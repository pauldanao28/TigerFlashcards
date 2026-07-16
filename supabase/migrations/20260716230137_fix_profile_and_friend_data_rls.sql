-- Audit found: profiles and friendships each had a leftover blanket
-- "USING (true)" SELECT policy that silently defeated every other, more
-- specific policy already on the table (Postgres OR's all matching SELECT
-- policies together — one permissive policy makes the rest moot).
-- Confirmed live via an anon-key client: it could read every user's full
-- profile (scores, streak, referral_code) and every friendship row with
-- zero authentication.
--
-- Also found: the existing "View friend profiles" policy only matched one
-- direction of a friendship (auth.uid() had to be the original sender),
-- so roughly half of all accepted friend-pairs couldn't see each other's
-- profile at all. And user_review_counts had no friends-readable policy
-- whatsoever, meaning SocialDock's per-friend daily-progress bar has
-- likely been silently broken (0 / empty) since it was built.

-- Drop the temporary introspection helper used to audit this.
drop function if exists __probe_policies(text);

-- 1. Remove the blanket-public policies.
drop policy if exists "Profiles are viewable by everyone" on profiles;
drop policy if exists "Enable read access for all users" on friendships;

-- 2. Replace the broken one-directional friend-profile policy with a
-- correct bidirectional one. Covers pending connections too (not just
-- accepted) so you can see who sent/received a request before it's
-- accepted — narrower stranger-search still goes through a separate RPC
-- below, not this policy.
drop policy if exists "View friend profiles" on profiles;
create policy "profiles readable by connected users"
  on profiles for select
  to authenticated
  using (
    exists (
      select 1 from friendships
      where (friendships.user_id = auth.uid() and friendships.friend_id = profiles.id)
         or (friendships.friend_id = auth.uid() and friendships.user_id = profiles.id)
    )
  );

-- 3. Let accepted friends read each other's daily review counts (streak /
-- daily-progress data) — previously only self and admin could read this.
create policy "user_review_counts readable by accepted friends"
  on user_review_counts for select
  to authenticated
  using (
    exists (
      select 1 from friendships
      where friendships.status = 'accepted'
        and (
          (friendships.user_id = auth.uid() and friendships.friend_id = user_review_counts.user_id)
          or (friendships.friend_id = auth.uid() and friendships.user_id = user_review_counts.user_id)
        )
    )
  );

-- 4. Narrow, non-sensitive lookups for the two "find a stranger" flows that
-- legitimately need to work before any friendship/connection exists:
-- searching by name to send a friend request, and resolving a referral
-- code (which must also work for a not-yet-signed-up anonymous visitor on
-- the /join/[code] landing page).
create or replace function find_user_by_name(p_name text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from profiles where full_name ilike p_name limit 1;
$$;
grant execute on function find_user_by_name(text) to authenticated;

create or replace function find_user_by_referral_code(p_code text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from profiles where referral_code = upper(p_code) limit 1;
$$;
grant execute on function find_user_by_referral_code(text) to authenticated, anon;

-- 5. Privacy toggle — hide detailed stats (scores/level) from friends.
-- Enforced at the UI layer (friends' RLS access still includes the row,
-- since they legitimately need name/avatar/streak regardless); this flag
-- controls whether the client renders the detailed score breakdown.
alter table profiles add column if not exists stats_visible_to_friends boolean not null default true;
