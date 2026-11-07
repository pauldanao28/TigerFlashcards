-- Replaces the short-lived point score (reflex_score, +20/-10) with actual elapsed time —
-- a plain, self-explanatory metric needs no made-up weighting. reflex_time_total_ms is the
-- sum of how long each Reflex Mode PASS took to answer (capped at nothing — Reflex Mode no
-- longer enforces a hard deadline, it just measures). A Fail contributes nothing: this
-- metric is specifically "how long you take to recall a word you DO know," not accuracy —
-- Weak Words already covers "don't know it at all". reflex_attempts (added previously)
-- is reused as-is; it now counts only passes, since that's the only thing tracked.
alter table user_scores drop column if exists reflex_score;
alter table user_scores add column if not exists reflex_time_total_ms bigint not null default 0;
