import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    if (!messages?.length) return NextResponse.json({ error: "No messages" }, { status: 400 });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const conversation = messages
      .map((m: { role: string; content: string }) =>
        `${m.role === "user" ? "Student" : "Sensei"}: ${m.content}`
      )
      .join("\n");

    const prompt = `Analyze this Japanese learning conversation and return a session recap.

Conversation:
${conversation}

Return ONLY valid JSON, no markdown, no explanation:
{
  "words_covered": ["list of Japanese words/phrases that came up or were taught"],
  "corrections": ["specific mistakes the student made and the correct form, e.g. '食べました → 食べた (casual context)'"],
  "grammar_points": ["grammar patterns practiced or that came up, e.g. 'て-form', 'は vs が'"],
  "strong_moments": ["things the student did well"],
  "encouragement": "one short encouraging sentence in Japanese (casual, warm tone)"
}

Keep each array concise (max 5 items each). If nothing found for a category, return empty array.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");

    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    console.error("chat-recap error:", e);
    return NextResponse.json({ error: "Failed to generate recap" }, { status: 500 });
  }
}
