import { createClient } from "@supabase/supabase-js";

// Shared by the daily cron (24-48h-old signups going forward) and the one-off admin
// backfill (existing signups older than that) — both need the same "who has never
// graded a single card, and what do we send them" logic, just different candidate
// pools.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Keeps .in() filters short enough for PostgREST's URL limit.
const ID_CHUNK = 100;
// Resend's batch endpoint takes up to 100 emails per call.
const SEND_BATCH = 100;
// How many per-user "has studied?" lookups run at once.
const LOOKUP_CONCURRENCY = 20;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// handle_new_user stamps 'G_' + 5 chars of the user id when no name was given at
// signup — never greet someone by that.
function displayName(fullName: string | null | undefined): string {
  const name = fullName?.trim();
  if (!name || name.startsWith("G_")) return "there";
  return escapeHtml(name);
}

// One existence check per user (limit 1) instead of selecting every user_scores row
// for all candidates at once — that bulk select is capped at PostgREST's max rows
// (1000), so a few active users' rows would crowd out everyone else and make them look
// like they'd never studied.
async function findStudiedIds(ids: string[]): Promise<Set<string>> {
  const studied = new Set<string>();
  for (const group of chunk(ids, LOOKUP_CONCURRENCY)) {
    const results = await Promise.all(
      group.map(async (id) => {
        const { data, error } = await supabaseAdmin
          .from("user_scores")
          .select("user_id")
          .eq("user_id", id)
          .limit(1);
        if (error) throw error;
        return (data?.length ?? 0) > 0 ? id : null;
      })
    );
    for (const id of results) if (id) studied.add(id);
  }
  return studied;
}

function buildEmail(name: string): string {
  return `
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
        <p style="font-size: 11px; color: #64748b; margin-top: 30px;">
          This is a one-time reminder because you signed up for FlashKado. You won't get it again.
        </p>
      </div>
    `;
}

export async function sendFirstReviewReminders(
  candidates: { id: string; email: string | null }[]
): Promise<{ neverStudied: number; sent: number; failed: number }> {
  const withEmail = candidates.filter((c) => c.email);
  if (withEmail.length === 0) return { neverStudied: 0, sent: 0, failed: 0 };

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured — skipping first-review reminder");
    return { neverStudied: 0, sent: 0, failed: 0 };
  }

  // user_scores gets a row the moment handleScore runs, regardless of whether the
  // user ever hit the daily goal (that only sets profiles.last_review_date) — the
  // true "never studied at all" signal, not just "no streak yet."
  const studiedIds = await findStudiedIds(withEmail.map((c) => c.id));
  const neverStudied = withEmail.filter((c) => !studiedIds.has(c.id));
  if (neverStudied.length === 0) return { neverStudied: 0, sent: 0, failed: 0 };

  const nameById = new Map<string, string | null>();
  for (const ids of chunk(neverStudied.map((c) => c.id), ID_CHUNK)) {
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) nameById.set(p.id, p.full_name);
  }

  let sent = 0;
  let failed = 0;
  const batches = chunk(neverStudied, SEND_BATCH);
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const payload = batch.map((user) => ({
      from: "FlashKado <hello@flashkado.app>",
      to: [user.email!],
      subject: "Your Japanese deck is waiting for you 🇯🇵",
      html: buildEmail(displayName(nameById.get(user.id))),
    }));

    // Batch endpoint = 1 request per 100 emails, so we stay well under Resend's
    // per-second rate limit. Retry once on 429.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 1500));
    }

    if (res?.ok) sent += batch.length;
    else {
      failed += batch.length;
      console.error("First-review reminder batch failed:", res ? await res.text() : "no response");
    }

    if (i < batches.length - 1) await new Promise((r) => setTimeout(r, 600));
  }

  return { neverStudied: neverStudied.length, sent, failed };
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
