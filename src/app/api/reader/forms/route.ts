import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { dictionaryForms } from "@/lib/japaneseTokenizer";

export const runtime = "nodejs";

// No AI — local tokenizer only. Capped so a single request stays small even for a
// full video transcript's worth of words.
const MAX_WORDS = 3000;
const MAX_WORD_CHARS = 40;

// Maps tapped word units to their dictionary forms, so deck-status highlights can match
// 難しかった against a 難しい card.
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { words } = await req.json();
  if (!Array.isArray(words)) return NextResponse.json({ error: "words must be an array" }, { status: 400 });
  const clean = [...new Set(words.filter((w): w is string => typeof w === "string" && w.length > 0 && w.length <= MAX_WORD_CHARS))]
    .slice(0, MAX_WORDS);

  try {
    return NextResponse.json({ forms: await dictionaryForms(clean) });
  } catch (e) {
    console.error("Dictionary form lookup failed:", e);
    return NextResponse.json({ error: "Could not analyze words" }, { status: 500 });
  }
}
