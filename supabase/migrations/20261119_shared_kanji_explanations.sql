-- Shared, reusable kanji explanations. Run in Supabase SQL Editor before deploying.
create table if not exists public.kanji_explanations (
  character text primary key check (char_length(character) between 1 and 4),
  radicals text not null,
  story text not null,
  updated_at timestamptz not null default now()
);
alter table public.kanji_explanations enable row level security;
-- Reads are handled by the authenticated API; writes only via service-role key.
revoke all on public.kanji_explanations from anon, authenticated;
