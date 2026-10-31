-- Web Push subscriptions — one row per browser/device a user has opted into
-- notifications on. endpoint is unique per browser install, so re-subscribing
-- (e.g. after clearing site data) just upserts over the old row for that endpoint.
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "users manage their own push subscriptions"
  on push_subscriptions for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The notify-friend-request API route reads other users' subscriptions (to push a
-- notification *to* them) using the service-role key server-side, which bypasses RLS
-- entirely — same pattern as rateLimit.ts's supabaseAdmin client. No additional policy
-- needed for that path.
