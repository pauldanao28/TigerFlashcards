import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";
import { renderShareCard } from "@/lib/shareCard";
import { renderStatsCard } from "@/lib/statsCard";
import { STREAK_MILESTONES } from "@/lib/notificationText";
import { pickDailyQuests } from "@/lib/dailyQuests";

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
    .select("full_name, avatar_url, streak_count, referral_code, last_review_date")
    .eq("id", user.id)
    .maybeSingle();
  if (!me) return new Response("Profile not found", { status: 404 });

  const name = (me.full_name || "A FlashKado learner").slice(0, 24);
  // Chosen avatars are stored as DiceBear SVG URLs, which the image renderer draws as
  // an empty circle — DiceBear serves the same avatar as PNG at /png.
  const avatar = me.avatar_url
    ? me.avatar_url.replace("/svg?", "/png?")
    : `https://api.dicebear.com/7.x/avataaars/png?seed=${user.id}`;
  const shareUrl = me.referral_code ? `${origin}/join/${me.referral_code}` : origin;
  const shareHost = shareUrl.replace(/^https?:\/\//, "");

  // Different template entirely (dashboard-style breakdown, not one hero stat), so
  // it returns straight from here instead of falling into the shared renderShareCard
  // call below. jlpt_stats/pos_stats are deck-wide aggregates with no date filtering,
  // so get_dashboard_data's own per-card mastery math — not duplicated here — is the
  // single source of truth; it's security definer and reads auth.uid() internally,
  // so it has to run as the caller's own JWT, not the service-role client used above.
  if (kind === "vocab_stats") {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return new Response("Sign in required", { status: 401 });
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const { data: dash, error: dashErr } = await userClient.rpc("get_dashboard_data", {
      p_today: new Date().toLocaleDateString("en-CA"),
    });
    if (dashErr || !dash) return new Response("Couldn't load vocabulary stats", { status: 500 });
    if (!dash.deck_size) return new Response("No cards in your deck yet", { status: 400 });

    const image = await renderStatsCard({
      name,
      avatar,
      shareHost,
      deckSize: dash.deck_size,
      vocabNlevel: dash.vocab_nlevel,
      grammarScore: dash.grammar_score ?? 0,
      readingScore: dash.reading_score ?? 0,
      listeningScore: dash.listening_score ?? 0,
      jlptStats: dash.jlpt_stats,
      posStats: dash.pos_stats,
    });
    image.headers.set("X-Share-Url", shareUrl);
    image.headers.set("Cache-Control", "private, no-store");
    return image;
  }

  let emoji: string;
  let eyebrow: string;
  let headline: string;
  let headlineSize: number;
  let subline: string;
  let stats: { label: string; value: string }[] = [];
  let headlineLetterSpacing: number | undefined;

  if (kind === "streak") {
    const streak = me.streak_count ?? 0;
    // Shareable any time from Home, not just right after the goal — only claim
    // "goal complete"/milestone when today's goal (SGT, set by update_streak) is done.
    const doneToday = me.last_review_date === new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const milestone = doneToday && STREAK_MILESTONES.includes(streak);
    const cards = clampInt(searchParams.get("cards"), 9999);
    const accuracy = clampInt(searchParams.get("accuracy"), 100);
    emoji = milestone ? "🏆" : "🔥";
    eyebrow = milestone ? "Streak Milestone" : doneToday ? "Daily Goal Complete" : "Current Streak";
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
  } else if (kind === "quests") {
    // Today's quest set is a pure function of (Asia/Singapore date), same for every
    // user — see pickDailyQuests — so it's recomputed here rather than trusted from
    // the query string, same list the client showed in the Today's Quests card.
    const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    const todaysQuests = pickDailyQuests(todaySg);
    emoji = "✅";
    eyebrow = "Daily Quests Complete";
    headline = "";
    headlineSize = 10;
    subline = "";
    stats = todaysQuests.map((q) => ({ label: q.shortLabel, value: q.icon }));
  } else if (kind === "referral") {
    if (!me.referral_code) return new Response("No referral code", { status: 400 });
    emoji = "🎴";
    eyebrow = "You're Invited";
    // Grouped in two halves with a gap, not run together — an 8-character code is
    // hard to read (and copy by hand off a screenshot) as one solid block.
    headline = `${me.referral_code.slice(0, 4)} ${me.referral_code.slice(4)}`;
    headlineSize = 110;
    headlineLetterSpacing = 10;
    subline = "YOUR INVITE CODE";
    const streak = me.streak_count ?? 0;
    stats = streak > 0 ? [{ label: "Day streak", value: String(streak) }] : [];
  } else {
    return new Response("Unknown card kind", { status: 400 });
  }

  const image = await renderShareCard({ name, avatar, shareHost, emoji, eyebrow, headline, headlineSize, subline, stats, headlineLetterSpacing });
  image.headers.set("X-Share-Url", shareUrl);
  image.headers.set("Cache-Control", "private, no-store");
  return image;
}
