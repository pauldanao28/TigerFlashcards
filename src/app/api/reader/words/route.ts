import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";
import { findNewWords, type DeckWord } from "@/lib/japaneseTokenizer";

export const runtime = "nodejs";

// Generous cap — no AI cost here, just local tokenizing. Sized for long texts like
// full video transcripts, not just Reader passages.
const MAX_CHARS = 20000;
const PAGE = 1000;

// Returns the vocabulary in `text` (dictionary form) that isn't in the caller's default
// deck yet. The deck is matched here rather than on the client so deck cards can go
// through the same tokenizer — see findNewWords for the cross-form matching rules.
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { text } = await req.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text must be a non-empty string" }, { status: 400 });
  }

  // Query as the user (their token, so RLS applies), not with a service key.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    const { data: deck } = await supabase
      .from("decks").select("id").eq("user_id", user.id).eq("is_default", true).maybeSingle();

    const deckWords: DeckWord[] = [];
    if (deck) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("master_cards")
          .select("japanese, reading, deck_cards!inner(deck_id)")
          .eq("deck_cards.deck_id", deck.id)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        deckWords.push(...(data ?? []).map((c) => ({ japanese: c.japanese, reading: c.reading })));
        if (!data || data.length < PAGE) break;
      }
    }

    const words = await findNewWords(text.trim().slice(0, MAX_CHARS), deckWords);
    return NextResponse.json({ words });
  } catch (e) {
    console.error("Word extraction failed:", e);
    return NextResponse.json({ error: "Could not analyze text" }, { status: 500 });
  }
}
