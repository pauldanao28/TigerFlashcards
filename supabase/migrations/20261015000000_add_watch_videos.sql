-- Saved videos for the Watch view: a YouTube video plus the transcript the user pasted or
-- uploaded, their clip range and where they stopped — so a transcript added on a PC is
-- there on their phone, and they can resume. One row per user per video.
create table if not exists watch_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  video_id text not null,                 -- 11-char YouTube id
  url text not null,                      -- the link as entered (keeps ?t= etc.)
  title text,                             -- from the player once it loads
  transcript text not null default '',
  line_count integer not null default 0,  -- parsed caption lines, for the list
  start_input text not null default '',   -- clip fields exactly as typed
  end_input text not null default '',
  end_mode text not null default 'end' check (end_mode in ('end', 'length')),
  length_input text not null default '',
  clip_manual boolean not null default false,
  last_position real,                     -- seconds, for resume
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, video_id)
);

alter table watch_videos enable row level security;

create policy "watch_videos owner select" on watch_videos
  for select to authenticated using (auth.uid() = user_id);
create policy "watch_videos owner insert" on watch_videos
  for insert to authenticated with check (auth.uid() = user_id);
create policy "watch_videos owner update" on watch_videos
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "watch_videos owner delete" on watch_videos
  for delete to authenticated using (auth.uid() = user_id);

-- "My videos" list: most recently watched first.
create index if not exists idx_watch_videos_user_updated on watch_videos (user_id, updated_at desc);
