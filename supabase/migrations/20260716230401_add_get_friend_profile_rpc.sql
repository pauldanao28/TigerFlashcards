-- Server-enforced (not just UI-hidden) friend profile lookup: checks the
-- friendship first, then whether the target has opted out of sharing
-- detailed stats — nulling the score fields server-side means even a
-- direct API call bypassing the UI gets nothing when hidden, not just a
-- client that politely chooses not to render it.
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
  -- 1. Must be connected (any friendship status, either direction) — not
  -- just anyone can pull another user's profile through this function.
  select exists (
    select 1 from friendships f
    where (f.user_id = auth.uid() and f.friend_id = p_friend_id)
       or (f.friend_id = auth.uid() and f.user_id = p_friend_id)
  ) into is_connected;

  if not is_connected then
    return;
  end if;

  -- 2. Only then check whether they've opted to hide detailed stats.
  select p.stats_visible_to_friends into stats_visible from profiles p where p.id = p_friend_id;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.streak_count,
    p.max_streak,
    case when stats_visible then p.vocab_score end,
    case when stats_visible then p.grammar_score end,
    case when stats_visible then p.reading_score end,
    case when stats_visible then p.listening_score end,
    (not stats_visible) as stats_hidden
  from profiles p
  where p.id = p_friend_id;
end;
$$;

revoke execute on function get_friend_profile(uuid) from public;
revoke execute on function get_friend_profile(uuid) from anon;
grant execute on function get_friend_profile(uuid) to authenticated;
