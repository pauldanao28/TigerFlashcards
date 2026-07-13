import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { difficultyLabel } from "@/lib/scoring";

function nextLevelLabel(score: number): string {
  return difficultyLabel(Math.min(100, score + 20));
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { cards, difficulty = 30 } = await req.json();

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
    }

    const wordList = (cards as { japanese: string; reading: string; english: string }[])
      .map((c, i) => `${i + 1}. ${c.japanese}（${c.reading}）= ${c.english}`)
      .join("\n");

    const grammarTarget = difficultyLabel(difficulty);
    const nextTarget = nextLevelLabel(difficulty);

    const prompt = `You are a Japanese sentence generator for language learners.

For each word below, write one short, natural Japanese sentence that uses that word.

Rules:
- Grammar difficulty: ${grammarTarget}
- Sentence length: 1–2 short clauses, natural and concise
- Freely use any natural verb/adjective form — dictionary form, て-form, た-form, ている, てから, ないで, たい, polite/casual — whatever fits the sentence best
- Vary sentence structures across words (don't repeat the same pattern)
- Wrap ONLY the conjugated form of the target word as it appears in the sentence with【】
- The "word" field must always be the dictionary form (as given in the list)
- Provide a natural English translation
- Exposure rule: naturally include 1 vocabulary word from the next level up (${nextTarget}) somewhere in the sentence — not as the target word, just as supporting context to expose the learner to new words worth mining

Words:
${wordList}

Return ONLY a valid JSON array, no markdown, no explanation:
[{"word":"食べる","sentence_jp":"野菜を【食べてから】、デザートを食べよう。","sentence_en":"Let's eat dessert after eating vegetables."}]`;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Sentence generation timed out")), 40000)
    );

    const tryWithModel = async (modelId: string) => {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await Promise.race([model.generateContent(prompt), timeout]);
      return result.response.text();
    };

    let raw: string;
    try {
      raw = await tryWithModel("gemini-2.5-flash-lite");
    } catch {
      raw = await tryWithModel("gemini-2.5-flash");
    }

    const cleaned = raw
      .trimStart()
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/gm, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) return NextResponse.json({ sentences: parsed });
    } catch {}

    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return NextResponse.json({ sentences: parsed });
      } catch {}
    }

    return NextResponse.json({ error: "Failed to parse sentences" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Sentence generation failed", detail }, { status: 500 });
  }
}
