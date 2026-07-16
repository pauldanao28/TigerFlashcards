import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

interface PatternInput {
  id: string;
  pattern: string;
  meaning: string;
  example_jp?: string | null;
}

// Cycle question types across the pool so every question is still anchored to a specific
// pattern_id (unlike the old free-form quiz), but the round isn't 100% fill-in-blank.
// Roughly matches the old 5/10/5-out-of-20 grammar/reading/writing split.
function assignType(index: number): "grammar" | "reading" | "writing" {
  const cycle = index % 4;
  if (cycle === 0 || cycle === 3) return "reading";
  if (cycle === 1) return "grammar";
  return "writing";
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const usage = await checkAndRecordUsage(user.id, "quiz_grammar");
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} grammar quiz rounds per day. Come back tomorrow!` },
      { status: 429 }
    );
  }

  try {
    const { patterns } = await req.json();
    if (!Array.isArray(patterns) || patterns.length === 0) {
      return NextResponse.json({ error: "patterns must be a non-empty array" }, { status: 400 });
    }
    const pool = (patterns as PatternInput[]).slice(0, 25);

    const list = pool
      .map((p, i) => `${i + 1}. id=${p.id} | type=${assignType(i)} | pattern=${p.pattern} | meaning=${p.meaning}${p.example_jp ? ` | example=${p.example_jp}` : ""}`)
      .join("\n");

    const prompt = `You are a Japanese grammar quiz generator. For each grammar pattern below, write ONE question of the given type that specifically tests whether the learner knows THAT pattern — not a different pattern, not just vocabulary.

Patterns (with assigned question type):
${list}

Question type formats:
- type "grammar": fill-in-the-blank. "sentence" is a natural Japanese sentence with the pattern's key part replaced by ___（アンダースコア3つ）, furigana on other non-trivial kanji in parentheses. "choices": exactly 4 (correct + 3 plausible confusable forms/particles). "answer": exact match of one choice.
- type "reading": "japanese" is a full natural sentence USING the pattern correctly (no blank), furigana on non-trivial kanji. "choices": exactly 4 natural English translations, only one correct. "answer": exact match of one choice.
- type "writing": "english" is an English sentence that requires this exact pattern to translate naturally into Japanese. "answer": the natural Japanese model translation (with furigana). "hint": a short English hint naming the grammar point.

Every question object must include:
- "pattern_id": the exact id given for that pattern (echo back unchanged)
- "type": exactly the assigned type shown above
- "explanation": 1-2 sentences in Japanese explaining the answer

Return ONLY a valid JSON array, one entry per pattern, same order:
[
  {"pattern_id":"<id>","type":"grammar","sentence":"昨日、映画___見ました。","choices":["を","が","に","は"],"answer":"を","explanation":"直接目的語には助詞「を」を使います。"},
  {"pattern_id":"<id>","type":"reading","japanese":"彼女（かのじょ）は毎朝（まいあさ）コーヒーを飲（の）みます。","choices":["She drinks coffee every morning.","She drinks tea every morning.","He drinks coffee every morning.","She drinks coffee every evening."],"answer":"She drinks coffee every morning.","explanation":"毎朝＝every morning、飲む＝to drink。"},
  {"pattern_id":"<id>","type":"writing","english":"I went to the convenience store yesterday.","answer":"昨日（きのう）、コンビニに行（い）きました。","hint":"destination uses に","explanation":"「〜に行く」で「go to〜」。"}
]`;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Grammar pattern quiz generation timed out")), 50000)
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

    const validPatternIds = new Set(pool.map((p) => p.id));
    const validate = (parsed: unknown) => {
      if (!Array.isArray(parsed)) return null;
      const valid = parsed.filter((q) => {
        if (!q || typeof q !== "object") return false;
        if (typeof q.pattern_id !== "string" || !validPatternIds.has(q.pattern_id)) return false;
        if (typeof q.explanation !== "string") return false;
        if (q.type === "grammar") {
          return typeof q.sentence === "string" && q.sentence.includes("___") &&
            Array.isArray(q.choices) && q.choices.length === 4 &&
            typeof q.answer === "string" && q.choices.includes(q.answer);
        }
        if (q.type === "reading") {
          return typeof q.japanese === "string" &&
            Array.isArray(q.choices) && q.choices.length === 4 &&
            typeof q.answer === "string" && q.choices.includes(q.answer);
        }
        if (q.type === "writing") {
          return typeof q.english === "string" && typeof q.answer === "string";
        }
        return false;
      });
      return valid.length > 0 ? valid : null;
    };

    // The model tends to place the correct choice first — shuffle so it isn't a giveaway.
    const shuffleChoices = (questions: any[]) =>
      questions.map((q) =>
        Array.isArray(q.choices) ? { ...q, choices: [...q.choices].sort(() => Math.random() - 0.5) } : q
      );

    try {
      const parsed = validate(JSON.parse(cleaned));
      if (parsed) return NextResponse.json({ questions: shuffleChoices(parsed) });
    } catch {}

    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        const parsed = validate(JSON.parse(arrMatch[0]));
        if (parsed) return NextResponse.json({ questions: shuffleChoices(parsed) });
      } catch {}
    }

    return NextResponse.json({ error: "Failed to parse grammar pattern quiz" }, { status: 500 });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "Grammar pattern quiz generation failed", detail }, { status: 500 });
  }
}
