-- increment_ai_usage is SECURITY DEFINER, so it runs with elevated
-- privileges regardless of caller. Postgres grants EXECUTE on new
-- functions to PUBLIC by default, and the original migration never
-- revoked it — meaning any anon/authenticated client could call this
-- RPC directly with an arbitrary user_id and amount (including
-- negative), completely bypassing checkAndRecordUsage()'s rate limit
-- check. Confirmed exploitable via a live probe with only the anon key.
--
-- Only the server (via the service-role client in rateLimit.ts) should
-- ever call this function.
REVOKE EXECUTE ON FUNCTION increment_ai_usage(uuid, text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_ai_usage(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_ai_usage(uuid, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_usage(uuid, text, integer) TO service_role;
