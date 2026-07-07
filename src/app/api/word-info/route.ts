import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { word } = await req.json();
    if (!word) return NextResponse.json({ error: "No word provided" }, { status: 400 });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const result = await model.generateContent(
      `For the Japanese word or phrase "${word}", provide the hiragana reading and a brief English meaning.
Respond ONLY with valid JSON, no other text: {"reading": "hiragana only", "meaning": "brief English meaning"}`
    );

    const text = result.response.text().trim();
    const match = text.match(/\{[^}]+\}/);
    if (!match) throw new Error("No JSON in response");

    return NextResponse.json(JSON.parse(match[0]));
  } catch (e) {
    console.error("word-info error:", e);
    return NextResponse.json({ reading: "", meaning: "Could not fetch" }, { status: 200 });
  }
}
