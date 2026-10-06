import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const WEAK_MIN_ATTEMPTS = 3;
const WEAK_LIST_SIZE = 20;

interface ModeStats { pass: number; fail: number; total: number; percent: number }
interface CardRow {
  japanese: string;
  reading: string;
  english: string;
  jlpt_level: string | null;
  partOfSpeech: string | null;
  user_scores: { scores_json: { jp_to_en: ModeStats; en_to_jp: ModeStats } | null; is_priority: boolean | null }[];
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

// A card's "combined" accuracy folds both study directions into one number —
// good enough for grouping/ranking, where per-direction nuance isn't the point.
function combinedAccuracy(s: { jp_to_en: ModeStats; en_to_jp: ModeStats } | null): { pass: number; total: number } {
  if (!s) return { pass: 0, total: 0 };
  return {
    pass: (s.jp_to_en?.pass || 0) + (s.en_to_jp?.pass || 0),
    total: (s.jp_to_en?.total || 0) + (s.en_to_jp?.total || 0),
  };
}

async function requireAdmin(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const { data: profile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) } as const;
  return { user } as const;
}

// Pulls every scored word for this user (their default deck), aggregates it into a
// compact summary, and leaves the raw per-word list out except for the weakest slice —
// that's the only part where individual words (not just stats) are actually useful.
async function buildSummary(userId: string) {
  const { data: deck } = await supabaseAdmin
    .from("decks")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  const empty = {
    totals: { totalWords: 0, mastered: 0, struggling: 0, masteredPct: 0, strugglingPct: 0 },
    jlpt: Object.fromEntries(JLPT_LEVELS.map((lvl) => [lvl, { count: 0, avgAccuracy: 0 }])),
    direction: {
      jpToEn: { avgAccuracy: 0, totalReviews: 0 },
      enToJp: { avgAccuracy: 0, totalReviews: 0 },
    },
    partOfSpeech: {} as Record<string, { count: number; avgAccuracy: number }>,
    velocity: { last7: 0, last30: 0, byDay: {} as Record<string, number> },
    weakestWords: [] as { japanese: string; reading: string; english: string; accuracy: number; attempts: number }[],
    priorityCount: 0,
    streak: { current: 0, best: 0 },
  };

  if (!deck) return empty;

  const allRows: CardRow[] = [];
  const PAGE_SIZE = 1000;
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page, error } = await supabaseAdmin
      .from("master_cards")
      .select(`japanese, reading, english, jlpt_level, partOfSpeech, deck_cards!inner(deck_id), user_scores(scores_json, is_priority)`)
      .eq("deck_cards.deck_id", deck.id)
      .eq("user_scores.user_id", userId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (page) allRows.push(...(page as unknown as CardRow[]));
    if (!page || page.length < PAGE_SIZE) break;
  }

  const totalWords = allRows.length;
  let mastered = 0;
  let struggling = 0;
  let priorityCount = 0;
  const jlpt: Record<string, { count: number; accSum: number; accN: number }> = {};
  for (const lvl of JLPT_LEVELS) jlpt[lvl] = { count: 0, accSum: 0, accN: 0 };
  const pos: Record<string, { count: number; accSum: number; accN: number }> = {};
  let jpToEnPass = 0, jpToEnTotal = 0, enToJpPass = 0, enToJpTotal = 0;
  const weakCandidates: { japanese: string; reading: string; english: string; accuracy: number; attempts: number }[] = [];

  for (const row of allRows) {
    const scores = row.user_scores?.[0]?.scores_json ?? null;
    if (row.user_scores?.[0]?.is_priority) priorityCount++;
    const jp = scores?.jp_to_en;
    const en = scores?.en_to_jp;
    jpToEnPass += jp?.pass || 0; jpToEnTotal += jp?.total || 0;
    enToJpPass += en?.pass || 0; enToJpTotal += en?.total || 0;

    const isMastered = ((jp?.pass ?? 0) >= 5 && (jp?.percent ?? 0) >= 70) || ((en?.pass ?? 0) >= 5 && (en?.percent ?? 0) >= 70);
    const totalAttempts = (jp?.total ?? 0) + (en?.total ?? 0);
    const avgAccuracy = ((jp?.percent ?? 0) + (en?.percent ?? 0)) / 2;
    if (isMastered) mastered++;
    if (totalAttempts > 0 && avgAccuracy < 40) struggling++;

    const { pass, total } = combinedAccuracy(scores);
    const accuracy = total > 0 ? Math.round((pass / total) * 100) : null;

    if (row.jlpt_level && jlpt[row.jlpt_level]) {
      jlpt[row.jlpt_level].count++;
      if (accuracy !== null) { jlpt[row.jlpt_level].accSum += accuracy; jlpt[row.jlpt_level].accN++; }
    }

    const posKey = (row.partOfSpeech || "other").toLowerCase();
    const posBucket = (pos[posKey] ??= { count: 0, accSum: 0, accN: 0 });
    posBucket.count++;
    if (accuracy !== null) { posBucket.accSum += accuracy; posBucket.accN++; }

    if (accuracy !== null && total >= WEAK_MIN_ATTEMPTS) {
      weakCandidates.push({ japanese: row.japanese, reading: row.reading, english: row.english, accuracy, attempts: total });
    }
  }

  const weakestWords = weakCandidates.sort((a, b) => a.accuracy - b.accuracy).slice(0, WEAK_LIST_SIZE);

  const since30 = dayKey(daysAgo(29));
  const { data: reviewRows } = await supabaseAdmin
    .from("user_review_counts")
    .select("study_date, count")
    .eq("user_id", userId)
    .gte("study_date", since30);
  const byDay: Record<string, number> = {};
  for (let i = 0; i < 30; i++) byDay[dayKey(daysAgo(i))] = 0;
  for (const r of reviewRows ?? []) if (r.study_date in byDay) byDay[r.study_date] = r.count;
  const last7 = Object.entries(byDay).filter(([d]) => d >= dayKey(daysAgo(6))).reduce((s, [, c]) => s + c, 0);
  const last30 = Object.values(byDay).reduce((s, c) => s + c, 0);

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("streak_count, max_streak")
    .eq("id", userId)
    .maybeSingle();

  return {
    totals: {
      totalWords,
      mastered,
      struggling,
      masteredPct: totalWords ? Math.round((mastered / totalWords) * 100) : 0,
      strugglingPct: totalWords ? Math.round((struggling / totalWords) * 100) : 0,
    },
    jlpt: Object.fromEntries(JLPT_LEVELS.map((lvl) => [lvl, {
      count: jlpt[lvl].count,
      avgAccuracy: jlpt[lvl].accN ? Math.round(jlpt[lvl].accSum / jlpt[lvl].accN) : 0,
    }])),
    direction: {
      jpToEn: { avgAccuracy: jpToEnTotal ? Math.round((jpToEnPass / jpToEnTotal) * 100) : 0, totalReviews: jpToEnTotal },
      enToJp: { avgAccuracy: enToJpTotal ? Math.round((enToJpPass / enToJpTotal) * 100) : 0, totalReviews: enToJpTotal },
    },
    partOfSpeech: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, {
      count: v.count,
      avgAccuracy: v.accN ? Math.round(v.accSum / v.accN) : 0,
    }])),
    velocity: { last7, last30, byDay },
    weakestWords,
    priorityCount,
    streak: { current: profile?.streak_count ?? 0, best: profile?.max_streak ?? 0 },
  };
}

