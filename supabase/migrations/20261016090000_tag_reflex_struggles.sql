-- Informational tag only — does NOT create a second scoring signal. fail_count (the
-- real pass/fail, used for the 3+ threshold) still counts a Reflex Mode timeout exactly
-- like any other Fail. reflex_fail_count just remembers how many of today's fails on
-- this card came from a Reflex Mode timeout, so the Struggling Today UI can show a
-- "Reflex" tag alongside the existing fail count, without changing what counts as a
-- struggle or how it's scored.
alter table daily_struggles add column if not exists reflex_fail_count integer not null default 0;

-- Signature is changing (new 3rd param), so the old 2-arg overload is dropped first to
-- avoid an ambiguous-call error when both versions exist at once.
drop function if exists record_daily_struggle(uuid, uuid);

create or replace function record_daily_struggle(
  target_user_id uuid,
  target_card_id uuid,
  is_reflex_timeout boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into daily_struggles (user_id, card_id, struggle_date, fail_count, reflex_fail_count)
  values (
    target_user_id,
    target_card_id,
    (now() at time zone 'Asia/Singapore')::date,
    1,
    case when is_reflex_timeout then 1 else 0 end
  )
  on conflict (user_id, card_id, struggle_date)
  do update set
    fail_count = daily_struggles.fail_count + 1,
    reflex_fail_count = daily_struggles.reflex_fail_count + case when is_reflex_timeout then 1 else 0 end;
end;
$$;

grant execute on function record_daily_struggle(uuid, uuid, boolean) to authenticated;
