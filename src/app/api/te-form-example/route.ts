import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Example cache is not configured" }, { status: 503 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { cardId } = await req.json();
  if (typeof cardId !== "string" || !/^[0-9a-f-]{36}$/i.test(cardId)) {
    return NextResponse.json({ error: "Invalid card" }, { status: 400 });
  }
  const { data: card, error: cardError } = await admin.from("master_cards")
    .select("id,japanese,reading,english,te_form,suru_meaning").eq("id", cardId).single();
  if (cardError || !card || !card.te_form) {
    return NextResponse.json({ error: "No te-form for this card" }, { status: 404 });
  }
  const { data: cached } = await admin.from("te_form_examples")
    .select("te_form,jp,en").eq("card_id", cardId).maybeSingle();
  if (cached && cached.te_form === card.te_form) {
    return NextResponse.json({ jp: cached.jp, en: cached.en, cached: true });
  }
  const usage = await checkAndRecordUsage(user.id, "mnemonic", 1);
  if (!usage.allowed) return NextResponse.json({ error: "Daily AI limit reached" }, { status: 429 });

  const prompt = `Create ONE short, natural Japanese example sentence demonstrating the te-form "${card.te_form}" of "${card.japanese}" (reading: ${card.reading}; meaning: ${card.english}; suru meaning if applicable: ${card.suru_meaning ?? "none"}).
The sentence MUST contain the exact string "${card.te_form}" used grammatically as a te-form, not just mentioned or quoted. Make it useful to an intermediate Japanese learner. Give a faithful English translation. Return ONLY JSON: {"jp":"...","en":"..."}.`;
  try {
    const model = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!)
      .getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const response = await model.generateContent(prompt);
    const raw = response.response.text();
    const match = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : raw);
    if (typeof parsed.jp !== "string" || typeof parsed.en !== "string" ||
        !parsed.jp.includes(card.te_form) || !parsed.en.trim() ||
        parsed.jp.length > 240 || parsed.en.length > 400) {
      return NextResponse.json({ error: "Invalid example generated" }, { status: 502 });
    }
    const { error } = await admin.from("te_form_examples").upsert({
      card_id: cardId, te_form: card.te_form, jp: parsed.jp, en: parsed.en,
    }, { onConflict: "card_id" });
    if (error) {
      console.error("Te-form cache save failed:", error.message);
      return NextResponse.json({ error: "Unable to save example" }, { status: 503 });
    }
    return NextResponse.json({ jp: parsed.jp, en: parsed.en });
  } catch (error) {
    console.error("Te-form generation failed:", error);
    return NextResponse.json({ error: "Example unavailable, please try again later" }, { status: 503 });
  }
}
