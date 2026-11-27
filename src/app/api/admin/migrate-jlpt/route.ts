import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";

// Process a small batch per request to stay within serverless execution limits.
const BATCH = 20;
const VALID_LEVELS = new Set(["N5", "N4", "N3", "N2", "N1"]);

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function authorize(req: Request) {
  // Existing one-time maintenance scripts can continue using the secret key.
  const configuredKey = process.env.ADMIN_MIGRATE_KEY;
  const key = req.headers.get("x-admin-key");
  if (configuredKey && key === configuredKey) return true;

  // Also allow a signed-in admin to run maintenance from the Admin page.
  const user = await getAuthedUser(req);
  if (!user) return false;
  const { data, error } = await adminClient().from("profiles")
    .select("is_admin").eq("id", user.id).maybeSingle();
  return !error && data?.is_admin === true;
}

function missingVocabularyQuery() {
  return adminClient().from("master_cards")
    .select("id, japanese, reading, english", { count: "exact" })
    .is("jlpt_level", null)
    .or("card_type.is.null,card_type.neq.phrase");
}

async function remainingCount() {
  const { count, error } = await missingVocabularyQuery().limit(1);
  if (error) throw error;
  return count ?? 0;
}

export async function GET(req: Request) {
  if (!await authorize(req)) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  try {
    return NextResponse.json({ remaining: await remainingCount() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!await authorize(req)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    // Always take the FIRST missing batch: updating rows removes them from
    // the filter, so incrementing offsets would skip unclassified cards.
    const { data: cards, error } = await missingVocabularyQuery()
      .order("id", { ascending: true }).limit(BATCH);
    if (error) throw error;
    if (!cards?.length) return NextResponse.json({ done: true, processed: 0, updated: 0, remaining: 0 });

    const model = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!)
      .getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const prompt = `Assign an estimated JLPT vocabulary difficulty level to EACH of these Japanese words.
Use N5 (easiest), N4, N3, N2 or N1 (hardest). Base the estimate on the Japanese spelling, reading, and English meaning. Only return one of those five levels for each word; never null. JLPT does not publish an official vocabulary list, so these are approximate study-level estimates.
Output ONLY a JSON array: [{"id":"exact supplied id","jlpt_level":"N3"}].
Do not invent IDs, exclude entries or change the words.
Cards: ${JSON.stringify(cards)}`;
    const raw = (await model.generateContent(prompt)).response.text();
    const start = raw.indexOf("[");
    const end = raw.lastIndexOf("]");
    if (start < 0 || end <= start) throw new Error("AI did not return a valid JSON array");
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(parsed)) throw new Error("AI did not return a list");

    const candidates = new Set(cards.map(c => c.id));
    const assigned = new Map<string, string>();
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id === "string" && candidates.has(row.id)
        && typeof row.jlpt_level === "string" && VALID_LEVELS.has(row.jlpt_level)) {
        assigned.set(row.id, row.jlpt_level);
      }
    }

    let updated = 0;
    const errors: string[] = [];
    for (const card of cards) {
      const level = assigned.get(card.id);
      if (!level) {
        errors.push(`No valid level returned for ${card.japanese}`);
        continue;
      }
      // Never overwrite an existing classification, including one set
      // concurrently by another admin. No deck, scores or review rows touched.
      const { data, error: writeError } = await adminClient().from("master_cards")
        .update({ jlpt_level: level })
        .eq("id", card.id).is("jlpt_level", null)
        .select("id");
      if (writeError) errors.push(`${card.japanese}: ${writeError.message}`);
      else if (data?.length) updated++;
    }

    const remaining = await remainingCount();
    return NextResponse.json({
      done: remaining === 0,
      processed: cards.length,
      updated,
      remaining,
      errors,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
