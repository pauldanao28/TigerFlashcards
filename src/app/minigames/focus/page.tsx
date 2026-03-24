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
  return (
    // INCREASED CONTAINER: changed max-w-sm to max-w-md
    <div className="max-w-md mx-auto p-6 font-sans select-none overflow-hidden min-h-[600px] touch-none overscroll-none">
      {/* Header / Back */}
      <Link
        href="/stats"
        className="flex items-center gap-1 text-slate-400 hover:text-slate-600 mb-8 transition-colors w-fit"
      >
        <ChevronLeft size={20} strokeWidth={3} />
        <span className="text-xs font-black uppercase tracking-widest">
          {t.back}
        </span>
      </Link>

      {/* Score Row */}
      <div className="flex justify-between mb-10 px-2">
        <div className="text-2xl font-black text-slate-800">{timeLeft}s</div>
        <div className="text-right">
          <div className="text-[10px] font-black text-slate-400 uppercase leading-none">
            {t.best}
          </div>
          <div className="text-2xl font-black text-indigo-600">{maxStreak}</div>
        </div>
      </div>

      {gameState === "playing" ? (
        // INCREASED HEIGHT: changed h-80 to h-[400px]
        <div className="relative h-[400px] flex flex-col items-center justify-center">
          <div className="mb-6 text-xs font-black text-indigo-400 uppercase tracking-widest">
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
                x: x.get() > 0 ? 300 : -300, // Further exit for wider container
                opacity: 0,
                transition: { duration: 0.2 },
              }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              // UPDATED CARD: w-full h-96 for a massive swipe area
              className="w-full h-96 bg-white rounded-[48px] shadow-2xl border border-slate-100 flex items-center justify-center cursor-grab active:cursor-grabbing"
            >
              <div
                // UPDATED TEXT: text-8xl for that big "Stroop" impact
                className="text-8xl font-black pointer-events-none tracking-tighter"
                style={{ color: inkColor.hex }}
              >
                {language === "en" ? currentWord.name_en : currentWord.name_jp}
              </div>
            </motion.div>
          </AnimatePresence>

          <div className="mt-12 flex gap-16 text-xs font-black uppercase tracking-widest">
            <motion.span style={{ color: leftColor }}>← {t.diff}</motion.span>
            <motion.span style={{ color: rightColor }}>{t.same} →</motion.span>
          </div>
        </div>
      ) : (
        // Start/Game Over Screen (Updated to match new width)
        <div className="text-center py-14 bg-white rounded-[48px] shadow-xl border border-slate-50 px-8">
          <h2 className="text-4xl font-black text-slate-900 mb-8 leading-tight">
            {gameState === "over" ? "❌ " + t.game_over : t.focus_swipe_game}
          </h2>

          {/* --- NEW INSTRUCTIONS SECTION --- */}
          {gameState !== "over" && (
            <div className="mb-8 space-y-4 bg-slate-50 p-6 rounded-3xl border border-slate-100">
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em]">
                {lang === "en" ? "How to Play" : "遊び方"}
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                    →
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 leading-tight">
                    {lang === "en"
                      ? "SWIPE RIGHT if Word matches Color"
                      : "色の名前とインクの色が同じなら右へ"}
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black">
                    ←
                  </div>
                  <p className="text-[11px] font-bold text-slate-600 leading-tight">
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
            <div className="mb-8 space-y-3">
              <p className="text-lg font-bold text-slate-500">
                {t.final_streak} {streak}
              </p>
              {streak >= maxStreak && streak > 0 && (
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1.1 }}>
                  <span className="text-xs font-black bg-emerald-100 text-emerald-600 px-4 py-2 rounded-full uppercase tracking-tighter">
                    {t.minigame_focus_new_best}
                  </span>
                </motion.div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              disabled={loading}
              onClick={() => startGame(30)}
              className="bg-indigo-600 text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {loading && <Loader2 className="animate-spin" size={20} />}
              30s {t.mode}
            </button>
            <button
              disabled={loading}
              onClick={() => startGame(60)}
              className="bg-slate-900 text-white py-5 rounded-3xl font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {loading && <Loader2 className="animate-spin" size={20} />}
              60s {t.mode}
            </button>
          </div>
        </div>
      )}

      {/* Footer Toggle */}
      <div className="mt-16 text-center">
        <button
          onClick={() => setLanguage((l) => (l === "en" ? "jp" : "en"))}
          className="text-sm font-black text-slate-400 underline decoration-2 underline-offset-8"
        >
          {t.language}: {language.toUpperCase()}
        </button>
      </div>
    </div>
  );
}
