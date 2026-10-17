-- Same class of bug as increment_ai_usage earlier: new Postgres functions
-- grant EXECUTE to PUBLIC by default, and the previous migration only
-- added an authenticated grant without revoking that default — confirmed
-- live that the anon key could still call find_user_by_name. Unlike
-- find_user_by_referral_code (deliberately anon-callable for the
-- pre-signup /join/[code] page), name search should require login.
revoke execute on function find_user_by_name(text) from public;
revoke execute on function find_user_by_name(text) from anon;
grant execute on function find_user_by_name(text) to authenticated;
