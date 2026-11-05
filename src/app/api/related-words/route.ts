import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";
import { stripParens, normalizeEnglish } from "@/lib/textNormalize";
import { generateCards } from "@/lib/generateCards";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Shown after adding a single word (not a batch) — "words you might also want to
// add alongside this one", with real, deck-ready card data already attached, so
// tapping "add" on one is a plain deck_cards/user_scores link with NO further AI
// call (see step 3 below — that's the whole point of doing the enrichment here
// instead of leaving it for /api/generate to redo on tap).
const RESULT_COUNT = 5;
const CANDIDATE_COUNT = 10;

// Step 1: lightweight discovery — just which words are related, not full card data
// (that would be 10 enrichments for words most of which get filtered out below).
const discoveryPrompt = (word: string, reading: string, english: string) => `Task: Suggest ${CANDIDATE_COUNT} Japanese words related to the word below — same topic/theme, common synonyms, or words a learner would naturally want to learn alongside it. Useful, commonly-used vocabulary only, not obscure or archaic terms.

Word: ${word}${reading ? ` (${reading})` : ""}${english ? ` — "${english}"` : ""}

Rules:
- Never include the word itself.
- Each "japanese" field must be the plain DICTIONARY FORM (辞書形), never a conjugated form.
- Deduplicate: no repeats.

Output ONLY raw JSON as an ARRAY of exactly ${CANDIDATE_COUNT} objects:
[
  { "japanese": "..." }
]`;

async function tryDiscover(modelName: string, word: string, reading: string, english: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(discoveryPrompt(word, reading, english));
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
    text = await tryDiscover("gemini-2.5-flash-lite", word.trim(), String(reading || ""), String(english || ""));
  } catch {
    try {
      text = await tryDiscover("gemini-2.5-flash", word.trim(), String(reading || ""), String(english || ""));
    } catch (e) {
      console.error("Related-words discovery error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : text;

  let candidateWords: string[];
  try {
    const parsed = JSON.parse(cleanJson);
    const seen = new Set<string>([word.trim()]);
    candidateWords = (Array.isArray(parsed) ? parsed : [])
      .map((item: Record<string, unknown>) => (typeof item.japanese === "string" ? item.japanese.trim() : ""))
      .filter((w) => {
        if (!w || seen.has(w)) return false;
        seen.add(w);
        return true;
      });
  } catch {
    console.error("Gemini returned invalid JSON:", text);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }

  // Step 2: which candidates are already in the user's deck — excluded below.
  // Deck membership (not master_cards row existence) is the source of truth, same
  // bug class useWordLookup's checkDeck fixes.
  const { data: deck } = await supabaseAdmin
    .from("decks")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  const { data: masterRows } = candidateWords.length > 0
    ? await supabaseAdmin.from("master_cards").select("*").in("japanese", candidateWords)
    : { data: [] };
  const masterByWord = new Map((masterRows ?? []).map((r) => [r.japanese as string, r]));

  let linkedIds = new Set<string>();
  if (deck && masterByWord.size > 0) {
    const { data: links } = await supabaseAdmin
      .from("deck_cards")
      .select("card_id")
      .eq("deck_id", deck.id)
      .in("card_id", [...masterByWord.values()].map((r) => r.id));
    linkedIds = new Set((links ?? []).map((l) => l.card_id));
  }

  const survivors = candidateWords
    .filter((w) => {
      const existing = masterByWord.get(w);
      return !existing || !linkedIds.has(existing.id);
    })
    .slice(0, RESULT_COUNT);

  // Step 3: full card data for whichever survivors aren't already in master_cards —
  // the ONE extra Gemini call this route makes, amortized over up to RESULT_COUNT
  // words instead of one call per word, and happening now instead of on tap.
  const needsEnrichment = survivors.filter((w) => !masterByWord.has(w));
  if (needsEnrichment.length > 0) {
    const genUsage = await checkAndRecordUsage(user.id, "generate", needsEnrichment.length);
    if (genUsage.allowed) {
      try {
        const enriched = await generateCards(needsEnrichment);
        const { data: inserted } = await supabaseAdmin
          .from("master_cards")
          .upsert(
            enriched.map((c) => ({ ...c, creator_id: user.id })),
            { onConflict: "japanese" },
          )
          .select("*");
        (inserted ?? []).forEach((r) => masterByWord.set(r.japanese, r));
      } catch (e) {
        console.error("Related-words enrichment failed (showing fewer suggestions):", e);
      }
    }
    // Limit reached or enrichment failed — those words just won't have a
    // master_cards row below and get dropped from the response, not errored.
  }

  const words = survivors
    .map((w) => masterByWord.get(w))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      id: r.id,
      japanese: r.japanese,
      reading: stripParens(r.reading || ""),
      english: normalizeEnglish(r.english || ""),
      jlpt_level: r.jlpt_level ?? null,
    }));

  return NextResponse.json({ words });
}
