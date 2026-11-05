import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";
import { stripParens, normalizeEnglish } from "@/lib/textNormalize";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Shown after adding a single word (not a batch) — "words you might also want to
// learn alongside this one". Asked for more than the 5 actually shown (CANDIDATE_COUNT)
// since some will already be in the user's deck and get filtered out below; filtering
// happens here, against the user's own deck_cards, rather than by sending the deck
// itself into the prompt.
const RESULT_COUNT = 5;
const CANDIDATE_COUNT = 10;

const prompt = (word: string, reading: string, english: string) => `Task: Suggest ${CANDIDATE_COUNT} Japanese words related to the word below — same topic/theme, common synonyms, or words a learner would naturally want to learn alongside it. Useful, commonly-used vocabulary only, not obscure or archaic terms.

Word: ${word}${reading ? ` (${reading})` : ""}${english ? ` — "${english}"` : ""}

Rules:
- Never include the word itself, or ${word === reading ? "its own entry" : "its own reading"}.
- Each "japanese" field must be the plain DICTIONARY FORM (辞書形), never a conjugated form.
- Deduplicate: no repeats.
- "english": a plain, concise translation — at most 3 short meanings separated by " / ", no parentheses, no "to " prefix for verbs.
- "jlpt_level": EXACTLY ONE of "N5","N4","N3","N2","N1" (N5 easiest, N1 hardest). If unsure, pick the closest level.

Output ONLY raw JSON as an ARRAY of exactly ${CANDIDATE_COUNT} objects:
[
  { "japanese": "...", "reading": "...", "english": "...", "jlpt_level": "N5" }
]`;

async function tryGenerate(modelName: string, word: string, reading: string, english: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(word, reading, english));
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
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { word, reading, english } = await req.json();
  if (typeof word !== "string" || !word.trim()) {
    return NextResponse.json({ error: "word is required" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "related_words", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached — come back tomorrow!" },
      { status: 429 }
    );
  }

  let text: string;
  try {
    text = await tryGenerate("gemini-2.5-flash-lite", word.trim(), String(reading || ""), String(english || ""));
  } catch {
    try {
      text = await tryGenerate("gemini-2.5-flash", word.trim(), String(reading || ""), String(english || ""));
    } catch (e) {
      console.error("Related-words API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : text;

  let candidates: { japanese: string; reading: string; english: string; jlpt_level: string | null }[];
  try {
    const parsed = JSON.parse(cleanJson);
    const JLPT = ["N5", "N4", "N3", "N2", "N1"];
    const seen = new Set<string>([word.trim()]);
    candidates = (Array.isArray(parsed) ? parsed : [])
      .map((item: Record<string, unknown>) => ({
        japanese: typeof item.japanese === "string" ? item.japanese.trim() : "",
        reading: typeof item.reading === "string" ? stripParens(item.reading) : "",
        english: typeof item.english === "string" ? normalizeEnglish(item.english) : "",
        jlpt_level: typeof item.jlpt_level === "string" && JLPT.includes(item.jlpt_level) ? item.jlpt_level : null,
      }))
      .filter((c) => {
        if (!c.japanese || seen.has(c.japanese)) return false;
        seen.add(c.japanese);
        return true;
      });
  } catch {
    console.error("Gemini returned invalid JSON:", text);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }

  // Deck membership is the source of truth, not master_cards row existence — a card
  // can exist in master_cards from another user's deck without being in this one
  // (same bug class useWordLookup's checkDeck fixes). Resolved with two queries
  // instead of sending the deck itself into the prompt.
  const { data: deck } = await supabaseAdmin
    .from("decks")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  let inDeckWords = new Set<string>();
  if (deck && candidates.length > 0) {
    const { data: masterRows } = await supabaseAdmin
      .from("master_cards")
      .select("id, japanese")
      .in("japanese", candidates.map((c) => c.japanese));
    const idByWord = new Map((masterRows ?? []).map((r) => [r.japanese, r.id]));
    if (idByWord.size > 0) {
      const { data: links } = await supabaseAdmin
        .from("deck_cards")
        .select("card_id")
        .eq("deck_id", deck.id)
        .in("card_id", [...idByWord.values()]);
      const linkedIds = new Set((links ?? []).map((l) => l.card_id));
      inDeckWords = new Set([...idByWord.entries()].filter(([, id]) => linkedIds.has(id)).map(([w]) => w));
    }
  }

  const words = candidates.filter((c) => !inDeckWords.has(c.japanese)).slice(0, RESULT_COUNT);
  return NextResponse.json({ words });
}
