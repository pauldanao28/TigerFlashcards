"use client";
import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import type { LearningSummary } from "@/app/api/learning-insights/route";

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

const MiniBars = ({ byDay, color }: { byDay: Record<string, number>; color: string }) => {
  const days = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  const max = Math.max(1, ...days.map(([, v]) => v));
  return (
    <div className="flex items-end gap-1.5 h-20">
      {days.map(([day, count]) => (
        <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${day}: ${count}`}>
          <div className={`w-full ${color} rounded-t-md min-h-[2px]`} style={{ height: `${(count / max) * 100}%` }} />
          <span className="text-[8px] text-slate-300 font-bold">{day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
};

const WordList = ({ words, badgeClass }: { words: { japanese: string; reading: string; english: string; accuracy: number }[]; badgeClass: string }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
    {words.map((w, i) => (
      <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="font-black text-slate-800 text-sm truncate">{w.japanese}</p>
          <p className="text-slate-400 text-[11px] font-medium truncate">{w.reading} • {w.english}</p>
        </div>
        <span className={`shrink-0 text-[10px] font-black px-2 py-1 rounded-full ${badgeClass}`}>{w.accuracy}%</span>
      </div>
    ))}
  </div>
);

export default function LearningInsights({ isAdmin }: { isAdmin: boolean }) {
  const [summary, setSummary] = useState<LearningSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch("/api/learning-insights")
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
      const res = await authedFetch("/api/learning-insights", { method: "POST" });
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

  const posEntries = Object.entries(summary.partOfSpeech).sort(([, a], [, b]) => b.count - a.count);
  const quizEntries = Object.entries(summary.quizPerformance).sort(([, a], [, b]) => b.sessions - a.sessions);

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

      {/* Funnel */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">New / Learning / Mastered</h3>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="New" value={summary.funnel.new} sub="never reviewed" />
          <StatCard label="Learning" value={summary.funnel.learning} sub="reviewed, not mastered" />
          <StatCard label="Mastered" value={summary.funnel.mastered} sub="5+ passes, 70%+" />
        </div>
      </section>

      {/* Direction + Streak + Consistency */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Recognition vs. Recall</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="JP → EN" value={`${summary.direction.jpToEn.avgAccuracy}%`} sub={`${summary.direction.jpToEn.totalReviews} reviews`} />
          <StatCard label="EN → JP" value={`${summary.direction.enToJp.avgAccuracy}%`} sub={`${summary.direction.enToJp.totalReviews} reviews`} />
          <StatCard label="Streak" value={summary.streak.current} sub={`best: ${summary.streak.best}`} />
          <StatCard label="Days Studied" value={`${summary.studyConsistency.daysStudied}/${summary.studyConsistency.totalDays}`} sub="last 30 days" />
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

      {/* Acquisition vs Review velocity */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Last 14 Days</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              New words added <span className="text-slate-300">· {summary.acquisition.last7}/7d</span>
            </p>
            <MiniBars byDay={summary.acquisition.byDay} color="bg-amber-400" />
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              Reviews <span className="text-slate-300">· {summary.velocity.last7}/7d</span>
            </p>
            <MiniBars byDay={summary.velocity.byDay} color="bg-indigo-400" />
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

      {/* Content coverage + Priority effectiveness */}
      <section>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Content & Priority</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Has Example" value={`${summary.contentCoverage.exampleSentencePct}%`} sub="of your deck" />
          <StatCard label="Has Mnemonic" value={`${summary.contentCoverage.mnemonicPct}%`} sub="of your deck" />
          <StatCard label="Priority Accuracy" value={`${summary.priorityEffectiveness.priorityAccuracy}%`} sub={`${summary.priorityEffectiveness.priorityCount} starred`} />
          <StatCard label="Non-Priority Accuracy" value={`${summary.priorityEffectiveness.nonPriorityAccuracy}%`} sub={`${summary.priorityEffectiveness.nonPriorityCount} words`} />
        </div>
      </section>

      {/* Quiz performance */}
      {quizEntries.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Quiz Performance (30d)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {quizEntries.map(([type, d]) => (
              <StatCard key={type} label={type} value={`${d.accuracy}%`} sub={`${d.sessions} sessions · ${d.correct}/${d.total}`} />
            ))}
          </div>
        </section>
      )}

      {/* Weakest words */}
      {summary.weakestWords.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Weakest Words</h3>
          <WordList words={summary.weakestWords} badgeClass="bg-rose-100 text-rose-700" />
        </section>
      )}

      {/* Relapsed words */}
      {summary.relapsedWords.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Slipping (Were Strong, Now Below 70%)</h3>
          <WordList words={summary.relapsedWords} badgeClass="bg-amber-100 text-amber-700" />
        </section>
      )}

      {/* Grammar weak points */}
      {summary.grammarWeakPoints.length > 0 && (
        <section>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Grammar Weak Points</h3>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
            {summary.grammarWeakPoints.map((g, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="font-black text-slate-800 text-sm truncate">{g.pattern} <span className="text-[9px] font-black text-slate-400 uppercase">{g.jlptLevel}</span></p>
                  <p className="text-slate-400 text-[11px] font-medium truncate">{g.meaning}</p>
                </div>
                <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full bg-rose-100 text-rose-700">{g.percent}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* AI narrative — admin only, the one part of this that costs anything */}
      {isAdmin && (
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
      )}
    </div>
  );
}
