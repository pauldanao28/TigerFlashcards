"use client";
import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";

interface AnalyticsData {
  signups: { total: number; last7: number; last30: number; byDay: Record<string, number> };
  activity: { dau: number; wau: number; mau: number; reviewsLast7: number; reviewsLast30: number };
  content: { masterCards: number; deckCards: number };
  quiz: Record<string, { sessions: number; correct: number; total: number }>;
  aiUsage: { last7: Record<string, number>; last30: Record<string, number> };
  accounts: { premium: number; admin: number };
}

const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-2xl font-black text-slate-800 mt-1">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
  </div>
);

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch("/api/admin/analytics")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load analytics");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="bg-rose-50 text-rose-600 p-6 rounded-2xl font-bold text-sm">{error}</div>;
  if (!data) return <div className="text-slate-400 font-bold text-sm p-6">Loading analytics…</div>;

  const last14Days = Object.entries(data.signups.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const maxSignupDay = Math.max(1, ...last14Days.map(([, v]) => v));

  return (
    <div className="grid gap-8">
      {/* Growth */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Growth</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={data.signups.total} />
          <StatCard label="New (7d)" value={data.signups.last7} />
          <StatCard label="New (30d)" value={data.signups.last30} />
          <StatCard label="Premium" value={data.accounts.premium} sub={`${data.accounts.admin} admin`} />
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mt-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Signups — last 14 days</p>
          <div className="flex items-end gap-1.5 h-24">
            {last14Days.map(([day, count]) => (
              <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${day}: ${count}`}>
                <div
                  className="w-full bg-indigo-400 rounded-t-md min-h-[2px]"
                  style={{ height: `${(count / maxSignupDay) * 100}%` }}
                />
                <span className="text-[8px] text-slate-300 font-bold">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Activity */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Activity</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="DAU" value={data.activity.dau} sub="today" />
          <StatCard label="WAU" value={data.activity.wau} sub="last 7 days" />
          <StatCard label="MAU" value={data.activity.mau} sub="last 30 days" />
          <StatCard label="Reviews (7d)" value={data.activity.reviewsLast7} sub={`${data.activity.reviewsLast30} in 30d`} />
        </div>
      </section>

      {/* Content */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Content</h3>
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Master Cards" value={data.content.masterCards} />
          <StatCard label="Cards Added to Decks" value={data.content.deckCards} />
        </div>
      </section>

      {/* Quiz activity */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Quiz Activity (30d)</h3>
        <div className="grid grid-cols-3 gap-4">
          {["grammar", "reading", "listening"].map((type) => {
            const q = data.quiz[type] ?? { sessions: 0, correct: 0, total: 0 };
            const accuracy = q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;
            return (
              <StatCard
                key={type}
                label={type}
                value={`${q.sessions} sessions`}
                sub={q.total > 0 ? `${accuracy}% accuracy` : "no data"}
              />
            );
          })}
        </div>
      </section>

      {/* AI usage — ties back to the daily rate limits */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">AI Usage (real cost driver)</h3>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="text-left px-5 py-3">Endpoint</th>
                <th className="text-right px-5 py-3">Last 7 days</th>
                <th className="text-right px-5 py-3">Last 30 days</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(data.aiUsage.last30).length === 0 ? (
                <tr><td colSpan={3} className="text-center text-slate-400 font-bold py-6">No AI usage recorded yet.</td></tr>
              ) : (
                Object.entries(data.aiUsage.last30).sort(([, a], [, b]) => b - a).map(([endpoint, total30]) => (
                  <tr key={endpoint} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-3 font-bold text-slate-700">{endpoint}</td>
                    <td className="px-5 py-3 text-right font-black text-slate-800">{data.aiUsage.last7[endpoint] ?? 0}</td>
                    <td className="px-5 py-3 text-right font-black text-slate-800">{total30}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
