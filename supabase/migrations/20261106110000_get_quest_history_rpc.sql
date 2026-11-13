-- Daily Quests stay fully derived (dailyQuests.ts: pickDailyQuests + questProgress),
-- but completion history also needs to look at PAST days, not just today, so Home's
-- 14-Day Progress can show which days all 3 quests were done. Rather than add a new
-- table, this replays the same signals get_dashboard_data already reads for "today"
-- (daily_count, mastered_today, cards_added_today, done_today_quizzes,
-- done_today_translate, done_today_read_watch) across the last p_days days — the
-- client then runs pickDailyQuests(user_id, date)/questProgress per day, same as it
-- already does for today, to decide which days were fully completed.
create or replace function get_quest_history(p_days int default 14)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      ((now() at time zone 'Asia/Singapore')::date) - (p_days - 1),
      (now() at time zone 'Asia/Singapore')::date,
      interval '1 day'
    )::date as d
  ),
  deck as (
    select id from decks where user_id = auth.uid() and is_default = true limit 1
  ),
  reviews as (
    select study_date, count from user_review_counts where user_id = auth.uid()
  ),
  masteries as (
    select mastery_date, count from user_mastery_counts where user_id = auth.uid()
  ),
  added as (
    select (dc.added_at at time zone 'Asia/Singapore')::date as d, count(*) as c
    from deck_cards dc
    where dc.deck_id = (select id from deck)
    group by 1
  ),
  quizzes as (
    select study_date,
           bool_or(quiz_type = 'reading') as reading,
           bool_or(quiz_type = 'listening') as listening,
           bool_or(quiz_type = 'grammar') as grammar
    from quiz_daily_stats
    where user_id = auth.uid()
    group by study_date
  ),
  features as (
    select study_date,
           bool_or(feature = 'translate') as translate,
           bool_or(feature in ('reader', 'watch')) as read_watch
    from daily_feature_usage
    where user_id = auth.uid()
    group by study_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'study_date', days.d,
    'daily_count', coalesce(reviews.count, 0),
    'mastered_today', coalesce(masteries.count, 0),
    'cards_added_today', coalesce(added.c, 0),
    'done_today_quizzes', jsonb_build_object(
      'reading', coalesce(quizzes.reading, false),
      'listening', coalesce(quizzes.listening, false),
      'grammar', coalesce(quizzes.grammar, false)
    ),
    'done_today_translate', coalesce(features.translate, false),
    'done_today_read_watch', coalesce(features.read_watch, false)
  ) order by days.d), '[]'::jsonb)
  from days
  left join reviews on reviews.study_date = days.d
  left join masteries on masteries.mastery_date = days.d
  left join added on added.d = days.d
  left join quizzes on quizzes.study_date = days.d
  left join features on features.study_date = days.d;
$$;

revoke execute on function get_quest_history(int) from public;
revoke execute on function get_quest_history(int) from anon;
grant execute on function get_quest_history(int) to authenticated;
