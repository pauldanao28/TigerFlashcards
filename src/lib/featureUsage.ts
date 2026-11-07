import { supabase } from "@/lib/supabase";

// Backs the Translate/Read/Watch daily quests (dailyQuests.ts) — Translate, Reader and
// Watch aren't graded quizzes, so they don't fit quiz_daily_stats' schema (quiz_type/
// n_level/correct/total). This just marks "used today" in daily_feature_usage, read
// back by get_dashboard_data (done_today_translate/done_today_read_watch) and
// get_friends_quest_progress_today. Fire-and-forget — a failure here shouldn't block
// or fail the feature it's called from, just means that one quest doesn't tick over.
export function markFeatureUsedToday(feature: "translate" | "reader" | "watch") {
  supabase.rpc("mark_feature_used_today", { p_feature: feature }).then(({ error }) => {
    if (error) console.error("[mark_feature_used_today]", feature, error.code, error.message);
  });
}
