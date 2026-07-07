import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const BASE_PROMPT = `あなたは「先生」、親切な日本語学習パートナーです。

ルール:
1. 常に日本語のみで返答してください。ユーザーが英語で書いても、日本語で返答し、やさしく日本語で話しかけましょう。
2. 難しいと思われる漢字語（N3以上、または文脈上ユーザーが知らない可能性がある語）にのみ、括弧でふりがなを付けてください。形式：漢字（ふりがな）。例：彼女（かのじょ）、勉強（べんきょう）。【絶対ルール】漢字を一字も含まない語（ひらがな・カタカナのみの語、助詞、助動詞、接続詞など）には一切ふりがなを付けないこと。漢字が含まれる語のみが対象。
3. ユーザーの日本語の間違い（文法・語彙・敬語）は会話の中で自然に指摘してください。間違いを引用し、正しい形を示し、なぜ違うか簡単に説明してください。
4. ユーザーのレベルに合わせて日本語の難易度を調整してください。
5. 温かく、励ますような先生らしい態度でいてください。
6. 会話を通じて自然に新しい語彙や文法パターンを教えてください。
7. 返答は簡潔に。ユーザーが詳しい説明を求めた場合のみ長く答えてください。`;

interface SenseiProfile {
  level?: string;
  native_language?: string;
  motivation?: string;
  occupation?: string;
  learning_goals?: string[];
  hobbies?: string[];
  weak_points?: string[];
  strong_points?: string[];
  common_errors?: string[];
  preferred_topics?: string[];
  personality?: string;
  vocabulary_introduced?: string[];
  notes?: string;
}

function buildSystemPrompt(profile: SenseiProfile | null): string {
  if (!profile) return BASE_PROMPT;

  const lines: string[] = [];
  if (profile.level)                    lines.push(`レベル: ${profile.level}`);
  if (profile.native_language)          lines.push(`母国語: ${profile.native_language}`);
  if (profile.motivation)               lines.push(`学習動機: ${profile.motivation}`);
  if (profile.occupation)               lines.push(`職業: ${profile.occupation}`);
  if (profile.learning_goals?.length)   lines.push(`目標: ${profile.learning_goals.join("、")}`);
  if (profile.hobbies?.length)          lines.push(`趣味: ${profile.hobbies.join("、")}`);
  if (profile.weak_points?.length)      lines.push(`弱点: ${profile.weak_points.join("、")}`);
  if (profile.strong_points?.length)    lines.push(`得意: ${profile.strong_points.join("、")}`);
  if (profile.common_errors?.length)    lines.push(`よくある間違い: ${profile.common_errors.join("、")}`);
  if (profile.preferred_topics?.length) lines.push(`好きなトピック: ${profile.preferred_topics.join("、")}`);
  if (profile.personality)              lines.push(`学習スタイル: ${profile.personality}`);
  if (profile.vocabulary_introduced?.length) lines.push(`既習語彙: ${profile.vocabulary_introduced.join("、")}`);
  if (profile.notes)                    lines.push(`メモ: ${profile.notes}`);

  if (lines.length === 0) return BASE_PROMPT;

  return `${BASE_PROMPT}

## 生徒のプロフィール
${lines.join("\n")}

このプロフィールを常に参考にして、生徒のレベル・弱点・興味・学習スタイルに合わせて指導してください。既習語彙は既に知っているので再説明は不要です。よくある間違いは特に注意して指摘してください。`;
}

export async function POST(req: Request) {
  try {
    const { messages, profile } = await req.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: buildSystemPrompt(profile ?? null),
    });

    // Full window: last 20 messages for conversation context
    // Profile is injected into system prompt on top of this
    const window = messages.slice(-20);
    const lastMessage = window[window.length - 1];

    // Gemini requires history to strictly alternate user→model starting with user.
    // Drop leading model messages, then remove any consecutive duplicate roles.
    type HistoryEntry = { role: string; parts: { text: string }[] };
    const raw: HistoryEntry[] = window.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
    const firstUser = raw.findIndex((m) => m.role === "user");
    const trimmed = firstUser >= 0 ? raw.slice(firstUser) : [];
    const history = trimmed.filter((m, i) => i === 0 || m.role !== trimmed[i - 1].role);

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);

    return NextResponse.json({ content: result.response.text() });
  } catch (e) {
    console.error("Chat API error:", e);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
