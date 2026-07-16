import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const prompt = (words: string[]) => `Task: Process the following input and produce flashcard data.

Input: [${words.join(", ")}]

Step 1 — Detect input type for each item:
- If the item is a SINGLE WORD or SHORT PHRASE (a term to look up): process it directly.
- If the item is a SENTENCE, LYRICS, STORY, or PARAGRAPH (contains multiple words forming natural text): first extract all meaningful vocabulary from it — nouns, verbs, i-adjectives, na-adjectives, adverbs. Skip particles (は、が、を、に、で、と、の、も、へ、から、まで、より), conjunctions, and filler words. Then process each extracted word individually.

Step 2 — For every word (whether given directly or extracted from text):
1. If Japanese (Kanji/Kana): the "japanese" field must be the plain DICTIONARY FORM (辞書形), never the form as it appeared in the text.
   - Verb/i-adjective conjugations (て-form, た-form, ます-form, negative, passive, potential, causative, etc.) → normalize to dictionary form, e.g. "食べた"→"食べる", "飲みます"→"飲む", "美味しかった"→"美しい".
   - Na-adjectives with copula (だった, でした, じゃない, etc.) → strip copula and return bare stem, e.g. "静かだった"→"静か".
   - Nouns don't conjugate — return as-is.
   - Deduplicate: if the same dictionary form appears multiple times, output it only once.
2. If English: provide the most common Kanji (dictionary form), reading, and example.
3. Identify the Part of Speech (e.g., noun, verb, adjective, adverb).
4. Classify JLPT level: N5 (easiest) → N1 (hardest). If unsure, pick the closest level.

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
    "jlpt_level": "N5",
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
