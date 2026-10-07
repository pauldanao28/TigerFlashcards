"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

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

function buildChoices(correct: Card, all: Card[]): Card[] {
  const others = shuffle(all.filter((c) => c.id !== correct.id)).slice(0, 3);
  return shuffle([correct, ...others]);
}

const MAX_LIVES = 3;
const BASE_SPEED = 4.5;
const MIN_SPEED = 1.8;
const SPEED_STEP = 0.25;

function getSpeed(score: number): number {
  return Math.max(MIN_SPEED, BASE_SPEED - Math.floor(score / 5) * SPEED_STEP);
}

export default function SurvivalGame() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">("idle");
  const [lives, setLives] = useState(MAX_LIVES);
  const [score, setScore] = useState(0);
  const [current, setCurrent] = useState<Card | null>(null);
  const [choices, setChoices] = useState<Card[]>([]);
  const [cardKey, setCardKey] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | "miss" | null>(null);
  const [answered, setAnswered] = useState(false);

  const controls = useAnimation();
  const answeredRef = useRef(false);
  const livesRef = useRef(MAX_LIVES);
  const scoreRef = useRef(0);
  const cardsRef = useRef<Card[]>([]);
  const queueRef = useRef<Card[]>([]);
  const gameStateRef = useRef<"idle" | "playing" | "over">("idle");

  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const loaded = await loadDeckCards(session.user.id);
      setCards(loaded);
      cardsRef.current = loaded;
      setLoading(false);
    });
  }, []);

  const endGame = useCallback(() => {
    controls.stop();
    setGameState("over");
  }, [controls]);

  const spawnCard = useCallback(() => {
    const all = cardsRef.current;
    if (all.length < 4) return;
    let q = queueRef.current;
    if (q.length === 0) q = shuffle(all);
    const [next, ...rest] = q;
    queueRef.current = rest;
    answeredRef.current = false;
    setAnswered(false);
    setFeedback(null);
    setCurrent(next);
    setChoices(buildChoices(next, all));
    setCardKey((k) => k + 1);
  }, []);

  const startGame = useCallback(() => {
    livesRef.current = MAX_LIVES;
    scoreRef.current = 0;
    queueRef.current = shuffle(cardsRef.current);
    setLives(MAX_LIVES);
    setScore(0);
    setFeedback(null);
    setAnswered(false);
    answeredRef.current = false;
    setGameState("playing");
    spawnCard();
  }, [spawnCard]);

  // Start falling animation when a new card spawns
  useEffect(() => {
    if (gameStateRef.current !== "playing" || !current) return;
    const speed = getSpeed(scoreRef.current);

    controls
      .start({ y: "62vh", transition: { duration: speed, ease: "linear" } })
      .then(() => {
        if (answeredRef.current || gameStateRef.current !== "playing") return;
        // Miss
        answeredRef.current = true;
        setFeedback("miss");
        const nextLives = livesRef.current - 1;
        livesRef.current = nextLives;
        setLives(nextLives);
        if (nextLives <= 0) {
          setTimeout(endGame, 700);
        } else {
          setTimeout(spawnCard, 900);
        }
      });

    return () => { controls.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);

  const handleChoice = (choice: Card) => {
    if (answeredRef.current || gameStateRef.current !== "playing" || !current) return;
    answeredRef.current = true;
    controls.stop();
    setAnswered(true);

    const correct = choice.id === current.id;
    setFeedback(correct ? "correct" : "wrong");

    if (correct) {
      const next = scoreRef.current + 1;
      scoreRef.current = next;
      setScore(next);
      setTimeout(spawnCard, 600);
    } else {
      const nextLives = livesRef.current - 1;
      livesRef.current = nextLives;
      setLives(nextLives);
      if (nextLives <= 0) {
        setTimeout(endGame, 700);
      } else {
        setTimeout(spawnCard, 800);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading your deck…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0 relative z-10">
        <Link href="/minigames" className="text-slate-400 hover:text-white transition-colors">
          ←
        </Link>
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-400">
          💀 Survival
        </span>
        <span className="font-black text-sm text-rose-400 tabular-nums w-12 text-right">
          {gameState === "playing" ? `${score}` : ""}
        </span>
      </div>

      <div className="flex-1 flex flex-col p-5 relative z-10">
        {gameState === "idle" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center max-w-xs"
            >
              <div className="text-7xl mb-5">💀</div>
              <h1 className="text-white font-black text-2xl mb-2">Survival</h1>
              <p className="text-slate-400 text-sm leading-relaxed mb-8">
                Cards fall from above showing an English meaning. Pick the correct Japanese word before it hits the ground. 3 lives — gets faster as you score.
              </p>
              {cards.length < 4 ? (
                <p className="text-rose-400 text-sm">Add at least 4 cards to your deck to play.</p>
              ) : (
                <button
                  onClick={startGame}
                  className="bg-rose-500 text-white px-10 py-4 rounded-2xl font-black text-sm hover:bg-rose-400 active:scale-95 transition-all"
                >
                  Start
                </button>
              )}
            </motion.div>
          </div>
        )}

        {gameState === "playing" && current && (
          <div className="flex flex-col h-full" style={{ minHeight: "calc(100vh - 65px)" }}>
            {/* HUD */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex gap-1.5">
                {Array.from({ length: MAX_LIVES }).map((_, i) => (
                  <motion.span
                    key={i}
                    animate={i === lives && feedback !== "correct" ? { scale: [1, 1.4, 1] } : {}}
                    className={`text-xl transition-all duration-300 ${
                      i < lives ? "opacity-100" : "opacity-20 grayscale"
                    }`}
                  >
                    ❤️
                  </motion.span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
                  speed {getSpeed(score).toFixed(1)}s
                </span>
                <span className="text-white font-black text-xl tabular-nums">{score}</span>
              </div>
            </div>

            {/* Falling zone */}
            <div className="relative flex-1 overflow-hidden" style={{ maxHeight: "55vh" }}>
              <AnimatePresence>
                <motion.div
                  key={cardKey}
                  initial={{ y: -80 }}
                  animate={controls}
                  className={`absolute left-1/2 -translate-x-1/2 w-56 rounded-3xl p-6 text-center border-2 shadow-2xl ${
                    feedback === "correct"
                      ? "bg-emerald-900/60 border-emerald-400"
                      : feedback === "wrong" || feedback === "miss"
                        ? "bg-rose-900/60 border-rose-500"
                        : "bg-slate-800 border-slate-600"
                  }`}
                >
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">
                    What is this?
                  </p>
                  <p className="text-white text-xl font-black leading-snug">{current.english}</p>
                  {feedback && (
                    <p
                      className={`text-sm font-black mt-3 ${
                        feedback === "correct" ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {feedback === "correct"
                        ? `✓ ${current.japanese}`
                        : feedback === "miss"
                          ? "Too slow!"
                          : `✗ ${current.japanese}`}
                    </p>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Choices */}
            <div className="grid grid-cols-2 gap-3 mt-4 shrink-0">
              {choices.map((choice) => {
                const isCorrectAnswer = choice.id === current.id;
                let cls =
                  "border-2 rounded-2xl py-4 px-3 text-center font-bold transition-all active:scale-95";
                if (answered && isCorrectAnswer) {
                  cls += " bg-emerald-500/20 border-emerald-400 text-emerald-300";
                } else if (answered) {
                  cls += " bg-slate-800 border-slate-800 text-slate-600";
                } else {
                  cls += " bg-slate-800 border-slate-700 text-white hover:border-slate-500";
                }
                return (
                  <button
                    key={choice.id}
                    onClick={() => handleChoice(choice)}
                    disabled={answered}
                    className={cls}
                  >
                    <div className="text-lg">{choice.japanese}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 font-medium">{choice.reading}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {gameState === "over" && (
          <div className="flex-1 flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center max-w-xs w-full"
            >
              <div className="text-7xl mb-4">
                {score >= 20 ? "🏆" : score >= 10 ? "💪" : "💀"}
              </div>
              <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">Score</p>
              <p className="text-white font-black text-5xl mb-2 tabular-nums">{score}</p>
              <p className="text-slate-500 text-sm mb-10">words survived</p>
              <div className="flex gap-3">
                <button
                  onClick={startGame}
                  className="flex-1 bg-rose-500 text-white py-4 rounded-2xl font-black text-sm hover:bg-rose-400 active:scale-95 transition-all"
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
          </div>
        )}
      </div>
    </div>
  );
}
