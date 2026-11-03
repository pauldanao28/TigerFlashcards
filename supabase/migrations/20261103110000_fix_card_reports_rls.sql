-- "Admins can view all reports" had qual = true despite its name — since Postgres
-- OR's together multiple permissive policies for the same command, that alone meant
-- ANY signed-in user could select every card_reports row directly (reporter identity,
-- suggested_meaning text), bypassing the two other policies that correctly check
-- is_admin()/email, via the browser's own already-authenticated Supabase client —
-- the /admin page's is_admin redirect is a UI convenience, not an access boundary.
drop policy if exists "Admins can view all reports" on card_reports;

-- Regular users still need SOME way to know which cards are currently flagged — Study
-- excludes them from rotation (see StudyView.tsx) so a confirmed-bad example sentence
-- doesn't keep reaching learners while a report is pending. A security definer RPC
-- that returns only card_id for pending reports gives them exactly that, without
-- exposing who reported what or their suggested correction text.
create or replace function get_pending_flagged_card_ids()
returns table(card_id uuid)
language sql
security definer
set search_path = public
as $$
  select cr.card_id from card_reports cr where cr.status = 'pending';
$$;

grant execute on function get_pending_flagged_card_ids() to authenticated;
