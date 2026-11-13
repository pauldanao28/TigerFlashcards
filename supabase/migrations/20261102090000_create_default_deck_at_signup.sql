-- Default deck at signup, not at the end of onboarding. Before this, the deck only
-- existed once OnboardingModal finished (N5 Kickstart or skip) — anyone who signed up
-- and closed the tab mid-onboarding (7 of the first 19 accounts) was left with no
-- deck at all. OnboardingModal now reuses this deck instead of inserting its own.

-- 1. Signup trigger: same profile insert as 20261031110000, plus the default deck.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $function$begin
  insert into public.profiles (
    id,
    email,
    full_name,
    has_onboarded
  )
  values (
    new.id,
    new.email,
    substring(
      coalesce(
        nullif(new.raw_user_meta_data->>'full_name', ''),
        nullif(new.raw_user_meta_data->>'name', ''),
        'G_' || substring(new.id::text from 1 for 5)
      )
      from 1 for 10
    ),
    false
  );

  insert into public.decks (user_id, title, is_default)
  values (new.id, 'My Deck', true);

  return new;
end;$function$;

-- 2. Backfill: every existing user without any deck gets their default deck now.
insert into public.decks (user_id, title, is_default)
select u.id, 'My Deck', true
from auth.users u
where not exists (select 1 from public.decks d where d.user_id = u.id);

-- 3. At most one default deck per user — the app looks it up with .single(), so a
-- second default (e.g. an old cached onboarding page inserting its own) would break
-- the Study page instead of just being a stray row.
create unique index if not exists decks_one_default_per_user
  on public.decks (user_id)
  where is_default;
