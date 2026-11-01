import { NextResponse } from "next/server";
import { deliver, sgDate, supabaseAdmin } from "@/lib/notifyServer";

// Daily "streak at risk" reminder — run by Vercel Cron (see vercel.json) at 12:00 UTC,
// i.e. 8 PM Asia/Singapore, four hours before the app's daily reset. Targets anyone
// with a live streak whose last goal-met day was yesterday (SGT), meaning they haven't
// hit today's goal yet. Also prunes notification history older than 30 days.
//
// Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations; anything
// without it is rejected so the route can't be triggered by outsiders.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = sgDate();
  const yesterday = sgDate(-1);

  const { data: atRisk, error } = await supabaseAdmin
    .from("profiles")
    .select("id, streak_count")
    .gt("streak_count", 0)
    .eq("last_review_date", yesterday);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = await deliver(
    (atRisk ?? []).map((p) => ({
      user_id: p.id,
      actor_id: null,
      type: "streak_reminder" as const,
      data: { streak: p.streak_count },
      dedupe_key: `streak:${today}`,
    }))
  );

  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await supabaseAdmin.from("notifications").delete().lt("created_at", cutoff);

  return NextResponse.json({ atRisk: atRisk?.length ?? 0, ...result });
}
