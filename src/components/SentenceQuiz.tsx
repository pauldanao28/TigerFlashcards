"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface QuizCard {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  scores: {
    jp_to_en: { pass: number; fail: number; total: number; percent: number };
    en_to_jp: { pass: number; fail: number; total: number; percent: number };
  };
  sentence_jp: string;
  sentence_en: string;
}

interface SentenceQuizProps {
  userId: string;
  onClose: () => void;
}

function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
  if (sentence.includes("【")) {
    const parts = sentence.split(/【(.*?)】/);
    return (
      <>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <mark key={i} className="bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-sm px-0.5 not-italic font-black">
              {part}
            </mark>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }
  // Fallback: highlight dictionary form
  const idx = sentence.indexOf(word);
  if (idx >= 0) {
    return (
      <>
        <span>{sentence.slice(0, idx)}</span>
        <mark className="bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-sm px-0.5 not-italic font-black">
          {word}
        </mark>
        <span>{sentence.slice(idx + word.length)}</span>
      </>
    );
  }
  return <span>{sentence}</span>;
}

export default function SentenceQuiz({ userId, onClose }: SentenceQuizProps) {
  const [phase, setPhase] = useState<"loading" | "quiz" | "done">("loading");
  const [quizCards, setQuizCards] = useState<QuizCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState<{ card: QuizCard; passed: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scoringRef = useRef(false);

  const load = useCallback(async () => {
    setPhase("loading");
    setCurrentIdx(0);
    setResults([]);
    setRevealed(false);
    setError(null);

    try {
      const { data, error: dbErr } = await supabase
        .from("user_scores")
        .select("scores_json, master_cards!card_id(id, japanese, reading, english)")
        .eq("user_id", userId)
        .limit(500);

      if (dbErr || !data) throw new Error("Could not load your cards");

      const scored = data
        .map((row: any) => {
          const card = row.master_cards;
          if (!card) return null;
          const s = row.scores_json || {};
          const jpPct = s.jp_to_en?.percent ?? 0;
          const enPct = s.en_to_jp?.percent ?? 0;
          return { ...card, scores: s, combined: (jpPct + enPct) / 2 };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.combined - b.combined)
        .slice(0, 100);

      if (scored.length === 0) throw new Error("Add some cards to your deck first");

      const pick = [...scored].sort(() => Math.random() - 0.5).slice(0, Math.min(20, scored.length));

      const res = await fetch("/api/quiz/sentences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: pick.map((c: any) => ({ japanese: c.japanese, reading: c.reading, english: c.english })),
        }),
      });

      if (!res.ok) throw new Error("Failed to generate sentences");
      const { sentences } = await res.json();

      // Look up by word field so AI reordering or skipped items don't misalign sentences
      const sentenceMap = new Map<string, { sentence_jp: string; sentence_en: string }>(
        (sentences ?? []).map((s: any) => [s.word, s])
      );

      const merged: QuizCard[] = pick.map((card: any) => ({
        id: card.id,
        japanese: card.japanese,
        reading: card.reading,
        english: card.english,
        scores: card.scores,
        sentence_jp: sentenceMap.get(card.japanese)?.sentence_jp ?? `【${card.japanese}】`,
        sentence_en: sentenceMap.get(card.japanese)?.sentence_en ?? card.english,
      }));

      setQuizCards(merged);
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleScore = async (passed: boolean) => {
    if (scoringRef.current) return;
    scoringRef.current = true;

    const card = quizCards[currentIdx];
    const old = card.scores?.jp_to_en || { pass: 0, fail: 0, total: 0, percent: 0 };
    const newPass = passed ? old.pass + 1 : old.pass;
    const newFail = !passed ? old.fail + 1 : old.fail;
    const newTotal = old.total + 1;

    await supabase.from("user_scores").upsert({
      user_id: userId,
      card_id: card.id,
      scores_json: {
        ...card.scores,
        jp_to_en: { pass: newPass, fail: newFail, total: newTotal, percent: Math.round((newPass / newTotal) * 100) },
      },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,card_id" });

    const newResults = [...results, { card, passed }];
    setResults(newResults);

    if (currentIdx + 1 >= quizCards.length) {
      setPhase("done");
    } else {
      setCurrentIdx(i => i + 1);
      setRevealed(false);
      scoringRef.current = false;
    }
  };

  const passedCount = results.filter(r => r.passed).length;
  const currentCard = quizCards[currentIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[300] bg-slate-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-base">📝</span>
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Sentence Quiz</span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Loading */}
      {phase === "loading" && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Generating quiz…</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="text-5xl">😓</span>
          <p className="text-slate-600 font-bold text-sm">{error}</p>
          <button onClick={onClose} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
            Close
          </button>
        </div>
      )}

      {/* Quiz */}
      {phase === "quiz" && currentCard && (
        <div className="flex-1 flex flex-col px-5 py-5 max-w-lg mx-auto w-full min-h-0">
          {/* Progress bar */}
          <div className="mb-5 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{currentIdx + 1} / {quizCards.length}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{passedCount} passed</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500 rounded-full"
                animate={{ width: `${(currentIdx / quizCards.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex flex-col gap-3 min-h-0"
            >
              {/* Sentence card */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Read the sentence</p>
                <p className="text-xl leading-relaxed text-slate-800 font-medium">
                  <HighlightedSentence sentence={currentCard.sentence_jp} word={currentCard.japanese} />
                </p>
              </div>

              {/* Word card */}
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-black text-slate-900">{currentCard.japanese}</span>
                  <span className="text-sm text-slate-400 font-medium">{currentCard.reading}</span>
                </div>
                <AnimatePresence>
                  {revealed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <p className="text-indigo-600 font-bold text-base mt-2">{currentCard.english}</p>
                      <p className="text-slate-400 text-xs mt-1 italic">{currentCard.sentence_en}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-auto shrink-0 pb-safe">
                {!revealed ? (
                  <button
                    onClick={() => setRevealed(true)}
                    className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm"
                  >
                    Reveal Answer
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleScore(false)}
                      className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
                    >
                      ✕ Fail
                    </button>
                    <button
                      onClick={() => handleScore(true)}
                      className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
                    >
                      ✓ Pass
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="text-center mb-8"
          >
            <div className="text-6xl mb-4">
              {passedCount >= 16 ? "🏆" : passedCount >= 10 ? "💪" : "📚"}
            </div>
            <h2 className="text-4xl font-black text-slate-900 mb-1">{passedCount}<span className="text-slate-300 font-bold text-2xl"> / {results.length}</span></h2>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-1">
              {results.length > 0 ? Math.round((passedCount / results.length) * 100) : 0}% correct · scores updated
            </p>
          </motion.div>

          {results.filter(r => !r.passed).length > 0 && (
            <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 mb-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-3">Review these</p>
              <div className="flex flex-wrap gap-2">
                {results.filter(r => !r.passed).map((r, i) => (
                  <div key={i} className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                    <span className="text-sm font-black text-rose-700">{r.card.japanese}</span>
                    <span className="text-[10px] text-rose-400">{r.card.english}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
            >
              Done
            </button>
            <button
              onClick={load}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm"
            >
              Play Again
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
