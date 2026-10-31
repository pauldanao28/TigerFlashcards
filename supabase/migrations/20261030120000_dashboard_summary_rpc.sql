-- Dashboard used to load via ~10 separate client round trips in 3 sequential
-- waves (profile/deck/today's-counters -> paginated deck_cards/user_scores/
-- master_cards -> grammar patterns/scores), each paginated client-side past
-- PostgREST's 1000-row default to avoid truncating vocab counts and mastery
-- stats on large decks. This RPC does the same aggregation in one round trip
-- instead: the per-card loop runs server-side inside the function, so it's
-- never subject to PostgREST's row cap at all (only the final small JSON
-- summary crosses that boundary) — faster AND removes the truncation risk
-- entirely rather than just working around it with pagination loops.
create or replace function get_dashboard_data(p_today date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile record;
  v_deck_id uuid;
  v_daily_count int;
  v_mastered_today int;
  v_done_reading boolean;
  v_done_listening boolean;
  v_done_grammar boolean;
  v_deck_size int := 0;
  v_still_learning int := 0;
  v_raw_vocab numeric := 0;
  v_vocab_score int := 0;
  v_grammar_score int;
  v_raw_grammar numeric := 0;
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
  pattern_count int;
  pattern_contribution numeric;
begin
  select full_name, referral_code, streak_count, max_streak, reading_score, listening_score, grammar_score
    into v_profile
    from profiles where id = v_user_id;

  select id into v_deck_id from decks where user_id = v_user_id and is_default = true limit 1;

  select count into v_daily_count from user_review_counts where user_id = v_user_id and study_date = p_today;
  v_daily_count := coalesce(v_daily_count, 0);

  select count into v_mastered_today from user_mastery_counts where user_id = v_user_id and mastery_date = p_today;
  v_mastered_today := coalesce(v_mastered_today, 0);

  select coalesce(bool_or(quiz_type = 'reading'), false),
         coalesce(bool_or(quiz_type = 'listening'), false),
         coalesce(bool_or(quiz_type = 'grammar'), false)
    into v_done_reading, v_done_listening, v_done_grammar
    from quiz_daily_stats where user_id = v_user_id and study_date = p_today;

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
      left join user_scores us on us.card_id = dc.card_id and us.user_id = v_user_id
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

  foreach lvl in array v_levels loop
    v_raw_vocab := v_raw_vocab + least(
      (v_jlpt_stats -> lvl ->> 'mastered')::numeric / (v_increment_map ->> lvl)::numeric,
      1
    ) * 20;
  end loop;
  v_vocab_score := round(v_raw_vocab)::int;

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

  -- Matches the client's `!grammarScore` falsy check, including the "exactly 0"
  -- case recomputing again every load — preserved as-is, not introducing a
  -- behavior change here.
  if v_profile.grammar_score is null or v_profile.grammar_score = 0 then
    foreach lvl in array v_levels loop
      select count(*) into pattern_count from grammar_patterns where jlpt_level = lvl;
      if pattern_count = 0 then
        continue;
      end if;
      select coalesce(sum(least(ugs.total::numeric / 3, 1)), 0)
        into pattern_contribution
        from grammar_patterns gp
        join user_grammar_scores ugs on ugs.pattern_id = gp.id and ugs.user_id = v_user_id
        where gp.jlpt_level = lvl and ugs.percent >= 67;
      v_raw_grammar := v_raw_grammar + (pattern_contribution / pattern_count) * 20;
    end loop;
    v_grammar_score := least(100, round(v_raw_grammar))::int;
  else
    v_grammar_score := v_profile.grammar_score;
  end if;

  update profiles set vocab_score = v_vocab_score, grammar_score = v_grammar_score where id = v_user_id;
  perform upsert_score_snapshot(p_vocab => v_vocab_score, p_grammar => v_grammar_score);

  return jsonb_build_object(
    'name', v_profile.full_name,
    'referral_code', v_profile.referral_code,
    'streak', coalesce(v_profile.streak_count, 0),
    'max_streak', coalesce(v_profile.max_streak, 0),
    'daily_count', v_daily_count,
    'mastered_today', v_mastered_today,
    'still_learning', v_still_learning,
    'vocab_score', v_vocab_score,
    'reading_score', v_profile.reading_score,
    'listening_score', v_profile.listening_score,
    'grammar_score', v_grammar_score,
    'deck_size', v_deck_size,
    'jlpt_stats', v_jlpt_stats,
    'pos_stats', v_pos_stats,
    'vocab_nlevel', v_vocab_nlevel,
    'done_today_quizzes', jsonb_build_object('reading', v_done_reading, 'listening', v_done_listening, 'grammar', v_done_grammar)
  );
end;
$$;

grant execute on function get_dashboard_data(date) to authenticated;
