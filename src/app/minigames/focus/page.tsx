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
import { useLang } from "@/context/LanguageContext";
import { supabase } from "@/lib/supabase";

const COLORS = [
  { name_en: "RED", name_jp: "赤", hex: "#ef4444" },
  { name_en: "BLUE", name_jp: "青", hex: "#3b82f6" },
  { name_en: "GREEN", name_jp: "緑", hex: "#22c55e" },
  { name_en: "YELLOW", name_jp: "黄色", hex: "#eab308" },
  { name_en: "PURPLE", name_jp: "紫", hex: "#a855f7" },
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

  if (error) {
    console.error("Score update failed:", error.message);
    return false;
  }
  return true;
};

export default function StroopSwipeGame() {
  const { t, lang } = useLang();

  const [user, setUser] = useState<any>(null);
  const [dbScores, setDbScores] = useState({ best30s: 0, best60s: 0 });
  const [loading, setLoading] = useState(true);

  const [language, setLanguage] = useState<"en" | "jp">("jp");
  const [currentWord, setCurrentWord] = useState(COLORS[0]);
  const [inkColor, setInkColor] = useState(COLORS[1]);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameState, setGameState] = useState<"idle" | "playing" | "over">(
    "idle",
  );
  const [gameKey, setGameKey] = useState(Date.now());
  const [currentMode, setCurrentMode] = useState<30 | 60 | null>(null);

  // Motion Values
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-20, 20]);
  const opacity = useTransform(x, [-150, -100, 0, 100, 150], [0, 1, 1, 1, 0]);
  const leftColor = useTransform(x, [-100, -20], ["#fb7185", "#cbd5e1"]);
  const rightColor = useTransform(x, [20, 100], ["#cbd5e1", "#10b981"]);

  useEffect(() => {
    const initSession = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("minigame_focus_best_30s, minigame_focus_best_60s")
          .eq("id", currentUser.id)
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
    initSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentMode === 30) setMaxStreak(dbScores.best30s);
    if (currentMode === 60) setMaxStreak(dbScores.best60s);
  }, [currentMode, dbScores]);

  const nextChallenge = useCallback(() => {
    // Force reset x value immediately
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
    if (!currentMode || streak <= 0) return;

    if (user?.id) {
      const isNewBest =
        streak > (currentMode === 30 ? dbScores.best30s : dbScores.best60s);
      if (isNewBest) {
        const success = await updateMinigameBest(user.id, currentMode, streak);
        if (success) {
          setDbScores((prev) => ({
            ...prev,
            [currentMode === 30 ? "best30s" : "best60s"]: streak,
          }));
        }
      }
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
      // RESET POSITION BEFORE NEXT CARD
      x.set(0);
      nextChallenge();
    } else {
      triggerGameOver();
    }
  };

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      handleAnswer(true);
    } else if (info.offset.x < -threshold) {
      handleAnswer(false);
    } else {
      // If they didn't swipe far enough, Framer resets it naturally
      // but we force x back to 0 just in case
      x.set(0);
    }
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

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Game logic
      if (gameState === "playing") {
        if (e.key === "ArrowLeft") {
          x.set(-100);
          handleAnswer(false);
        } else if (e.key === "ArrowRight") {
          x.set(100);
          handleAnswer(true);
        }
      } else {
        // Start game shortcuts
        if (e.key === " " || e.key === "ArrowUp") {
          e.preventDefault(); // Prevent page jump
          startGame(30); // Default to 30s on shortcut
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, handleAnswer, startGame, x]);

  return (
    // 1. Changed p-6 to p-4 and min-h-[600px] to h-screen to lock the viewport
    <div className="max-w-md mx-auto p-4 font-sans select-none overflow-hidden h-screen max-h-screen touch-none overscroll-none flex flex-col">
      {/* Header / Back - Reduced mb-8 to mb-2 */}
      <Link
        href="/stats"
        className="flex items-center gap-1 text-slate-400 hover:text-slate-600 mb-2 transition-colors w-fit"
      >
        <ChevronLeft size={20} strokeWidth={3} />
        <span className="text-xs font-black uppercase tracking-widest">
          {t.back}
        </span>
      </Link>

      {/* Score Row - Reduced mb-10 to mb-4 */}
      <div className="flex justify-between mb-4 px-2">
        <div className="text-2xl font-black text-slate-800">{timeLeft}s</div>
        <div className="text-right">
          <div className="text-[10px] font-black text-slate-400 uppercase leading-none">
            {t.best}
          </div>
          <div className="text-2xl font-black text-indigo-600">{maxStreak}</div>
        </div>
      </div>

      {/* MOVED LANGUAGE TOGGLE ABOVE THE GAME AREA */}
      <div className="flex justify-center mb-4">
        <button
          onClick={() => setLanguage((l) => (l === "en" ? "jp" : "en"))}
          className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest border border-indigo-100 active:scale-95 transition-all"
        >
          {t.language}: {language.toUpperCase()}
        </button>
      </div>

      {/* Main Content Area - Flex-1 to push footer down */}
      <div className="flex-1 flex flex-col">
        {gameState === "playing" ? (
          // Adjusted container height to 340px to fit within viewport
          <div className="relative h-[340px] flex flex-col items-center justify-center">
            <div className="mb-4 text-xs font-black text-indigo-400 uppercase tracking-widest">
              {t.streak}: {streak}
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={gameKey}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={handleDragEnd}
                style={{ x, rotate, opacity }}
                initial={{ x: 0, scale: 0.9, opacity: 0 }}
                animate={{ x: 0, scale: 1, opacity: 1 }}
                exit={{
                  x: x.get() > 0 ? 300 : -300,
                  opacity: 0,
                  transition: { duration: 0.2 },
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                // REDUCED CARD HEIGHT: Changed h-96 to h-72
                className="w-full h-72 bg-white rounded-[40px] shadow-2xl border border-slate-100 flex items-center justify-center cursor-grab active:cursor-grabbing"
              >
                <div
                  // REDUCED TEXT SIZE: text-7xl for better fit
                  className="text-7xl font-black pointer-events-none tracking-tighter"
                  style={{ color: inkColor.hex }}
                >
                  {language === "en"
                    ? currentWord.name_en
                    : currentWord.name_jp}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-8 flex gap-12 text-xs font-black uppercase tracking-widest">
              <motion.span style={{ color: leftColor }}>← {t.diff}</motion.span>
              <motion.span style={{ color: rightColor }}>
                {t.same} →
              </motion.span>
            </div>
          </div>
        ) : (
          // Start/Game Over Screen - Reduced py-14 to py-8
          <div className="text-center py-8 bg-white rounded-[40px] shadow-xl border border-slate-50 px-6">
            <h2 className="text-3xl font-black text-slate-900 mb-6 leading-tight">
              {gameState === "over" ? "❌ " + t.game_over : t.focus_swipe_game}
            </h2>

            {/* --- INSTRUCTIONS KEPT (Slightly tighter spacing) --- */}
            {gameState !== "over" && (
              <div className="mb-6 space-y-4 bg-slate-50 p-5 rounded-3xl border border-slate-100">
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">
                  {lang === "en" ? "How to Play" : "遊び方"}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                      →
                    </div>
                    <p className="text-[10px] font-bold text-slate-600 leading-tight">
                      {lang === "en"
                        ? "SWIPE RIGHT if Word matches Color"
                        : "色の名前とインクの色が同じなら右へ"}
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black">
                      ←
                    </div>
                    <p className="text-[10px] font-bold text-slate-600 leading-tight">
                      {lang === "en"
                        ? "SWIPE LEFT if they are Different"
                        : "違っていたら左へスワイプ"}
                    </p>
                  </div>
                </div>

                <p className="text-[9px] font-black text-slate-400 uppercase italic">
                  {lang === "en"
                    ? "Don't let the word trick you!"
                    : "文字にだまされないで！"}
                </p>
              </div>
            )}

            {gameState === "over" && (
              <div className="mb-6 space-y-3">
                <p className="text-lg font-bold text-slate-500">
                  {t.final_streak} {streak}
                </p>
              </div>
            )}

            {/* Buttons - Reduced gap from 4 to 3 */}
            <div className="flex flex-col gap-3">
              <button
                disabled={loading}
                onClick={() => startGame(30)}
                className="bg-indigo-600 text-white py-4 rounded-3xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {loading && <Loader2 className="animate-spin" size={20} />}
                30s {t.mode}
              </button>
              <button
                disabled={loading}
                onClick={() => startGame(60)}
                className="bg-slate-900 text-white py-4 rounded-3xl font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {loading && <Loader2 className="animate-spin" size={20} />}
                60s {t.mode}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts Legend - Desktop Only */}
      <div className="hidden md:flex fixed bottom-6 left-0 w-full justify-center pointer-events-none">
        <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500">
                SPACE
              </kbd>
              <span className="text-[10px] font-bold text-slate-300 uppercase">
                or
              </span>
              <kbd className="px-2 py-1 bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500">
                ↑
              </kbd>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t.start || "START"}
            </span>
          </div>
          <div className="w-[1px] h-3 bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              <kbd className="px-1.5 py-1 min-w-[1.5rem] flex justify-center bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500">
                ←
              </kbd>
              <kbd className="px-1.5 py-1 min-w-[1.5rem] flex justify-center bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500">
                →
              </kbd>
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {t.score || "SWIPE"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
