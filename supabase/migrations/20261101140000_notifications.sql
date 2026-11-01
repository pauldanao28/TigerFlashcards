-- In-app notification history — every push the app sends (friend requests, friend
-- activity, streak reminders) also lands here, so the Home bell can list what you
-- missed even if push is off on this device. Rows are written only server-side
-- (service role, in lib/notifyServer.ts); users can read and mark their own as read.
--
-- dedupe_key makes each event fire at most once per recipient (e.g. one "Aki hit
-- their goal" per friend per day): the insert uses on conflict do nothing, and a push
-- is only sent for rows that were actually inserted.
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  actor_id   uuid references auth.users(id) on delete cascade,
  type       text not null,
  data       jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at    timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);

alter table notifications enable row level security;

create policy "users read own notifications"
  on notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users mark own notifications read"
  on notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Lets the bell's badge update live when a new row arrives.
alter publication supabase_realtime add table notifications;
