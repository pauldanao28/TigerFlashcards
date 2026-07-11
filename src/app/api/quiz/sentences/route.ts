import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { cards } = await req.json();

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: "cards must be a non-empty array" }, { status: 400 });
    }

    const wordList = (cards as { japanese: string; reading: string; english: string }[])
      .map((c, i) => `${i + 1}. ${c.japanese}（${c.reading}）= ${c.english}`)
      .join("\n");

    const prompt = `You are a Japanese sentence generator for language learners.

For each word below, write one short, natural Japanese sentence that uses that word.

Rules:
- Grammar difficulty: N4 level
- Sentence length: 1–2 short clauses, natural and concise
- Use varied, natural verb/adjective forms — do NOT always use the dictionary form. Freely use て-form, た-form, ている, てから, ないで, たい, など, casual or polite conjugations — whatever makes the sentence feel natural
- Vary sentence structures across words (don't repeat the same pattern)
- Wrap ONLY the conjugated form of the target word as it appears in the sentence with【】
- The "word" field must always be the dictionary form (as given in the list)
- Provide a natural English translation

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
