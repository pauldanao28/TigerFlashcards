import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const prompt = (words: string[]) => `Task: Analyze or translate this list of terms: [${words.join(", ")}].
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

const stripParens = (s: string) => s.replace(/\s*[\(\[（【][^)\]）】]*[\)\]）】]/g, "").trim();

async function tryGenerate(modelName: string, words: string[]): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(words));
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
}

export async function POST(req: Request) {
  const { words } = await req.json();

  let text: string;
  try {
    text = await tryGenerate("gemini-2.5-flash-lite", words);
  } catch {
    try {
      text = await tryGenerate("gemini-2.5-flash", words);
    } catch (e) {
      console.error("Generate API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : text;

  try {
    const parsedData = JSON.parse(cleanJson);
    const cleaned = parsedData.map((item: Record<string, unknown>) => ({
      ...item,
      english: typeof item.english === "string" ? stripParens(item.english) : item.english,
      reading: typeof item.reading === "string" ? stripParens(item.reading) : item.reading,
    }));
    return NextResponse.json(cleaned);
  } catch (e) {
    console.error("Gemini returned invalid JSON:", text);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
