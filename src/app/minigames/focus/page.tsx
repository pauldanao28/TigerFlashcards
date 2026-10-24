"use client";

import { useState, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
} from "framer-motion";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { translations } from "@/lib/languages";
import { supabase } from "@/lib/supabase";

const COLORS = [
  { name_en: "RED",    name_jp: "赤",   hex: "#ef4444" },
  { name_en: "BLUE",   name_jp: "青",   hex: "#3b82f6" },
  { name_en: "GREEN",  name_jp: "緑",   hex: "#22c55e" },
  { name_en: "YELLOW", name_jp: "黄色", hex: "#eab308" },
  { name_en: "PURPLE", name_jp: "紫",   hex: "#a855f7" },
];

const updateMinigameBest = async (
  userId: string,
  mode: 30 | 60,
  newScore: number,
) => {
  const column =
    mode === 30 ? "minigame_focus_best_30s" : "minigame_focus_best_60s";
  const { error } = await supabase
    .from("profiles")
    .update({ [column]: newScore })
    .eq("id", userId)
    .lt(column, newScore);
  if (error) console.error("Score update failed:", error.message);
};

export default function StroopSwipeGame() {
  const t = translations.en;

  const [user, setUser]       = useState<any>(null);
  const [dbScores, setDbScores] = useState({ best30s: 0, best60s: 0 });
  const [loading, setLoading] = useState(true);

  const [language]       = useState<"en" | "jp">("jp");
  const [currentWord, setCurrentWord] = useState(COLORS[0]);
  const [inkColor, setInkColor]       = useState(COLORS[1]);
  const [streak, setStreak]           = useState(0);
  const [maxStreak, setMaxStreak]     = useState(0);
  const [timeLeft, setTimeLeft]       = useState(0);
  const [gameState, setGameState]     = useState<"idle" | "playing" | "over">("idle");
  const [gameKey, setGameKey]         = useState(Date.now());
  const [currentMode, setCurrentMode] = useState<30 | 60 | null>(null);

  const x         = useMotionValue(0);
  const rotate    = useTransform(x, [-150, 150], [-20, 20]);
  const opacity   = useTransform(x, [-150, -100, 0, 100, 150], [0, 1, 1, 1, 0]);
  const leftColor  = useTransform(x, [-100, -20], ["#fb7185", "#475569"]);
  const rightColor = useTransform(x, [20, 100],  ["#475569", "#34d399"]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("minigame_focus_best_30s, minigame_focus_best_60s")
          .eq("id", u.id)
          .single();
        if (profile) {
          setDbScores({
            best30s: profile.minigame_focus_best_30s || 0,
            best60s: profile.minigame_focus_best_60s || 0,
          });
        }
      }
      setLoading(false);
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentMode === 30) setMaxStreak(dbScores.best30s);
    if (currentMode === 60) setMaxStreak(dbScores.best60s);
  }, [currentMode, dbScores]);

  const nextChallenge = useCallback(() => {
    x.stop();
    x.set(0);
    const wordBase = COLORS[Math.floor(Math.random() * COLORS.length)];
    const shouldMatch = Math.random() > 0.5;
    const colorBase = shouldMatch
      ? wordBase
      : COLORS[Math.floor(Math.random() * COLORS.length)];
    setCurrentWord(wordBase);
    setInkColor(colorBase);
    setGameKey(Date.now());
  }, [x]);

  const triggerGameOver = useCallback(async () => {
    setGameState("over");
    if (!currentMode || streak <= 0 || !user?.id) return;
    const isNewBest = streak > (currentMode === 30 ? dbScores.best30s : dbScores.best60s);
    if (isNewBest) {
      await updateMinigameBest(user.id, currentMode, streak);
      setDbScores((prev) => ({
        ...prev,
        [currentMode === 30 ? "best30s" : "best60s"]: streak,
      }));
    }
  }, [streak, currentMode, user, dbScores]);

  const handleAnswer = (userSaysMatch: boolean) => {
    const isActualMatch = currentWord.hex === inkColor.hex;
    if (userSaysMatch === isActualMatch) {
      setStreak((prev) => {
        const next = prev + 1;
        if (next > maxStreak) setMaxStreak(next);
        return next;
      });
      x.set(0);
      nextChallenge();
    } else {
      triggerGameOver();
    }
  };

  const handleDragEnd = (_: any, info: any) => {
    if (info.offset.x > 100)       handleAnswer(true);
    else if (info.offset.x < -100) handleAnswer(false);
    else x.set(0);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState === "playing" && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    } else if (timeLeft === 0 && gameState === "playing") {
      triggerGameOver();
    }
    return () => clearInterval(timer);
  }, [gameState, timeLeft, triggerGameOver]);

  const startGame = (seconds: number) => {
    setCurrentMode(seconds as 30 | 60);
    setStreak(0);
    setTimeLeft(seconds);
    setGameState("playing");
    nextChallenge();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === "playing") {
        if (e.key === "ArrowLeft")  { x.set(-100); handleAnswer(false); }
        if (e.key === "ArrowRight") { x.set(100);  handleAnswer(true);  }
      } else {
        if (e.key === " " || e.key === "ArrowUp") { e.preventDefault(); startGame(30); }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, handleAnswer, startGame, x]);

  return (
    <div className="bg-slate-900 font-sans select-none overflow-hidden h-screen max-h-screen touch-none overscroll-none flex flex-col">

      {/* Header — matches other mini games */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
        <Link
          href="/minigames"
          className="flex items-center gap-0.5 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft size={18} strokeWidth={3} />
          <span className="text-[10px] font-black uppercase tracking-widest">{t.back}</span>
        </Link>
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-400">
          🎯 Color Focus
        </span>
        {gameState === "playing" ? (
          <span className="text-violet-400 font-black text-sm tabular-nums w-16 text-right">
            {streak}
          </span>
        ) : (
          <div className="w-16" />
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col p-5 max-w-md mx-auto w-full overflow-hidden">

        {/* Score row (playing only) */}
        {gameState === "playing" && (
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-400 text-xs font-bold tabular-nums">{timeLeft}s</span>
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">
              best <span className="text-violet-400">{maxStreak}</span>
            </span>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {gameState === "playing" ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-8">
              {/* Streak */}
              <div className="text-violet-400 text-xs font-black uppercase tracking-widest">
                {t.streak}: {streak}
              </div>

              {/* Swipe card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={gameKey}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={handleDragEnd}
                  style={{ x, rotate, opacity }}
                  initial={{ x: 0, scale: 0.9, opacity: 0 }}
                  animate={{ x: 0, scale: 1, opacity: 1 }}
                  exit={{ x: x.get() > 0 ? 300 : -300, opacity: 0, transition: { duration: 0.2 } }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="w-full h-64 bg-slate-800 border-2 border-slate-700 rounded-3xl shadow-2xl flex items-center justify-center cursor-grab active:cursor-grabbing"
                >
                  <span
                    className="text-7xl font-black pointer-events-none tracking-tighter"
                    style={{ color: inkColor.hex }}
                  >
                    {language === "en" ? currentWord.name_en : currentWord.name_jp}
                  </span>
                </motion.div>
              </AnimatePresence>

              {/* Swipe hints */}
              <div className="flex gap-16 text-xs font-black uppercase tracking-widest">
                <motion.span style={{ color: leftColor }}>← {t.diff}</motion.span>
                <motion.span style={{ color: rightColor }}>{t.same} →</motion.span>
              </div>
            </div>
          ) : (
            /* Idle / Game Over */
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="w-full bg-slate-800 border border-slate-700 rounded-3xl p-7">
                {gameState === "over" ? (
                  <>
                    <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1 text-center">Score</p>
                    <p className="text-white font-black text-5xl text-center mb-2 tabular-nums">{streak}</p>
                    <p className="text-slate-500 text-sm text-center mb-7">streak in {currentMode}s</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-white font-black text-xl text-center mb-5">🎯 Color Focus</h2>
                    <div className="bg-slate-900/60 rounded-2xl p-4 mb-6 border border-slate-700">
                      <p className="text-violet-400 text-[10px] font-black uppercase tracking-widest text-center mb-3">
                        How to Play
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black mx-auto mb-1.5">→</div>
                          <p className="text-[10px] font-bold text-slate-400 leading-snug">Swipe RIGHT if word matches ink color</p>
                        </div>
                        <div className="text-center">
                          <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-black mx-auto mb-1.5">←</div>
                          <p className="text-[10px] font-bold text-slate-400 leading-snug">Swipe LEFT if they are different</p>
                        </div>
                      </div>
                      <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest text-center mt-3">
                        Don&apos;t let the word trick you!
                      </p>
                    </div>
                  </>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    disabled={loading}
                    onClick={() => startGame(30)}
                    className="bg-violet-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-violet-500"
                  >
                    {loading && <Loader2 className="animate-spin" size={16} />}
                    {gameState === "over" ? "Play Again" : "30s Mode"}
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => startGame(60)}
                    className="bg-slate-700 border border-slate-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-slate-600"
                  >
                    {loading && <Loader2 className="animate-spin" size={16} />}
                    {gameState === "over" ? "Try 60s" : "60s Mode"}
                  </button>
                  {gameState === "over" && (
                    <Link
                      href="/minigames"
                      className="bg-slate-800 border border-slate-700 text-slate-300 py-4 rounded-2xl font-black text-sm flex items-center justify-center hover:border-slate-500 active:scale-95 transition-all"
                    >
                      Menu
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Keyboard legend — desktop only */}
        <div className="hidden md:flex mt-4 justify-center pointer-events-none">
          <div className="bg-slate-800/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-700 flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <kbd className="px-2 py-1 bg-slate-700 border-b-2 border-slate-600 rounded text-[10px] font-black text-slate-300">SPACE</kbd>
                <span className="text-[10px] font-bold text-slate-600">or</span>
                <kbd className="px-2 py-1 bg-slate-700 border-b-2 border-slate-600 rounded text-[10px] font-black text-slate-300">↑</kbd>
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Start</span>
            </div>
            <div className="w-px h-3 bg-slate-700" />
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <kbd className="px-1.5 py-1 min-w-[1.5rem] flex justify-center bg-slate-700 border-b-2 border-slate-600 rounded text-[10px] font-black text-slate-300">←</kbd>
                <kbd className="px-1.5 py-1 min-w-[1.5rem] flex justify-center bg-slate-700 border-b-2 border-slate-600 rounded text-[10px] font-black text-slate-500">→</kbd>
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Swipe</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
