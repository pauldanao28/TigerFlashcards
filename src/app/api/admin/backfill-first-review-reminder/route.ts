import { NextResponse } from "next/server";
import { listAllUserIds, sendFirstReviewReminders } from "@/lib/firstReviewReminder";

// One-off catch-up for existing signups the daily cron's 24-48h window never covered
// (anyone who signed up before this feature existed). Meant to be triggered once
// manually, not scheduled — same ADMIN_MIGRATE_KEY pattern as the other one-off
// admin routes (backfill-examples, migrate-jlpt). After this runs once, the daily
// /api/cron/first-review-reminder sweep covers every new signup going forward.
export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_MIGRATE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only signups older than 48h — anyone newer is (or will be) covered by the daily
  // cron's 24-48h window, so including them here would double-send.
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const allUsers = await listAllUserIds();
  const candidates = allUsers
    .filter((u) => new Date(u.created_at).getTime() <= cutoff)
    .map((u) => ({ id: u.id, email: u.email }));

  const result = await sendFirstReviewReminders(candidates);
  return NextResponse.json({ candidates: candidates.length, ...result });
}
