"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { getLevel, jlptLevel, bootstrapVocabScore } from "@/lib/scoring";

interface ProfileScores {
  name: string | null;
  streak: number;
  vocab_score: number | null;
  reading_score: number | null;
  listening_score: number | null;
  grammar_score: number | null;
}

function ScoreTile({
  href,
  emoji,
  label,
  score,
  sub,
}: {
  href: string;
  emoji: string;
  label: string;
  score: number | null;
  sub?: string;
}) {
  const s = score ?? 0;
  const level = getLevel(s);
  return (
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
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileScores | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
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

      // Only bootstrap vocab_score — reading/listening/grammar start at 0 and
      // are earned through quiz sessions, not inferred from card accuracy.
      if (vocabScore == null) {
        const rows = (scoresRes.data ?? []) as { scores_json: any }[];
        vocabScore = bootstrapVocabScore(rows);
        supabase.from("profiles").update({ vocab_score: vocabScore }).eq("id", user.id);
      }

      setData({
        name: p?.full_name ?? null,
        streak: p?.streak_count ?? 0,
        vocab_score: vocabScore,
        reading_score: p?.reading_score ?? null,
        listening_score: p?.listening_score ?? null,
        grammar_score: p?.grammar_score ?? null,
      });
    };
    load();
  }, [user]);

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

  // Overall level: only count scores that have been earned (non-null)
  const availableScores = [data.vocab_score, data.reading_score, data.listening_score, data.grammar_score].filter((s): s is number => s !== null);
  const overallScore = availableScores.length > 0 ? availableScores.reduce((a, b) => a + b, 0) / availableScores.length : 0;
  const overallLevel = jlptLevel(overallScore);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{greeting}</p>
        <h1 className="text-2xl font-black text-slate-900 italic mt-0.5 leading-tight">
          {name || "Learner"} 👋
        </h1>
        {streak > 0 && (
          <span className="mt-2 inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
            <span>🔥</span>
            <span className="text-[10px] font-black text-orange-600">{streak} day streak</span>
          </span>
        )}

        {/* Overall level banner */}
        <div className="mt-4 bg-indigo-600 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Overall Level</p>
            <p className="text-4xl font-black text-white mt-0.5">{overallLevel}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Avg Score</p>
            <p className="text-3xl font-black text-white mt-0.5">{Math.round(overallScore)}</p>
          </div>
        </div>
      </div>

      {/* Section label */}
      <p className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Your Skills
      </p>

      {/* 2×2 skill tiles */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <ScoreTile href="/study"   emoji="🃏" label="Vocabulary" score={data.vocab_score}     />
        <ScoreTile href="/sensei"  emoji="📝" label="Grammar"    score={data.grammar_score}   />
        <ScoreTile href="/quizzes" emoji="📖" label="Reading"    score={data.reading_score}   sub="Sentence quiz" />
        <ScoreTile href="/quizzes" emoji="🎧" label="Listening"  score={data.listening_score} sub="Listening quiz" />
      </div>
    </div>
  );
}
