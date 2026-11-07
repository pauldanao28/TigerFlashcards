-- streak_count is lazy: it's only ever updated the next time someone completes
-- their daily goal (see update_streak), so a friend who stopped studying keeps
-- their last streak number forever instead of it ever resetting to 0 on its own.
-- A friend's profile only shows through this RPC and useFriends.ts's own query —
-- useFriends.ts already does this same "is it current" check client-side (it can,
-- since it already selects the whole profiles row), but this RPC only ever
-- returned streak_count on its own with no way to tell it apart from a stale one.
-- Doing the check here, server-side, means the client never has to duplicate the
-- logic and get_friend_profile's result is correct on its own.
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
    -- A streak is still "alive" if its last review was today or yesterday (Asia/
    -- Singapore) — anything older means a full day was missed, so the stored
    -- number is stale. max_streak is an all-time record, not a current streak,
    -- so it's untouched.
    case
      when p.last_review_date >= (now() at time zone 'Asia/Singapore')::date - 1
      then p.streak_count::int
      else 0
    end as streak_count,
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
