"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import SentenceQuiz from "@/components/SentenceQuiz";
import ListeningQuiz from "@/components/ListeningQuiz";

export default function QuizzesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showSentence, setShowSentence] = useState(false);
  const [showListening, setShowListening] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/login"); return; }
      const uid = session.user.id;
      setUserId(uid);
      const { data } = await supabase.from("profiles").select("is_admin").eq("id", uid).single();
      setIsAdmin(!!data?.is_admin);
    });
  }, [router]);

  if (!userId) return <LoadingScreen />;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 pb-5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Practice</p>
        <h1 className="text-2xl font-black text-slate-900 italic mt-0.5">Quizzes</h1>
      </div>

      {/* Quiz cards */}
      <div className="px-4 pt-4 flex flex-col gap-3">
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

        {/* Grammar Quiz → Sensei */}
        <Link
          href="/sensei"
          className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all block"
        >
          <div className="flex items-center gap-4">
            <span className="text-3xl">📝</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Grammar Quiz</p>
              <p className="text-xs text-slate-400 mt-0.5">AI grammar practice with your Sensei</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </Link>
      </div>

      {/* Overlays */}
      {showSentence && (
        <SentenceQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowSentence(false)} />
      )}
      {showListening && (
        <ListeningQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowListening(false)} />
      )}
    </div>
  );
}
