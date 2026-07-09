import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const FURIGANA_RULES = `
## ルール（全ペルソナ共通・絶対厳守）
- 難しい漢字語（N3以上、またはユーザーが知らない可能性がある語）にのみ括弧でふりがなを付ける。形式：漢字（ふりがな）。例：彼女（かのじょ）、勉強（べんきょう）。
- 【絶対】漢字を一字も含まない語（ひらがな・カタカナのみの語、助詞など）にはふりがなを一切付けないこと。
- 常に日本語のみで返答すること。ユーザーが英語で書いても日本語で返す。
- 普通の会話・返答は2〜3文以内に収める。ただし、ユーザーの間違いを指摘・訂正する時は、引用・正しい形・理由・例文を含む詳しい説明をすること。同じ文や表現を繰り返さないこと。
- 文法的には正しいが、英語の直訳っぽかったり不自然な表現の場合も、さりげなく「ネイティブならこう言うよ→〜」と提案してから会話を続けること。correctionsには追加せず、content内で自然に触れる。
- 【必須・毎回】返答の最後に必ずユーザーへの質問か話題の提案を一文添えること。プロフィール情報があればそれを活かす。プロフィールが薄い場合は「好きな食べ物は？」「最近見たアニメや映画は？」「週末は何をした？」「日本に行ったら何をしたい？」「好きなスポーツは？」などの日常的なテーマを自由に聞くこと。絶対にこれを省略しないこと。

## 出力形式（必須・毎回）
必ず以下のJSON形式のみで返答すること。マークダウン・コードブロック・余分なテキスト一切不要：
{"content":"会話の返答（ふりがなルール厳守）","corrections":[]}
ユーザーの日本語に文法・助詞・語彙の間違いがある場合：
- contentの中で友達のように自然に訂正すること。例：「あ、「食べました」じゃなくて「食べた」の方が自然だよ！」
- correctionsには構造化データで追加：[{"mistake":"食べました","correct":"食べた","reason":"カジュアル"}]
間違いがなければcorrections:[]のまま。`;

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
  recently_added?: string[];
  grammar_weak_points?: string[];
  recent_topics?: string[];
  notes?: string;
}

interface Scenario {
  id: string;
  prompt: string;
}

