"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface DashStats {
  name: string | null;
  streak: number;
  masteredCount: number;
  grammarLevel: string | null;
}

function vocabInfo(count: number): { level: string; color: string; nextAt: number } {
  if (count >= 1000) return { level: "N1", color: "text-red-600",     nextAt: Infinity };
  if (count >= 500)  return { level: "N2", color: "text-orange-600",  nextAt: 1000 };
  if (count >= 200)  return { level: "N3", color: "text-amber-600",   nextAt: 500 };
  if (count >= 50)   return { level: "N4", color: "text-emerald-600", nextAt: 200 };
  return              { level: "N5", color: "text-indigo-600",  nextAt: 50 };
}

function isMastered(scoresJson: Record<string, any>): boolean {
  const s = scoresJson || {};
  const total = (s.jp_to_en?.total || 0) + (s.en_to_jp?.total || 0);
  const avg = ((s.jp_to_en?.percent || 0) + (s.en_to_jp?.percent || 0)) / 2;
  return total > 0 && avg >= 80;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashStats | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("profiles").select("full_name, streak_count").eq("id", user.id).single(),
      supabase.from("user_scores").select("scores_json").eq("user_id", user.id),
      supabase.from("sensei_profile").select("level").eq("user_id", user.id).maybeSingle(),
    ]).then(([profileRes, scoresRes, senseiRes]) => {
      const masteredCount = (scoresRes.data ?? []).filter((r: any) => isMastered(r.scores_json)).length;
      setStats({
        name: profileRes.data?.full_name ?? null,
        streak: profileRes.data?.streak_count ?? 0,
        masteredCount,
        grammarLevel: senseiRes.data?.level ?? null,
      });
    });
  }, [user]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  const { name, streak, masteredCount, grammarLevel } = stats;
  const vocab = vocabInfo(masteredCount);
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-5">
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
      </div>

      {/* Section label */}
      <p className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Your Skills
      </p>

      {/* 2×2 skill tiles */}
      <div className="px-4 grid grid-cols-2 gap-3">
        {/* Vocabulary */}
        <Link
          href="/study"
          className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all"
        >
          <span className="text-2xl">🃏</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Vocabulary</p>
          <p className={`text-2xl font-black ${vocab.color} mt-0.5`}>{vocab.level}</p>
          <p className="text-[10px] text-slate-400 mt-1">{masteredCount} mastered</p>
        </Link>

        {/* Grammar */}
        <Link
          href="/sensei"
          className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all"
        >
          <span className="text-2xl">📝</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Grammar</p>
          <p className="text-2xl font-black text-violet-600 mt-0.5">
            {grammarLevel || "—"}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">Chat with Sensei</p>
        </Link>

        {/* Reading */}
        <Link
          href="/quizzes"
          className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all"
        >
          <span className="text-2xl">📖</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Reading</p>
          <p className="text-2xl font-black text-emerald-600 mt-0.5">Quiz</p>
          <p className="text-[10px] text-slate-400 mt-1">Sentence reading</p>
        </Link>

        {/* Listening */}
        <Link
          href="/quizzes"
          className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all"
        >
          <span className="text-2xl">🎧</span>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-2">Listening</p>
          <p className="text-2xl font-black text-sky-600 mt-0.5">Quiz</p>
          <p className="text-[10px] text-slate-400 mt-1">Hear & recognize</p>
        </Link>
      </div>
    </div>
  );
}
