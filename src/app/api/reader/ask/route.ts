import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const MAX_PASSAGE_CHARS = 1500;
const MAX_QUESTION_CHARS = 300;

const prompt = (passage: string, question: string) => `A Japanese language learner is reading this passage:
"""
${passage}
"""

They asked: "${question}"

Answer helpfully and concisely (2-5 sentences) in English, quoting the relevant Japanese snippet from the passage where useful. If the question isn't actually about the passage, just answer it as a general Japanese-learning question. Output ONLY the answer text — no JSON, no markdown headers.`;

async function tryGenerate(modelName: string, passage: string, question: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(passage, question));
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

  const { passage, question } = await req.json();
  if (typeof passage !== "string" || typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "passage and question are required" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "reader_ask", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} questions per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  const cleanPassage = passage.trim().slice(0, MAX_PASSAGE_CHARS);
  const cleanQuestion = question.trim().slice(0, MAX_QUESTION_CHARS);

  let text: string;
  try {
    text = await tryGenerate("gemini-2.5-flash-lite", cleanPassage, cleanQuestion);
  } catch {
    try {
      text = await tryGenerate("gemini-2.5-flash", cleanPassage, cleanQuestion);
    } catch (e) {
      console.error("Reader ask API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  return NextResponse.json({ answer: text.trim() });
}
