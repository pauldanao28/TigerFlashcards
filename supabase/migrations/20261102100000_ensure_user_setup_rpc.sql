-- Self-heal on login: makes sure the signed-in user has a profile and a default deck,
-- creating whichever is missing. handle_new_user creates both at signup, so this is
-- a safety net (a failed trigger, a deck deleted later, accounts from before the
-- trigger made decks). Called once per browser session by AccountSetupGuard.
--
-- Also reports whether an already-onboarded user still has no real username (blank,
-- or the 'G_xxxxx' placeholder handle_new_user falls back to) so the client can ask
-- for one. Users still in onboarding are left alone — OnboardingModal asks them.
create or replace function ensure_user_setup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_created_profile boolean := false;
  v_created_deck boolean := false;
  v_profile record;
begin
  if v_uid is null then
    return null;
  end if;

  if not exists (select 1 from profiles where id = v_uid) then
    insert into profiles (id, email, full_name, has_onboarded)
    select u.id, u.email, 'G_' || substring(u.id::text from 1 for 5), false
    from auth.users u where u.id = v_uid;
    v_created_profile := true;
  end if;

  if not exists (select 1 from decks where user_id = v_uid and is_default) then
    insert into decks (user_id, title, is_default) values (v_uid, 'My Deck', true);
    v_created_deck := true;
  end if;

  select full_name, has_onboarded into v_profile from profiles where id = v_uid;

  return jsonb_build_object(
    'created_profile', v_created_profile,
    'created_deck', v_created_deck,
    'needs_username', coalesce(v_profile.has_onboarded, false)
      and (coalesce(trim(v_profile.full_name), '') = '' or v_profile.full_name like 'G\_%')
  );
end;
$$;

revoke execute on function ensure_user_setup() from public;
revoke execute on function ensure_user_setup() from anon;
grant execute on function ensure_user_setup() to authenticated;
