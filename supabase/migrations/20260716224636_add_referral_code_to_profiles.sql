-- Referral links previously matched by profiles.full_name, which is
-- user-editable, starts empty at signup, and has no uniqueness guarantee —
-- two same-named users would break the .maybeSingle() lookup entirely, and
-- a name change silently breaks every link someone already shared.
-- referral_code is a stable, unique, opaque identifier instead.
create or replace function generate_referral_code() returns text
language sql
volatile
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', ceil(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

alter table profiles add column if not exists referral_code text unique default generate_referral_code();

-- Belt-and-suspenders backfill in case the volatile default didn't get
-- applied per-row on ADD COLUMN (should be automatic in modern Postgres,
-- but this is cheap insurance at our current table size).
update profiles set referral_code = generate_referral_code() where referral_code is null;

alter table profiles alter column referral_code set not null;
