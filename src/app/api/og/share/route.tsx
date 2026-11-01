import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";
import { renderShareCard } from "@/lib/shareCard";
import { STREAK_MILESTONES } from "@/lib/notificationText";

// Shareable achievement card (1080×1920, Instagram Story size) for the ShareButton.
// Requires sign-in and draws only the caller's own data: name, avatar, streak, and
// referral code come from their profile, never the query string. The query only says
// which card to draw plus session numbers (cards/accuracy) and level-up levels, all
// validated against fixed ranges/enums. The share link is returned in X-Share-Url so
// the client doesn't need to look up the referral code itself.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const SKILLS = { reading: "Reading", listening: "Listening", grammar: "Grammar", vocab: "Vocabulary" } as const;
const LEVEL_NAME: Record<string, string> = { N5: "Beginner", N4: "Learner", N3: "Intermediate", N2: "Advanced", N1: "Expert" };
const LEVEL_EMOJI: Record<string, string> = { N5: "🌱", N4: "🌿", N3: "⚡", N2: "🔥", N1: "🏆" };

function clampInt(raw: string | null, max: number): number | null {
  const n = Number(raw);
  return raw != null && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

export async function GET(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return new Response("Sign in required", { status: 401 });

  const { searchParams, origin } = new URL(req.url);
  const kind = searchParams.get("kind");

  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("full_name, avatar_url, streak_count, referral_code")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return new Response("Profile not found", { status: 404 });

  const name = (me.full_name || "A FlashKado learner").slice(0, 24);
  const avatar = me.avatar_url || `https://api.dicebear.com/7.x/avataaars/png?seed=${user.id}`;
  const shareUrl = me.referral_code ? `${origin}/join/${me.referral_code}` : origin;
  const shareHost = shareUrl.replace(/^https?:\/\//, "");

  let emoji: string;
  let eyebrow: string;
  let headline: string;
  let headlineSize: number;
  let subline: string;
  let stats: { label: string; value: string }[] = [];

  if (kind === "streak") {
    const streak = me.streak_count ?? 0;
    const milestone = STREAK_MILESTONES.includes(streak);
    const cards = clampInt(searchParams.get("cards"), 9999);
    const accuracy = clampInt(searchParams.get("accuracy"), 100);
    emoji = milestone ? "🏆" : "🔥";
    eyebrow = milestone ? "Streak Milestone" : "Daily Goal Complete";
    headline = String(streak);
    headlineSize = streak >= 100 ? 260 : 320;
    subline = "DAY STREAK";
    if (cards != null) stats.push({ label: "Cards today", value: String(cards) });
    if (accuracy != null) stats.push({ label: "Accuracy", value: `${accuracy}%` });
  } else if (kind === "levelup") {
    const from = searchParams.get("from") as (typeof LEVELS)[number];
    const to = searchParams.get("to") as (typeof LEVELS)[number];
    const skill = searchParams.get("skill") as keyof typeof SKILLS;
    if (!LEVELS.includes(from) || !LEVELS.includes(to) || !(skill in SKILLS)) {
      return new Response("Bad level-up params", { status: 400 });
    }
    emoji = LEVEL_EMOJI[to];
    eyebrow = `${SKILLS[skill]} Level Up`;
    headline = to;
    headlineSize = 320;
    subline = `${from} → ${to} · ${LEVEL_NAME[to].toUpperCase()}`;
    stats = [];
  } else {
    return new Response("Unknown card kind", { status: 400 });
  }

  const image = await renderShareCard({ name, avatar, shareHost, emoji, eyebrow, headline, headlineSize, subline, stats });
  image.headers.set("X-Share-Url", shareUrl);
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
