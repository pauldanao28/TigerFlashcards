"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { speak } from "@/lib/tts";

type Card = { id: string; japanese: string; reading: string; english: string };

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
    .select("id, japanese, reading, english, deck_cards!inner(deck_id)")
    .eq("deck_cards.deck_id", deck.id)
    .limit(500);
  return (data ?? []) as Card[];
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildChoices(correct: Card, all: Card[]): string[] {
  const pool = shuffle(all.filter((c) => c.id !== correct.id));
  return shuffle([correct.english, ...pool.slice(0, 3).map((c) => c.english)]);
}

const DURATION = 60;

export default function TypeHearGame() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [current, setCurrent] = useState<Card | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const queueRef = useRef<Card[]>([]);
  const cardsRef = useRef<Card[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const loaded = await loadDeckCards(session.user.id);
      setCards(loaded);
      cardsRef.current = loaded;
      setLoading(false);
    });
  }, []);

  const spawnCard = useCallback(() => {
    let q = queueRef.current;
    if (q.length === 0) q = shuffle(cardsRef.current);
    const [next, ...rest] = q;
    queueRef.current = rest;
    setCurrent(next);
    setChoices(buildChoices(next, cardsRef.current));
    setSelected(null);
    speak(next.japanese);
  }, []);

  const startGame = useCallback(() => {
    queueRef.current = shuffle(cardsRef.current);
    setScore(0);
    setTimeLeft(DURATION);
    setSelected(null);
    setGameState("playing");
    spawnCard();
  }, [spawnCard]);

  useEffect(() => {
    if (gameState !== "playing") return;
    if (timeLeft <= 0) { setGameState("over"); return; }
    const t = setTimeout(() => setTimeLeft((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [gameState, timeLeft]);

  const handleChoice = (choice: string) => {
    if (selected || !current || gameState !== "playing") return;
    setSelected(choice);
    if (choice === current.english) setScore((s) => s + 1);
    setTimeout(spawnCard, 650);
  };

  const timerPct = (timeLeft / DURATION) * 100;
  const timerColor = timerPct > 40 ? "bg-emerald-500" : timerPct > 15 ? "bg-amber-500" : "bg-rose-500";

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
          👂 Listen & Pick
        </span>
        <span className="font-black text-sm text-emerald-400 tabular-nums w-12 text-right">
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
            <div className="text-7xl mb-5">👂</div>
            <h1 className="text-white font-black text-2xl mb-2">Listen & Pick</h1>
            <p className="text-slate-400 text-sm leading-relaxed mb-8 max-w-xs mx-auto">
              A Japanese word plays automatically. Pick the correct English meaning. 60 seconds.
            </p>
            {cards.length < 4 ? (
              <p className="text-rose-400 text-sm">Add at least 4 cards to your deck to play.</p>
            ) : (
              <button
                onClick={startGame}
                className="bg-emerald-500 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-emerald-400 active:scale-95 transition-all"
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
                className={`h-full rounded-full transition-colors ${timerColor}`}
                animate={{ width: `${timerPct}%` }}
                transition={{ duration: 1, ease: "linear" }}
              />
            </div>
            <div className="flex items-center justify-between w-full">
              <span className="text-slate-500 text-xs font-bold tabular-nums">{timeLeft}s</span>
              <span className="text-white font-black text-lg tabular-nums">{score}</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.button
                key={current.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={() => speak(current.japanese)}
                className="bg-slate-800 border-2 border-slate-700 rounded-3xl p-8 text-center w-full hover:border-emerald-600 active:scale-95 transition-all"
              >
                <div className="text-5xl mb-3">🔊</div>
                <p className="text-slate-400 text-xs font-medium">tap to hear again</p>
              </motion.button>
            </AnimatePresence>

            <div className="grid grid-cols-2 gap-3 w-full">
              {choices.map((choice) => {
                const isCorrect = choice === current.english;
                const isChosen = choice === selected;
                let cls =
                  "border-2 rounded-2xl p-4 text-sm font-bold transition-all active:scale-95 text-left leading-snug";
                if (!selected) {
                  cls += " bg-slate-800 border-slate-700 text-white hover:border-slate-500";
                } else if (isChosen && isCorrect) {
                  cls += " bg-emerald-500 border-emerald-400 text-white";
                } else if (isChosen && !isCorrect) {
                  cls += " bg-rose-500 border-rose-400 text-white";
                } else if (!isChosen && isCorrect) {
                  cls += " bg-emerald-500/20 border-emerald-500 text-emerald-300";
                } else {
                  cls += " bg-slate-800 border-slate-700 text-slate-400";
                }
                return (
                  <button key={choice} onClick={() => handleChoice(choice)} className={cls}>
                    {choice}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {gameState === "over" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center w-full"
          >
            <div className="text-7xl mb-4">🎯</div>
            <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Score</p>
            <p className="text-white font-black text-5xl mb-2 tabular-nums">{score}</p>
            <p className="text-slate-500 text-sm mb-10">correct in 60 seconds</p>
            <div className="flex gap-3">
              <button
                onClick={startGame}
                className="flex-1 bg-emerald-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-emerald-400 active:scale-95 transition-all"
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
