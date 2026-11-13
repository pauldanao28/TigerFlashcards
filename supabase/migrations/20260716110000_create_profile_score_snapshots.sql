-- Daily snapshot of a user's four skill scores.
-- Written client-side after each quiz or study session that changes a score.
create table if not exists profile_score_snapshots (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  snapshot_date date        not null default current_date,
  vocab_score   int,
  grammar_score int,
  reading_score int,
  listening_score int,
  created_at    timestamptz not null default now(),
  unique (user_id, snapshot_date)   -- one row per user per day (upsert)
);

create index if not exists profile_score_snapshots_user_date_idx
  on profile_score_snapshots (user_id, snapshot_date desc);

alter table profile_score_snapshots enable row level security;

create policy "Users can upsert own snapshots"
  on profile_score_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update own snapshots"
  on profile_score_snapshots for update
  using (auth.uid() = user_id);

create policy "Users can read own snapshots"
  on profile_score_snapshots for select
  using (auth.uid() = user_id);

-- RPC: upsert today's snapshot, merging only the supplied score (others stay as-is)
create or replace function upsert_score_snapshot(
  p_vocab     int default null,
  p_grammar   int default null,
  p_reading   int default null,
  p_listening int default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profile_score_snapshots
    (user_id, snapshot_date, vocab_score, grammar_score, reading_score, listening_score)
  values
    (auth.uid(), current_date, p_vocab, p_grammar, p_reading, p_listening)
  on conflict (user_id, snapshot_date) do update set
    vocab_score     = coalesce(excluded.vocab_score,     profile_score_snapshots.vocab_score),
    grammar_score   = coalesce(excluded.grammar_score,   profile_score_snapshots.grammar_score),
    reading_score   = coalesce(excluded.reading_score,   profile_score_snapshots.reading_score),
    listening_score = coalesce(excluded.listening_score, profile_score_snapshots.listening_score);
end;
$$;
