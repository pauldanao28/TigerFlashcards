import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

async function listAllUsers() {
  const users: { id: string; email: string | null; created_at: string }[] = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at })));
    if (data.users.length < perPage) break;
    page++;
  }
  return users;
}

export async function GET(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data: profile } = await supabaseAdmin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const since30 = dayKey(daysAgo(29));
  const since7 = dayKey(daysAgo(6));
  const today = dayKey(new Date());

  const [users, cardCounts, deckCardCount, reviewCounts, quizStats, aiUsage, premiumCount, adminCount] = await Promise.all([
    listAllUsers(),
    supabaseAdmin.from("master_cards").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("deck_cards").select("*", { count: "exact", head: true }),
    supabaseAdmin.from("user_review_counts").select("user_id, study_date, count").gte("study_date", since30),
    supabaseAdmin.from("quiz_daily_stats").select("quiz_type, n_level, correct, total, study_date").gte("study_date", since30),
    supabaseAdmin.from("ai_usage_daily").select("endpoint, amount, usage_date").gte("usage_date", since30),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("is_premium", true),
    supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("is_admin", true),
  ]);

  // --- Signups ---
  const totalUsers = users.length;
  const newLast7 = users.filter((u) => dayKey(new Date(u.created_at)) >= since7).length;
  const newLast30 = users.filter((u) => dayKey(new Date(u.created_at)) >= since30).length;
  const signupsByDay: Record<string, number> = {};
  for (let i = 0; i < 30; i++) signupsByDay[dayKey(daysAgo(i))] = 0;
  for (const u of users) {
    const k = dayKey(new Date(u.created_at));
    if (k in signupsByDay) signupsByDay[k]++;
  }

  // --- Activity (DAU/WAU/MAU from user_review_counts) ---
  const rc = reviewCounts.data ?? [];
  const dau = new Set(rc.filter((r) => r.study_date === today).map((r) => r.user_id)).size;
  const wau = new Set(rc.filter((r) => r.study_date >= since7).map((r) => r.user_id)).size;
  const mau = new Set(rc.map((r) => r.user_id)).size;
  const reviewsLast7 = rc.filter((r) => r.study_date >= since7).reduce((s, r) => s + r.count, 0);
  const reviewsLast30 = rc.reduce((s, r) => s + r.count, 0);

  // --- Quiz activity ---
  const qs = quizStats.data ?? [];
  const quizByType: Record<string, { sessions: number; correct: number; total: number }> = {};
  for (const q of qs) {
    const bucket = (quizByType[q.quiz_type] ??= { sessions: 0, correct: 0, total: 0 });
    bucket.sessions++;
    bucket.correct += q.correct;
    bucket.total += q.total;
  }

  // --- AI usage (ties back to the rate limits) ---
  const usage = aiUsage.data ?? [];
  const usageByEndpoint7: Record<string, number> = {};
  const usageByEndpoint30: Record<string, number> = {};
  for (const u of usage) {
    usageByEndpoint30[u.endpoint] = (usageByEndpoint30[u.endpoint] ?? 0) + u.amount;
    if (u.usage_date >= since7) usageByEndpoint7[u.endpoint] = (usageByEndpoint7[u.endpoint] ?? 0) + u.amount;
  }

  return NextResponse.json({
    signups: { total: totalUsers, last7: newLast7, last30: newLast30, byDay: signupsByDay },
    activity: { dau, wau, mau, reviewsLast7, reviewsLast30 },
    content: { masterCards: cardCounts.count ?? 0, deckCards: deckCardCount.count ?? 0 },
    quiz: quizByType,
    aiUsage: { last7: usageByEndpoint7, last30: usageByEndpoint30 },
    accounts: { premium: premiumCount.count ?? 0, admin: adminCount.count ?? 0 },
  });
}
