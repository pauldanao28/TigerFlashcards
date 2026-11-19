-- Run once in Supabase SQL Editor. Shared across all learners.
create table if not exists public.te_form_examples (
  card_id uuid primary key references public.master_cards(id) on delete cascade,
  te_form text not null,
  jp text not null,
  en text not null,
  created_at timestamptz not null default now()
);
alter table public.te_form_examples enable row level security;
revoke all on public.te_form_examples from anon, authenticated;
