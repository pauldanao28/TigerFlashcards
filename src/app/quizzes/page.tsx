"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import SentenceQuiz from "@/components/SentenceQuiz";
import ListeningQuiz from "@/components/ListeningQuiz";
import GrammarQuiz from "@/components/GrammarQuiz";

export default function QuizzesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const [showListening, setShowListening] = useState(false);
  const [showGrammar, setShowGrammar] = useState(false);
  const [focusWeak, setFocusWeak] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const uid = session.user.id;
      setUserId(uid);
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
      setIsAdmin(!!data?.is_admin);
      const open = searchParams.get("open");
      if (open === "sentence") setShowSentence(true);
      else if (open === "listening") setShowListening(true);
      else if (open === "grammar") setShowGrammar(true);
    });
  }, [router, searchParams]);

  if (!userId) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Practice</p>
        <h1 className="text-2xl font-black text-slate-900 italic mt-0.5">Quizzes</h1>
      </div>

      {/* Focus toggle */}
      <div className="px-5 pt-4 pb-1 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Card selection</p>
        <button
          onClick={() => setFocusWeak(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
            focusWeak
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-slate-100 border-slate-200 text-slate-500"
          }`}
        >
          {focusWeak ? "🎯 Weak cards" : "🎲 Random"}
        </button>
      </div>

      {/* Quiz cards */}
      <div className="px-4 pt-2 flex flex-col gap-3">
        {/* Reading / Sentence Quiz */}
        <button
          onClick={() => setShowSentence(true)}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all text-left w-full"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">📖</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Reading Quiz</p>
              <p className="text-xs text-slate-400 mt-0.5">Sentence comprehension from your deck</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

        {/* Listening Quiz */}
        <button
          onClick={() => setShowListening(true)}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all text-left w-full"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">🎧</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Listening Quiz</p>
              <p className="text-xs text-slate-400 mt-0.5">Hear Japanese, guess the meaning</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

        {/* Grammar Quiz */}
        <button
          onClick={() => setShowGrammar(true)}
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all text-left w-full"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">📝</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Grammar Quiz</p>
              <p className="text-xs text-slate-400 mt-0.5">AI grammar practice based on your level</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>
      </div>

      {/* Overlays */}
      {showSentence && (
        <SentenceQuiz userId={userId} isAdmin={isAdmin} focusWeak={focusWeak} onClose={() => setShowSentence(false)} />
      )}
      {showListening && (
        <ListeningQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowListening(false)} />
      )}
      {showGrammar && (
        <GrammarQuiz userId={userId} onClose={() => setShowGrammar(false)} />
      )}
    </div>
  );
}
