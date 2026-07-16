// src/lib/social.ts
import { supabase } from './supabase';
export const addFriendByUsername = async (targetUsername: string) => {
  // 1. Get Current User
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not logged in" };

  const cleanUsername = targetUsername.trim();
  if (!cleanUsername) return { error: "Please enter a name" };

  // 2. Find the target user via the narrow RPC — profiles is no longer
  // publicly readable, so a stranger's row can only be found this way,
  // and only id/full_name are ever returned (no scores/streak).
  const { data: profiles, error: profileError } = await supabase
    .rpc('find_user_by_name', { p_name: cleanUsername });

  // Check if query failed or no user was found
  if (profileError || !profiles || profiles.length === 0) {
    return { error: "User not found" };
  }

  // Safely extract the single object from the array
  const targetProfile = profiles[0];

  // 3. Validation: Don't add yourself
  if (targetProfile.id === user.id) {
    return { error: "You can't add yourself" };
  }

  // 4. Insert the Friendship (Single Row Approach)
  const { error: insertError } = await supabase
    .from('friendships')
    .insert([
      { 
        user_id: user.id,            // You (The Sender)
        friend_id: targetProfile.id,   // Them (The Receiver)
        status: 'pending' 
      }
    ]);

  // 5. Handle Errors (like duplicate requests)
  if (insertError) {
    // Check for unique constraint violation (already friends or pending)
    if (insertError.code === '23505') {
      return { error: "Request already exists or you are already friends" };
    }
    return { error: insertError.message };
  }

  console.log("Success! Found and added:", targetProfile.full_name);
  return { success: true, name: targetProfile.full_name };
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