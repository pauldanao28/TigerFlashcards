"use client";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import type { LearningSummary } from "@/app/api/admin/learning-insights/route";

interface Insights {
  overall: string;
  strengths: string[];
  weakSpots: string[];
  jlptReadiness: string;
  recommendations: string[];
}

const JLPT_COLOR: Record<string, string> = {
  N5: "bg-emerald-400",
  N4: "bg-teal-400",
  N3: "bg-amber-400",
  N2: "bg-orange-400",
  N1: "bg-rose-400",
};

const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
    <p className="text-2xl font-black text-slate-800 mt-1">{value}</p>
    {sub && <p className="text-[10px] text-slate-400 mt-1">{sub}</p>}
  </div>
);

export default function AdminLearningInsights() {
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch("/api/admin/learning-insights")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load stats");
        return r.json();
      })
      .then((d) => setSummary(d.summary))
      .catch((e) => setSummaryError(e.message));
  }, []);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await authedFetch("/api/admin/learning-insights", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setSummary(data.summary);
      setInsights(data.insights);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (summaryError) return <div className="bg-rose-50 text-rose-600 p-6 rounded-2xl font-bold text-sm">{summaryError}</div>;
  if (!summary) return <div className="text-slate-400 font-bold text-sm p-6">Loading your stats…</div>;

  if (summary.totals.totalWords === 0) {
    return <div className="text-slate-400 font-bold text-sm p-6">No studied words yet — come back once you&apos;ve reviewed a few.</div>;
  }

  const last14Days = Object.entries(summary.velocity.byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const maxDay = Math.max(1, ...last14Days.map(([, v]) => v));
  const posEntries = Object.entries(summary.partOfSpeech).sort(([, a], [, b]) => b.count - a.count);

  return (
    <div className="grid gap-8">
      {/* Overview */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Words" value={summary.totals.totalWords} />
          <StatCard label="Mastered" value={`${summary.totals.masteredPct}%`} sub={`${summary.totals.mastered} words`} />
          <StatCard label="Struggling" value={`${summary.totals.strugglingPct}%`} sub={`${summary.totals.struggling} words`} />
          <StatCard label="Priority" value={summary.priorityCount} sub="starred words" />
        </div>
      </section>

      {/* Direction + Streak */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Recognition vs. Recall</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="JP → EN" value={`${summary.direction.jpToEn.avgAccuracy}%`} sub={`${summary.direction.jpToEn.totalReviews} reviews`} />
          <StatCard label="EN → JP" value={`${summary.direction.enToJp.avgAccuracy}%`} sub={`${summary.direction.enToJp.totalReviews} reviews`} />
          <StatCard label="Streak" value={summary.streak.current} sub={`best: ${summary.streak.best}`} />
          <StatCard label="Reviews (7d)" value={summary.velocity.last7} sub={`${summary.velocity.last30} in 30d`} />
        </div>
      </section>

      {/* JLPT breakdown */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">By JLPT Level</h3>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
          {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => {
            const d = summary.jlpt[lvl];
            return (
              <div key={lvl} className="flex items-center gap-3">
                <span className="shrink-0 w-8 text-[10px] font-black text-center text-slate-500">{lvl}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${JLPT_COLOR[lvl]}`} style={{ width: `${d.avgAccuracy}%` }} />
                </div>
                <span className="shrink-0 w-28 text-right text-xs font-black text-slate-600">
                  {d.count} words <span className="text-slate-400 font-bold">· {d.avgAccuracy}%</span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Review velocity */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Reviews — last 14 days</h3>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-end gap-1.5 h-24">
            {last14Days.map(([day, count]) => (
              <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${day}: ${count}`}>
                <div className="w-full bg-indigo-400 rounded-t-md min-h-[2px]" style={{ height: `${(count / maxDay) * 100}%` }} />
                <span className="text-[8px] text-slate-300 font-bold">{day.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Part of speech */}
      {posEntries.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">By Part of Speech</h3>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            {posEntries.map(([pos, d]) => (
              <div key={pos} className="flex items-center gap-3">
                <span className="shrink-0 w-20 text-[10px] font-black uppercase tracking-widest text-slate-500 truncate">{pos}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-400" style={{ width: `${d.avgAccuracy}%` }} />
                </div>
                <span className="shrink-0 w-28 text-right text-xs font-black text-slate-600">
                  {d.count} words <span className="text-slate-400 font-bold">· {d.avgAccuracy}%</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Weakest words */}
      {summary.weakestWords.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Weakest Words</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {summary.weakestWords.map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{w.japanese}</p>
                  <p className="text-slate-400 text-[11px] font-medium truncate">{w.reading} • {w.english}</p>
                </div>
                <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-700">
                  {w.accuracy}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI narrative */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">AI Analysis</h3>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
          >
            {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {insights ? "Re-analyze" : "Analyze my progress"}
          </button>
        </div>

        {analyzeError && (
          <p className="text-rose-500 text-xs font-bold mb-3">{analyzeError}</p>
        )}

        {!insights && !analyzing && !analyzeError && (
          <p className="text-slate-400 text-xs font-bold bg-white p-5 rounded-2xl border border-dashed border-slate-200">
            Nothing generated yet — the numbers above are always live, but the written analysis only runs when you ask for it.
          </p>
        )}

        {insights && (
          <div className="grid gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-sm text-slate-700 leading-relaxed">{insights.overall}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-2">Strengths</p>
                <ul className="space-y-1.5">
                  {insights.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-emerald-500">•</span>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-rose-50 p-5 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600 mb-2">Weak Spots</p>
                <ul className="space-y-1.5">
                  {insights.weakSpots.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-rose-500">•</span>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">JLPT Readiness</p>
              <p className="text-sm text-slate-700 leading-relaxed">{insights.jlptReadiness}</p>
            </div>
            <div className="bg-indigo-50 p-5 rounded-2xl border border-indigo-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-2">Recommendations</p>
              <ul className="space-y-1.5">
                {insights.recommendations.map((s, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-indigo-500">•</span>{s}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
