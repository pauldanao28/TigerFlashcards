import { createClient } from "@supabase/supabase-js";

// Shared by the daily cron (24-48h-old signups going forward) and the one-off admin
// backfill (every existing signup, any age) — both need the same "who has never
// graded a single card, and what do we send them" logic, just different candidate
// pools.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function sendFirstReviewReminders(
  candidates: { id: string; email: string | null }[]
): Promise<{ neverStudied: number; sent: number }> {
  if (candidates.length === 0) return { neverStudied: 0, sent: 0 };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured — skipping first-review reminder");
    return { neverStudied: 0, sent: 0 };
  }

  // user_scores gets a row the moment handleScore runs, regardless of whether the
  // user ever hit the daily goal (that only sets profiles.last_review_date) — the
  // true "never studied at all" signal, not just "no streak yet."
  const { data: scored } = await supabaseAdmin
    .from("user_scores")
    .select("user_id")
    .in("user_id", candidates.map((c) => c.id));
  const studiedIds = new Set((scored ?? []).map((s) => s.user_id));
  const neverStudied = candidates.filter((c) => !studiedIds.has(c.id) && c.email);

  if (neverStudied.length === 0) return { neverStudied: 0, sent: 0 };

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name")
    .in("id", neverStudied.map((c) => c.id));
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  let sent = 0;
  for (const user of neverStudied) {
    const name = nameById.get(user.id) || "there";
    const emailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; border: 2px solid #000; padding: 40px; background: #fff;">
        <h1 style="font-size: 36px; font-weight: 900; font-style: italic; text-transform: uppercase; letter-spacing: -2px; margin: 0;">
          Your Deck Is Waiting
        </h1>
        <p style="font-weight: bold; text-transform: uppercase; color: #64748b; font-size: 12px; margin-bottom: 30px;">
          FlashKado | AI Flashcards for Japanese Learning
        </p>
        <p style="font-size: 16px; line-height: 1.6; color: #1e293b;">
          Hey ${name}, you signed up but haven't reviewed your first card yet — it only takes a couple of minutes to get your first few words in.
        </p>
        <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
          <a href="https://flashkado.app/study"
             style="display: inline-block; background: #000; color: #fff; padding: 15px 30px; text-decoration: none; font-weight: 900; font-size: 14px; text-transform: uppercase;">
            Start Studying ⚡️
          </a>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FlashKado <hello@flashkado.app>",
        to: user.email,
        subject: "Your Japanese deck is waiting for you 🇯🇵",
        html: emailHtml,
      }),
    });
    if (res.ok) sent++;
    else console.error("First-review reminder send failed:", await res.text());
  }

  return { neverStudied: neverStudied.length, sent };
}

export async function listAllUserIds(): Promise<{ id: string; email: string | null; created_at: string }[]> {
  const users: { id: string; email: string | null; created_at: string }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at })));
    if (data.users.length < 1000) break;
  }
  return users;
}
