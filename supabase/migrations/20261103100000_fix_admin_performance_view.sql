-- admin_user_performance_master predates migration tracking (created directly in
-- Supabase), so this is a straight CREATE OR REPLACE capturing it as it stood, with
-- two fixes:
--
-- 1. mastered_count/struggling_count used a different rule than the rest of the app
--    (average of both directions' percent >= 80% / < 40%, no minimum attempt count —
--    so a single lucky pass could count as "mastered"). Replaced with the same rule
--    used everywhere else (get_dashboard_data, Dashboard.tsx): >=5 passes AND >=70%
--    in EITHER direction. struggling_count mirrors the same per-direction fields —
--    attempted at least once, not mastered, and neither direction reaches 40%.
--
-- 2. total_cards_added (master_cards.creator_id) answers "how many NEW cards has
--    this user contributed to the shared library", not "how many cards do they
--    have" — master_cards is shared, so most of a user's deck is typically cards
--    someone else (or AI generation) already created. Added deck_size as a new
--    column (their default deck's actual card count) to answer that directly.
create or replace view admin_user_performance_master as
select
  p.id,
  p.email,
  p.full_name,
  p.streak_count,
  p.max_streak as profile_max_streak,
  coalesce((
    select urc.count from user_review_counts urc
    where urc.user_id = p.id and urc.study_date = (current_timestamp at time zone 'Asia/Singapore')::date
  ), 0) as reviews_today,
  (select count(*) from user_scores us where us.user_id = p.id) as cards_studied,
  (
    select count(*) from user_scores us
    where us.user_id = p.id
      and (
        (coalesce((us.scores_json -> 'jp_to_en' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'jp_to_en' ->> 'percent')::numeric, 0) >= 70)
        or
        (coalesce((us.scores_json -> 'en_to_jp' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'en_to_jp' ->> 'percent')::numeric, 0) >= 70)
      )
  ) as mastered_count,
  (
    select count(*) from user_scores us
    where us.user_id = p.id
      and (coalesce((us.scores_json -> 'jp_to_en' ->> 'total')::numeric, 0)
           + coalesce((us.scores_json -> 'en_to_jp' ->> 'total')::numeric, 0)) > 0
      and not (
        (coalesce((us.scores_json -> 'jp_to_en' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'jp_to_en' ->> 'percent')::numeric, 0) >= 70)
        or
        (coalesce((us.scores_json -> 'en_to_jp' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'en_to_jp' ->> 'percent')::numeric, 0) >= 70)
      )
      and coalesce((us.scores_json -> 'jp_to_en' ->> 'percent')::numeric, 0) < 40
      and coalesce((us.scores_json -> 'en_to_jp' ->> 'percent')::numeric, 0) < 40
  ) as struggling_count,
  coalesce(round((
    select sum((us.scores_json -> 'en_to_jp' ->> 'pass')::numeric) / nullif(sum((us.scores_json -> 'en_to_jp' ->> 'total')::numeric), 0)
    from user_scores us where us.user_id = p.id
  ) * 100, 1), 0) as actual_en_jp_pct,
  coalesce(round((
    select sum((us.scores_json -> 'jp_to_en' ->> 'pass')::numeric) / nullif(sum((us.scores_json -> 'jp_to_en' ->> 'total')::numeric), 0)
    from user_scores us where us.user_id = p.id
  ) * 100, 1), 0) as actual_jp_en_pct,
  (
    select count(*) from deck_cards dc join decks d on dc.deck_id = d.id
    where d.user_id = p.id
      and (dc.added_at at time zone 'Asia/Singapore')::date = (current_timestamp at time zone 'Asia/Singapore')::date
  ) as cards_added_today,
  (select count(*) from master_cards mc where mc.creator_id = p.id) as total_cards_added,
  (
    select count(*) from deck_cards dc join decks d on dc.deck_id = d.id
    where d.user_id = p.id and d.is_default = true
  ) as deck_size
from profiles p
order by (coalesce((
  select urc.count from user_review_counts urc
  where urc.user_id = p.id and urc.study_date = (current_timestamp at time zone 'Asia/Singapore')::date
), 0)) desc, p.streak_count desc;
