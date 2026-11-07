-- Study Circle: lets the client compute each friend's "quests complete today"
-- indicator. pickDailyQuests/questProgress (src/lib/dailyQuests.ts) already run
-- client-side for the signed-in user; they need the same two signals for a
-- friend that get_dashboard_data computes for you (mastered_today,
-- cards_added_today) — daily_count and done_today_quizzes are already available
-- via friend.dailyProgress and get_friends_quiz_today. Same one-call-for-the-
-- whole-list shape and stats_visible_to_friends gate as get_friends_quiz_today.
create or replace function get_friends_quest_progress_today(p_today date)
returns table (friend_id uuid, mastered_today int, cards_added_today int)
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
  -- Same (dc.added_at at time zone 'Asia/Singapore')::date pattern
  -- get_dashboard_data's cards_added_today already uses.
  added as (
    select d.user_id, count(*) as cards_added_today
    from decks d
    join deck_cards dc on dc.deck_id = d.id
    join connected c on c.id = d.user_id
    where d.is_default = true
      and (dc.added_at at time zone 'Asia/Singapore')::date = p_today
    group by d.user_id
  )
  select c.id, coalesce(m.mastered_today, 0), coalesce(a.cards_added_today, 0)
  from connected c
  join profiles p on p.id = c.id
  left join mastered m on m.user_id = c.id
  left join added a on a.user_id = c.id
  where coalesce(p.stats_visible_to_friends, true);
$$;

revoke execute on function get_friends_quest_progress_today(date) from public;
revoke execute on function get_friends_quest_progress_today(date) from anon;
grant execute on function get_friends_quest_progress_today(date) to authenticated;
