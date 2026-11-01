// src/lib/social.ts
import { supabase } from './supabase';
import { notifyFriendRequest, notifyFriendAccepted } from './push';

export type FriendCandidate = { id: string; full_name: string };

// Referral codes are always 8 chars from generate_referral_code()'s charset
// (uppercase letters minus I/L/O, digits minus 0/1) — distinct enough from
// a display name that we can auto-detect which kind of lookup to do.
const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/i;

type FriendActionResult =
  | { success: true; name: string; autoAccepted?: boolean; error?: undefined; needsDisambiguation?: undefined }
  | { error: string; success?: undefined; needsDisambiguation?: undefined }
  | { needsDisambiguation: true; matches: FriendCandidate[]; success?: undefined; error?: undefined };

// Goes through send_friend_request (see its migration) rather than a raw insert —
// friendships' unique constraint is only on (user_id, friend_id), not symmetric, so a
// raw insert can't detect "they already sent me a request" and would create a second,
// crossed-direction row instead of just accepting theirs. The RPC decides atomically.
const sendFriendRequest = async (
  currentUserId: string,
  target: FriendCandidate,
): Promise<FriendActionResult> => {
  if (target.id === currentUserId) {
    return { error: "You can't add yourself" };
  }

  const { data, error } = await supabase.rpc('send_friend_request', { p_target_id: target.id });
  if (error) return { error: error.message };

  switch (data as string) {
    case 'sent':
      // Fire-and-forget — a push failure (not configured, permission never
      // granted, etc.) shouldn't block or fail the request-sent flow itself.
      notifyFriendRequest(target.id);
      return { success: true, name: target.full_name };
    case 'accepted':
      // They'd already sent us a request — this call accepted it instead of
      // creating a duplicate, so the outcome is "friends now", not "request sent".
      // Notify them the same way an explicit Accept-button tap would.
      notifyFriendAccepted(target.id);
      return { success: true, name: target.full_name, autoAccepted: true };
    case 'already_pending':
      return { error: "Request already exists" };
    case 'already_friends':
      return { error: "You're already friends" };
    case 'self':
      return { error: "You can't add yourself" };
    default:
      return { error: "Something went wrong" };
  }
};

// Single entry point for the "add friend" box — accepts either a display
// name or a referral code. Returns `needsDisambiguation` with the candidate
// list when a name matches more than one profile, instead of silently
// picking one (find_user_by_name no longer collapses to a single row).
export const addFriend = async (input: string): Promise<FriendActionResult> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const cleaned = input.trim();
  if (!cleaned) return { error: "Please enter a name or code" };

  if (REFERRAL_CODE_PATTERN.test(cleaned)) {
    const { data: matches, error } = await supabase
      .rpc('find_user_by_referral_code', { p_code: cleaned });

    if (error || !matches || matches.length === 0) {
      return { error: "Code not found" };
    }
    return sendFriendRequest(user.id, matches[0]);
  }

  // profiles is no longer publicly readable, so a stranger's row can only
  // be found via this narrow RPC, and only id/full_name are ever returned
  // (no scores/streak).
  const { data: matches, error } = await supabase
    .rpc('find_user_by_name', { p_name: cleaned });

  if (error || !matches || matches.length === 0) {
    return { error: "User not found" };
  }
  if (matches.length > 1) {
    return { needsDisambiguation: true as const, matches: matches as FriendCandidate[] };
  }
  return sendFriendRequest(user.id, matches[0]);
};

// Used once a disambiguation list is shown and the user taps the right one.
export const addFriendById = async (target: FriendCandidate): Promise<FriendActionResult> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };
  return sendFriendRequest(user.id, target);
};

export const cancelFriendRequest = async (friendId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Delete both directions of the pending request
  const { error } = await supabase
    .from('friendships')
    .delete()
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`);

  return { error };
};

// ACCEPT: Change status from 'pending' to 'accepted'
export const handleAcceptRequest = async (senderId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .match({ user_id: senderId, friend_id: user.id });

  if (error) console.error("Accept Error:", error.message);
  else notifyFriendAccepted(senderId);
  return { error };
};

// IGNORE: Just delete the row entirely
export const handleIgnoreRequest = async (senderId: string) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from('friendships')
    .delete()
    .match({ user_id: senderId, friend_id: user.id });

  if (error) console.error("Ignore Error:", error.message);
  return { error };
};

// Goes through process_referral (see its migration) rather than raw client inserts —
// the mutual-friendship insert needs a row with the REFERRER as user_id, and a plain
// insert authenticated as the newly-referred user can't satisfy an auth.uid() =
// user_id RLS check for that row. Doing the whole thing atomically server-side also
// means the two call sites (Auth.tsx right after signUp, StudyView's fallback for when
// email confirmation delays that first attempt) can't race into a double-insert.
export const processReferral = async (referralCode: string) => {
  try {
    const { data, error } = await supabase.rpc("process_referral", { p_code: referralCode });
    if (error) {
      console.error("Referral process failed:", error.message);
      return { success: false, error: error.message };
    }

    switch (data as string) {
      case "linked":
        localStorage.removeItem("tg_referrer");
        return { success: true };
      case "self":
        console.log("Self-referral blocked. You cannot invite yourself!");
        localStorage.removeItem("tg_referrer"); // Clean up so the error stops popping up
        return { success: false, error: "Self-referral" };
      case "already_referred":
        localStorage.removeItem("tg_referrer");
        return { success: false, error: "Already referred" };
      case "invalid_code":
        console.error("Referrer not found");
        return { success: false, error: "Referrer not found" };
      default:
        return { success: false, error: "Something went wrong" };
    }
  } catch (e) {
    console.error("Referral process crashed:", e);
    return { success: false, error: "Internal crash" };
  }
};