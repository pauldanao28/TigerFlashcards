"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Card = { id: string; japanese: string; english: string };

async function loadDeckCards(userId: string): Promise<Card[]> {
  const { data: deck } = await supabase
    .from("decks")
    .select("id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .single();
  if (!deck) return [];
  const { data } = await supabase
    .from("master_cards")
    .select("id, japanese, english, deck_cards!inner(deck_id)")
    .eq("deck_cards.deck_id", deck.id)
    .limit(500);
  return (data ?? []) as Card[];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

const DURATION = 60;

export default function SpeedMatchGame() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [current, setCurrent] = useState<Card | null>(null);
  const [shownEnglish, setShownEnglish] = useState("");
  const [isRealMatch, setIsRealMatch] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const cardsRef = useRef<Card[]>([]);
  const processingRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const loaded = await loadDeckCards(session.user.id);
      setCards(loaded);
      cardsRef.current = loaded;
      setLoading(false);
    });
  }, []);

  const spawnPair = useCallback(() => {
    const all = cardsRef.current;
    if (all.length < 2) return;
    const shuffled = shuffle(all);
    const card = shuffled[0];
    const isMatch = Math.random() > 0.5;
    const english = isMatch ? card.english : shuffled[1].english;
    setCurrent(card);
    setShownEnglish(english);
    setIsRealMatch(isMatch);
    setFeedback(null);
    processingRef.current = false;
  }, []);

  const startGame = useCallback(() => {
    setScore(0);
    setCombo(0);
    setTimeLeft(DURATION);
    setGameState("playing");
    spawnPair();
  }, [spawnPair]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (timeLeft <= 0) { setGameState("over"); return; }
    const t = setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timeLeft]);

  const handleAnswer = (userSaysMatch: boolean) => {
    if (processingRef.current || gameState !== "playing") return;
    processingRef.current = true;

    const correct = userSaysMatch === isRealMatch;
    setFeedback(correct ? "correct" : "wrong");

    if (correct) {
      setCombo((c) => {
        const next = c + 1;
        setScore((s) => s + 1 + Math.floor(next / 3));
        return next;
      });
    } else {
      setCombo(0);
    }

    setTimeout(spawnPair, 380);
  };

  const timerPct = (timeLeft / DURATION) * 100;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading your deck…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
        <Link href="/minigames" className="text-slate-400 hover:text-white transition-colors">
          ←
        </Link>
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-400">
          ⚡ Speed Match
        </span>
        <span className="font-black text-sm text-amber-400 tabular-nums w-12 text-right">
          {gameState === "playing" ? `${score}` : ""}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6 max-w-sm mx-auto w-full">
        {gameState === "idle" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center w-full"
          >
            <div className="text-7xl mb-5">⚡</div>
            <h1 className="text-white font-black text-2xl mb-2">Speed Match</h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
              A Japanese word and an English meaning appear. Do they match? Tap fast — 60 seconds. Build combos for bonus points.
            </p>
            {cards.length < 4 ? (
              <p className="text-rose-400 text-sm">Add at least 4 cards to your deck to play.</p>
            ) : (
              <button
                onClick={startGame}
                className="bg-amber-500 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-amber-400 active:scale-95 transition-all"
              >
                Start
              </button>
            )}
          </motion.div>
        )}

        {gameState === "playing" && current && (
          <>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-amber-500"
                animate={{ width: `${timerPct}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex items-center justify-between w-full">
              <span className="text-slate-500 text-xs font-bold tabular-nums">{timeLeft}s</span>
              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {combo >= 3 && (
                    <motion.span
                      key={combo}
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-amber-400 text-xs font-black"
                    >
                      🔥 ×{combo}
                    </motion.span>
                  )}
                </AnimatePresence>
                <span className="text-white font-black text-lg tabular-nums">{score}</span>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={current.id + shownEnglish}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className={`w-full rounded-3xl border-2 p-8 text-center transition-colors duration-150 ${
                  feedback === "correct"
                    ? "bg-emerald-900/30 border-emerald-500"
                    : feedback === "wrong"
                      ? "bg-rose-900/30 border-rose-500"
                      : "bg-slate-800 border-slate-700"
                }`}
              >
                <p className="text-white text-3xl font-black mb-5">{current.japanese}</p>
                <div className="h-px bg-slate-700 mb-5" />
                <p className="text-slate-300 text-xl font-bold">{shownEnglish}</p>
              </motion.div>
            </AnimatePresence>

            <div className="flex gap-4 w-full">
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 bg-rose-500/10 border-2 border-rose-500/30 text-rose-400 py-5 rounded-2xl font-black text-xl hover:bg-rose-500/20 active:scale-95 transition-all"
              >
                ✗
              </button>
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-400 py-5 rounded-2xl font-black text-xl hover:bg-emerald-500/20 active:scale-95 transition-all"
              >
                ✓
              </button>
            </div>
            <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
              ✗ No Match &nbsp;·&nbsp; ✓ Match
            </p>
          </>
        )}

        {gameState === "over" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center w-full"
          >
            <div className="text-7xl mb-4">⚡</div>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Score</p>
            <p className="text-white font-black text-5xl mb-2 tabular-nums">{score}</p>
            <p className="text-slate-500 text-sm mb-10">points in 60 seconds</p>
            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="flex-1 bg-amber-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-amber-400 active:scale-95 transition-all"
              >
                Play Again
              </button>
              <Link
                href="/minigames"
                className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 py-4 rounded-2xl font-black text-sm flex items-center justify-center hover:border-slate-500 active:scale-95 transition-all"
              >
                Menu
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
