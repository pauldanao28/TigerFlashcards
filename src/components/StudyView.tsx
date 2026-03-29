"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";

import Flashcard from "@/components/Flashcard";
import LanguageToggle from "@/components/LanguageToggle";
import OnboardingModal from "@/components/OnboardingModal";
import CoachMarks from "@/components/CoachMarks";
import Auth from "@/components/Auth";
import Logo from "@/components/Logo";
import { FlashcardData } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

const DAILY_GOAL = 10;

export default function StudyView() {
  const { user, loading } = useAuth();
  // --- 1. State Management ---
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);

  const [dataLoading, setDataLoading] = useState(true); // Cards loading
  const [aiLoading, setAiLoading] = useState(false); // AI Syncing
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [language, setLanguage] = useState<"en" | "jp">("jp");
  const [streak, setStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [dailyProgress, setDailyProgress] = useState(0);

  const [isFlipped, setIsFlipped] = useState(false);
  const [audioPulse, setAudioPulse] = useState(0);
  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [swipeFeedback, setSwipeFeedback] = useState<{
    percent: number;
    isPass: boolean;
  } | null>(null);
  const { t, setLang } = useLang();

  // --- 3. Profile & Deck Fetching (The "Waterfall" Start) ---
  useEffect(() => {
    if (!user) return;

    const fetchUserEnvironment = async () => {
      // Fetch Profile & Deck in parallel for speed
      const [profileRes, deckRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase
          .from("decks")
          .select("id")
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
        setStreak(p.streak_count || 0);
        setAutoPlayJp(p.auto_play_jp ?? true);
        setAutoPlayEn(p.auto_play_en ?? false);
        setHasOnboarded(p.has_onboarded);
        setStreak(p.max_streak || 0);

        // Check if goal already met today
        const today = new Date().toISOString().split("T")[0];
        if (p.last_review_date === today) setDailyProgress(DAILY_GOAL);

        // Hint Logic
        if (
          !p.has_onboarded ||
          localStorage.getItem("show_first_timer_hint") === "true"
        ) {
          setShowHints(true);
        }

        if (p.preferred_language) {
          setLang(p.preferred_language);
        }
      }

      if (deckRes.data) {
        setDefaultDeckId(deckRes.data.id);
      } else {
        // If deck missing but onboarded, we have an issue. Handled by dataLoading state.
        setDefaultDeckId(null);
      }
    };

    fetchUserEnvironment();
  }, [user]);

  // --- 4. Card Fetching (Triggers when Deck is ready) ---
  const fetchInitialData = useCallback(async () => {
    if (!user || !defaultDeckId) {
      setDataLoading(false);
      return;
    }
    // 🔥 FIX 1: Only show the "Syncing Deck" spinner if we have NO cards.
    // If we already have cards, we fetch in the background silently.
    if (cards.length === 0) {
      setDataLoading(true);
    }

    const { data, error } = await supabase
      .from("master_cards")
      .select(
        `
        *,
        deck_cards!inner (deck_id),
        user_scores (scores_json)
      `,
      )
      .eq("deck_cards.deck_id", defaultDeckId)
      .eq("user_scores.user_id", user.id);

    if (!error && data) {
      const flattened = data.map((card: any) => ({
        ...card,
        scores: card.user_scores?.[0]?.scores_json || {
          jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
          en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
        },
      }));
      setCards(flattened);
      if (flattened.length > 0) {
        // ✅ FIX: Only pick a new card if we don't already have one on screen.
        // This prevents the card from "jumping" when you return to the tab.
        setCurrentCard((prev) => {
          if (prev) return prev; // Keep the card that was already there
          return getNextPriorityCard(flattened);
        });
      }
    }
    setDataLoading(false);
    setHasLoadedOnce(true);
  }, [user, defaultDeckId, language]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // --- 5. Spaced Repetition Logic ---
  const getNextPriorityCard = (
    allCards: FlashcardData[],
    lastCardId?: string,
  ) => {
    if (allCards.length === 0) return null;
    const mode = language === "jp" ? "jp_to_en" : "en_to_jp";

    const getScore = (c: FlashcardData) => c.scores?.[mode]?.percent || 0;
    const getTries = (c: FlashcardData) => c.scores?.[mode]?.total || 0;

    const sorted = [...allCards].sort((a, b) => getScore(a) - getScore(b));
    const hardCards = sorted.slice(0, 10);
    const easyCards = allCards.filter(
      (c) => getScore(c) >= 85 && getTries(c) >= 15,
    );
    const mediumCards = allCards.filter(
      (c) =>
        !hardCards.some((h) => h.id === c.id) &&
        !easyCards.some((e) => e.id === c.id),
    );

    const roll = Math.random();
    let pool =
      roll < 0.7 && hardCards.length
        ? hardCards
        : roll < 0.9 && mediumCards.length
          ? mediumCards
          : easyCards.length
            ? easyCards
            : allCards;

    const filtered = pool.filter((c) => c.id !== lastCardId);
    return filtered.length
      ? filtered[Math.floor(Math.random() * filtered.length)]
      : allCards[0];
  };

  // --- 6. Interaction Handlers ---
  const updateStreak = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: p } = await supabase
      .from("profiles")
      .select("streak_count, last_review_date")
      .eq("id", user.id)
      .single();
    if (!p || p.last_review_date === today) return;

    const newStreak =
      p.last_review_date === yesterdayStr ? p.streak_count + 1 : 1;
    await supabase
      .from("profiles")
      .update({ streak_count: newStreak, last_review_date: today })
      .eq("id", user.id);
    setStreak(newStreak);
  };

  const incrementStudyCount = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Calls the Postgres function we just created
    const { error } = await supabase.rpc("increment_daily_review", {
      target_user_id: user.id,
    });

    if (error) console.error("Error incrementing daily count:", error);
  };
  const handleScore = useCallback(
    async (isPass: boolean) => {
      if (!currentCard || !user) return;

      // 1. Calculate Score Updates
      const mode = language === "jp" ? "jp_to_en" : "en_to_jp";
      const s = currentCard.scores || {
        jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
        en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
      };

      const stats = s[mode];
      const nextPass = isPass ? stats.pass + 1 : stats.pass;
      const nextTotal = stats.total + 1;
      const nextPercent = Math.round((nextPass / nextTotal) * 100);

      const updatedStats = {
        ...stats,
        pass: nextPass,
        fail: !isPass ? stats.fail + 1 : stats.fail,
        total: nextTotal,
        percent: nextPercent,
      };

      const newScores = { ...s, [mode]: updatedStats };

      // 2. Trigger UI Feedback (Floating Percentage)
      setSwipeFeedback({ percent: nextPercent, isPass });
      setTimeout(() => setSwipeFeedback(null), 800);

      // 3. Update Session Logic
      const newSessionStreak = isPass ? sessionStreak + 1 : 0;
      setSessionStreak(newSessionStreak);
      incrementStudyCount();

      // 4. Update Profile Max Streak (Only if current session breaks record)
      if (isPass && newSessionStreak > streak) {
        setStreak(newSessionStreak);
        await supabase
          .from("profiles")
          .update({ max_streak: newSessionStreak })
          .eq("id", user.id);
      }

      // 5. Database Sync (Upsert Score)
      await supabase.from("user_scores").upsert(
        {
          user_id: user.id,
          card_id: currentCard.id,
          scores_json: newScores,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,card_id" },
      );

      // 6. Progress & Daily Goal
      if (isPass) {
        const prog = dailyProgress + 1;
        setDailyProgress(prog);
        if (prog === DAILY_GOAL) {
          updateStreak();
          alert(t.daily_streak_extended); // Keep alert or use a toast
        }
      }

      // 7. UI Cleanup & Next Card
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      const updatedCards = cards.map((c) =>
        c.id === currentCard.id ? { ...c, scores: newScores } : c,
      );

      setCards(updatedCards);
      setCurrentCard(getNextPriorityCard(updatedCards, currentCard.id));
      setIsFlipped(false);
    },
    [
      currentCard,
      user,
      cards,
      language,
      dailyProgress,
      streak,
      sessionStreak,
      t,
    ],
  );
  // Add the dependencies used inside the function

  // --- 7. AI Sync Logic ---
  useEffect(() => {
    const syncAI = async () => {
      if (currentCard?.english === "Pending AI Sync") {
        setAiLoading(true);
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({ words: [currentCard.japanese] }),
          });
          const data = await res.json();
          const fetched = Array.isArray(data) ? data[0] : data;

          await supabase
            .from("master_cards")
            .update({ ...fetched })
            .eq("id", currentCard.id);
          const updated = { ...currentCard, ...fetched };
          setCurrentCard(updated);
          setCards((prev) =>
            prev.map((c) => (c.id === currentCard.id ? updated : c)),
          );
        } catch (e) {
          console.error(e);
        } finally {
          setAiLoading(false);
        }
      }
    };
    syncAI();
  }, [currentCard?.id]);

  const onSwipe = (direction: "left" | "right") => {
    if (showHints) {
      setShowHints(false);
      localStorage.removeItem("show_first_timer_hint");
    }

    // 🔥 IMPORTANT: Reset the flip state so the NEXT card
    // starts on the front side, whether swiped by mouse or thumb.
    setIsFlipped(false);
    handleScore(direction === "right");
  };

  // Keyboard Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ignore if typing or if key is being held down (auto-repeat)
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.repeat
      ) {
        return;
      }

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          setAudioPulse((prev) => prev + 1);
          break;
        case "ArrowUp":
        case " ": // Spacebar support
          e.preventDefault();
          setIsFlipped((prev) => !prev);
          break;

        case "ArrowRight":
          e.preventDefault();
          handleScore(true);
          // Note: handleScore already calls setIsFlipped(false) in your logic,
          // but keeping it here is a safe double-check.
          setIsFlipped(false);
          break;

        case "ArrowLeft":
          e.preventDefault();
          handleScore(false);
          setIsFlipped(false);
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleScore]); // Removed isFlipped because we use the functional update (prev => !prev)

  return (
    <main className="fixed inset-0 h-[100dvh] w-full bg-slate-50 flex flex-col items-center p-4 overflow-hidden touch-none font-sans select-none">
      {hasOnboarded === false && (
        <OnboardingModal
          defaultName={
            user.user_metadata?.full_name || user.user_metadata?.name || ""
          }
          userId={user.id}
          onComplete={(added) =>
            added ? window.location.reload() : setHasOnboarded(true)
          }
        />
      )}
      {/* --- MOBILE NAVIGATION (Top-Right Stack) --- */}
      <div className="md:hidden fixed top-4 left-0 w-full z-50 pointer-events-none px-4 flex justify-between items-start">
        <Logo className="w-10 h-12 pointer-events-auto active:scale-95 transition-transform" />

        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {/* Matched h-9 for slightly better tap targets than h-8 */}
          <div className="h-9 w-32">
            <LanguageToggle language={language} setLanguage={setLanguage} />
          </div>

          <Link
            href="/stats"
            className="bg-white h-9 w-32 rounded-full shadow-sm border border-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
          >
            <span className="text-xs">📊</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
              {t.stats}
            </span>
          </Link>
        </div>
      </div>
      {/* --- 2. DESKTOP NAVIGATION (Single-Line Layout) --- */}
      <div className="hidden md:flex fixed top-8 left-0 w-full z-50 pointer-events-none px-8 items-center justify-between">
        {/* Left: Logo */}
        <div className="pointer-events-auto flex items-center h-12">
          <Link href="/" className="block hover:scale-105 transition-transform">
            <Logo className="w-10 h-12" />
          </Link>
        </div>

        {/* Right: Controls Group */}
        <div className="flex items-center gap-6 pointer-events-auto">
          {/* 1. Language Toggle - Removed width restriction, increased height */}
          <div className="h-11 flex items-center min-w-[200px]">
            <LanguageToggle language={language} setLanguage={setLanguage} />
          </div>

          {/* 2. Stats Button - Matched to h-11 with more padding */}
          <Link
            href="/stats"
            className="bg-white h-11 px-8 rounded-full shadow-sm border border-slate-100 flex items-center gap-3 hover:border-slate-300 transition-all active:scale-95"
          >
            <span className="text-xl leading-none">📊</span>
            <span className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
              {t.stats}
            </span>
          </Link>
        </div>
      </div>
      <div className="relative flex-1 w-full max-w-md flex flex-col items-center justify-center pt-10 md:pt-0">
        {/* HUD / Progress Area */}
        <div className="w-full h-16 mb-2 flex flex-col items-center justify-end relative md:h-20 md:mb-8">
          {sessionStreak >= 3 && (
            <div className="absolute top-0 flex items-center gap-2 bg-white px-5 py-2 rounded-full shadow-xl border border-orange-100 animate-bounce z-40 md:top-4">
              <span className="text-xl">🔥</span>
              <span className="font-black text-slate-800 tracking-tight text-sm uppercase">
                {sessionStreak} {t.in_a_row}
              </span>
            </div>
          )}

          <div className="pb-2 text-center md:pb-1">
            {dailyProgress < DAILY_GOAL ? (
              <>
                <div className="w-40 h-2 bg-slate-200 rounded-full overflow-hidden shadow-inner mx-auto mb-2 md:w-32 md:h-1.5 md:mb-1">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(dailyProgress / DAILY_GOAL) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest md:text-[9px]">
                  {t.goal}: {dailyProgress}/{DAILY_GOAL}
                </p>
              </>
            ) : (
              /* SUCCESS STATE: Non-distracting and compact */
              <div className="flex items-center justify-center gap-1.5 opacity-80 group">
                {/* The dot feels more "active" if it's slightly brighter while the text stays neutral */}
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] md:text-[8px]">
                  {t.daily_goal_met}
                </p>
              </div>
            )}
          </div>
        </div>
        {/* Card Main Logic */}
        {/* 1. LOADING STATE: Only show if an active process is in flight */}
        {(dataLoading || aiLoading) && !hasLoadedOnce ? (
          <div className="w-80 h-[28rem] bg-white rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
              {t.syncing_deck}
            </p>
          </div>
        ) : cards.length > 0 && currentCard ? (
          /* 2. ACTIVE CARD STATE: Show when we have data */
          <div className="flex flex-col items-center gap-6">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">
              {language === "jp" ? `🇯🇵 ${t.recognition}` : `🇺🇸 ${t.recall}`} |{" "}
              {currentCard.scores?.[language === "jp" ? "jp_to_en" : "en_to_jp"]
                ?.percent || 0}
              % {t.accuracy}
            </span>
            <div className="relative">
              {/* --- SWIPE FEEDBACK OVERLAY --- */}
              <AnimatePresence>
                {swipeFeedback && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: -40 }}
                    exit={{ opacity: 0, scale: 1.1, y: -100 }}
                    className={`absolute inset-0 z-[100] flex items-center justify-center pointer-events-none`}
                  >
                    <div
                      className={`
                      px-6 py-3 rounded-full font-black text-2xl shadow-2xl border-2
                      ${
                        swipeFeedback.isPass
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : "bg-rose-500 text-white border-rose-400"
                      }
                    `}
                    >
                      {swipeFeedback.percent}%
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {showHints && (
                <CoachMarks onDismiss={() => setShowHints(false)} />
              )}
              <div className={showHints ? "animate-wobble" : ""}>
                <Flashcard
                  key={currentCard.id}
                  card={currentCard}
                  language={language}
                  userId={user.id}
                  onSwipe={onSwipe}
                  autoPlayJp={autoPlayJp}
                  autoPlayEn={autoPlayEn}
                  isFlipped={isFlipped} // New Prop
                  onFlip={setIsFlipped} // New Prop
                  audioPulse={audioPulse}
                />
              </div>
            </div>
          </div>
        ) : hasLoadedOnce && cards.length === 0 ? (
          /* 3. ACTUAL EMPTY STATE: Show when loading is finished AND cards are zero */
          <div className="text-center p-10 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 w-80 h-[28rem] flex flex-col justify-center items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
            <div className="text-5xl opacity-40">📭</div>
            <div>
              <h3 className="text-slate-800 font-black text-xl mb-2 italic uppercase tracking-tighter">
                {t.empty_deck}
              </h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
                {t.start_journey}
              </p>
            </div>
            <Link
              href="/stats"
              className="text-white font-black bg-indigo-600 px-8 py-4 rounded-2xl shadow-xl shadow-indigo-100 transition-all active:scale-95 uppercase tracking-widest text-xs"
            >
              {t.get_started}
            </Link>
          </div>
        ) : null}
        {/* 4. NEUTRAL STATE: Prevents flickering before the very first render */}
        {/* Action Buttons */}
        {!dataLoading && cards.length > 0 && currentCard && (
          <div className="flex gap-4 w-full py-6">
            <button
              onClick={() => handleScore(false)}
              className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-[1.5rem] font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-sm tracking-widest"
            >
              ✕ {t.fail}
            </button>
            <button
              onClick={() => handleScore(true)}
              className="flex-1 py-4 bg-emerald-500 text-white rounded-[1.5rem] font-black border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all uppercase text-sm tracking-widest"
            >
              ✓ {t.pass}
            </button>
          </div>
        )}
      </div>
      {/* Keyboard Shortcuts Legend - Desktop Only */}
      <div className="hidden md:flex fixed bottom-6 left-0 w-full justify-center pointer-events-none">
        <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Flip Controls */}
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
              {t.flip}
            </span>
          </div>

          <div className="w-[1px] h-3 bg-slate-200" />

          {/* NEW: Audio Control */}
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500 italic">
              ENTER
            </kbd>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              🔊
            </span>
          </div>

          <div className="w-[1px] h-3 bg-slate-200" />

          {/* Scoring Controls */}
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
              {t.score}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
