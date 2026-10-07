import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// One-time fix: cards seeded via "I know this card" had pass:3 instead of pass:5,
// so they never cleared the mastery threshold (pass >= 5). This bumps all user_scores
// rows updated today where both directions are exactly {pass:3, total:3, percent:100}.
export async function POST(req: Request) {
  const adminKey = req.headers.get("x-admin-key");
  if (adminKey !== process.env.ADMIN_MIGRATE_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: rows, error } = await supabaseAdmin
    .from("user_scores")
    .select("id, user_id, card_id, scores_json")
    .gte("updated_at", today.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ fixed: 0 });

  const fixedStats = { pass: 5, fail: 0, total: 5, percent: 100 };

  const toFix = rows.filter((r) => {
    const jp = r.scores_json?.jp_to_en;
    const en = r.scores_json?.en_to_jp;
    return (
      jp?.pass === 3 && jp?.total === 3 && jp?.percent === 100 &&
      en?.pass === 3 && en?.total === 3 && en?.percent === 100
    );
  });

  if (toFix.length === 0) return NextResponse.json({ fixed: 0 });

  const updates = await Promise.all(
    toFix.map((r) =>
      supabaseAdmin
        .from("user_scores")
        .update({ scores_json: { jp_to_en: fixedStats, en_to_jp: fixedStats } })
        .eq("id", r.id)
    )
  );

  const errors = updates.filter((u) => u.error).map((u) => u.error?.message);
  return NextResponse.json({ fixed: toFix.length - errors.length, errors });
}
