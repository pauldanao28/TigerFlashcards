import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

export async function POST(req: Request) {
  const { words } = await req.json();

const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

  const prompt = `Task: Analyze or translate this list of terms: [${words.join(", ")}].
1. If the input is Japanese (Kanji/Kana): Provide the reading, English translation, and example.
2. If the input is English: Provide the most common Kanji, reading, and example.
3. Identify the Part of Speech (e.g., noun, verb, adjective, adverb).

Rules for the "english" field:
- Plain, concise translation only. No parentheses, no brackets, no qualifiers, no "to " prefix for verbs.
- Good: "eat", "challenge", "mistake", "beautiful"
- Bad: "(to) eat", "eat (food)", "challenge (suru verb)", "mistake (error)"

Output ONLY raw JSON as an ARRAY of objects:
[
  {
    "japanese": "...",
    "reading": "...",
    "english": "...",
    "partOfSpeech": "...",
    "alternatives": [],
    "contextNote": "...",
    "exampleSentence": { "jp": "...", "en": "..." }
  }
]`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  //const cleanJson = text.replace(/```json|```/g, "").trim();

  // To this (safer):
  const jsonMatch = text.match(/\[[\s\S]*\]/); 
  const cleanJson = jsonMatch ? jsonMatch[0] : text;

try {
  const parsedData = JSON.parse(cleanJson);
  // Strip any parenthetical qualifiers the AI still adds (e.g. "eat (food)" → "eat")
  const cleaned = parsedData.map((item: Record<string, unknown>) => ({
    ...item,
    english: typeof item.english === "string"
      ? item.english.replace(/\s*[\(\[（【][^)\]）】]*[\)\]）】]/g, "").trim()
      : item.english,
  }));
  return NextResponse.json(cleaned);
} catch (e) {
  console.error("Gemini returned invalid JSON:", text);
  return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
}
}