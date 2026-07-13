import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { difficultyLabel } from "@/lib/scoring";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { count = 20, difficulty = 30 } = await req.json().catch(() => ({}));
    const n = Math.min(30, Math.max(1, Number(count) || 20));
    const grammarTarget = difficultyLabel(Number(difficulty) || 30);

    // Adjust simple/complex sentence ratio based on difficulty
    const simpleRatio = difficulty >= 80 ? 20 : difficulty >= 60 ? 40 : difficulty >= 40 ? 60 : difficulty >= 20 ? 75 : 90;
    const complexRatio = 100 - simpleRatio;

    const prompt = `You are a Japanese sentence generator for learners who want to recognize common verb and noun+verb "chunks" fast by ear, for listening practice.

Generate ${n} natural Japanese sentences, each built around ONE commonly used verb or a common noun+verb collocation (e.g. 電話をかける, 気をつける, 時間がかかる, 頑張る, 我慢する, 約束を守る).

Rules:
- Pick genuinely high-frequency, everyday chunks — the kind that show up constantly in spoken Japanese. Don't repeat the same chunk twice in this batch.
- Grammar difficulty target: ${grammarTarget}
- Sentence mix: about ${simpleRatio}% should be short and simple (one clause), about ${complexRatio}% should be longer or more complex (two clauses, embedded structures).
- Freely use any natural verb form — dictionary form, て-form, た-form, ている, たい, polite/casual — whatever fits the sentence best.
- Wrap ONLY the target chunk as it appears in the sentence with【】.
- The "word" field must always be the dictionary form of the chunk (e.g. "電話をかける", not "電話をかけた").
- "reading" is the reading of the dictionary-form chunk in hiragana.
- "english" is a short meaning of the chunk itself (a few words).
- "sentence_en" is a natural English translation of the full sentence.

Return ONLY a valid JSON array, no markdown, no explanation:
[{"word":"電話をかける","reading":"でんわをかける","english":"to make a phone call","sentence_jp":"友達に【電話をかけた】。","sentence_en":"I called my friend."}]`;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Listening quiz generation timed out")), 50000)
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
      if (Array.isArray(parsed)) return NextResponse.json({ questions: parsed });
    } catch {}

    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (Array.isArray(parsed)) return NextResponse.json({ questions: parsed });
      } catch {}
    }

    return NextResponse.json({ error: "Failed to parse listening quiz" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Listening quiz generation failed", detail }, { status: 500 });
  }
}
