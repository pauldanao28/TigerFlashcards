import { createClient } from "@supabase/supabase-js";

// Server-side (service role) client — rate limit writes never go through the
// user's own RLS-scoped client, since we need to read/write regardless of the
// "readable by owner" policy direction and do it atomically via the RPC.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Daily caps per AI-cost endpoint. Tune here — nothing else needs to change.
// generate/tts are counted by volume (words generated / characters spoken);
// the rest are counted per round/message, matching how they're actually billed.
export const AI_DAILY_LIMITS = {
  generate: 200,        // words card-generated per day
  chat: 80,              // sensei messages per day
  tts: 400,               // audio clips played per day (fires on every card flip)
  quiz_grammar: 15,       // grammar quiz rounds per day
  quiz_sentences: 15,     // reading quiz rounds per day
  quiz_listening: 15,     // listening quiz rounds per day
} as const;

export type AiEndpoint = keyof typeof AI_DAILY_LIMITS;

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  used: number;
}

// Atomically records usage and reports whether this request should be allowed.
// Admins are exempt (matches the existing !isAdmin checks already used for the
// old client-side quiz limits).
export async function checkAndRecordUsage(
  userId: string,
  endpoint: AiEndpoint,
  amount: number = 1
): Promise<RateLimitResult> {
  const limit = AI_DAILY_LIMITS[endpoint];

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_admin) {
    return { allowed: true, limit, used: 0 };
  }

  const { data, error } = await supabaseAdmin.rpc("increment_ai_usage", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_by_amount: amount,
  });

  if (error) {
    // Fail open on infra hiccups — a DB error shouldn't take down the whole
    // feature, but log it so a persistent failure gets noticed.
    console.error(`[rateLimit] increment_ai_usage failed for ${endpoint}:`, error.message);
    return { allowed: true, limit, used: 0 };
  }

  const used = data as number;
  return { allowed: used <= limit, limit, used };
}
