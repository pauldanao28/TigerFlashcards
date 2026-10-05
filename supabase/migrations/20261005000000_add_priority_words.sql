-- Per-user per-card "priority" flag, same granularity as scores_json — a word the
-- user wants to see more often during study, independent of its actual mastery.
-- prioritized_at lets the client enforce a rolling 30-word cap (oldest-prioritized
-- auto-demotes when a 31st is added) without a separate table.
alter table user_scores
  add column if not exists is_priority boolean not null default false,
  add column if not exists prioritized_at timestamptz;

-- Speeds up "give me my current priority list, oldest first" for the cap-eviction
-- check and the Priority Words modal.
create index if not exists idx_user_scores_priority
  on user_scores (user_id, prioritized_at)
  where is_priority = true;
