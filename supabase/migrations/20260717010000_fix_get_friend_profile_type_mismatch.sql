-- get_friend_profile was raising "structure of query does not match
-- function result type" for every call — RETURN QUERY requires an exact
-- type match against the declared RETURNS TABLE columns, and profiles'
-- actual score/streak column types (not tracked in this repo's migrations)
-- don't line up with the int columns declared here. Cast explicitly so
-- this works regardless of the real underlying column types.
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
    case when stats_visible then p.vocab_score::int end,
    case when stats_visible then p.grammar_score::int end,
    case when stats_visible then p.reading_score::int end,
    case when stats_visible then p.listening_score::int end,
    (not stats_visible)::boolean as stats_hidden
  from profiles p
  where p.id = p_friend_id;
end;
$$;

revoke execute on function get_friend_profile(uuid) from public;
revoke execute on function get_friend_profile(uuid) from anon;
grant execute on function get_friend_profile(uuid) to authenticated;
