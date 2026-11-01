-- processReferral (lib/social.ts) used to do its writes as two separate raw
-- client inserts, authenticated as the newly-referred user:
--
--   insert into referrals (referrer_id, referred_id) values (referrer.id, newUserId);
--   insert into friendships (user_id, friend_id, status) values
--     (referrer.id, newUserId, 'accepted'),
--     (newUserId, referrer.id, 'accepted');
--
-- The referrals insert is fine (auth.uid() = referred_id = newUserId), but the first
-- friendships row has user_id = referrer.id while the caller is newUserId — exactly the
-- "insert a row on someone else's behalf" case send_friend_request's own migration
-- documents as requiring security definer. A plain client insert can't satisfy an
-- auth.uid() = user_id check for that row, so it's rejected by RLS — and the client
-- code never checked that insert's error, so the referral got recorded but the two
-- parties never actually became friends, despite the call reporting success.
--
-- Moving the whole thing server-side also closes two smaller gaps in the old flow:
-- it's called from two places (Auth.tsx right after signUp, and StudyView's fallback
-- for when email confirmation delays the first attempt), so doing the "already
-- referred" check and the referrer lookup atomically here avoids any chance of a
-- double-insert race between the two call sites.
create or replace function process_referral(p_code text)
returns text -- 'linked' | 'self' | 'already_referred' | 'invalid_code'
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_referrer_id uuid;
begin
  select id into v_referrer_id from profiles where referral_code = upper(p_code);

  if v_referrer_id is null then
    return 'invalid_code';
  end if;

  if v_referrer_id = v_caller then
    return 'self';
  end if;

  if exists (select 1 from referrals where referred_id = v_caller) then
    return 'already_referred';
  end if;

  insert into referrals (referrer_id, referred_id) values (v_referrer_id, v_caller);

  -- Mutual, pre-accepted friendship. on conflict guards the case where one of them
  -- already sent (or had) a friend request in either direction before the referral
  -- landed — upgrade it to accepted rather than erroring on the unique constraint.
  insert into friendships (user_id, friend_id, status)
  values (v_referrer_id, v_caller, 'accepted')
  on conflict (user_id, friend_id) do update set status = 'accepted';

  insert into friendships (user_id, friend_id, status)
  values (v_caller, v_referrer_id, 'accepted')
  on conflict (user_id, friend_id) do update set status = 'accepted';

  return 'linked';
end;
$$;

revoke execute on function process_referral(text) from public;
revoke execute on function process_referral(text) from anon;
grant execute on function process_referral(text) to authenticated;
