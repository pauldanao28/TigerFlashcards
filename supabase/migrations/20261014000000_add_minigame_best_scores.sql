alter table public.profiles
  add column if not exists minigame_speed_match_best integer not null default 0,
  add column if not exists minigame_survival_best integer not null default 0,
  add column if not exists minigame_type_hear_best integer not null default 0;
