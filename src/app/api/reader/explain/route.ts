import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";
import type { LineExplanation } from "@/lib/types";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const MAX_LINE_CHARS = 300;
const MAX_CONTEXT_CHARS = 600;

const prompt = (line: string, context: string) => `A Japanese learner is studying this line (from a video's captions or a reading passage):
"""
${line}
"""
${context ? `Surrounding lines, for context only (do NOT explain these):\n"""\n${context}\n"""\n` : ""}
Explain the line for the learner:
- "translation": a natural English translation of the line.
- "grammar": 1-4 grammar patterns actually used in the line (skip trivial ones like は/です unless the line is that simple). Each: "pattern" (e.g. "〜てしまう") and a 1-2 sentence "explanation" of what it does in THIS line.
- "words": up to 6 words in the line a learner would likely not know (skip basic N5 words and particles). Each: "word" in dictionary form (食べた → 食べる), "reading" in hiragana, "meaning" in short English.
- "note": one short sentence on nuance if useful (casual/rough speech, slang, dialect, politeness, tone, a cultural reference) — otherwise "".

Output ONLY JSON: { "translation": "...", "grammar": [ { "pattern": "...", "explanation": "..." } ], "words": [ { "word": "...", "reading": "...", "meaning": "..." } ], "note": "..." }`;

async function tryGenerate(modelName: string, line: string, context: string): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(line, context));
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

// "Explain this line" for the Reader and Watch: translation, grammar used, harder words,
// and a nuance note. Uses AI, so it's rate-limited per day (line_explain).
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { line, context } = await req.json();
  if (typeof line !== "string" || !line.trim()) {
    return NextResponse.json({ error: "line must be a non-empty string" }, { status: 400 });
  }
  const cleanLine = line.trim().slice(0, MAX_LINE_CHARS);
  const cleanContext = typeof context === "string" ? context.trim().slice(0, MAX_CONTEXT_CHARS) : "";

  const usage = await checkAndRecordUsage(user.id, "line_explain", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} line explanations per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  let raw: string;
  try {
    raw = await tryGenerate("gemini-2.5-flash-lite", cleanLine, cleanContext);
  } catch {
    try {
      raw = await tryGenerate("gemini-2.5-flash", cleanLine, cleanContext);
    } catch (e) {
      console.error("Line explain API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw) as Partial<LineExplanation>;
    const explanation: LineExplanation = {
      translation: String(parsed.translation ?? ""),
      grammar: Array.isArray(parsed.grammar) ? parsed.grammar.filter((g) => g?.pattern) : [],
      words: Array.isArray(parsed.words) ? parsed.words.filter((w) => w?.word) : [],
      note: String(parsed.note ?? ""),
    };
    return NextResponse.json(explanation);
  } catch {
    console.error("Gemini returned invalid JSON for line explain:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
