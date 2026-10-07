-- Table: per-session quiz completions (reading, listening, grammar)
create table if not exists quiz_daily_stats (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  quiz_type   text        not null check (quiz_type in ('reading', 'listening', 'grammar')),
  n_level     text        not null check (n_level in ('N5', 'N4', 'N3', 'N2', 'N1')),
  correct     int         not null default 0,
  total       int         not null default 0,
  study_date  date        not null default current_date,
  created_at  timestamptz not null default now()
);

-- Index for quick per-user daily lookups
create index if not exists quiz_daily_stats_user_date_idx
  on quiz_daily_stats (user_id, study_date);

-- RLS
alter table quiz_daily_stats enable row level security;

create policy "Users can insert own quiz stats"
  on quiz_daily_stats for insert
  with check (auth.uid() = user_id);

create policy "Users can read own quiz stats"
  on quiz_daily_stats for select
  using (auth.uid() = user_id);

-- RPC called from quiz components: records one completed session
create or replace function log_quiz_daily(
  p_type    text,
  p_n_level text,
  p_correct int,
  p_total   int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into quiz_daily_stats (user_id, quiz_type, n_level, correct, total, study_date)
  values (auth.uid(), p_type, p_n_level, p_correct, p_total, current_date);
end;
$$;
