import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const MAX_CHARS = 500;

const prompt = (text: string) => `A Japanese language learner gave you this text — it can be in any
language, including Japanese already:
"""
${text}
"""

1. Detect the source language (if it's already Japanese, say "Japanese").
2. Translate its meaning into natural Japanese, in TWO registers:
   - "casual": how a friend would say it, plain/casual speech (タメ口)
   - "polite": how you'd say it politely (です/ます, or proper keigo if the content calls for it)
3. For each register, write a short 1-2 sentence explanation of what makes that version
   casual or polite specifically (word choice, verb form, sentence ending) — not a dictionary
   gloss of the words.
4. Add one short overall "notes" string (1-3 sentences): anything that doesn't map 1:1 between
   the source language and Japanese, cultural context worth knowing, or how you resolved any
   ambiguity in the input.

IMPORTANT: "explanation" and "notes" must always be written in English, regardless of the
source language you detected in step 1 — never write them in Japanese or the source language.
Only the "japanese" fields are in Japanese.

Output ONLY raw JSON, no markdown fences. Japanese text plain, no furigana/parentheses:
{
  "detectedLanguage": "...",
  "casual": { "japanese": "...", "explanation": "..." },
  "polite": { "japanese": "...", "explanation": "..." },
  "notes": "..."
}`;

interface TranslateResult {
  detectedLanguage: string;
  casual: { japanese: string; explanation: string };
  polite: { japanese: string; explanation: string };
  notes: string;
}

async function tryGenerate(modelName: string, text: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(text));
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

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  const trimmed = text.trim().slice(0, MAX_CHARS);

  const usage = await checkAndRecordUsage(user.id, "translate", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached — come back tomorrow!" },
      { status: 429 },
    );
  }

  let raw: string;
  try {
    raw = await tryGenerate("gemini-2.5-flash-lite", trimmed);
  } catch {
    try {
      raw = await tryGenerate("gemini-2.5-flash", trimmed);
    } catch (e) {
      console.error("Translate API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(cleanJson) as Partial<TranslateResult>;
    if (!parsed.casual?.japanese || !parsed.polite?.japanese) {
      throw new Error("missing casual/polite japanese");
    }
    return NextResponse.json({
      detectedLanguage: parsed.detectedLanguage || "Unknown",
      casual: { japanese: parsed.casual.japanese, explanation: parsed.casual.explanation || "" },
      polite: { japanese: parsed.polite.japanese, explanation: parsed.polite.explanation || "" },
      notes: parsed.notes || "",
    } satisfies TranslateResult);
  } catch {
    console.error("Gemini returned invalid JSON for translate:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
