-- Reflex Mode: auto-fails a flashcard if not graded within 3 seconds. Off by default —
-- it's an opt-in drill, not a default study behavior.
alter table profiles add column if not exists reflex_mode boolean not null default false;
