import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

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
3. Identify the Part of Speech.
4. Classify JLPT level: N5 (easiest) → N1 (hardest). If unsure, pick the closest level.

Rules for the "partOfSpeech" field:
- Must be EXACTLY ONE of these lowercase tags, nothing else: noun, verb, adjective, adverb, particle, pronoun, conjunction, number, phrase.
- "phrase" is only for multi-word idioms, set expressions, or greetings that don't fit a single grammatical category.
- If a word can act as both a noun and a suru-verb, tag it "noun". If a word can act as both a noun and a na-adjective, tag it "adjective".
- No qualifiers, no romaji/Japanese characters, no explanations.
- Good: "noun", "verb", "adjective"
- Bad: "godan verb, transitive", "名詞", "noun (suru-verb)", "na-adjective (adjectival noun)"

Rules for the "english" field:
- Plain, concise translation only. No parentheses, no brackets, no qualifiers, no "to " prefix for verbs.
- If the word has multiple common meanings, give AT MOST 3, each a single word or short 2-3 word phrase, separated by " / " — never a comma-separated list, never connector words like "or"/"and".
- Good: "eat", "challenge", "mistake", "beautiful", "panic / scare", "companion / escort"
- Bad: "(to) eat", "eat (food)", "challenge (suru verb)", "mistake (error)", "panic, scare, consternation, or economic crisis", "companion; attendant; escort; accompaniment; offering"

Output ONLY raw JSON as an ARRAY of objects:
[
  {
    "japanese": "...",
    "reading": "...",
    "english": "...",
    "partOfSpeech": "noun",
    "jlpt_level": "N5",
    "alternatives": [],
    "exampleSentence": { "jp": "...", "en": "..." }
  }
]`;

const stripParens = (s: string) => s.replace(/\s*[\(\[（【][^)\]）】]*[\)\]）】]/g, "").trim();

// Safety net for the "english" field — the model doesn't always follow the
// prompt's synonym-formatting rule (comma/semicolon lists with "or"/"and"
// slip through), so normalize on the way out: split on any separator, drop
// a stray "to " prefix per part, cap at 3, rejoin with a single consistent " / ".
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const normalizeEnglish = (s: string): string => {
  const parts = s
    .split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i)
    .map((p) => lowerFirst(p.trim().replace(/^to\s+/i, "")))
    .filter(Boolean)
    .slice(0, 3);
  return parts.length > 0 ? parts.join(" / ") : lowerFirst(s.trim());
};

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
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { words } = await req.json();
  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "words must be a non-empty array" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "generate", words.length);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} words per day. Come back tomorrow!` },
      { status: 429 }
    );
  }

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
      english: typeof item.english === "string" ? normalizeEnglish(stripParens(item.english)) : item.english,
      reading: typeof item.reading === "string" ? stripParens(item.reading) : item.reading,
    }));
    return NextResponse.json(cleaned);
  } catch (e) {
    console.error("Gemini returned invalid JSON:", text);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
