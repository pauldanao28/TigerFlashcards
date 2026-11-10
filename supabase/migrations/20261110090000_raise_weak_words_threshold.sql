-- Raise the "struggling today" bar from 2 fails back to 3 — matches the client-side
-- DAILY_STRUGGLE_THRESHOLD bump in stats/page.tsx and WeakWordsQuiz.tsx, so the Cards
-- "Struggling Today" count, the Study page badge, and count_weak_words all keep agreeing.
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
    and ds.fail_count >= 3
    and ds.cleared_at is null;
  return coalesce(v_count, 0);
end;
$$;
