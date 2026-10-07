import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Keep passages short enough that grammar-note extraction stays reliable and cheap —
// this is a reading aid, not a bulk-import pipeline. Word lookup itself doesn't touch
// Gemini at all (same Jisho tap-to-lookup as the quizzes), only this grammar pass does.
const MAX_CHARS = 1500;

const prompt = (text: string) => `A Japanese language learner is reading this passage:
"""
${text}
"""

List 2-5 notable grammar patterns actually used in it (skip anything too trivial to note,
e.g. basic だ/です). For each: the pattern name and a 1-2 sentence explanation of how it
works, referencing the specific part of the passage it appears in. If the passage is too
short/simple to have any notable patterns, return an empty array.

Output ONLY raw JSON, no markdown fences:
{ "grammarNotes": [ { "pattern": "...", "explanation": "..." } ] }`;

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

  const usage = await checkAndRecordUsage(user.id, "reader_annotate", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} passages analyzed per day. Come back tomorrow!` },
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
      console.error("Reader annotate API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(cleanJson) as { grammarNotes?: { pattern: string; explanation: string }[] };
    return NextResponse.json({ grammarNotes: Array.isArray(parsed.grammarNotes) ? parsed.grammarNotes : [] });
  } catch {
    console.error("Gemini returned invalid JSON for reader annotate:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
