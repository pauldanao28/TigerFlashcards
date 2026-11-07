-- Diagnostic confirmed only friendships and notifications were ever added to the
-- supabase_realtime publication (select tablename from pg_publication_tables where
-- pubname = 'supabase_realtime'). profiles and user_review_counts never were —
-- both predate this app's migrations convention (set up directly in the Supabase
-- dashboard) — so useFriends.ts's "profile-updates" (online status / streak) and
-- "progress-updates" (daily progress) postgres_changes subscriptions have been
-- silently receiving zero events this whole time, with no error of any kind:
-- RLS was never even reached, the rows just never left the table in the first
-- place. Adding a table to this publication only controls whether Realtime emits
-- change events for it — it has no effect on normal reads/writes.
alter publication supabase_realtime add table profiles;
alter publication supabase_realtime add table user_review_counts;
