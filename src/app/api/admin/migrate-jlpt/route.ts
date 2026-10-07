import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);
const BATCH = 60;

async function classifyBatch(cards: { id: string; japanese: string; english: string }[]): Promise<Map<string, string>> {
  const list = cards.map((c, i) => `${i + 1}. ${c.japanese}（${c.english}）`).join("\n");
  const promptText = `Classify each Japanese word by JLPT level (N5=easiest, N4, N3, N2, N1=hardest).
Return ONLY a JSON array with one entry per word in the same order:
[{"id":"<id>","jlpt_level":"N5"}]

Words:
${cards.map((c, i) => `${i + 1}. id=${c.id} | ${c.japanese}（${c.english}）`).join("\n")}`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  const result = await model.generateContent(promptText);
  const raw = result.response.text();

  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (!arrMatch) return new Map();

  try {
    const parsed: { id: string; jlpt_level: string }[] = JSON.parse(arrMatch[0]);
    const map = new Map<string, string>();
    for (const item of parsed) {
      if (item.id && VALID_LEVELS.has(item.jlpt_level)) {
        map.set(item.id, item.jlpt_level);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_MIGRATE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { offset = 0 } = await req.json().catch(() => ({}));

  const { data: cards, error } = await supabaseAdmin
    .from("master_cards")
    .select("id, japanese, english")
    .is("jlpt_level", null)
    .range(offset, offset + BATCH - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!cards || cards.length === 0) return NextResponse.json({ done: true, updated: 0 });

  const levelMap = await classifyBatch(cards);

  const updates = Array.from(levelMap.entries()).map(([id, jlpt_level]) => ({ id, jlpt_level }));

  if (updates.length > 0) {
    for (const u of updates) {
      await supabaseAdmin.from("master_cards").update({ jlpt_level: u.jlpt_level }).eq("id", u.id);
    }
  }

  return NextResponse.json({
    done: false,
    processed: cards.length,
    updated: updates.length,
    next_offset: offset + cards.length,
  });
}
