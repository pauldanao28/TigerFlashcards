-- The live push_subscriptions table has a column named "auth", but the original
-- migration (20261031150000_push_subscriptions.sql) defines it as "auth_key", and
-- every piece of application code (/api/push/subscribe, lib/notifyServer.ts) was
-- written against "auth_key" — this drift (table created with one name, code/migration
-- written against another) is what made every notification-toggle attempt fail with
-- "Could not find the 'auth_key' column... in the schema cache". A straight rename,
-- not a drop/recreate — no data loss, existing rows keep their values.
alter table push_subscriptions rename column auth to auth_key;
