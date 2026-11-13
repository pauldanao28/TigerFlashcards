-- Every email/password signup sent full_name: "" (empty string, not null) in its
-- auth metadata (see Auth.tsx's signUp call). coalesce() only falls through on NULL,
-- not on an empty string, so every such signup got full_name = '' here. profiles.full_name
-- has a UNIQUE constraint (full_name_unique_check) — the first email/password signup ever
-- succeeded with that blank name, and every one after it collided on the same empty
-- string, failing the insert inside this trigger and rolling back the whole auth.users
-- insert, which is exactly the 500 Supabase's own /auth/v1/signup returned to the client.
--
-- nullif(..., '') turns an empty string into NULL first, so coalesce actually reaches
-- its fallback ('G_' + a slice of the new user's own id, which is unique by construction)
-- instead of silently keeping the empty string.
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
  return new;
end;$function$;
