-- Badges V1 — 12 achievements across streak/mastery/JLPT-level/social, all computed
-- from stats already tracked elsewhere (no new tracking needed). Thresholds here
-- must stay in sync with src/lib/badges.ts, which mirrors them for display/progress
-- on locked badges — this RPC is the only place that actually AWARDS one.
create table if not exists user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_key  text not null,
  earned_at  timestamptz not null default now(),
  unique (user_id, badge_key)
);

create index if not exists user_badges_user_id_idx on user_badges (user_id);

alter table user_badges enable row level security;

create policy "users can read own badges"
  on user_badges for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for regular users — only check_and_award_badges
-- (security definer, bypasses RLS) can write rows, so a badge can't be faked by
-- calling the table directly from the browser console.

-- Awards any newly-qualified badges for the caller and returns just the new ones
-- (for a celebration toast) — already-earned badges are silently no-ops via
-- on conflict do nothing. Safe to call often; it's a handful of cheap aggregate
-- queries, not a full-deck scan.
create or replace function check_and_award_badges()
returns table(badge_key text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_streak int;
  v_mastered int;
  v_n5 int;
  v_n4 int;
  v_n3 int;
  v_n2 int;
  v_n1 int;
  v_friends int;
begin
  select coalesce(streak_count, 0) into v_streak from profiles where id = v_user_id;

  -- Same mastery rule used everywhere else in the app (get_dashboard_data,
  -- Dashboard.tsx): >=5 passes AND >=70% in either direction.
  select count(*) into v_mastered
  from user_scores us
  where us.user_id = v_user_id
    and (
      (coalesce((us.scores_json -> 'jp_to_en' ->> 'pass')::numeric, 0) >= 5
        and coalesce((us.scores_json -> 'jp_to_en' ->> 'percent')::numeric, 0) >= 70)
      or
      (coalesce((us.scores_json -> 'en_to_jp' ->> 'pass')::numeric, 0) >= 5
        and coalesce((us.scores_json -> 'en_to_jp' ->> 'percent')::numeric, 0) >= 70)
    );

  -- Per-level mastered counts, same per-card join get_dashboard_data's jlpt_stats
  -- loop uses, just pre-filtered to one mastery boolean per card.
  select
    count(*) filter (where x.jlpt_level = 'N5' and x.mastered),
    count(*) filter (where x.jlpt_level = 'N4' and x.mastered),
    count(*) filter (where x.jlpt_level = 'N3' and x.mastered),
    count(*) filter (where x.jlpt_level = 'N2' and x.mastered),
    count(*) filter (where x.jlpt_level = 'N1' and x.mastered)
    into v_n5, v_n4, v_n3, v_n2, v_n1
  from (
    select
      mc.jlpt_level,
      (
        (coalesce((us.scores_json -> 'jp_to_en' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'jp_to_en' ->> 'percent')::numeric, 0) >= 70)
        or
        (coalesce((us.scores_json -> 'en_to_jp' ->> 'pass')::numeric, 0) >= 5
          and coalesce((us.scores_json -> 'en_to_jp' ->> 'percent')::numeric, 0) >= 70)
      ) as mastered
    from deck_cards dc
    join decks d on dc.deck_id = d.id
    join master_cards mc on mc.id = dc.card_id
    left join user_scores us on us.card_id = dc.card_id and us.user_id = v_user_id
    where d.user_id = v_user_id and d.is_default = true
  ) x;

  select count(*) into v_friends
  from friendships f
  where f.status = 'accepted' and (f.user_id = v_user_id or f.friend_id = v_user_id);

  -- JLPT floors match scoring.ts's JLPT_VOCAB_INCREMENT exactly — "mastered this
  -- level's whole floor" is the same bar that maxes out that level's contribution
  -- to vocab_score.
  return query
  insert into user_badges (user_id, badge_key)
  select v_user_id, v.key
  from (values
    ('streak_7',     v_streak   >= 7),
    ('streak_30',    v_streak   >= 30),
    ('streak_100',   v_streak   >= 100),
    ('mastered_50',  v_mastered >= 50),
    ('mastered_100', v_mastered >= 100),
    ('mastered_500', v_mastered >= 500),
    ('jlpt_n5',      v_n5 >= 800),
    ('jlpt_n4',      v_n4 >= 700),
    ('jlpt_n3',      v_n3 >= 2250),
    ('jlpt_n2',      v_n2 >= 2250),
    ('jlpt_n1',      v_n1 >= 4000),
    ('first_friend', v_friends >= 1)
  ) as v(key, earned)
  where v.earned
  on conflict (user_id, badge_key) do nothing
  returning badge_key;
end;
$$;

grant execute on function check_and_award_badges() to authenticated;
