-- Weak Words Quiz's pool is now struggling-today only (daily_struggles), no longer
-- weak accuracy or slow reflex — this badge count (BottomNav's Quick Actions tile)
-- must match the same pool WeakWordsQuiz itself samples from. Same signature as
-- the original count_weak_words_rpc migration, so CREATE OR REPLACE is enough.
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
  where ds.user_id = v_user_id and ds.struggle_date = p_today and ds.fail_count >= 3;
  return coalesce(v_count, 0);
end;
$$;
