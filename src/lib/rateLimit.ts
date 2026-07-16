import { createClient } from "@supabase/supabase-js";
import { AI_DAILY_LIMITS, AI_DAILY_LIMITS_PREMIUM, AiEndpoint } from "@/lib/aiLimits";

export { AI_DAILY_LIMITS, AI_DAILY_LIMITS_PREMIUM };
export type { AiEndpoint };

// Server-side (service role) client — rate limit writes never go through the
// user's own RLS-scoped client, since we need to read/write regardless of the
// "readable by owner" policy direction and do it atomically via the RPC.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  used: number;
}

// Atomically records usage and reports whether this request should be allowed.
// Admins are fully exempt (internal/dev accounts). Premium gets a higher
// ceiling (AI_DAILY_LIMITS_PREMIUM), not a bypass — still tracked and capped,
// just generously, since even a paying user could otherwise be scripted for
// more cost than their subscription covers.
export async function checkAndRecordUsage(
  userId: string,
  endpoint: AiEndpoint,
  amount: number = 1
): Promise<RateLimitResult> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin, is_premium")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_admin) {
    return { allowed: true, limit: AI_DAILY_LIMITS[endpoint], used: 0 };
  }

  const limit = profile?.is_premium ? AI_DAILY_LIMITS_PREMIUM[endpoint] : AI_DAILY_LIMITS[endpoint];

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