export type LearningSummary = Awaited<ReturnType<typeof buildSummary>>;

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const summary = await buildSummary(auth.user.id);
  return NextResponse.json({ summary });
}

const prompt = (summary: LearningSummary) => `You are a Japanese-learning coach. Here is a learner's aggregated
study data (already computed — don't recalculate anything, just interpret it):

${JSON.stringify(summary, null, 2)}

Write a short analysis as JSON with these exact keys:
- "overall": one short paragraph (2-3 sentences) assessing where they stand overall.
- "strengths": 2-4 short bullet strings naming specific things going well (reference actual numbers/levels/directions from the data).
- "weakSpots": 2-4 short bullet strings naming specific weaknesses. If weakestWords is non-empty, reference a few of those actual words by their "japanese" text.
- "jlptReadiness": one short paragraph guessing their practical JLPT readiness based on the per-level accuracy and counts.
- "recommendations": 2-3 short, concrete, actionable bullet strings for what to focus on next.

Output ONLY raw JSON, no markdown fences:
{ "overall": "...", "strengths": ["..."], "weakSpots": ["..."], "jlptReadiness": "...", "recommendations": ["..."] }`;

async function tryGenerate(modelName: string, text: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(text);
      return result.response.text();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = msg.includes("503") || msg.includes("429") || msg.includes("overloaded");
      if (!retryable || attempt === 2) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const summary = await buildSummary(user.id);
  if (summary.totals.totalWords === 0) {
    return NextResponse.json({ error: "No studied words yet — nothing to analyze." }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "learning_insights", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} analyses per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  const text = prompt(summary);
  let raw: string;
  try {
    raw = await tryGenerate("gemini-2.5-flash-lite", text);
  } catch {
    try {
      raw = await tryGenerate("gemini-2.5-flash", text);
    } catch (e) {
      console.error("Learning insights API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;

  try {
    const insights = JSON.parse(cleanJson);
    return NextResponse.json({ summary, insights });
  } catch {
    console.error("Gemini returned invalid JSON for learning insights:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
