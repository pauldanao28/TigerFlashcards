// Daily Quests are fully derived — no daily_quests table, no new progress-tracking
// hooks into handleScore/quiz handlers/useAddWords. Which 2-3 quests show today is a
// pure function of (user_id, date), computed here with a seeded shuffle so it's
// stable across reloads/devices for the same user on the same day without storing
// anything. Each quest's progress reads fields get_dashboard_data already returns
// (daily_count, mastered_today, cards_added_today, done_today_quizzes) — see
// supabase/migrations/20261104110000_add_daily_quests_fields.sql for the one field
// that had to be added (cards_added_today; the rest already existed).
export type QuestKey =
  | "review_10"
  | "master_1"
  | "add_1"
  | "quiz_reading"
  | "quiz_listening"
  | "quiz_grammar";

export interface QuestDef {
  key: QuestKey;
  label: string;
  icon: string;
  target: number;
}

export const QUEST_CATALOG: QuestDef[] = [
  { key: "review_10", label: "Review 10 cards", icon: "🔁", target: 10 },
  { key: "master_1", label: "Master 1 card", icon: "⭐", target: 1 },
  { key: "add_1", label: "Add 1 new word", icon: "➕", target: 1 },
  { key: "quiz_reading", label: "Try today's Reading quiz", icon: "📖", target: 1 },
  { key: "quiz_listening", label: "Try today's Listening quiz", icon: "🎧", target: 1 },
  { key: "quiz_grammar", label: "Try today's Grammar quiz", icon: "📝", target: 1 },
];

// Simple string hash (djb2) feeding a seeded PRNG (mulberry32) — deterministic, no
// crypto needed, just needs to be stable and reasonably well-distributed.
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickDailyQuests(userId: string, dateStr: string, count = 3): QuestDef[] {
  const rand = mulberry32(seedFromString(`${userId}:${dateStr}`));
  const pool = [...QUEST_CATALOG];
  // Fisher-Yates with the seeded PRNG — same shuffle every time for this user+date.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

export interface QuestProgressSource {
  daily_count: number;
  mastered_today: number;
  cards_added_today: number;
  done_today_quizzes: { reading: boolean; listening: boolean; grammar: boolean };
}

export function questProgress(key: QuestKey, data: QuestProgressSource): number {
  switch (key) {
    case "review_10": return data.daily_count;
    case "master_1": return data.mastered_today;
    case "add_1": return data.cards_added_today;
    case "quiz_reading": return data.done_today_quizzes.reading ? 1 : 0;
    case "quiz_listening": return data.done_today_quizzes.listening ? 1 : 0;
    case "quiz_grammar": return data.done_today_quizzes.grammar ? 1 : 0;
  }
}
