import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { profile, recentMistakes = [] } = await req.json();

    const level = profile?.level ?? "beginner";
    const weakPoints = profile?.grammar_weak_points ?? [];
    const commonErrors = profile?.common_errors ?? [];

    const mistakeSummary = recentMistakes.slice(0, 10)
      .map((m: { mistake: string; correct: string; reason: string }) => `誤：${m.mistake} → 正：${m.correct}（${m.reason}）`)
      .join("\n");

    const prompt = `あなたは日本語文法クイズ生成AIです。
レベル：${level}
弱点文法：${weakPoints.length > 0 ? weakPoints.join("、") : "基礎文法全般"}
よくある間違い：${commonErrors.length > 0 ? commonErrors.join("、") : "なし"}
${mistakeSummary ? `最近の間違い：\n${mistakeSummary}` : ""}

上記の情報を参考に、このレベルに合った日本語文法クイズを10問作成してください。
できる限り弱点・間違いに関連する文法（助詞、動詞活用、て形、た形、〜たい、〜ない、〜ている など）を出題してください。

必ず以下のJSON形式のみで返答すること。コードブロック・余分なテキスト一切不要：
{"questions":[{"sentence":"昨日、映画___見ました。","blank_hint":"object marker","choices":["を","が","に","は"],"answer":"を","explanation":"「映画を見る」のように、直接目的語には助詞「を」を使います。"}]}

ルール：
- sentenceの空欄は必ず___（アンダースコア3つ）で表す
- choicesは必ず4つ
- answerはchoicesの中の1つ
- explanationは短く、なぜその答えが正しいかを日本語で説明（1〜2文）
- 10問すべて異なる文法ポイントをカバーすること`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(prompt);
    const raw = result.response.text();

    const cleaned = raw
      .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/gm, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return NextResponse.json(parsed);
      }
    } catch {}

    // brace-depth fallback
    let depth = 0, start = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === "{") { if (depth === 0) start = i; depth++; }
      else if (cleaned[i] === "}") {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const parsed = JSON.parse(cleaned.slice(start, i + 1));
            if (Array.isArray(parsed.questions)) return NextResponse.json(parsed);
          } catch {}
          start = -1;
        }
      }
    }

    return NextResponse.json({ error: "Failed to parse quiz" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Quiz generation failed", detail }, { status: 500 });
  }
}
