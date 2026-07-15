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

// Rolling average — sessions weighted 15%, history weighted 85%.
// Heavy anchoring to past performance prevents single-day grinding.
export function rollingAvg(oldScore: number, sessionScore: number): number {
  return Math.min(100, Math.max(0, oldScore * 0.85 + sessionScore * 0.15));
}

// Diminishing returns multiplier — 1st/2nd quiz of day = full weight,
// 3rd/4th = 50%, 5th+ = 25%. Pass quizzes completed BEFORE this session.
export function dailySessionWeight(completedBeforeThis: number): number {
  if (completedBeforeThis < 2) return 1.0;
  if (completedBeforeThis < 4) return 0.5;
  return 0.25;
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

// Correct answers needed per N level to reach full credit (20 pts) for reading and listening.
// 40 = two full sessions of 20 questions at perfect accuracy.
export const QUIZ_LEVEL_REQUIRED = 40;

// Score from accumulated correct/total per N level — shared by reading and listening.
// Mirrors grammarPatternScore but for AI-generated quizzes with no fixed question bank:
// correct answers accumulate across sessions; QUIZ_LEVEL_REQUIRED correct = 20 pts per level.
export function levelQuizScore(
  stats: Partial<Record<string, { correct: number; total: number }>>
): number {
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  let score = 0;
  for (const level of LEVELS) {
    const s = stats[level];
    if (!s || s.correct === 0) continue;
    score += Math.min(s.correct / QUIZ_LEVEL_REQUIRED, 1) * 20;
  }
  return Math.min(100, Math.round(score));
}

// JLPT cumulative vocab targets — cards needed to reach each level.
export const JLPT_VOCAB_FLOOR: Record<string, number> = {
  N5: 800,
  N4: 1500,
  N3: 3750,
  N2: 6000,
  N1: 10000,
};

// Incremental (level-specific) targets derived from the cumulative JLPT_VOCAB_FLOOR above —
// e.g. N4's cumulative floor of 1500 already includes the ~800 N5 words, so the vocab that's
// actually *new* to N4 is 1500-800=700. Used for per-level breakdowns where a level's own
// tagged card count should be compared against its own target, not a cumulative one that
// already includes easier levels.
export const JLPT_VOCAB_INCREMENT: Record<string, number> = {
  N5: JLPT_VOCAB_FLOOR.N5,
  N4: JLPT_VOCAB_FLOOR.N4 - JLPT_VOCAB_FLOOR.N5,
  N3: JLPT_VOCAB_FLOOR.N3 - JLPT_VOCAB_FLOOR.N4,
  N2: JLPT_VOCAB_FLOOR.N2 - JLPT_VOCAB_FLOOR.N3,
  N1: JLPT_VOCAB_FLOOR.N1 - JLPT_VOCAB_FLOOR.N2,
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
// A card is "known" when its combined accuracy >= 70%.
// Score = known_cards / vocabFloor(deckSize) so unlearned/unmined cards don't inflate the score.
export function vocabMastery(cardAccuracies: number[], deckSize: number): number {
  const known = cardAccuracies.filter(a => a >= 70).length;
  const denominator = vocabFloor(deckSize);
  return Math.min(100, Math.round((known / denominator) * 100));
}

// Grammar score derived purely from pattern performance — each JLPT level contributes 20 points
// based on what % of that level's patterns have been answered correctly (≥ 80% accuracy, any
// number of attempts). Level unlocking uses a stricter isMastered threshold (≥ 3 attempts)
// to prevent lucky single-try unlocks, but scoring counts even the first correct answer so
// the score isn't stuck at 0 after completing a first quiz.
// N5=0-20, N4=20-40, N3=40-60, N2=60-80, N1=80-100.
export function grammarPatternScore(
  patterns: { id: string; jlpt_level: string }[],
  scoreMap: Map<string, { total: number; percent: number }>
): number {
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const byLevel = new Map<string, string[]>();
  for (const p of patterns) {
    if (!byLevel.has(p.jlpt_level)) byLevel.set(p.jlpt_level, []);
    byLevel.get(p.jlpt_level)!.push(p.id);
  }
  let score = 0;
  for (const level of LEVELS) {
    const ids = byLevel.get(level) ?? [];
    if (ids.length === 0) continue;
    const mastered = ids.filter(id => {
      const s = scoreMap.get(id);
      return s && s.total >= 1 && s.percent >= 80;
    }).length;
    score += (mastered / ids.length) * 20;
  }
  return Math.min(100, Math.round(score));
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
