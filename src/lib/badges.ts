// Badges V1 catalog — display metadata + the same thresholds used to compute
// progress on a locked badge. The actual awarding happens server-side in
// check_and_award_badges (supabase/migrations/20261104100000_add_badges.sql);
// these numbers must stay in sync with that function's thresholds, or a badge
// could show "100%" here while still being locked (or vice versa).
export type BadgeCategory = "streak" | "mastery" | "jlpt" | "social";

export interface BadgeDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: BadgeCategory;
  threshold: number;
}

export const BADGES: BadgeDef[] = [
  { key: "streak_7", name: "Week One", description: "Reach a 7-day streak", icon: "🔥", category: "streak", threshold: 7 },
  { key: "streak_30", name: "Monthly Dedication", description: "Reach a 30-day streak", icon: "🔥", category: "streak", threshold: 30 },
  { key: "streak_100", name: "Centurion", description: "Reach a 100-day streak", icon: "🔥", category: "streak", threshold: 100 },

  { key: "mastered_50", name: "Getting Started", description: "Master 50 cards", icon: "🃏", category: "mastery", threshold: 50 },
  { key: "mastered_100", name: "Vocabulary Builder", description: "Master 100 cards", icon: "🃏", category: "mastery", threshold: 100 },
  { key: "mastered_500", name: "Vocabulary Master", description: "Master 500 cards", icon: "🃏", category: "mastery", threshold: 500 },

  { key: "jlpt_n5", name: "N5 Complete", description: "Master every N5 word in your deck's floor", icon: "🌱", category: "jlpt", threshold: 800 },
  { key: "jlpt_n4", name: "N4 Complete", description: "Master every N4 word in your deck's floor", icon: "🌿", category: "jlpt", threshold: 700 },
  { key: "jlpt_n3", name: "N3 Complete", description: "Master every N3 word in your deck's floor", icon: "⚡", category: "jlpt", threshold: 2250 },
  { key: "jlpt_n2", name: "N2 Complete", description: "Master every N2 word in your deck's floor", icon: "🔥", category: "jlpt", threshold: 2250 },
  { key: "jlpt_n1", name: "N1 Complete", description: "Master every N1 word in your deck's floor", icon: "🏆", category: "jlpt", threshold: 4000 },

  { key: "first_friend", name: "Not Alone", description: "Add your first friend", icon: "👋", category: "social", threshold: 1 },
];

export const BADGE_BY_KEY: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.key, b]));
