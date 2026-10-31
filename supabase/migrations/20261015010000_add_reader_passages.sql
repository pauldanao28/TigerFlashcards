-- Saved passages for the Reader view: the text (pasted or AI-generated), its grammar
-- notes (so resuming doesn't re-spend an AI call), and where the user left off reading —
-- so a passage read on a PC is there on their phone, and they can resume. One row per
-- reading session (no natural dedup key, unlike Watch's video_id).
create table if not exists reader_passages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  passage text not null,
  source text not null default 'pasted' check (source in ('pasted', 'generated')),
  gen_level text,                         -- N5..N1, set when source = 'generated'
  gen_topic text,
  grammar_notes jsonb not null default '[]'::jsonb,
  read_idx integer,                       -- index into splitSentences(passage), for resume
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table reader_passages enable row level security;

create policy "reader_passages owner select" on reader_passages
  for select to authenticated using (auth.uid() = user_id);
create policy "reader_passages owner insert" on reader_passages
  for insert to authenticated with check (auth.uid() = user_id);
create policy "reader_passages owner update" on reader_passages
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reader_passages owner delete" on reader_passages
  for delete to authenticated using (auth.uid() = user_id);

-- "My passages" list: most recently read first.
create index if not exists idx_reader_passages_user_updated on reader_passages (user_id, updated_at desc);
