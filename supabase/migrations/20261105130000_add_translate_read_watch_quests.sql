-- Two new Daily Quests — Translate, and Read/Watch — need a daily "used this today"
-- signal, same as the existing quests do (daily_count, mastered_today,
-- cards_added_today, done_today_quizzes). Translate/Reader/Watch aren't graded
-- quizzes though (no n_level/correct/total), so they don't fit quiz_daily_stats'
-- schema — this is a minimal, feature-agnostic table instead.
create table if not exists daily_feature_usage (
  user_id    uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  feature    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, study_date, feature)
);

alter table daily_feature_usage enable row level security;

create policy "daily_feature_usage insert own"
  on daily_feature_usage for insert
  with check (auth.uid() = user_id);

create policy "daily_feature_usage select own"
  on daily_feature_usage for select
  using (auth.uid() = user_id);

-- Called from TranslateView/ReaderView/WatchView on a successful translate/passage/
-- video — Asia/Singapore date, same "today" the rest of the daily quests use.
create or replace function mark_feature_used_today(p_feature text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into daily_feature_usage (user_id, study_date, feature)
  values (auth.uid(), (now() at time zone 'Asia/Singapore')::date, p_feature)
  on conflict (user_id, study_date, feature) do nothing;
end;
$$;

grant execute on function mark_feature_used_today(text) to authenticated;

-- get_dashboard_data: add done_today_translate / done_today_read_watch, read from
-- daily_feature_usage the same way done_today_quizzes already reads quiz_daily_stats.
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
  v_cards_added_today int;
  v_done_reading boolean;
  v_done_listening boolean;
  v_done_grammar boolean;
  v_done_translate boolean;
  v_done_read_watch boolean;
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
  jp_total int;
  en_pass int;
  en_pct int;
  en_total int;
  best_accuracy int;
  total_attempts int;
  pattern_count int;
  pattern_contribution numeric;
  v_struggling_count int := 0;
  v_accuracy_sum numeric := 0;
  v_accuracy_count int := 0;
  v_reflex_ms_total numeric := 0;
  v_reflex_attempts_total int := 0;
  v_jp_tries int := 0;
  v_jp_pass int := 0;
  v_en_tries int := 0;
  v_en_pass int := 0;
  v_avg_reflex_seconds numeric;
  v_avg_accuracy int;
begin
  select full_name, avatar_url, referral_code, streak_count, max_streak, reading_score, listening_score, grammar_score, daily_quests_enabled
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

  select coalesce(bool_or(feature = 'translate'), false),
         coalesce(bool_or(feature in ('reader', 'watch')), false)
    into v_done_translate, v_done_read_watch
    from daily_feature_usage where user_id = v_user_id and study_date = p_today;

  -- Same (dc.added_at at time zone 'Asia/Singapore')::date pattern
  -- admin_user_performance_master's cards_added_today already uses.
  if v_deck_id is not null then
    select count(*) into v_cards_added_today
    from deck_cards dc
    where dc.deck_id = v_deck_id
      and (dc.added_at at time zone 'Asia/Singapore')::date = p_today;
  end if;
  v_cards_added_today := coalesce(v_cards_added_today, 0);

  foreach lvl in array v_levels loop
    v_jlpt_stats := jsonb_set(v_jlpt_stats, array[lvl], '{"total":0,"mastered":0}'::jsonb);
  end loop;
  foreach pos in array v_allowed_pos loop
    v_pos_stats := jsonb_set(v_pos_stats, array[pos], '{"total":0,"mastered":0}'::jsonb);
  end loop;

  if v_deck_id is not null then
    select count(*) into v_deck_size from deck_cards where deck_id = v_deck_id;

    for rec in
      select mc.jlpt_level, mc."partOfSpeech" as pos, us.scores_json,
             us.reflex_time_total_ms, us.reflex_attempts
      from deck_cards dc
      join master_cards mc on mc.id = dc.card_id
      left join user_scores us on us.card_id = dc.card_id and us.user_id = v_user_id
      where dc.deck_id = v_deck_id
    loop
      jp_pass  := coalesce((rec.scores_json -> 'jp_to_en' ->> 'pass')::int, 0);
      jp_pct   := coalesce((rec.scores_json -> 'jp_to_en' ->> 'percent')::int, 0);
      jp_total := coalesce((rec.scores_json -> 'jp_to_en' ->> 'total')::int, 0);
      en_pass  := coalesce((rec.scores_json -> 'en_to_jp' ->> 'pass')::int, 0);
      en_pct   := coalesce((rec.scores_json -> 'en_to_jp' ->> 'percent')::int, 0);
      en_total := coalesce((rec.scores_json -> 'en_to_jp' ->> 'total')::int, 0);
      mastered := (jp_pass >= 5 and jp_pct >= 70) or (en_pass >= 5 and en_pct >= 70);

      if not mastered then
        v_still_learning := v_still_learning + 1;
      end if;

      -- Struggling / avg accuracy: best direction, not the average — same philosophy
      -- as Mastered (either direction clearing the bar counts), and untried cards
      -- (zero attempts in both directions) are excluded from both.
      total_attempts := jp_total + en_total;
      if total_attempts > 0 then
        best_accuracy := greatest(jp_pct, en_pct);
        if best_accuracy < 40 then
          v_struggling_count := v_struggling_count + 1;
        end if;
        v_accuracy_sum := v_accuracy_sum + best_accuracy;
        v_accuracy_count := v_accuracy_count + 1;
      end if;

      v_reflex_ms_total := v_reflex_ms_total + coalesce(rec.reflex_time_total_ms, 0);
      v_reflex_attempts_total := v_reflex_attempts_total + coalesce(rec.reflex_attempts, 0);

      v_jp_tries := v_jp_tries + jp_total;
      v_jp_pass  := v_jp_pass + jp_pass;
      v_en_tries := v_en_tries + en_total;
      v_en_pass  := v_en_pass + en_pass;

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

  v_avg_reflex_seconds := case when v_reflex_attempts_total > 0
    then round(v_reflex_ms_total / v_reflex_attempts_total / 1000, 1)
    else null end;
  v_avg_accuracy := case when v_accuracy_count > 0
    then round(v_accuracy_sum / v_accuracy_count)::int
    else null end;

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
    'avatar_url', v_profile.avatar_url,
    'referral_code', v_profile.referral_code,
    'streak', coalesce(v_profile.streak_count, 0),
    'max_streak', coalesce(v_profile.max_streak, 0),
    'daily_count', v_daily_count,
    'mastered_today', v_mastered_today,
    'cards_added_today', v_cards_added_today,
    'still_learning', v_still_learning,
    'mastered_count', v_deck_size - v_still_learning,
    'struggling_count', v_struggling_count,
    'avg_reflex_seconds', v_avg_reflex_seconds,
    'avg_accuracy', v_avg_accuracy,
    'jp_tries', v_jp_tries,
    'jp_pass', v_jp_pass,
    'en_tries', v_en_tries,
    'en_pass', v_en_pass,
    'vocab_score', v_vocab_score,
    'reading_score', v_profile.reading_score,
    'listening_score', v_profile.listening_score,
    'grammar_score', v_grammar_score,
    'deck_size', v_deck_size,
    'jlpt_stats', v_jlpt_stats,
    'pos_stats', v_pos_stats,
    'vocab_nlevel', v_vocab_nlevel,
    'done_today_quizzes', jsonb_build_object('reading', v_done_reading, 'listening', v_done_listening, 'grammar', v_done_grammar),
    'done_today_translate', v_done_translate,
    'done_today_read_watch', v_done_read_watch,
    'daily_quests_enabled', coalesce(v_profile.daily_quests_enabled, true)
  );
