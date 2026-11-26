import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/apiAuth";
import { checkAndRecordUsage } from "@/lib/rateLimit";
import { generateCards } from "@/lib/generateCards";

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { words, cardType = "vocabulary" } = await req.json();
  if (!["vocabulary", "phrase"].includes(cardType)) return NextResponse.json({ error: "Invalid card type" }, {status:400});
  if (!Array.isArray(words) || words.length === 0) {
    return NextResponse.json({ error: "words must be a non-empty array" }, { status: 400 });
  }

  const usage = await checkAndRecordUsage(user.id, "generate", words.length);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Daily limit reached — come back tomorrow!" },
      { status: 429 }
    );
  }

  try {
    const cards = await generateCards(words, {cardType});
    return NextResponse.json(cards);
  } catch (e) {
    console.error("Generate API error:", e);
    return NextResponse.json({ error: "AI unavailable" }, { status: 500 });
  }
}
