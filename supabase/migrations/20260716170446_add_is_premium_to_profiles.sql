-- Placeholder for a future paid tier — no billing integration yet, but the
-- rate limiter already checks this alongside is_admin so premium accounts
-- can be exempted from daily AI limits once payments exist.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;
