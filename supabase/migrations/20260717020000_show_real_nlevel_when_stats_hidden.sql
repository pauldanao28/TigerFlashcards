-- Product decision: stats_visible_to_friends should hide the detailed
-- score breakdown (Vocab/Grammar/Reading/Listening %), not the overall
-- N-level badge — a friend's level is fine to show even when they've
-- hidden their stats. Previously the four score columns were nulled
-- server-side whenever stats_hidden, which also silently zeroed out the
-- client's N-level calc (since it derives from these same scores).
create or replace function get_friend_profile(p_friend_id uuid)
returns table(
  id uuid,
  full_name text,
  avatar_url text,
  streak_count int,
  max_streak int,
  vocab_score int,
  grammar_score int,
  reading_score int,
  listening_score int,
  stats_hidden boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  is_connected boolean;
  stats_visible boolean;
begin
  select exists (
    select 1 from friendships f
    where (f.user_id = auth.uid() and f.friend_id = p_friend_id)
       or (f.friend_id = auth.uid() and f.user_id = p_friend_id)
  ) into is_connected;

  if not is_connected then
    return;
  end if;

  select p.stats_visible_to_friends into stats_visible from profiles p where p.id = p_friend_id;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.streak_count::int,
    p.max_streak::int,
    p.vocab_score::int,
    p.grammar_score::int,
    p.reading_score::int,
    p.listening_score::int,
    (not stats_visible)::boolean as stats_hidden
  from profiles p
  where p.id = p_friend_id;
end;
$$;

revoke execute on function get_friend_profile(uuid) from public;
revoke execute on function get_friend_profile(uuid) from anon;
grant execute on function get_friend_profile(uuid) to authenticated;
