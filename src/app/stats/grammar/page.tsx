"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import { Volume2 } from "lucide-react";
import { speak } from "@/lib/tts";

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof JLPT_LEVELS)[number];

const LEVEL_META: Record<Level, { color: string; badgeColor: string }> = {
  N5: { color: "text-emerald-600", badgeColor: "bg-emerald-100 text-emerald-700" },
  N4: { color: "text-sky-600", badgeColor: "bg-sky-100 text-sky-700" },
  N3: { color: "text-amber-600", badgeColor: "bg-amber-100 text-amber-700" },
  N2: { color: "text-orange-600", badgeColor: "bg-orange-100 text-orange-700" },
  N1: { color: "text-rose-600", badgeColor: "bg-rose-100 text-rose-700" },
};

const MASTERY_MIN_ATTEMPTS = 3;
const MASTERY_MIN_PERCENT = 80;

interface GrammarPattern {
  id: string;
  pattern: string;
  meaning: string;
  jlpt_level: string;
  example_jp: string | null;
}

interface PatternScore {
  pattern_id: string;
  pass: number;
  fail: number;
  total: number;
  percent: number;
}

export default function GrammarPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [patterns, setPatterns] = useState<GrammarPattern[]>([]);
  const [scores, setScores] = useState<Record<string, PatternScore>>({});
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState<Level | "all">("all");

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setSignedIn(true);

      const [{ data: pData }, { data: sData }] = await Promise.all([
        supabase
          .from("grammar_patterns")
          .select("id, pattern, meaning, jlpt_level, example_jp")
          .order("jlpt_level")
          .order("pattern"),
        supabase.from("user_grammar_scores").select("pattern_id, pass, fail, total, percent").eq("user_id", user.id),
      ]);

      setPatterns(pData ?? []);
      const scoreMap: Record<string, PatternScore> = {};
      for (const row of sData ?? []) scoreMap[row.pattern_id] = row;
      setScores(scoreMap);
      setLoading(false);
    })();
  }, []);

  const isMastered = (p: GrammarPattern) => {
    const s = scores[p.id];
    return !!s && s.total >= MASTERY_MIN_ATTEMPTS && s.percent >= MASTERY_MIN_PERCENT;
  };

  // Only patterns you've actually attempted at least once — this page is "your
  // grammar progress," not the full catalog (untouched patterns would just be noise).
  const touchedPatterns = useMemo(
    () => patterns.filter((p) => !!scores[p.id] && scores[p.id].total > 0),
    [patterns, scores],
  );

  const masteredCount = useMemo(
    () => touchedPatterns.filter((p) => {
      const s = scores[p.id];
      return !!s && s.total >= MASTERY_MIN_ATTEMPTS && s.percent >= MASTERY_MIN_PERCENT;
    }).length,
    [touchedPatterns, scores],
  );

  const visiblePatterns = levelFilter === "all" ? touchedPatterns : touchedPatterns.filter((p) => p.jlpt_level === levelFilter);

  if (loading) return <LoadingScreen />;

  if (!signedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 font-bold mb-4">Sign in to see your grammar progress.</p>
          <Link href="/" className="text-indigo-600 font-black text-sm">← Back home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
            📝 Grammar <span className="text-slate-300 text-lg md:text-xl">· {masteredCount}/{touchedPatterns.length}</span>
          </h1>
          <Link
            href="/stats"
            className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
          >
            ← Back
          </Link>
        </div>

        {/* Level filter */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-6">
          <button
            onClick={() => setLevelFilter("all")}
            className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              levelFilter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-100"
            }`}
          >
            All
          </button>
          {JLPT_LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => setLevelFilter(lvl)}
              className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                levelFilter === lvl ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-100"
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          {visiblePatterns.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-10">
              {touchedPatterns.length === 0
                ? "No grammar patterns practiced yet — try the Grammar quiz to get started."
                : "No patterns practiced at this level yet."}
            </p>
          ) : (
            visiblePatterns.map((p) => {
              const meta = LEVEL_META[p.jlpt_level as Level] ?? LEVEL_META.N5;
              const mastered = isMastered(p);
              return (
                <div key={p.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-black uppercase tracking-widest ${meta.color}`}>
                      {p.jlpt_level}
                    </span>
                    <span className="font-black text-slate-900 text-base">{p.pattern}</span>
                    {mastered && (
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.badgeColor}`}>
                        Mastered
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{p.meaning}</p>
                  {p.example_jp && (
                    <div className="flex items-center gap-2 mt-2">
                      <p className="text-sm text-slate-700 font-medium">{p.example_jp}</p>
                      <button
                        onClick={() => speak(p.example_jp!)}
                        className="shrink-0 text-slate-300 hover:text-indigo-500 active:scale-90 transition-all"
                      >
                        <Volume2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}
