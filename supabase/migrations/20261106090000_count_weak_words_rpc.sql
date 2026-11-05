-- Quick Actions' Weak Words Quiz tile shows a badge with how many cards currently
-- qualify (same pool WeakWordsQuiz itself randomly samples 10 from: slow reflex,
-- weak, or struggling today) — fetched once when the Quick Actions sheet first
-- opens (BottomNav.tsx), same lazy timing as its other data. Doing this count
-- server-side instead of fetching every scored card to the client (what
-- WeakWordsQuiz's own load() does, fine there since it only runs when you actually
-- start the quiz) keeps opening the sheet itself cheap.
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
  from (
    select us.card_id
    from user_scores us
    where us.user_id = v_user_id
      and (
        -- weak: 10+ combined tries, <30% combined accuracy — same rule
        -- stats/page.tsx's weakWordsIds and WeakWordsQuiz's own pool use.
        (
          (coalesce((us.scores_json->'jp_to_en'->>'total')::int, 0) + coalesce((us.scores_json->'en_to_jp'->>'total')::int, 0)) >= 10
          and round(
            (coalesce((us.scores_json->'jp_to_en'->>'pass')::int, 0) + coalesce((us.scores_json->'en_to_jp'->>'pass')::int, 0))::numeric * 100
            / nullif(coalesce((us.scores_json->'jp_to_en'->>'total')::int, 0) + coalesce((us.scores_json->'en_to_jp'->>'total')::int, 0), 0)
          ) < 30
        )
        -- slow reflex: 3+ timed attempts
        or coalesce(us.reflex_attempts, 0) >= 3
      )
    union
    -- struggling today: failed 3+ times today (daily_struggles), same threshold
    -- Cards' "Struggling Today" and WeakWordsQuiz use.
    select ds.card_id
    from daily_struggles ds
    where ds.user_id = v_user_id and ds.struggle_date = p_today and ds.fail_count >= 3
  ) pool;
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function count_weak_words(date) from public;
revoke execute on function count_weak_words(date) from anon;
grant execute on function count_weak_words(date) to authenticated;
