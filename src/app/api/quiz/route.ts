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

    const prompt = `あなたは日本語クイズ生成AIです。
レベル：${level}
弱点文法：${weakPoints.length > 0 ? weakPoints.join("、") : "基礎文法全般"}
よくある間違い：${commonErrors.length > 0 ? commonErrors.join("、") : "なし"}
${mistakeSummary ? `最近の間違い：\n${mistakeSummary}` : ""}

以下の3種類の問題を合計20問作成してください：
- type "grammar"：5問　空欄補充（助詞・動詞活用など）
- type "reading"：10問　日本語文の読解・英訳（4択）
- type "writing"：5問　英文の和訳（自由記述・自己採点）

必ず以下のJSON形式のみで返答すること。コードブロック・余分なテキスト一切不要：
{"questions":[
  {"type":"grammar","sentence":"昨日、映画___見ました。","blank_hint":"object marker","choices":["を","が","に","は"],"answer":"を","explanation":"直接目的語には助詞「を」を使います。"},
  {"type":"reading","japanese":"彼女（かのじょ）は毎朝（まいあさ）コーヒーを飲（の）みます。","choices":["She drinks coffee every morning.","She drinks tea every morning.","He drinks coffee every morning.","She drinks coffee every evening."],"answer":"She drinks coffee every morning.","explanation":"毎朝＝every morning、飲む＝to drink。"},
  {"type":"writing","english":"I went to the convenience store yesterday.","answer":"昨日（きのう）、コンビニに行（い）きました。","hint":"destination uses に","explanation":"「〜に行く」で「go to〜」。昨日＝yesterday、コンビニ＝convenience store。"}
]}

ルール：
- grammarのsentenceの空欄は___（アンダースコア3つ）で表す。choicesは4つ、answerはその中の1つ。
- readingのjapaneseは難しい漢字にふりがなを付ける（例：彼女（かのじょ））。choicesは自然な英訳4つ、answerはその中の1つ。
- writingのanswerは自然な日本語の模範解答。hintは短い文法ヒント（英語）。
- explanationはすべて日本語で1〜2文。
- レベルと弱点に合った難易度にすること。`;

    const tryWithModel = async (modelId: string) => {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent(prompt);
      return result.response.text();
    };

    let raw: string;
    try {
      raw = await tryWithModel("gemini-2.5-flash-lite");
    } catch {
      raw = await tryWithModel("gemini-2.5-flash");
    }

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
