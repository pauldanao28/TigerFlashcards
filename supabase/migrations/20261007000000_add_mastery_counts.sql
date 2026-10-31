-- Per-user per-day count of words that crossed the mastery bar (pass>=5 &&
-- percent>=70 in either direction) that day. Mirrors user_review_counts'
-- shape/purpose but for masteries instead of raw reviews — the Study tab's
-- "Mastered Today" chip was previously localStorage-only (device-local, lost on
-- clear), this makes it a real synced counter.
create table if not exists user_mastery_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  mastery_date date not null,
  count integer not null default 0,
  primary key (user_id, mastery_date)
);

alter table user_mastery_counts enable row level security;

create policy "user can read own mastery counts"
  on user_mastery_counts for select
  using (auth.uid() = user_id);

-- Atomic upsert-or-increment, called client-side with the caller's own id right
-- after a mastery transition. security definer so the single INSERT ... ON CONFLICT
-- doesn't need separate insert+update RLS policies for the same effect.
create or replace function increment_mastery_count(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into user_mastery_counts (user_id, mastery_date, count)
  values (target_user_id, (now() at time zone 'Asia/Singapore')::date, 1)
  on conflict (user_id, mastery_date)
  do update set count = user_mastery_counts.count + 1;
end;
$$;

grant execute on function increment_mastery_count(uuid) to authenticated;