end;
$$;

grant execute on function get_dashboard_data(date) to authenticated;

-- get_friends_quest_progress_today: add the same two signals per friend, so the
-- Study Circle's 🎯 badge is accurate for a friend whose personalized quest set
-- happens to include Translate or Read/Watch.
create or replace function get_friends_quest_progress_today(p_today date)
returns table (
  friend_id uuid,
  mastered_today int,
  cards_added_today int,
  done_today_translate boolean,
  done_today_read_watch boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with connected as (
    select case when f.user_id = auth.uid() then f.friend_id else f.user_id end as id
    from friendships f
    where f.status = 'accepted'
      and (f.user_id = auth.uid() or f.friend_id = auth.uid())
  ),
  mastered as (
    select umc.user_id, umc.count as mastered_today
    from user_mastery_counts umc
    join connected c on c.id = umc.user_id
    where umc.mastery_date = p_today
  ),
  added as (
    select d.user_id, count(*) as cards_added_today
    from decks d
    join deck_cards dc on dc.deck_id = d.id
    join connected c on c.id = d.user_id
    where d.is_default = true
      and (dc.added_at at time zone 'Asia/Singapore')::date = p_today
    group by d.user_id
  ),
  feature_usage as (
    select dfu.user_id,
           bool_or(dfu.feature = 'translate') as done_translate,
           bool_or(dfu.feature in ('reader', 'watch')) as done_read_watch
    from daily_feature_usage dfu
    join connected c on c.id = dfu.user_id
    where dfu.study_date = p_today
    group by dfu.user_id
  )
  select c.id, coalesce(m.mastered_today, 0), coalesce(a.cards_added_today, 0),
         coalesce(fu.done_translate, false), coalesce(fu.done_read_watch, false)
  from connected c
  join profiles p on p.id = c.id
  left join mastered m on m.user_id = c.id
  left join added a on a.user_id = c.id
  left join feature_usage fu on fu.user_id = c.id
  where coalesce(p.stats_visible_to_friends, true);
$$;

revoke execute on function get_friends_quest_progress_today(date) from public;
revoke execute on function get_friends_quest_progress_today(date) from anon;
grant execute on function get_friends_quest_progress_today(date) to authenticated;
