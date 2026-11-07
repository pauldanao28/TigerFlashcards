-- Richer friend-profile view: same JLPT-by-level/mastery breakdown the owner sees on
-- their own Dashboard (via get_dashboard_data), but read-only and scoped to a friend —
-- never writes to their profile or snapshots, and only returns the detailed breakdown
-- when they haven't hidden stats from friends (same gate get_friend_profile already
-- uses). Mirrors get_dashboard_data's per-card aggregation for consistency, but skips
-- its two write side effects entirely since this is someone else's account.
create or replace function get_friend_dashboard_data(p_friend_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_connected boolean;
  v_profile record;
  v_stats_visible boolean;
  v_deck_id uuid;
  v_daily_count int;
  v_mastered_today int;
  v_done_reading boolean;
  v_done_listening boolean;
  v_done_grammar boolean;
  v_deck_size int := 0;
  v_still_learning int := 0;
  v_raw_vocab numeric := 0;
  v_vocab_score int;
  v_vocab_nlevel text := 'N5';
  v_jlpt_stats jsonb := '{}'::jsonb;
  v_pos_stats jsonb := '{}'::jsonb;
  v_increment_map jsonb := '{"N5":800,"N4":700,"N3":2250,"N2":2250,"N1":4000}'::jsonb;
  v_levels text[] := array['N5','N4','N3','N2','N1'];
  v_nlevel_order text[] := array['N1','N2','N3','N4','N5'];
  v_allowed_pos text[] := array['noun','verb','adjective','adverb','particle','pronoun','conjunction','number','phrase'];
  lvl text;
  pos text;
  lvl_total int;
  lvl_mastered int;
  lvl_ratio numeric;
  best_ratio numeric := -1;
  rec record;
  mastered boolean;
  jp_pass int;
  jp_pct int;
  en_pass int;
  en_pct int;
begin
  select exists (
    select 1 from friendships f
    where (f.user_id = auth.uid() and f.friend_id = p_friend_id)
       or (f.friend_id = auth.uid() and f.user_id = p_friend_id)
  ) into v_is_connected;

  if not v_is_connected then
    return null;
  end if;

  select full_name, avatar_url, streak_count, max_streak, vocab_score, grammar_score,
         reading_score, listening_score, stats_visible_to_friends
    into v_profile
    from profiles where id = p_friend_id;

  if v_profile is null then
    return null;
  end if;

  v_stats_visible := coalesce(v_profile.stats_visible_to_friends, true);

  if not v_stats_visible then
    return jsonb_build_object(
      'name', v_profile.full_name,
      'avatar_url', v_profile.avatar_url,
      'streak', coalesce(v_profile.streak_count, 0),
      'max_streak', coalesce(v_profile.max_streak, 0),
      'stats_hidden', true
    );
  end if;

  select id into v_deck_id from decks where user_id = p_friend_id and is_default = true limit 1;

  select count into v_daily_count from user_review_counts where user_id = p_friend_id and study_date = p_today;
  v_daily_count := coalesce(v_daily_count, 0);

  select count into v_mastered_today from user_mastery_counts where user_id = p_friend_id and mastery_date = p_today;
  v_mastered_today := coalesce(v_mastered_today, 0);

  select coalesce(bool_or(quiz_type = 'reading'), false),
         coalesce(bool_or(quiz_type = 'listening'), false),
         coalesce(bool_or(quiz_type = 'grammar'), false)
    into v_done_reading, v_done_listening, v_done_grammar
    from quiz_daily_stats where user_id = p_friend_id and study_date = p_today;

  foreach lvl in array v_levels loop
    v_jlpt_stats := jsonb_set(v_jlpt_stats, array[lvl], '{"total":0,"mastered":0}'::jsonb);
  end loop;
  foreach pos in array v_allowed_pos loop
    v_pos_stats := jsonb_set(v_pos_stats, array[pos], '{"total":0,"mastered":0}'::jsonb);
  end loop;

  if v_deck_id is not null then
    select count(*) into v_deck_size from deck_cards where deck_id = v_deck_id;

    for rec in
      select mc.jlpt_level, mc."partOfSpeech" as pos, us.scores_json
      from deck_cards dc
      join master_cards mc on mc.id = dc.card_id
      left join user_scores us on us.card_id = dc.card_id and us.user_id = p_friend_id
      where dc.deck_id = v_deck_id
    loop
      jp_pass := coalesce((rec.scores_json -> 'jp_to_en' ->> 'pass')::int, 0);
      jp_pct  := coalesce((rec.scores_json -> 'jp_to_en' ->> 'percent')::int, 0);
      en_pass := coalesce((rec.scores_json -> 'en_to_jp' ->> 'pass')::int, 0);
      en_pct  := coalesce((rec.scores_json -> 'en_to_jp' ->> 'percent')::int, 0);
      mastered := (jp_pass >= 5 and jp_pct >= 70) or (en_pass >= 5 and en_pct >= 70);

      if not mastered then
        v_still_learning := v_still_learning + 1;
      end if;

      if rec.jlpt_level is not null and v_jlpt_stats ? rec.jlpt_level then
        lvl_total := (v_jlpt_stats -> rec.jlpt_level ->> 'total')::int + 1;
        lvl_mastered := (v_jlpt_stats -> rec.jlpt_level ->> 'mastered')::int + (case when mastered then 1 else 0 end);
        v_jlpt_stats := jsonb_set(v_jlpt_stats, array[rec.jlpt_level], jsonb_build_object('total', lvl_total, 'mastered', lvl_mastered));
      end if;

      pos := coalesce(rec.pos, 'noun');
      if v_pos_stats ? pos then
        lvl_total := (v_pos_stats -> pos ->> 'total')::int + 1;
        lvl_mastered := (v_pos_stats -> pos ->> 'mastered')::int + (case when mastered then 1 else 0 end);
        v_pos_stats := jsonb_set(v_pos_stats, array[pos], jsonb_build_object('total', lvl_total, 'mastered', lvl_mastered));
      end if;
    end loop;
  end if;

  foreach lvl in array v_nlevel_order loop
    lvl_total := (v_jlpt_stats -> lvl ->> 'total')::int;
    lvl_mastered := (v_jlpt_stats -> lvl ->> 'mastered')::int;
    if lvl_total < floor((v_increment_map ->> lvl)::numeric / 2) then
      continue;
    end if;
    lvl_ratio := lvl_mastered::numeric / lvl_total::numeric;
    if lvl_ratio > best_ratio then
      best_ratio := lvl_ratio;
      v_vocab_nlevel := lvl;
    end if;
  end loop;

  -- Shown value stays whatever's already stored on their profile (refreshed whenever
  -- they themselves load their own Dashboard) rather than recomputed here — this view
  -- is read-only and never writes back.
  v_vocab_score := v_profile.vocab_score;

  return jsonb_build_object(
    'name', v_profile.full_name,
    'avatar_url', v_profile.avatar_url,
    'streak', coalesce(v_profile.streak_count, 0),
    'max_streak', coalesce(v_profile.max_streak, 0),
    'stats_hidden', false,
    'daily_count', v_daily_count,
    'mastered_today', v_mastered_today,
    'still_learning', v_still_learning,
    'vocab_score', v_vocab_score,
    'reading_score', v_profile.reading_score,
    'listening_score', v_profile.listening_score,
    'grammar_score', v_profile.grammar_score,
    'deck_size', v_deck_size,
    'jlpt_stats', v_jlpt_stats,
    'pos_stats', v_pos_stats,
    'vocab_nlevel', v_vocab_nlevel,
    'done_today_quizzes', jsonb_build_object('reading', v_done_reading, 'listening', v_done_listening, 'grammar', v_done_grammar)
  );
end;
$$;

revoke execute on function get_friend_dashboard_data(uuid, date) from public;
revoke execute on function get_friend_dashboard_data(uuid, date) from anon;
grant execute on function get_friend_dashboard_data(uuid, date) to authenticated;
