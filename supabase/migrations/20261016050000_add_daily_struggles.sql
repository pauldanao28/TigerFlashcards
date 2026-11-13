-- Per-user per-day log of cards graded Fail at least once that day (Asia/Singapore
-- calendar date, matching user_review_counts/user_mastery_counts). Separate from the
-- all-time "Struggling" metric (cumulative accuracy < 40%) — this is just "what did
-- I get wrong today", meant to be copied out (e.g. into a study diary) each day.
create table if not exists daily_struggles (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references master_cards(id) on delete cascade,
  struggle_date date not null,
  fail_count integer not null default 1,
  first_failed_at timestamptz not null default now(),
  primary key (user_id, card_id, struggle_date)
);

alter table daily_struggles enable row level security;

create policy "user can read own daily struggles"
  on daily_struggles for select
  using (auth.uid() = user_id);

-- Atomic upsert-or-increment, called client-side right after a Fail grade (any
-- direction, including a Reflex Mode timeout auto-fail). security definer so the
-- single INSERT ... ON CONFLICT doesn't need separate insert+update RLS policies.
create or replace function record_daily_struggle(target_user_id uuid, target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into daily_struggles (user_id, card_id, struggle_date, fail_count)
  values (target_user_id, target_card_id, (now() at time zone 'Asia/Singapore')::date, 1)
  on conflict (user_id, card_id, struggle_date)
  do update set fail_count = daily_struggles.fail_count + 1;
end;
$$;

grant execute on function record_daily_struggle(uuid, uuid) to authenticated;
