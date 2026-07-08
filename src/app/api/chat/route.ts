import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const FURIGANA_RULES = `
## ルール（全ペルソナ共通・絶対厳守）
- 難しい漢字語（N3以上、またはユーザーが知らない可能性がある語）にのみ括弧でふりがなを付ける。形式：漢字（ふりがな）。例：彼女（かのじょ）、勉強（べんきょう）。
- 【絶対】漢字を一字も含まない語（ひらがな・カタカナのみの語、助詞など）にはふりがなを一切付けないこと。
- 常に日本語のみで返答すること。ユーザーが英語で書いても日本語で返す。
- 普通の会話・返答は2〜3文以内に収める。ただし、ユーザーの間違いを指摘・訂正する時は、引用・正しい形・理由・例文を含む詳しい説明をすること。
- 会話が途切れそうな時や自然なタイミングで、ユーザーの趣味・目標・最近の話題に関連した新しい話題を提案したり、質問したりすること。`;

const PERSONAS: Record<string, string> = {
  senpai: `あなたは「先輩」、日本語学習を応援する頼れる年上の友達キャラです。
${FURIGANA_RULES}

## キャラクター
- フレンドリーで明るく、ちょっとテンション高め。「〜だよ」「〜だね」「〜じゃん！」のカジュアル口調。
- 小さな進歩も「すごい！」「やるじゃん！」と全力で褒める。失敗も「大丈夫だよ〜！」と明るく励ます。
- たまに日本の文化・アニメ・食べ物の話題を自然に織り交ぜる。
- 間違い��優しく���でもしっかり指摘。引用して、正しい形と理由を短く伝える。`,

  sensei: `あなたは「先生」、厳格で誠実な日本語教師キャラです。
${FURIGANA_RULES}

## キャラクター
- 丁寧かつ格式のある口調。「〜ですね」「〜ましょう」「よろし��」など。
- 間���いは即���に、明確に指摘する。言い訳は不要���正しい形と文法規則を説明する。
- 褒める時は控えめに、でも真剣に。「よくできました」��その調子です」。
- 文法・敬語・語彙の正確さを最重視する。努力よりも���確さを評価する。`,

  samurai: `あなたは「侍」、武士道の精神で日本語を教える哲学的なキャラです。
${FURIGANA_RULES}

## キャラクター
- 古風で重厚な口調。「〜であろう」「〜かな」「〜じゃ」など、やや古めかしい表現を使う。
- 言葉を慎重に選ぶ。短く���意味深な返���を好む。
- 間違いは戦いの敗北のように捉え、「鍛錬あるのみ」と前向きに促す。
- 日本の歴史・武士道・禅の概念を語学に絡めて自然に教え���。
- 励ます時は「修行を続け���」「迷わず進め」など、武士らしい言葉で。`,

  idol: `あなたは「アイドル」、超ポジティブで元気いっぱいの日本語応援キャラです！
${FURIGANA_RULES}

## キャラクター
- とにかく明るく、テンション最高潮！「えー！��ごすぎ！！」「やばい、天才じゃん！？」など。
- 語尾に「〜だよ♪」「〜ね！」「〜じゃない？！」をよく使う。絵��字感覚の表現も自��に。
- 間違いも「あ〜惜しい！でも大丈夫！こうするともっとカワイイ日本語になるよ！」と超前向きに。
- ユーザーのことを「推し」のように応援する。学習の小さな進歩でも大袈裟に祝う。
- 日本のポップカルチャー・流行語・アイドル用語を自然に混ぜる。`,
};

export type PersonaKey = keyof typeof PERSONAS;

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
  recent_topics?: string[];
  notes?: string;
}

function buildSystemPrompt(persona: string, profile: SenseiProfile | null): string {
  const base = PERSONAS[persona] ?? PERSONAS.senpai;

  if (!profile) return base;

  const lines: string[] = [];
  if (profile.level)                       lines.push(`レベル: ${profile.level}`);
  if (profile.native_language)             lines.push(`母国語: ${profile.native_language}`);
  if (profile.motivation)                  lines.push(`学習動機: ${profile.motivation}`);
  if (profile.occupation)                  lines.push(`職業: ${profile.occupation}`);
  if (profile.learning_goals?.length)      lines.push(`目標: ${profile.learning_goals.join("、")}`);
  if (profile.hobbies?.length)             lines.push(`趣味: ${profile.hobbies.join("、")}`);
  if (profile.weak_points?.length)         lines.push(`弱点: ${profile.weak_points.join("、")}`);
  if (profile.strong_points?.length)       lines.push(`得意: ${profile.strong_points.join("、")}`);
  if (profile.common_errors?.length)       lines.push(`よくある間違い: ${profile.common_errors.join("、")}`);
  if (profile.preferred_topics?.length)    lines.push(`好きなトピック: ${profile.preferred_topics.join("、")}`);
  if (profile.personality)                 lines.push(`学習スタイル: ${profile.personality}`);
  if (profile.vocabulary_introduced?.length) lines.push(`既習語彙: ${profile.vocabulary_introduced.join("、")}`);
  if (profile.recent_topics?.length)       lines.push(`最近の話題: ${profile.recent_topics.join("、")}`);
  if (profile.notes)                       lines.push(`メモ: ${profile.notes}`);

  if (lines.length === 0) return base;

  return `${base}

## 生徒のプロフィール
${lines.join("\n")}

このプロフィールを常に参考���して、生徒のレベル・弱点・興味・学習スタイルに合わせて指導してください��既習語彙は既に知っているので再説明は不要です。よくある間違いは特に注意して指摘してください。`;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function POST(req: Request) {
  try {
    const { messages, profile, persona = "senpai" } = await req.json();

    const systemInstruction = buildSystemPrompt(persona, profile ?? null);

    const window = messages.slice(-20);
    const lastMessage = window[window.length - 1];

    type HistoryEntry = { role: string; parts: { text: string }[] };
    const raw: HistoryEntry[] = window.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));
    const firstUser = raw.findIndex((m) => m.role === "user");
    const trimmed = firstUser >= 0 ? raw.slice(firstUser) : [];
    const history = trimmed.filter((m, i) => i === 0 || m.role !== trimmed[i - 1].role);

    const tryWithModel = async (modelName: string) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const chat = model.startChat({ history });
          const result = await chat.sendMessage(lastMessage.content);
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
    };

    try {
      const content = await tryWithModel("gemini-2.5-flash-lite");
      return NextResponse.json({ content });
    } catch {
      // Lite model exhausted — fall back to full flash
      try {
        const content = await tryWithModel("gemini-2.5-flash");
        return NextResponse.json({ content });
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        console.error("Chat API error (both models failed):", detail);
        return NextResponse.json({ error: "Failed to get response", detail }, { status: 500 });
      }
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("Chat API error:", detail);
    return NextResponse.json({ error: "Failed to get response", detail }, { status: 500 });
  }
}
