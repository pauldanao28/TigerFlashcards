"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, X, Loader2, Lightbulb, List } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { getTodayUsage, AiUsageInfo } from "@/lib/aiUsage";
import { useAppAlert } from "@/context/AlertContext";
import { queuePendingWords } from "@/lib/pendingWords";
import TappableText, { kanjiRe, type WordTapHandler } from "@/components/TappableText";
import WordLookupSheet from "@/components/WordLookupSheet";
import { useWordLookup } from "@/hooks/useWordLookup";
import type { KanjiMnemonic } from "@/lib/types";

const POOL_SIZE = 10;
// Same threshold (and cleared_at exclusion) as Cards' "Struggling Today" and
// count_weak_words, so this pool and that badge always agree on the same number.
const DAILY_STRUGGLE_THRESHOLD = 3;

interface ScoreDir { pass: number; fail: number; total: number; percent: number }
interface DeckRow {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  mnemonic?: KanjiMnemonic | null;
  scores: { jp_to_en: ScoreDir; en_to_jp: ScoreDir };
  reflex_attempts: number;
}
interface QuizCard extends DeckRow {
  sentence_jp: string;
  sentence_en: string;
  choices: string[];
  answer: string;
  explanation: string;
}

// Same highlight-the-target-word rendering as the Reading Quiz — tappable, furigana
// withheld until answered so it doesn't give the word away before the choice is made.
function HighlightedWord({ word, reading, onWordTap }: { word: string; reading: string; onWordTap: WordTapHandler }) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  return (
    <mark
      className="bg-amber-200 text-amber-900 rounded-sm px-0.5 not-italic font-black cursor-pointer active:opacity-70 transition-opacity"
      onClick={(e) => { e.stopPropagation(); onWordTap(word, reading, e); }}
      onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start) return;
        const dx = Math.abs(e.changedTouches[0].clientX - start.x);
        const dy = Math.abs(e.changedTouches[0].clientY - start.y);
        if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, reading, e as unknown as React.MouseEvent); }
      }}
    >
      {word}
    </mark>
  );
}

function HighlightedSentence({ sentence, word, reading, onWordTap }: { sentence: string; word: string; reading: string; onWordTap: WordTapHandler }) {
  if (sentence.includes("【")) {
    const parts = sentence.split(/【(.*?)】/);
    return (
      <>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <HighlightedWord key={i} word={part} reading={reading} onWordTap={onWordTap} />
          ) : (
            <TappableText key={i} text={part} keyPrefix={`p${i}`} onWordTap={onWordTap} />
          )
        )}
      </>
    );
  }
  const idx = sentence.indexOf(word);
  if (idx >= 0) {
    return (
      <>
        <TappableText text={sentence.slice(0, idx)} keyPrefix="pre" onWordTap={onWordTap} />
        <HighlightedWord word={word} reading={reading} onWordTap={onWordTap} />
        <TappableText text={sentence.slice(idx + word.length)} keyPrefix="post" onWordTap={onWordTap} />
      </>
    );
  }
  return <TappableText text={sentence} keyPrefix="full" onWordTap={onWordTap} />;
}

/**
 * A special quiz round built entirely from cards you're actually struggling with
 * today — failed 3+ times today (daily_struggles) — rather than a random/weighted
 * deck pick. AI writes a sentence per word (same 【bracket】 convention as the Reading Quiz) plus
 * 4 answer choices; a correct pick still counts as a real review (updates
 * user_scores.jp_to_en), same as any other quiz. A "Clue" button reuses the existing
 * kanji mnemonic feature (confirm → /api/mnemonic → cached on the card).
 */
