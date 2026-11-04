import { NextResponse } from "next/server";
import { listAllUserIds, sendFirstReviewReminders } from "@/lib/firstReviewReminder";

// Daily "you signed up but haven't studied yet" nudge — run by Vercel Cron (see
// vercel.json) alongside streak-reminder. Separate from it because the audience and
// the channel are both different: streak-reminder targets people who already have a
// streak and pushes a notification; this targets people who have NEVER reviewed a
// single card and sends an email instead, specifically because push can't reach them
// — there's no in-app nudge to install the PWA or enable notifications yet (confirmed
// by grepping the codebase), and on iOS push literally doesn't work at all without
// that install step, so email is the one channel guaranteed to reach every signup
// regardless of PWA/push status.
//
// Targets a 24-48h-old signup window (not "any signup that's ever been inactive") so
// this only ever fires once per user as the daily cron sweeps forward, with no
// separate dedupe table needed — a user created 30h ago today was already outside the
// window yesterday and will be outside it again tomorrow. Existing signups older than
// 48h are covered once by the separate /api/admin/backfill-first-review-reminder
// route instead, not by this ongoing daily sweep.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const windowStart = new Date(now - 48 * 60 * 60 * 1000);
  const windowEnd = new Date(now - 24 * 60 * 60 * 1000);

  const allUsers = await listAllUserIds();
  const candidates = allUsers
    .filter((u) => {
      const createdAt = new Date(u.created_at);
      return createdAt > windowStart && createdAt <= windowEnd;
    })
    .map((u) => ({ id: u.id, email: u.email }));

  const result = await sendFirstReviewReminders(candidates);
  return NextResponse.json({ candidates: candidates.length, ...result });
}
