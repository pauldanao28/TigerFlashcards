import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BATCH = 60;

async function generateBatch(
  cards: { id: string; japanese: string; reading: string; english: string; jlpt_level: string | null }[]
): Promise<Map<string, { jp: string; en: string }>> {
  const list = cards
    .map((c) => `id=${c.id} | ${c.japanese} (${c.reading}) — ${c.english}${c.jlpt_level ? ` [${c.jlpt_level}]` : ""}`)
    .join("\n");

  const promptText = `For each Japanese word below, write ONE natural example sentence that actually
contains the word (its dictionary form or a natural inflection), plus a natural English
translation of that exact sentence. Keep both short (roughly 5-15 words) and don't lean
on grammar harder than the word's own JLPT level, when given.

Words:
${list}

Output ONLY a JSON array, one entry per word:
[{"id":"<id>","jp":"...","en":"..."}]`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  const result = await model.generateContent(promptText);
  const raw = result.response.text();

  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrMatch) return new Map();

  try {
    const parsed: { id: string; jp: string; en: string }[] = JSON.parse(arrMatch[0]);
    const map = new Map<string, { jp: string; en: string }>();
    for (const item of parsed) {
      if (item.id && item.jp && item.en) map.set(item.id, { jp: item.jp, en: item.en });
    }
    return map;
  } catch {
    return new Map();
  }
}

// One-off backfill for cards missing an example sentence (added before the generator
// required one, or seeded via starter packs without one). No offset/pagination here on
// purpose: every row fixed by a batch drops out of the "missing" filter below, so the
// matching set shrinks as you go — an incrementing offset would skip rows as earlier
// ones are removed from under it. Just call this repeatedly (same body each time) until
// it returns { done: true } or processed: 0.
export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_MIGRATE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: cards, error } = await supabaseAdmin
    .from("master_cards")
    .select("id, japanese, reading, english, jlpt_level")
    .or("exampleSentence.is.null,exampleSentence->>jp.is.null")
    .limit(BATCH);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cards || cards.length === 0) return NextResponse.json({ done: true, updated: 0 });

  const examples = await generateBatch(cards);

  let updated = 0;
  for (const [id, exampleSentence] of examples) {
    const { error: updateErr } = await supabaseAdmin.from("master_cards").update({ exampleSentence }).eq("id", id);
    if (!updateErr) updated++;
  }

  return NextResponse.json({
    done: false,
    processed: cards.length,
    updated,
  });
}
