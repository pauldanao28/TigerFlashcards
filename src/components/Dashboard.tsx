"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Loader2, RotateCcw } from "lucide-react";
import { getLevel, jlptLevel, bootstrapVocabScore, bootstrapReadingScore, grammarPatternScore } from "@/lib/scoring";

interface ProfileScores {
  name: string | null;
  streak: number;
  vocab_score: number | null;
  reading_score: number | null;
  listening_score: number | null;
  grammar_score: number | null;
}

type ScoreKey = "vocab_score" | "reading_score" | "listening_score" | "grammar_score";

function ScoreTile({
  href,
  emoji,
  label,
  score,
  sub,
  scoreKey,
  userId,
  onReset,
}: {
  href: string;
  emoji: string;
  label: string;
  score: number | null;
  sub?: string;
  scoreKey: ScoreKey;
  userId: string | null;
  onReset: (key: ScoreKey) => void;
}) {
  const s = score ?? 0;
  const level = getLevel(s);
  return (
    <div className="relative">
      <Link href={href} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-2xl">{emoji}</span>
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${level.bg} ${level.color}`}>
            {level.nameJp}
          </span>
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div>
          <div className="flex items-end justify-between mb-1">
            <span className={`text-2xl font-black ${level.color}`}>{Math.round(s)}</span>
            <span className="text-[10px] text-slate-300 font-bold">/100</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                s >= 80 ? "bg-red-400" : s >= 60 ? "bg-orange-400" : s >= 40 ? "bg-amber-400" : s >= 20 ? "bg-emerald-400" : "bg-indigo-400"
              }`}
              style={{ width: `${s}%` }}
            />
          </div>
        </div>
        {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
      </Link>
      {userId && score !== null && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onReset(scoreKey); }}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-slate-100 transition-colors opacity-30 hover:opacity-80"
          title={`Reset ${label} score`}
        >
          <RotateCcw size={10} className="text-slate-500" />
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileScores | null>(null);

  const load = async () => {
    if (!user) return;
    const [profileRes, scoresRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, streak_count, vocab_score, reading_score, listening_score, grammar_score")
        .eq("id", user.id)
        .single(),
      supabase.from("user_scores").select("scores_json").eq("user_id", user.id),
    ]);

    const p = profileRes.data;
    let vocabScore = p?.vocab_score ?? null;
    let readingScore = p?.reading_score ?? null;
    let grammarScore = p?.grammar_score ?? null;

    const updates: Record<string, number> = {};

    if (vocabScore == null || readingScore == null) {
      const rows = (scoresRes.data ?? []) as { scores_json: any }[];
      if (vocabScore == null) {
        vocabScore = bootstrapVocabScore(rows);
        updates.vocab_score = vocabScore;
      }
      if (readingScore == null) {
        readingScore = bootstrapReadingScore(rows);
        updates.reading_score = readingScore;
      }
    }

    // Recalculate grammar_score from pattern mastery whenever it's stale (0 or null)
    // so the dashboard reflects existing quiz records without requiring another quiz.
    if (!grammarScore) {
      const [{ data: allPatterns }, { data: allScores }] = await Promise.all([
        supabase.from("grammar_patterns").select("id, jlpt_level"),
        supabase.from("user_grammar_scores").select("pattern_id, total, percent").eq("user_id", user.id),
      ]);
      if (allScores && allScores.length > 0) {
        const scoreMap = new Map(allScores.map(s => [s.pattern_id, { total: s.total, percent: s.percent }]));
        grammarScore = grammarPatternScore(allPatterns ?? [], scoreMap);
        updates.grammar_score = grammarScore;
      }
    }

    if (Object.keys(updates).length > 0) {
      supabase.from("profiles").update(updates).eq("id", user.id);
    }

    setData({
      name: p?.full_name ?? null,
      streak: p?.streak_count ?? 0,
      vocab_score: vocabScore,
      reading_score: readingScore,
      listening_score: p?.listening_score ?? null,
      grammar_score: grammarScore,
    });
  };

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleReset = async (key: ScoreKey) => {
    if (!user) return;
    await supabase.from("profiles").update({ [key]: null }).eq("id", user.id);
    setData(prev => prev ? { ...prev, [key]: null } : prev);
    // Re-run load to re-bootstrap if needed
    load();
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  const { name, streak } = data;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  // Overall level: average of available scores
  const availableScores = [data.vocab_score, data.reading_score, data.listening_score, data.grammar_score].filter((s): s is number => s !== null);
  const overallScore = availableScores.length > 0 ? availableScores.reduce((a, b) => a + b, 0) / availableScores.length : 0;
  const overallLevel = jlptLevel(overallScore);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{greeting}</p>
        <div className="flex items-center justify-between mt-0.5">
          <h1 className="text-2xl font-black text-slate-900 italic leading-tight">
            {name || "Learner"} 👋
          </h1>
          <span className="text-[11px] font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
            {overallLevel}
          </span>
        </div>
        {streak > 0 && (
          <span className="mt-2 inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
            <span>🔥</span>
            <span className="text-[10px] font-black text-orange-600">{streak} day streak</span>
          </span>
        )}
      </div>

      {/* Section label */}
      <p className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Your Skills
      </p>

      {/* 2×2 skill tiles */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <ScoreTile href="/study"   emoji="🃏" label="Vocabulary" score={data.vocab_score}     scoreKey="vocab_score"    userId={user?.id ?? null} onReset={handleReset} />
        <ScoreTile href="/sensei"  emoji="📝" label="Grammar"    score={data.grammar_score}   scoreKey="grammar_score"  userId={user?.id ?? null} onReset={handleReset} />
        <ScoreTile href="/quizzes" emoji="📖" label="Reading"    score={data.reading_score}   scoreKey="reading_score"  userId={user?.id ?? null} onReset={handleReset} sub="Sentence quiz" />
        <ScoreTile href="/quizzes" emoji="🎧" label="Listening"  score={data.listening_score} scoreKey="listening_score" userId={user?.id ?? null} onReset={handleReset} sub="Listening quiz" />
      </div>

      <p className="px-5 pt-3 text-[9px] text-slate-300 font-bold text-center">Tap ↺ on a tile to reset that score</p>
    </div>
  );
}
