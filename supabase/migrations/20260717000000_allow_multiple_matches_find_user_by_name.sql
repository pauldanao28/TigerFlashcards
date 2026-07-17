-- find_user_by_name previously had `limit 1` baked in, so the client's
-- addFriendByUsername always silently grabbed whichever same-named user
-- the DB happened to return first — no way to detect or resolve two
-- people sharing a display name. Return a small candidate set instead so
-- the client can disambiguate when there's more than one match.
create or replace function find_user_by_name(p_name text)
returns table(id uuid, full_name text)
language sql
security definer
set search_path = public
as $$
  select id, full_name from profiles where full_name ilike p_name limit 5;
$$;

revoke execute on function find_user_by_name(text) from public;
revoke execute on function find_user_by_name(text) from anon;
grant execute on function find_user_by_name(text) to authenticated;
