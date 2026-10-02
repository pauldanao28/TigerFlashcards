import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof LEVELS)[number];

const LENGTH_HINT: Record<Level, string> = {
  N5: "4-6 short, simple sentences. Only basic vocabulary, present/past tense, no complex clauses.",
  N4: "5-7 sentences. て-form chains, たい, simple conjunctions are fine.",
  N3: "6-9 sentences. Conditionals, て-verb compounds, plain-form embedding are fine.",
  N2: "7-10 sentences. Passive, causative, potential, and light keigo are fine.",
  N1: "8-12 sentences, denser prose. Keigo, classical-flavored patterns, and compound sentences are fine.",
};

function prompt(level: Level, topic: string | undefined): string {
  return `Write an ORIGINAL short Japanese reading passage for a language learner at JLPT ${level} level.

${LENGTH_HINT[level]}
${topic ? `Topic: ${topic}` : "Pick any everyday topic a learner would find engaging (daily life, food, a small story, a place, a hobby)."}

Rules:
- This must be entirely original writing, not a excerpt or paraphrase of any existing published book, song, or article.
- Natural, coherent Japanese — it should read like real prose, not a list of grammar examples.
- Output ONLY the passage text in Japanese. No title, no English translation, no furigana, no notes, no markdown.`;
}

async function tryGenerate(modelName: string, level: Level, topic: string | undefined): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(level, topic));
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

  const { level, topic } = await req.json();
  if (!LEVELS.includes(level)) {
    return NextResponse.json({ error: "level must be one of N5-N1" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "reader_generate", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} generated passages per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  const cleanTopic = typeof topic === "string" ? topic.trim().slice(0, 100) : undefined;

  let text: string;
  try {
    text = await tryGenerate("gemini-2.5-flash-lite", level, cleanTopic);
  } catch {
    try {
      text = await tryGenerate("gemini-2.5-flash", level, cleanTopic);
    } catch (e) {
      console.error("Reader generate API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  return NextResponse.json({ text: text.trim() });
}
