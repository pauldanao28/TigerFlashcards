// src/lib/social.ts
import { supabase } from './supabase';

export type FriendCandidate = { id: string; full_name: string };

// Referral codes are always 8 chars from generate_referral_code()'s charset
// (uppercase letters minus I/L/O, digits minus 0/1) — distinct enough from
// a display name that we can auto-detect which kind of lookup to do.
const REFERRAL_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/i;

type FriendActionResult =
  | { success: true; name: string; error?: undefined; needsDisambiguation?: undefined }
  | { error: string; success?: undefined; needsDisambiguation?: undefined }
  | { needsDisambiguation: true; matches: FriendCandidate[]; success?: undefined; error?: undefined };

const sendFriendRequest = async (
  currentUserId: string,
  target: FriendCandidate,
): Promise<FriendActionResult> => {
  if (target.id === currentUserId) {
    return { error: "You can't add yourself" };
  }

  const { error: insertError } = await supabase
    .from('friendships')
    .insert([
      {
        user_id: currentUserId,   // You (the sender)
        friend_id: target.id,     // Them (the receiver)
        status: 'pending',
      },
    ]);

  if (insertError) {
    // Unique constraint violation (already friends or pending)
    if (insertError.code === '23505') {
      return { error: "Request already exists or you are already friends" };
    }
    return { error: insertError.message };
  }

  return { success: true, name: target.full_name };
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

export const processReferral = async (newUserId: string, referralCode: string) => {
  try {
    // 1. Find the Referrer via the narrow RPC — matched by referral_code
    // (stable, unique, opaque), not full_name. profiles is no longer
    // publicly readable, and this must work for a user who was just
    // created moments ago and isn't "connected" to the referrer yet.
    const { data: referrerRows, error: findError } = await supabase
      .rpc("find_user_by_referral_code", { p_code: referralCode });
    const referrer = referrerRows?.[0];

    if (findError || !referrer) {
      console.error("Referrer not found");
      return { success: false, error: "Referrer not found" };
    }

    // --- NEW CHECK: Stop self-referral ---
    if (referrer.id === newUserId) {
      console.log("Self-referral blocked. You cannot invite yourself!");
      localStorage.removeItem("tg_referrer"); // Clean up so the error stops popping up
      return { success: false, error: "Self-referral" };
    }

    // 2. Insert into the referrals table
    const { error: refError } = await supabase.from("referrals").insert([
      {
        referrer_id: referrer.id,
        referred_id: newUserId,
      },
    ]);

    if (refError) {
      console.error("Referral record failed:", refError.message);
      return { success: false, error: refError.message };
    }

    // 3. Auto-add as friends (Mutual connection)
    await supabase.from("friendships").insert([
      { user_id: referrer.id, friend_id: newUserId, status: "accepted" },
      { user_id: newUserId, friend_id: referrer.id, status: "accepted" }
    ]);

    // 4. Clean up
    localStorage.removeItem("tg_referrer");
    return { success: true };

  } catch (e) {
    console.error("Referral process crashed:", e);
    return { success: false, error: "Internal crash" };
  }
};