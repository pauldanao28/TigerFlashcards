-- Run in Supabase SQL Editor before deploying the Study retention update.
create table if not exists public.study_review_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  direction text not null check (direction in ('jp_to_en','en_to_jp')),
  passed boolean not null,
  reviewed_at timestamptz not null default now(),
  previous_reviewed_at timestamptz,
  gap_days numeric generated always as
    (extract(epoch from (reviewed_at - previous_reviewed_at)) / 86400.0) stored
);
create index if not exists study_review_events_user_card_time
  on public.study_review_events(user_id, card_id, reviewed_at desc);
create index if not exists study_review_events_user_time
  on public.study_review_events(user_id, reviewed_at desc);
alter table public.study_review_events enable row level security;
revoke all on public.study_review_events from anon, authenticated;
grant select on public.study_review_events to authenticated;
create policy "read own study review events" on public.study_review_events
  for select to authenticated using (user_id = (select auth.uid()));

-- A single RPC computes the previous event on the server, then inserts.
-- The advisory lock prevents concurrent reviews of the same word from racing.
create or replace function public.record_study_review(
  p_card_id uuid, p_direction text, p_passed boolean
) returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_previous timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_direction not in ('jp_to_en','en_to_jp') then raise exception 'Invalid direction'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_card_id::text, 0));
  select max(reviewed_at) into v_previous from public.study_review_events
    where user_id = auth.uid() and card_id = p_card_id;
  insert into public.study_review_events(user_id, card_id, direction, passed, previous_reviewed_at)
    values(auth.uid(), p_card_id, p_direction, p_passed, v_previous);
end; $$;
revoke all on function public.record_study_review(uuid,text,boolean) from public;
grant execute on function public.record_study_review(uuid,text,boolean) to authenticated;

create or replace function public.get_study_retention()
returns table(seven_pass bigint, seven_total bigint, thirty_pass bigint, thirty_total bigint)
language sql stable security invoker set search_path = public as $$
  select count(*) filter(where gap_days >= 7 and passed),
         count(*) filter(where gap_days >= 7),
         count(*) filter(where gap_days >= 30 and passed),
         count(*) filter(where gap_days >= 30)
  from public.study_review_events where user_id = (select auth.uid());
$$;
grant execute on function public.get_study_retention() to authenticated;