export default function WeakWordsQuiz({ userId, isAdmin = false, onClose }: { userId: string; isAdmin?: boolean; onClose: () => void }) {
  const { showAlert, showConfirm } = useAppAlert();
  const [phase, setPhase] = useState<"intro" | "loading" | "quiz" | "done" | "empty">("intro");
  const [starting, setStarting] = useState(false);
  const [quizCards, setQuizCards] = useState<QuizCard[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [results, setResults] = useState<{ card: QuizCard; passed: boolean; newPercent: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [backConfirm, setBackConfirm] = useState(false);
  const [usage, setUsage] = useState<AiUsageInfo | null>(null);

  const { lookup, openLookup, setEditWord, closeLookup } = useWordLookup(userId);
  const [queuedWords, setQueuedWords] = useState<Set<string>>(new Set());
  const queueWord = async (w: string) => {
    try {
      await queuePendingWords(userId, [w]);
      setQueuedWords((prev) => new Set(prev).add(w));
    } catch {
      showAlert("Couldn't queue that word — try again.");
    }
  };

  // ── Kanji mnemonic "Clue" — same generate/cache flow as Cards' Slow Reflex/Weak
  // Words rows and StudyView's own, just scoped to this quiz's local card list. ──
  const [mnemonicCard, setMnemonicCard] = useState<QuizCard | null>(null);
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const handleMnemonic = async (card: QuizCard) => {
    setMnemonicCard(card);
    if (card.mnemonic || mnemonicLoading) return;
    const confirmed = await showConfirm(
      `Generate a memory aid for ${card.japanese}? This uses one of your daily AI lookups.`,
      { title: "Remember this kanji?", confirmLabel: "Generate" },
    );
    if (!confirmed) { setMnemonicCard(null); return; }
    setMnemonicLoading(true);
    setMnemonicError(null);
    try {
      const res = await authedFetch("/api/mnemonic", {
        method: "POST",
        body: JSON.stringify({ japanese: card.japanese, reading: card.reading, english: card.english }),
      });
      const data = await res.json();
      if (!res.ok) { setMnemonicError(data.error || "Couldn't generate a mnemonic right now."); return; }
      const mnemonic: KanjiMnemonic = { entries: data.entries, origin: data.origin };
      await supabase.from("master_cards").update({ mnemonic }).eq("id", card.id);
      setQuizCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, mnemonic } : c)));
      setMnemonicCard((prev) => (prev && prev.id === card.id ? { ...prev, mnemonic } : prev));
    } catch {
      setMnemonicError("Couldn't generate a mnemonic right now.");
    } finally {
      setMnemonicLoading(false);
    }
  };

  const refreshUsage = () => getTodayUsage(userId, "quiz_weak_words").then(setUsage);
  useEffect(() => { refreshUsage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Same count_weak_words RPC BottomNav's Quick Actions badge uses — greys out the
  // Start button below instead of blocking the entry points (Quick Actions tile,
  // the desktop Practice card) that open this quiz, so those stay clickable even
  // when there's nothing to review today.
  const [weakWordsCount, setWeakWordsCount] = useState<number | null>(null);
  useEffect(() => {
    const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
    supabase.rpc("count_weak_words", { p_today: todaySg }).then(({ data: count }) => {
      if (typeof count === "number") setWeakWordsCount(count);
    });
  }, []);

  // Warn on accidental refresh/tab-close mid-quiz — same as the other quizzes.
  useEffect(() => {
    if (phase !== "quiz") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  const loadingRef = useRef(false);
  const scoringRef = useRef(false);

  const load = async () => {
    if (loadingRef.current) return;
    if (!isAdmin && usage != null && usage.remaining <= 0) {
      setError("Daily limit reached — this keeps it free for everyone. Come back tomorrow!");
      setPhase("loading");
      return;
    }
    closeLookup();
    loadingRef.current = true;
    scoringRef.current = false;
    setPhase("loading");
    setCurrentIdx(0);
    setResults([]);
    setSelected(null);
    setError(null);
    setQueuedWords(new Set());

    try {
      // Struggling today — cards failed 2+ times today (daily_struggles) and not
      // yet cleared (answered correctly in this quiz already today). The only pool
      // source now, so fetch just those card ids instead of paginating the whole deck.
      const sgToday = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
      const { data: struggles, error: strugglesErr } = await supabase
        .from("daily_struggles")
        .select("card_id")
        .eq("user_id", userId)
        .eq("struggle_date", sgToday)
        .gte("fail_count", DAILY_STRUGGLE_THRESHOLD)
        .is("cleared_at", null);
      if (strugglesErr) throw new Error("Could not load your cards");

      const poolCardIds = (struggles ?? []).map((s) => s.card_id);
      if (poolCardIds.length === 0) {
        setPhase("empty");
        return;
      }

      const { data: rows, error: rowsErr } = await supabase
        .from("user_scores")
        .select("scores_json, reflex_attempts, master_cards!card_id(id, japanese, reading, english, mnemonic)")
        .eq("user_id", userId)
        .in("card_id", poolCardIds);
      if (rowsErr) throw new Error("Could not load your cards");

      const pool: DeckRow[] = (rows ?? [])
        .map((row) => {
          const card = (row as unknown as { master_cards?: DeckRow }).master_cards;
          if (!card) return null;
          const s = (row.scores_json as DeckRow["scores"]) || { jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 }, en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 } };
          return { ...card, scores: s, reflex_attempts: (row.reflex_attempts as number) ?? 0 };
        })
        .filter((c): c is DeckRow => c !== null);

      if (pool.length === 0) {
        setPhase("empty");
        return;
      }

      const pick = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(POOL_SIZE, pool.length));

      const res = await authedFetch("/api/quiz/weak-words", {
        method: "POST",
        body: JSON.stringify({ cards: pick.map((c) => ({ japanese: c.japanese, reading: c.reading, english: c.english })) }),
      });

      refreshUsage();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate quiz");
      }
      const { questions } = await res.json();
      const byIdx = new Map<number, { sentence_jp: string; sentence_en: string; choices: string[]; answer: string; explanation: string }>(
        (questions ?? []).map((q: { id: number } & Record<string, unknown>) => [q.id, q as never])
      );

      const merged: QuizCard[] = pick
        .map((card, idx) => {
          const q = byIdx.get(idx);
          if (!q) return null;
          return { ...card, sentence_jp: q.sentence_jp, sentence_en: q.sentence_en, choices: q.choices, answer: q.answer, explanation: q.explanation };
        })
        .filter((c): c is QuizCard => c !== null);

      if (merged.length === 0) {
        setError("Couldn't generate a quiz for these words. Please try again.");
        return;
      }

      setQuizCards(merged);
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      loadingRef.current = false;
    }
  };

  const handleAnswer = async (choice: string) => {
    if (selected !== null || scoringRef.current) return;
    scoringRef.current = true;
    setSelected(choice);

    const card = quizCards[currentIdx];
    const passed = choice === card.answer;
    const old = card.scores?.jp_to_en || { pass: 0, fail: 0, total: 0, percent: 0 };
    const newPass = passed ? old.pass + 1 : old.pass;
    const newFail = !passed ? old.fail + 1 : old.fail;
    const newTotal = old.total + 1;
    const newPercent = Math.round((newPass / newTotal) * 100);

    await supabase.from("user_scores").upsert({
      user_id: userId,
      card_id: card.id,
      scores_json: { ...card.scores, jp_to_en: { pass: newPass, fail: newFail, total: newTotal, percent: newPercent } },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,card_id" });

    // Same fire-and-forget "what did I get wrong today" log StudyView's Fail grade
    // writes — this card was already pulled from that same signal, so missing it
    // again here should count the same as missing it in a normal review.
    if (!passed) {
      supabase.rpc("record_daily_struggle", { target_user_id: userId, target_card_id: card.id })
        .then(({ error }) => { if (error) console.error("Error recording daily struggle:", error); });
    } else {
      // Getting it right here clears it from today's pool (cleared_at, not a
      // fail_count reset — daily_struggles stays an accurate "what did I get
      // wrong today" diary) so it stops reappearing once mastered today. A later
      // fresh fail (here or in regular Study) re-qualifies it automatically —
      // record_daily_struggle resets cleared_at on every new fail.
      supabase.rpc("clear_daily_struggle", { target_user_id: userId, target_card_id: card.id })
        .then(({ error }) => { if (error) console.error("Error clearing daily struggle:", error); });
    }

    setResults((prev) => [...prev, { card, passed, newPercent }]);
  };

  const goNext = () => {
    if (currentIdx + 1 >= quizCards.length) {
      setPhase("done");
      return;
    }
    setCurrentIdx((i) => i + 1);
    setSelected(null);
    scoringRef.current = false;
  };

  const passedCount = results.filter((r) => r.passed).length;
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
        <button
          onClick={() => (phase === "intro" || phase === "done" || phase === "empty" ? onClose() : setBackConfirm(true))}
          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
        >
          <ChevronLeft size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-base">😓</span>
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Weak Words Quiz</span>
        </div>
        <div className="w-[60px]" />
      </div>

      {/* Intro */}
      {phase === "intro" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full text-center gap-5">
          <span className="text-5xl">😓</span>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Review your weak words</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">
              Pulls up to {POOL_SIZE} cards you&apos;re struggling with today — failed a
              few times — and quizzes you on each in an AI-written sentence. A Clue
              button can generate a kanji mnemonic if you&apos;re stuck.
            </p>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Up to {POOL_SIZE} questions · ~3–5 min</p>
          {!isAdmin && usage != null && usage.remaining <= 0 && (
            <p className="text-rose-400 font-black uppercase tracking-widest text-[10px]">
              Daily limit reached — come back tomorrow!
            </p>
          )}
          {weakWordsCount === 0 && (
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              Nothing to review today — come back later!
            </p>
          )}
          <button
            onClick={() => { setStarting(true); load(); }}
            disabled={starting || weakWordsCount === 0 || (!isAdmin && usage != null && usage.remaining <= 0)}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : null}
            {starting ? "Please wait…" : "Start Quiz"}
          </button>
        </div>
      )}

      {/* Nothing to review */}
      {phase === "empty" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="text-5xl">🎉</span>
          <p className="text-slate-700 font-black text-base">Nothing to review right now!</p>
          <p className="text-slate-400 font-medium text-sm leading-relaxed">
            No cards are struggling today — come back once some are.
          </p>
          <button onClick={onClose} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
            Close
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Finding your weak words…</p>
          <p className="text-slate-300 font-bold text-[10px]">Please wait, this can take a few seconds</p>
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
          <div className="mb-5 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{currentIdx + 1} / {quizCards.length}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{passedCount} correct</span>
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
              className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto"
            >
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">What does the highlighted word mean?</p>
                  {kanjiRe.test(currentCard.japanese) && (
                    <button
                      onClick={() => handleMnemonic(currentCard)}
                      aria-label="Clue"
                      className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full active:scale-95 transition-all shrink-0"
                    >
                      <Lightbulb size={11} /> Clue
                    </button>
                  )}
                </div>
                <p className="text-xl leading-relaxed text-slate-800 font-medium">
                  <HighlightedSentence sentence={currentCard.sentence_jp} word={currentCard.japanese} reading={currentCard.reading} onWordTap={openLookup} />
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {currentCard.choices.map((choice) => {
                  const answered = selected !== null;
                  let style = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";
                  if (answered) {
                    if (choice === currentCard.answer) style = "bg-emerald-50 border-emerald-400 text-emerald-700";
                    else if (choice === selected) style = "bg-rose-50 border-rose-400 text-rose-700";
                    else style = "bg-white border-slate-200 text-slate-400";
                  }
                  return (
                    <button
                      key={choice}
                      disabled={answered}
                      onClick={() => handleAnswer(choice)}
                      className={`px-4 py-4 rounded-2xl border-2 text-sm font-bold text-left transition-all ${style}`}
                    >
                      {choice}
                    </button>
                  );
                })}
              </div>

              {selected !== null && (
                <div className={`rounded-2xl p-4 text-sm ${selected === currentCard.answer ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  <p className="font-black mb-1 flex items-center gap-2">
                    {selected === currentCard.answer ? "✓ Correct!" : `✗ Answer: ${currentCard.answer}`}
                    <span
                      className="text-sm font-black text-slate-700 cursor-pointer active:opacity-60 transition-opacity"
                      onClick={(e) => openLookup(currentCard.japanese, currentCard.reading, e)}
                    >
                      ({currentCard.japanese})
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed">{currentCard.explanation}</p>
                  <p className="text-xs italic opacity-70 mt-1.5">{currentCard.sentence_en}</p>
                </div>
              )}

              <div className="mt-auto shrink-0 pb-safe pt-2">
                {selected !== null && (
                  <button
                    onClick={goNext}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm"
                  >
                    {currentIdx + 1 >= quizCards.length ? "Finish" : "Next"}
                  </button>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="flex-1 flex flex-col items-center overflow-y-auto px-6 py-8 max-w-lg mx-auto w-full">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="text-center mb-8 w-full"
          >
            <div className="text-6xl mb-4">{passedCount >= results.length * 0.8 ? "🏆" : passedCount >= results.length * 0.5 ? "💪" : "📚"}</div>
            <h2 className="text-4xl font-black text-slate-900 mb-1">
              {passedCount}<span className="text-slate-300 font-bold text-2xl"> / {results.length}</span>
            </h2>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-1">scores updated</p>
          </motion.div>

          {results.filter((r) => !r.passed).length > 0 && (
            <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 mb-6">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-3">
                Review these · {results.filter((r) => !r.passed).length} missed
              </p>
              <div className="flex flex-col divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {results.filter((r) => !r.passed).map((r, i) => (
                  <div key={i} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-base leading-relaxed text-slate-800 font-medium mb-1.5">
                      <HighlightedSentence sentence={r.card.sentence_jp} word={r.card.japanese} reading={r.card.reading} onWordTap={() => {}} />
                    </p>
                    <p className="text-xs text-slate-500 italic mb-2">{r.card.sentence_en}</p>
                    <span className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                      {r.card.japanese} · {r.card.answer}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <button onClick={onClose} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
              Done
            </button>
            {!isAdmin && usage != null && usage.remaining <= 0 ? (
              <div className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] text-center">
                Limit reached
              </div>
            ) : (
              <button onClick={load} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">
                Play Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Leave confirmation */}
      {backConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setBackConfirm(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-black text-slate-800 mb-1">Leave the quiz?</p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">This counts as one of today&apos;s quiz slots. You&apos;ll need to generate a new quiz when you return.</p>
            <div className="flex gap-3">
              <button onClick={() => setBackConfirm(false)} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all">
                Cancel
              </button>
              <button onClick={onClose} className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm">
                Leave
              </button>
            </div>
          </div>
        </>
      )}

      {/* Word lookup — queues into pending_words (Add Cards' Queue tab), not straight
          into the deck, same as Translate. */}
      {lookup && (
        <WordLookupSheet
          lookup={lookup}
          onClose={closeLookup}
          onEditWord={setEditWord}
          onAdd={(w) => queueWord(w)}
          isAdded={(w) => queuedWords.has(w)}
          addLabel="Add to List"
          addIcon={<List size={11} />}
        />
      )}

      {/* Mnemonic ("Clue") sheet — same content/style as Cards'/StudyView's own */}
      {mnemonicCard && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[320] bg-black/40"
            onClick={() => setMnemonicCard(null)}
          />
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[321] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 p-6 w-full sm:max-w-sm max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} className="text-amber-500" />
                <p className="text-slate-800 font-black text-sm uppercase tracking-tight">Remember {mnemonicCard.japanese}</p>
              </div>
              <button onClick={() => setMnemonicCard(null)} className="text-slate-300 hover:text-slate-500 shrink-0">
                <X size={18} />
              </button>
            </div>

            {mnemonicLoading && (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" />
                <span>Thinking of a way to remember it…</span>
              </div>
            )}

            {!mnemonicLoading && mnemonicError && (
              <p className="text-center text-rose-500 text-xs font-bold py-6">{mnemonicError}</p>
            )}

            {!mnemonicLoading && !mnemonicError && mnemonicCard.mnemonic && (
              <div className="space-y-4">
                {mnemonicCard.mnemonic.entries.map((entry, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-3xl font-black text-slate-800 mb-1">{entry.character}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1.5">{entry.radicals}</p>
                    <p className="text-sm text-slate-600 leading-snug">{entry.story}</p>
                  </div>
                ))}
                {mnemonicCard.mnemonic.origin && (
                  <p className="text-xs text-slate-400 italic leading-snug pt-1">{mnemonicCard.mnemonic.origin}</p>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
