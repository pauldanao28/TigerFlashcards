"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Volume2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import { speak } from "@/lib/tts";

const JLPT_LEVELS = ["n5", "n4", "n3", "n2", "n1"] as const;
type LevelSlug = (typeof JLPT_LEVELS)[number];

const LEVEL_META: Record<LevelSlug, { label: string; color: string; badgeColor: string; barColor: string }> = {
  n5: { label: "N5", color: "text-emerald-600", badgeColor: "bg-emerald-100 text-emerald-700", barColor: "bg-emerald-500" },
  n4: { label: "N4", color: "text-teal-600",   badgeColor: "bg-teal-100 text-teal-700",     barColor: "bg-teal-500"    },
  n3: { label: "N3", color: "text-amber-600",   badgeColor: "bg-amber-100 text-amber-700",   barColor: "bg-amber-500"   },
  n2: { label: "N2", color: "text-orange-600",  badgeColor: "bg-orange-100 text-orange-700", barColor: "bg-orange-500"  },
  n1: { label: "N1", color: "text-rose-600",    badgeColor: "bg-rose-100 text-rose-700",     barColor: "bg-rose-500"    },
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

export default function LearnLevelPage() {
  const params = useParams();
  const router = useRouter();
  const slug = (params?.level as string)?.toLowerCase() as LevelSlug;

  const [userId, setUserId] = useState<string | null>(null);
  const [patterns, setPatterns] = useState<GrammarPattern[]>([]);
  const [scores, setScores] = useState<Record<string, PatternScore>>({});
  const [loading, setLoading] = useState(true);

  const isValidSlug = JLPT_LEVELS.includes(slug);
  const meta = isValidSlug ? LEVEL_META[slug] : null;
  const jlptLevel = meta?.label;

  useEffect(() => {
    if (!isValidSlug || !jlptLevel) { router.replace("/quizzes"); return; }
    (async () => {
      // Public page: patterns load for everyone. Scores (and the mastery bar/badges
      // they drive) only load when there's a session — no login wall to browse.
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      setUserId(uid);

      const [{ data: pData }, { data: sData }] = await Promise.all([
        supabase
          .from("grammar_patterns")
          .select("id, pattern, meaning, jlpt_level, example_jp")
          .eq("jlpt_level", jlptLevel)
          .order("pattern"),
        uid
          ? supabase.from("user_grammar_scores").select("pattern_id, pass, fail, total, percent").eq("user_id", uid)
          : Promise.resolve({ data: [] as PatternScore[] }),
      ]);

      setPatterns(pData ?? []);
      const scoreMap: Record<string, PatternScore> = {};
      for (const row of sData ?? []) scoreMap[row.pattern_id] = row;
      setScores(scoreMap);
      setLoading(false);
    })();
  }, [isValidSlug, slug, jlptLevel, router]);

  if (!isValidSlug || !meta || loading) return <LoadingScreen />;

  const mastered = patterns.filter((p) => {
    const s = scores[p.id];
    return s && s.total >= MASTERY_MIN_ATTEMPTS && s.percent >= MASTERY_MIN_PERCENT;
  }).length;

  const masteryPct = patterns.length > 0 ? Math.round((mastered / patterns.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-5">
        <Link
          href="/quizzes"
          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all w-fit mb-3"
        >
          <ChevronLeft size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className={`text-xl font-black ${meta.color}`}>{jlptLevel}</span>
          <div>
            <h1 className="text-2xl font-black text-slate-900 italic">Grammar Patterns</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Learn First</p>
          </div>
        </div>

        {/* Mastery bar — logged-in users only */}
        {userId && patterns.length > 0 && (
          <div className="mt-4">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
              <span>Mastered</span>
              <span>{mastered} / {patterns.length} · {masteryPct}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${meta.barColor} transition-all duration-500`}
                style={{ width: `${masteryPct}%` }}
              />
            </div>
          </div>
        )}
        {!userId && patterns.length > 0 && (
          <Link
            href="/login"
            className="mt-4 flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 hover:border-indigo-200 transition-colors"
          >
            <span className="text-xs font-bold text-slate-500">Sign in to track your mastery on each pattern</span>
            <span className="text-indigo-600 text-xs font-black shrink-0 ml-2">Start Free →</span>
          </Link>
        )}
      </div>

      {/* Pattern list */}
      <div className="px-4 pt-4 flex flex-col gap-2">
        {patterns.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-10">No patterns found for {jlptLevel}.</p>
        ) : (
          patterns.map((p) => {
            const s = scores[p.id];
            const mastered = s && s.total >= MASTERY_MIN_ATTEMPTS && s.percent >= MASTERY_MIN_PERCENT;

            return (
              <div
                key={p.id}
                className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm"
              >
                <div className="flex items-center gap-2 flex-wrap">
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
  );
}
