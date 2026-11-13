-- Study Circle: which of today's quizzes (reading / listening / grammar) each friend has
-- done. quiz_daily_stats' RLS only lets a user read their own rows, so the circle can't
-- embed it the way it embeds user_review_counts — this returns one row per connected
-- friend instead (one call for the whole list, not one per friend). Friends who hid
-- their stats are skipped, same gate get_friend_dashboard_data uses.
create or replace function get_friends_quiz_today(p_today date)
returns table (friend_id uuid, reading boolean, listening boolean, grammar boolean)
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
  )
  select q.user_id,
         bool_or(q.quiz_type = 'reading'),
         bool_or(q.quiz_type = 'listening'),
         bool_or(q.quiz_type = 'grammar')
  from quiz_daily_stats q
  join connected c on c.id = q.user_id
  join profiles p on p.id = q.user_id
  where q.study_date = p_today
    and coalesce(p.stats_visible_to_friends, true)
  group by q.user_id;
$$;

revoke execute on function get_friends_quiz_today(date) from public;
revoke execute on function get_friends_quiz_today(date) from anon;
grant execute on function get_friends_quiz_today(date) to authenticated;
