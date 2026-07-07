import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const SYSTEM_PROMPT = `あなたは「先生」、親切な日本語学習パートナーです。

ルール:
1. 常に日本語のみで返答してください。ユーザーが英語で書いても、日本語で返答し、やさしく日本語で話しかけましょう。
2. ふりがな・ルビ・ローマ字は絶対に使わないでください。漢字はそのまま書いてください。
3. ユーザーの日本語の間違い（文法・語彙・敬語）は会話の中で自然に指摘してください。間違いを引用し、正しい形を示し、なぜ違うか簡単に説明してください。
4. ユーザーのレベルに合わせて日本語の難易度を調整してください。
5. 温かく、励ますような先生らしい態度でいてください。
6. 会話を通じて自然に新しい語彙や文法パターンを教えてください。
7. 返答は簡潔に。ユーザーが詳しい説明を求めた場合のみ長く答えてください。`;

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1];
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);

    return NextResponse.json({ content: result.response.text() });
  } catch (e) {
    console.error("Chat API error:", e);
    return NextResponse.json({ error: "Failed to get response" }, { status: 500 });
  }
}
