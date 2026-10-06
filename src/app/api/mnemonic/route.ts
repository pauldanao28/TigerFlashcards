import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Only the kanji characters matter for a mnemonic — hiragana/katakana/punctuation
// in the word (okurigana like る in 食べる, particles, etc.) have no radical story.
const KANJI_RE = /[一-鿿]/g;

const prompt = (japanese: string, reading: string, english: string, kanji: string[]) => `A Japanese
language learner wants a memory aid for the word "${japanese}" (reading: ${reading}, meaning: "${english}").

For EACH of these kanji characters, in this exact order: ${kanji.join(", ")}

1. "radicals": a short breakdown of the components that make up the character (e.g. "人 (person) + 木 (tree)"). If it's a single indivisible pictograph, briefly say what it depicts instead.
2. "story": ONE vivid, memorable sentence turning those components (or the pictograph) into a mental image that ties them to the character's core meaning. Make it concrete and a little silly — memorable beats accurate.

Then, only if genuinely interesting (skip entirely for ordinary/unremarkable characters), an "origin" field: one sentence on the word's etymology or how its kanji came to mean what they do.

Output ONLY raw JSON, no markdown fences:
{
  "entries": [
    { "character": "${kanji[0] ?? ""}", "radicals": "...", "story": "..." }
  ],
  "origin": "..."
}`;

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
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { japanese, reading, english } = await req.json();
  if (typeof japanese !== "string" || !japanese.trim()) {
    return NextResponse.json({ error: "japanese must be a non-empty string" }, { status: 400 });
  }

  const kanji = [...new Set(japanese.match(KANJI_RE) ?? [])];
  if (kanji.length === 0) {
    return NextResponse.json({ error: "No kanji in this word" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "mnemonic", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} mnemonics per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  const text = prompt(japanese, reading ?? "", english ?? "", kanji);

  let raw: string;
  try {
    raw = await tryGenerate("gemini-2.5-flash-lite", text);
  } catch {
    try {
      raw = await tryGenerate("gemini-2.5-flash", text);
    } catch (e) {
      console.error("Mnemonic API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(cleanJson) as { entries?: { character: string; radicals: string; story: string }[]; origin?: string };
    if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
      return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
    }
    return NextResponse.json({ entries: parsed.entries, origin: parsed.origin || undefined });
  } catch {
    console.error("Gemini returned invalid JSON for mnemonic:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
