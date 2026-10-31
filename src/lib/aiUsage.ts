"use client";
import { supabase } from "@/lib/supabase";
import { AI_DAILY_LIMITS, AI_DAILY_LIMITS_PREMIUM, AiEndpoint } from "@/lib/aiLimits";

export interface AiUsageInfo {
  used: number;
  limit: number;
  remaining: number;
}

// Reads today's usage for one endpoint directly via the normal (RLS-scoped)
// client — ai_usage_daily has a "readable by owner" policy, so no API route
// is needed just to check your own remaining count.
export async function getTodayUsage(userId: string, endpoint: AiEndpoint): Promise<AiUsageInfo> {
  const today = new Date().toLocaleDateString("en-CA");

  const [{ data: profile }, { data: usageRow }] = await Promise.all([
    supabase.from("profiles").select("is_admin, is_premium").eq("id", userId).maybeSingle(),
    supabase.from("ai_usage_daily").select("amount").eq("user_id", userId).eq("usage_date", today).eq("endpoint", endpoint).maybeSingle(),
  ]);

  if (profile?.is_admin) {
    const limit = AI_DAILY_LIMITS[endpoint];
    return { used: 0, limit, remaining: limit };
  }

  const limit = profile?.is_premium ? AI_DAILY_LIMITS_PREMIUM[endpoint] : AI_DAILY_LIMITS[endpoint];
  const used = usageRow?.amount ?? 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}
