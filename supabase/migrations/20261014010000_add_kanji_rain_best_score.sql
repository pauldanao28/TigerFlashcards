alter table public.profiles
  add column if not exists minigame_kanji_rain_best integer not null default 0;
