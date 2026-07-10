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
- Grammar difficulty: N4 level (simple verb conjugations, basic particles, common patterns)
- Sentence length: 1–2 short clauses, max 20 characters
- Wrap ONLY the target word (exactly as it appears in the sentence, including any conjugation) with【】
- Provide a natural English translation
- Do NOT repeat the same sentence structure for every word

Words:
${wordList}

Return ONLY a valid JSON array, no markdown, no explanation:
[{"word":"食べる","sentence_jp":"毎朝ご飯を【食べます】。","sentence_en":"I eat rice every morning."}]`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text();

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
