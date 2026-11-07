-- Informational tag only — does NOT create a second scoring signal. fail_count (the
-- real pass/fail, used for the 3+ threshold) still counts a Reflex Mode timeout exactly
-- like any other Fail, via the unchanged record_daily_struggle call. reflex_fail_count
-- just remembers how many of today's fails on this card were Reflex Mode timeouts
-- specifically, so the UI can show a small "Reflex" tag alongside the existing fail
-- count, without touching record_daily_struggle's existing signature at all.
alter table daily_struggles add column if not exists reflex_fail_count integer not null default 0;

-- Called right after record_daily_struggle, only when the Fail was a Reflex Mode
-- timeout. The row already exists by the time this runs (record_daily_struggle just
-- created/updated it), so this is a plain increment, not an upsert.
create or replace function bump_reflex_struggle(target_user_id uuid, target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update daily_struggles
  set reflex_fail_count = reflex_fail_count + 1
  where user_id = target_user_id
    and card_id = target_card_id
    and struggle_date = (now() at time zone 'Asia/Singapore')::date;
end;
$$;

grant execute on function bump_reflex_struggle(uuid, uuid) to authenticated;
