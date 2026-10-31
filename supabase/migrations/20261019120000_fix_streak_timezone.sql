-- Moves daily-streak date math off the client. The old client-side version computed
-- "today"/"yesterday" from `new Date()` on whatever device called it — switching
-- between a phone and a PC (different timezone/locale/clock settings) could make the
-- server-stored last_review_date look like it matched neither "today" nor "yesterday"
-- from the new device's point of view, silently resetting the streak. Same fixed-
-- timezone pattern already used for daily_struggles/daily_explained_lines, so "today"
-- means the same calendar day no matter which device or timezone is asking.
create or replace function update_streak(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Singapore')::date;
  prev_date date;
  prev_streak integer;
  new_streak integer;
begin
  select last_review_date, streak_count into prev_date, prev_streak
  from profiles where id = target_user_id;

  if prev_date = today then
    return coalesce(prev_streak, 0);
  end if;

  new_streak := case when prev_date = today - 1 then coalesce(prev_streak, 0) + 1 else 1 end;

  update profiles set streak_count = new_streak, last_review_date = today where id = target_user_id;

  return new_streak;
end;
$$;

grant execute on function update_streak(uuid) to authenticated;
