-- A second, separate score per (user, card) — purely about recall speed, not knowledge.
-- Only moves on a grade made while Reflex Mode is on: +20 for a pass (recalled before the
-- deadline), -10 for a fail (timed out, or failed while under it). Unbounded (no clamp) so
-- it ranks "how slow/shaky" a word is relative to others, same as scores_json's percent
-- does for real accuracy — but it never touches scores_json itself, so the real pass/fail
-- signal stays exactly as it is today.
alter table user_scores add column if not exists reflex_score integer;
alter table user_scores add column if not exists reflex_attempts integer not null default 0;
