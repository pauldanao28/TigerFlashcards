-- Per-user per-day log of Reader sentences / Watch caption lines the user specifically
-- tapped "Explain" on (see useLineExplain / /api/reader/explain) — distinct from any
-- study-card data, this is reading/listening material they asked for help with, meant to
-- be exported (e.g. into a study diary) the same way Struggling Today is.
create table if not exists daily_explained_lines (
  user_id uuid not null references auth.users(id) on delete cascade,
  explain_date date not null,
  source text not null check (source in ('reader', 'watch')),
  line_text text not null,
  source_title text,
  explain_count integer not null default 1,
  first_explained_at timestamptz not null default now(),
  primary key (user_id, explain_date, source, line_text)
);

alter table daily_explained_lines enable row level security;

create policy "user can read own explained lines"
  on daily_explained_lines for select
  using (auth.uid() = user_id);

-- Atomic upsert-or-increment, called client-side (useLineExplain) right after a
-- successful "Explain" fetch. security definer so the single INSERT ... ON CONFLICT
-- doesn't need separate insert+update RLS policies for the same effect.
create or replace function record_explained_line(
  target_user_id uuid,
  target_source text,
  target_line text,
  target_title text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into daily_explained_lines (user_id, explain_date, source, line_text, source_title, explain_count)
  values (target_user_id, (now() at time zone 'Asia/Singapore')::date, target_source, target_line, target_title, 1)
  on conflict (user_id, explain_date, source, line_text)
  do update set
    explain_count = daily_explained_lines.explain_count + 1,
    source_title = coalesce(excluded.source_title, daily_explained_lines.source_title);
end;
$$;

grant execute on function record_explained_line(uuid, text, text, text) to authenticated;
