-- The alphabet 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' has 31 characters, but the
-- generator multiplied by 32 — ceil(random()*32) occasionally lands on 32,
-- which is out of bounds on a 31-char string and substr() silently returns
-- '', shortening the code below 8 characters. Fix the multiplier and
-- regenerate every code so all of them are a consistent 8 characters.
create or replace function generate_referral_code() returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', ceil(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

update profiles set referral_code = generate_referral_code();
