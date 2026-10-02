import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// Keep passages short enough that the segment-by-segment breakdown stays
// reliable (and cheap) — this is a reading aid, not a bulk-import pipeline.
const MAX_CHARS = 1500;

const prompt = (text: string) => `Break the following Japanese passage into an ordered array of segments covering
EVERY character, so that joining segments[i].text back together in order reproduces the passage EXACTLY
(including particles, punctuation, and whitespace/newlines).

Passage:
"""
${text}
"""

For each segment:
- "text": the exact original substring (a single word for content words, or the exact particle/punctuation/whitespace run otherwise). Never alter, conjugate, or normalize it.
- "isContent": true only for a word a learner would look up — nouns, verbs, i/na-adjectives, adverbs — in whatever conjugated/inflected form it actually appears in the text. false for particles, auxiliary verbs/copula, conjunctions, punctuation, numbers, and whitespace.
- When isContent is true, also include:
  - "reading": the hiragana reading of this segment AS IT APPEARS (not the dictionary form's reading if they differ, e.g. 食べた → たべた).
  - "english": a short, plain meaning of this word as used in this sentence.
  - "pos": one of noun, verb, adjective, adverb, phrase.
- When isContent is false, omit reading/english/pos.

Also list 2-5 notable grammar patterns actually used in this passage (skip anything too trivial to be worth noting, e.g. basic だ/です). For each: the pattern name and a 1-2 sentence explanation of how it works, referencing the specific part of the passage it appears in.

Output ONLY raw JSON, no markdown fences, matching exactly:
{
  "segments": [
    { "text": "...", "isContent": true, "reading": "...", "english": "...", "pos": "verb" },
    { "text": "...", "isContent": false }
  ],
  "grammarNotes": [
    { "pattern": "...", "explanation": "..." }
  ]
}`;

async function tryGenerate(modelName: string, text: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(prompt(text));
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

interface Segment {
  text: string;
  isContent: boolean;
  reading?: string;
  english?: string;
  pos?: string;
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }
  const trimmed = text.trim().slice(0, MAX_CHARS);

  const usage = await checkAndRecordUsage(user.id, "reader_annotate", 1);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: `Daily limit reached — ${usage.limit} passages glossed per day. Come back tomorrow!` },
      { status: 429 },
    );
  }

  let raw: string;
  try {
    raw = await tryGenerate("gemini-2.5-flash-lite", trimmed);
  } catch {
    try {
      raw = await tryGenerate("gemini-2.5-flash", trimmed);
    } catch (e) {
      console.error("Reader annotate API error (both models failed):", e);
      return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
    }
  }

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;

  try {
    const parsed = JSON.parse(cleanJson) as { segments?: Segment[]; grammarNotes?: { pattern: string; explanation: string }[] };
    if (!Array.isArray(parsed.segments)) throw new Error("missing segments array");

    // Sanity check: segments should reconstruct roughly the original passage. If the model
    // dropped or mangled a big chunk of text, fall back to an unglossed single segment rather
    // than show a garbled reading — a plain passage is still useful, broken furigana isn't.
    const rebuilt = parsed.segments.map((s) => s.text ?? "").join("");
    const normalize = (s: string) => s.replace(/\s+/g, "");
    const original = normalize(trimmed);
    const got = normalize(rebuilt);
    const lengthDiff = Math.abs(original.length - got.length) / Math.max(original.length, 1);
    if (lengthDiff > 0.1) {
      return NextResponse.json({
        segments: [{ text: trimmed, isContent: false }],
        grammarNotes: parsed.grammarNotes ?? [],
      });
    }

    return NextResponse.json({ segments: parsed.segments, grammarNotes: parsed.grammarNotes ?? [] });
  } catch {
    console.error("Gemini returned invalid JSON for reader annotate:", raw);
    return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
  }
}
