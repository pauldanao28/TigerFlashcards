"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import LoadingScreen from "@/components/LoadingScreen";
import SentenceQuiz from "@/components/SentenceQuiz";
import ListeningQuiz from "@/components/ListeningQuiz";
import GrammarQuiz from "@/components/GrammarQuiz";
import ReaderView from "@/components/ReaderView";
import WatchView from "@/components/WatchView";
import TranslateView from "@/components/TranslateView";
import WeakWordsQuiz from "@/components/WeakWordsQuiz";

function QuizzesInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Initialized from the URL synchronously (not in the effect below) so the overlay
  // is already open on the very first render that shows anything — otherwise the
  // bare Practice page painted for one frame before the effect ran, which is what
  // made tapping Reader/Watch/etc. from Quick Actions look like it detoured through
  // Practice before landing where it was actually headed.
  const open = searchParams.get("open");
  const [showSentence, setShowSentence] = useState(open === "sentence");
  const [showListening, setShowListening] = useState(open === "listening");
  const [showGrammar, setShowGrammar] = useState(open === "grammar");
  const [showReader, setShowReader] = useState(open === "reader");
  const [showWatch, setShowWatch] = useState(open === "watch");
  const [showTranslate, setShowTranslate] = useState(open === "translate");
  const [showWeakWords, setShowWeakWords] = useState(open === "weak_words");

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
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 md:pt-8 pb-5">
        <h1 className="text-2xl font-black text-slate-900 italic">Practice</h1>
      </div>

      <div className="max-w-2xl mx-auto">
      {/* Quiz cards */}
      <div className="px-4 pt-2 flex flex-col gap-3">
        {/* Reader */}
        <button
          onClick={() => setShowReader(true)}
          className="bg-white rounded-2xl p-5 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all text-left w-full relative overflow-hidden"
        >
          <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            New
          </span>
          <div className="flex items-center gap-4">
            <span className="text-3xl">📚</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Reader</p>
              <p className="text-xs text-slate-400 mt-0.5">Paste any text (or let AI write one) — tap words to add them, ask about grammar</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

        {/* Watch */}
        <button
          onClick={() => setShowWatch(true)}
          className="bg-white rounded-2xl p-5 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all text-left w-full relative overflow-hidden"
        >
          <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            New
          </span>
          <div className="flex items-center gap-4">
            <span className="text-3xl">📺</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Watch</p>
              <p className="text-xs text-slate-400 mt-0.5">YouTube with Japanese captions beside it — tap words, find the ones you don&apos;t have</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

        {/* Translate — desktop only; mobile already has this via Quick Actions
            (BottomNav is md:hidden, so these two have no other entry point there) */}
        <button
          onClick={() => setShowTranslate(true)}
          className="hidden md:block bg-white rounded-2xl p-5 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all text-left w-full relative overflow-hidden"
        >
          <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            New
          </span>
          <div className="flex items-center gap-4">
            <span className="text-3xl">🔄</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Translate</p>
              <p className="text-xs text-slate-400 mt-0.5">Type or speak any language — get casual &amp; polite Japanese, explained</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

        {/* Weak Words Quiz — desktop only, same reason as Translate above. The quiz
            itself disables its own Start button when there's nothing to review,
            rather than this card blocking the open. */}
        <button
          onClick={() => setShowWeakWords(true)}
          className="hidden md:block bg-white rounded-2xl p-5 border-2 border-indigo-100 shadow-sm active:scale-95 transition-all text-left w-full relative overflow-hidden"
        >
          <span className="absolute top-3 right-3 text-[8px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
            New
          </span>
          <div className="flex items-center gap-4">
            <span className="text-3xl">😓</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Weak Words Quiz</p>
              <p className="text-xs text-slate-400 mt-0.5">Cards you&apos;re struggling with today — reviewed in a sentence, with a kanji clue if you need it</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </div>
        </button>

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

      {/* Learn section */}
      <div className="px-4 pt-6 pb-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Learn First</p>
        <div className="flex flex-col gap-3">
          <Link
            href="/study/kana"
            className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all text-left w-full flex items-center gap-4"
          >
            <span className="text-3xl">あ</span>
            <div className="flex-1">
              <p className="font-black text-slate-900">Learn Kana</p>
              <p className="text-xs text-slate-400 mt-0.5">Hiragana &amp; Katakana flashcards</p>
            </div>
            <span className="text-slate-300 text-lg">›</span>
          </Link>
          {(["N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => {
            const colors: Record<string, string> = { N5: "text-emerald-600", N4: "text-sky-600", N3: "text-amber-600", N2: "text-orange-600", N1: "text-rose-600" };
            const descs: Record<string, string> = { N5: "Basic verb forms, particles, present/past tense", N4: "て-form chains, たい, polite/plain switching", N3: "Conditionals, て-verb compounds, plain embedding", N2: "Passive, causative, potential, keigo basics", N1: "Keigo, classical patterns, complex compound sentences" };
            return (
              <Link
                key={lvl}
                href={`/learn/${lvl.toLowerCase()}`}
                className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm active:scale-95 transition-all text-left w-full flex items-center gap-4"
              >
                <span className={`text-xl font-black w-8 text-center ${colors[lvl]}`}>{lvl}</span>
                <div className="flex-1">
                  <p className="font-black text-slate-900">Grammar {lvl}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{descs[lvl]}</p>
                </div>
                <span className="text-slate-300 text-lg">›</span>
              </Link>
            );
          })}
        </div>
      </div>

      </div>

      {/* Overlays */}
      {showSentence && (
        <SentenceQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowSentence(false)} />
      )}
      {showListening && (
        <ListeningQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowListening(false)} />
      )}
      {showGrammar && (
        <GrammarQuiz userId={userId} onClose={() => setShowGrammar(false)} />
      )}
      {showReader && (
        <ReaderView userId={userId} onClose={() => setShowReader(false)} />
      )}
      {showWatch && (
        <WatchView userId={userId} onClose={() => setShowWatch(false)} />
      )}
      {showTranslate && (
        <TranslateView userId={userId} onClose={() => setShowTranslate(false)} />
      )}
      {showWeakWords && (
        <WeakWordsQuiz userId={userId} isAdmin={isAdmin} onClose={() => setShowWeakWords(false)} />
      )}
    </div>
  );
}

export default function QuizzesPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <QuizzesInner />
    </Suspense>
  );
}
