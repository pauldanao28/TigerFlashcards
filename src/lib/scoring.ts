// Skill scoring — shared across Dashboard, StudyView, SentenceQuiz, ListeningQuiz, AdminChat

export interface SkillLevel {
  name: string;
  nameJp: string;
  color: string;
  bg: string;
}

const LEVELS: { min: number; name: string; nameJp: string; color: string; bg: string }[] = [
  { min: 80, name: "Expert",       nameJp: "達人",   color: "text-red-600",     bg: "bg-red-50"     },
  { min: 60, name: "Advanced",     nameJp: "上級者", color: "text-orange-600",  bg: "bg-orange-50"  },
  { min: 40, name: "Intermediate", nameJp: "中級者", color: "text-amber-600",   bg: "bg-amber-50"   },
  { min: 20, name: "Learner",      nameJp: "学習者", color: "text-emerald-600", bg: "bg-emerald-50" },
  { min: 0,  name: "Beginner",     nameJp: "初心者", color: "text-indigo-600",  bg: "bg-indigo-50"  },
];

export function getLevel(score: number): SkillLevel {
  return LEVELS.find(l => score >= l.min) ?? LEVELS[LEVELS.length - 1];
}

// Rolling average — sessions weighted 30%, history weighted 70%.
// Prevents single good/bad session from spiking the score.
export function rollingAvg(oldScore: number, sessionScore: number): number {
  return Math.min(100, Math.max(0, oldScore * 0.7 + sessionScore * 0.3));
}

// session_score = accuracy × difficulty — means perfect score on easy content
// doesn't push you to 100; you have to beat hard content to get a high score.
export function sessionScore(correct: number, total: number, difficulty: number): number {
  if (total === 0) return 0;
  return (correct / total) * Math.max(difficulty, 20);
}

// Bootstrap vocab_score from existing user_scores rows (called once when score is null).
// Uses a weighted average: more-attempted cards count more.
export function bootstrapVocabScore(
  rows: { scores_json: { jp_to_en?: { percent?: number; total?: number }; en_to_jp?: { percent?: number; total?: number } } }[]
): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const row of rows) {
    const s = row.scores_json ?? {};
    const jpTotal = s.jp_to_en?.total ?? 0;
    const enTotal = s.en_to_jp?.total ?? 0;
    const weight = jpTotal + enTotal;
    if (weight === 0) continue;
    const jpPct = s.jp_to_en?.percent ?? 0;
    const enPct = s.en_to_jp?.percent ?? 0;
    const avg = (jpPct + enPct) / 2;
    weightedSum += avg * weight;
    totalWeight += weight;
  }
  return totalWeight === 0 ? 0 : Math.round(weightedSum / totalWeight);
}

// Bootstrap reading_score from jp_to_en accuracy across all attempted cards.
export function bootstrapReadingScore(
  rows: { scores_json: { jp_to_en?: { percent?: number; total?: number } } }[]
): number {
  const attempted = rows.filter(r => (r.scores_json?.jp_to_en?.total ?? 0) > 0);
  if (attempted.length === 0) return 0;
  const avg = attempted.reduce((sum, r) => sum + (r.scores_json.jp_to_en?.percent ?? 0), 0) / attempted.length;
  return Math.round(avg);
}

// JLPT cumulative vocab targets — cards needed to reach each level.
export const JLPT_VOCAB_FLOOR: Record<string, number> = {
  N5: 800,
  N4: 1500,
  N3: 3750,
  N2: 6000,
  N1: 10000,
};

// Which JLPT tier a deck size falls into — determines the mastery floor.
export function deckJlptTier(deckSize: number): string {
  if (deckSize >= 6000) return "N1";
  if (deckSize >= 3750) return "N2";
  if (deckSize >= 1500) return "N3";
  if (deckSize >= 800) return "N4";
  return "N5";
}

// Floor = target card count for the next JLPT tier above your current deck size.
export function vocabFloor(deckSize: number): number {
  if (deckSize >= 6000) return 10000;
  if (deckSize >= 3750) return 6000;
  if (deckSize >= 1500) return 3750;
  if (deckSize >= 800) return 1500;
  return 800;
}

// Compute vocab mastery % from per-card combined accuracies (0-100 each).
// Denominator = vocabFloor(deckSize) so score reflects coverage of the JLPT tier.
// Unlearned deck cards contribute 0 accuracy.
export function vocabMastery(cardAccuracies: number[], deckSize: number): number {
  const denominator = vocabFloor(deckSize);
  const sum = cardAccuracies.reduce((a, b) => a + b, 0);
  return Math.min(100, Math.round(sum / denominator));
}

// Overall JLPT level estimate from a 0-100 skill score.
export function jlptLevel(score: number): string {
  if (score >= 80) return "N1";
  if (score >= 60) return "N2";
  if (score >= 40) return "N3";
  if (score >= 20) return "N4";
  return "N5";
}

// Max score achievable while answering questions at a given tier.
// Prevents grinding a lower tier to skip into a higher one — you can
// reach the entry of the next tier but not progress through it without
// actually facing that tier's questions.
export function tierScoreCap(currentScore: number): number {
  if (currentScore < 20) return 20;
  if (currentScore < 40) return 40;
  if (currentScore < 60) return 60;
  if (currentScore < 80) return 80;
  return 100;
}

// Difficulty label for quiz API prompts.
export function difficultyLabel(score: number): string {
  if (score >= 80) return "N1 / advanced — complex grammar, keigo, classical patterns, long compound sentences";
  if (score >= 60) return "N2 — passive, causative, potential, complex conditionals, keigo basics";
  if (score >= 40) return "N3 — て-form chains, たら/ば conditionals, て-verb compounds, plain form embedding";
  if (score >= 20) return "N4 — て-form, たい, polite/plain switching, simple compound sentences";
  return "N5 — extremely simple, present/past tense only, common verbs and nouns, short sentences";
}
