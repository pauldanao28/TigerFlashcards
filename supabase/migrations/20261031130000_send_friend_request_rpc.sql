-- friendships' unique constraint is UNIQUE (user_id, friend_id) — direction-specific,
-- not symmetric. The old client-side flow (lib/social.ts's sendFriendRequest) just did
-- a raw INSERT and treated a 23505 unique-violation as "already exists" — that only
-- catches re-sending the SAME direction twice. If A sends B a request, and before B
-- responds B also adds A (e.g. via A's code), the insert for (B, A) doesn't collide
-- with the existing (A, B) row at all — it silently creates a second, crossed-direction
-- pending row instead of recognizing the mutual request and accepting it. Depending on
-- which row the client's de-dupe-by-counterpart-id logic happens to keep, a friend
-- could appear stuck "pending" even after being accepted.
--
-- Moving the whole decision into one atomic function closes the race a client-side
-- check-then-insert would still have (two people adding each other at nearly the same
-- moment could both pass a "does the reverse row exist?" check before either insert
-- lands) — the row lock from the first UPDATE/INSERT here blocks the second caller
-- until the first transaction commits.
create or replace function send_friend_request(p_target_id uuid)
returns text -- 'sent' | 'accepted' | 'already_pending' | 'already_friends' | 'self'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_forward record;
  v_reverse record;
begin
  if p_target_id = v_caller then
    return 'self';
  end if;

  select * into v_forward from friendships where user_id = v_caller and friend_id = p_target_id;
  if found then
    return case when v_forward.status = 'accepted' then 'already_friends' else 'already_pending' end;
  end if;

  select * into v_reverse from friendships where user_id = p_target_id and friend_id = v_caller for update;
  if found then
    if v_reverse.status = 'accepted' then
      return 'already_friends';
    end if;
    -- They already sent us a request — accept it instead of inserting a crossed
    -- duplicate in the other direction.
    update friendships set status = 'accepted' where user_id = p_target_id and friend_id = v_caller;
    return 'accepted';
  end if;

  insert into friendships (user_id, friend_id, status) values (v_caller, p_target_id, 'pending');
  return 'sent';
end;
$$;

revoke execute on function send_friend_request(uuid) from public;
revoke execute on function send_friend_request(uuid) from anon;
grant execute on function send_friend_request(uuid) to authenticated;