function buildSystemPrompt(persona: string, profile: SenseiProfile | null, pendingWords: string[], scenario?: Scenario): string {
  let base = PERSONAS[persona] ?? PERSONAS.senpai;

  if (scenario?.prompt) {
    base += `\n\n## 今日のシナリオ\n${scenario.prompt}\nこのシナリオに合った語彙・表現を積極的に使い、リアルな会話練習を展開してください。`;
  }

  const lines: string[] = [];

  if (profile) {
    if (profile.level)                         lines.push(`レベル: ${profile.level}`);
    if (profile.native_language)               lines.push(`母国語: ${profile.native_language}`);
    if (profile.motivation)                    lines.push(`学習動機: ${profile.motivation}`);
    if (profile.occupation)                    lines.push(`職業: ${profile.occupation}`);
    if (profile.learning_goals?.length)        lines.push(`目標: ${profile.learning_goals.join("、")}`);
    if (profile.hobbies?.length)               lines.push(`趣味: ${profile.hobbies.join("、")}`);
    if (profile.weak_points?.length)           lines.push(`弱点: ${profile.weak_points.join("、")}`);
    if (profile.strong_points?.length)         lines.push(`得意: ${profile.strong_points.join("、")}`);
    if (profile.common_errors?.length)         lines.push(`よくある間違い: ${profile.common_errors.join("、")}`);
    if (profile.preferred_topics?.length)      lines.push(`好きなトピック: ${profile.preferred_topics.join("、")}`);
    if (profile.personality)                   lines.push(`学習スタイル: ${profile.personality}`);
    if (profile.vocabulary_introduced?.length) lines.push(`既習語彙（再説明不要）: ${profile.vocabulary_introduced.join("、")}`);
    if (profile.recently_added?.length)        lines.push(`【最近デッキに追加した語彙】: ${profile.recently_added.join("、")}`);
    if (profile.grammar_weak_points?.length)   lines.push(`【文法の弱点】: ${profile.grammar_weak_points.join("、")}`);
    if (profile.recent_topics?.length)         lines.push(`最近の話題: ${profile.recent_topics.join("、")}`);
    if (profile.notes)                         lines.push(`メモ: ${profile.notes}`);
  }

  if (pendingWords.length > 0) lines.push(`【今気になっている語彙（まだデッキ未追加）】: ${pendingWords.join("、")}`);

  if (lines.length === 0) return base;

  return `${base}

## 生徒のプロフィール
${lines.join("\n")}

このプロフィールを常に参考にして指導してください。
- 既習語彙は再説明不要。
- 【最近デッキに追加した語彙】は会話の中で自然に使い、定着を助けること。例文を作らせたり、使い方を確認したりする。
- 【今気になっている語彙】もさりげなく会話に織り交ぜてよい。
- 【文法の弱点】は会話の流れに合う時に自然に練習機会を作ること。無理に押し込まず、文脈に合った時だけ。
- よくある間違いは特に注意して指摘すること。`;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export async function POST(req: Request) {
  try {
    const { messages, profile, persona = "senpai", pendingWords = [], weakCards = [], greeting = false, scenario } = await req.json();

    const systemInstruction = buildSystemPrompt(persona, profile ?? null, pendingWords, scenario);

    const tryWithModel = async (modelName: string) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction });
      let lastError: unknown;

      // Greeting mode: generate an opening message with no user input
      if (greeting) {
        const weakHint = weakCards.length > 0 ? `苦手な語彙（${weakCards.slice(0, 5).join("、")}など）` : "";
        const greetPrompt = `会話を始めてください。生徒のプロフィール・最近の話題・${weakHint}を踏まえて、自然で温かい挨拶と、今日話したいトピックへの誘いを1〜2文で。`;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const result = await model.generateContent(greetPrompt);
            return result.response.text();
          } catch (e) {
            lastError = e;
            const msg = e instanceof Error ? e.message : String(e);
            if (!msg.includes("503") && !msg.includes("429") && !msg.includes("overloaded")) break;
            await sleep(1000 * 2 ** attempt);
          }
        }
        throw lastError;
      }

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

      // Also inject weak cards as a hidden context note in the last user message
      const userContent = weakCards.length > 0
        ? `${lastMessage.content}\n\n[CONTEXT: 苦手語彙候補=${weakCards.slice(0, 10).join("、")} — 会話の文脈に合う時のみ使う]`
        : lastMessage.content;

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const chat = model.startChat({ history });
          const result = await chat.sendMessage(userContent);
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

    type Correction = { mistake: string; correct: string; reason: string };
    const parseResponse = (raw: string): { content: string; corrections: Correction[] } => {
      const tryParse = (s: string) => {
        try {
          const p = JSON.parse(s);
          if (typeof p?.content === "string") return p;
        } catch {}
        return null;
      };

      const normalize = (corrections: unknown): Correction[] => {
        if (!Array.isArray(corrections)) return [];
        return corrections.flatMap((c) => {
          if (c && typeof c === "object" && "mistake" in c) {
            return [{ mistake: String(c.mistake ?? ""), correct: String((c as any).correct ?? ""), reason: String((c as any).reason ?? "") }];
          }
          // Legacy string format "誤：X → 正：Y（Z）"
          if (typeof c === "string") {
            const m = c.match(/誤[：:](.+?)[→＞]正[：:](.+?)(?:[（(](.+?)[）)])?$/);
            if (m) return [{ mistake: m[1].trim(), correct: m[2].trim(), reason: m[3]?.trim() ?? "" }];
          }
          return [];
        });
      };

      const cleaned = raw
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/gm, "")
        .trim();

      const single = tryParse(cleaned);
      if (single) return { content: single.content, corrections: normalize(single.corrections) };

      // Extract first valid JSON object by brace depth
      let depth = 0, start = -1;
      for (let i = 0; i < cleaned.length; i++) {
        if (cleaned[i] === "{") { if (depth === 0) start = i; depth++; }
        else if (cleaned[i] === "}") { depth--; if (depth === 0 && start !== -1) {
          const parsed = tryParse(cleaned.slice(start, i + 1));
          if (parsed) return { content: parsed.content, corrections: normalize(parsed.corrections) };
          start = -1;
        }}
      }

      return { content: raw, corrections: [] };
    };

    try {
      const raw = await tryWithModel("gemini-2.5-flash-lite");
      return NextResponse.json(parseResponse(raw));
    } catch {
      try {
        const raw = await tryWithModel("gemini-2.5-flash");
        return NextResponse.json(parseResponse(raw));
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
