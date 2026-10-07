-- Server-side, DB-backed daily usage tracking per user per AI endpoint.
-- Replaces the old client-side (localStorage) daily limits, which were
-- trivially bypassable (clear storage / incognito / call the API directly).
CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  endpoint text NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date, endpoint)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage (e.g. to show "X/Y left today" in the UI).
-- All writes go through the service role inside API routes, not the client directly.
CREATE POLICY "ai_usage_daily readable by owner"
  ON ai_usage_daily FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date ON ai_usage_daily(user_id, usage_date);

-- Atomically increments today's usage for (user_id, endpoint) by `by_amount` and
-- returns the new total. Single round-trip, race-safe under concurrent requests
-- (unlike a client-side read-then-write), via INSERT ... ON CONFLICT DO UPDATE.
CREATE OR REPLACE FUNCTION increment_ai_usage(p_user_id uuid, p_endpoint text, p_by_amount integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_amount integer;
BEGIN
  INSERT INTO ai_usage_daily (user_id, usage_date, endpoint, amount)
  VALUES (p_user_id, (now() AT TIME ZONE 'utc')::date, p_endpoint, p_by_amount)
  ON CONFLICT (user_id, usage_date, endpoint)
  DO UPDATE SET amount = ai_usage_daily.amount + p_by_amount
  RETURNING amount INTO new_amount;

  RETURN new_amount;
END;
$$;
