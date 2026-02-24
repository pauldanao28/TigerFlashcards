import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { words } = await req.json();

const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Task: Analyze or translate this list of terms: [${words.join(", ")}].
1. If the input is Japanese (Kanji/Kana): Provide the reading, English translation, and example.
2. If the input is English: Provide the most common Kanji, reading, and example.
3. If the input has multiple Kanji forms, choose the most common and list others in "alternatives".

Output ONLY raw JSON:
{
  "japanese": "The Kanji/Term",
  "reading": "Furigana/Reading",
  "english": "English Translation",
  "alternatives": ["Alt Kanji 1", "Alt Kanji 2"],
  "contextNote": "Usage note",
  "exampleSentence": { "jp": "...", "en": "..." }
}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  const cleanJson = text.replace(/```json|```/g, "").trim();

try {
  const parsedData = JSON.parse(cleanJson);
  return NextResponse.json(parsedData);
} catch (e) {
  console.error("Gemini returned invalid JSON:", text);
  return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
}
}