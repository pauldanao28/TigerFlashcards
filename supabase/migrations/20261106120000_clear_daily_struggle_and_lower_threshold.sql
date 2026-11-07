-- Weak Words Quiz: easier to qualify for (threshold already lowered client-side to
-- 2 fails today, from 3), and a card you just got right in the quiz should stop
-- reappearing today instead of sitting in the pool forever (daily_struggles'
-- fail_count never decreases — see its own migration). cleared_at is a pure
-- pool-exclusion flag, not a correction to fail_count, so daily_struggles stays an
-- accurate "what did I get wrong today" diary.
alter table daily_struggles add column if not exists cleared_at timestamptz;

-- A fresh fail always re-qualifies the card for today's pool, even if it was
-- cleared earlier today after being answered correctly in Weak Words Quiz.
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
  do update set fail_count = daily_struggles.fail_count + 1, cleared_at = null;
end;
$$;

-- Called after a correct answer in Weak Words Quiz.
create or replace function clear_daily_struggle(target_user_id uuid, target_card_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update daily_struggles
  set cleared_at = now()
  where user_id = target_user_id
    and card_id = target_card_id
    and struggle_date = (now() at time zone 'Asia/Singapore')::date;
end;
$$;

grant execute on function clear_daily_struggle(uuid, uuid) to authenticated;

-- count_weak_words: lower threshold to match the quiz's own pool (2, down from 3),
-- and exclude cleared cards so the badge matches what the quiz would actually show.
create or replace function count_weak_words(p_today date)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count int;
begin
  select count(*) into v_count
  from daily_struggles ds
  where ds.user_id = v_user_id
    and ds.struggle_date = p_today
    and ds.fail_count >= 2
    and ds.cleared_at is null;
  return coalesce(v_count, 0);
end;
$$;
