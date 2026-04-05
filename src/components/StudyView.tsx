"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import { calculateGlobalStats } from "@/lib/stats";
import { processReferral } from "@/lib/social";

import Auth from "@/components/Auth";
import Logo from "@/components/Logo";
import Flashcard from "@/components/Flashcard";
import LanguageToggle from "@/components/LanguageToggle";
import OnboardingModal from "@/components/OnboardingModal";
import CoachMarks from "@/components/CoachMarks";
import { SocialDock } from "@/components/SocialDock";
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
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);

  const [isFlipped, setIsFlipped] = useState(false);
  const [audioPulse, setAudioPulse] = useState(0);
  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [showHints, setShowHints] = useState(false);
  const [swipeFeedback, setSwipeFeedback] = useState<{
    percent: number;
    isPass: boolean;
  } | null>(null);
  const { t, setLang } = useLang();

  useEffect(() => {
    const checkReferral = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const refName = localStorage.getItem("tg_referrer");

      if (user && refName) {
        // 1. Quick check: Are they already linked?
        const { data: alreadyReferred } = await supabase
          .from("referrals")
          .select("id")
          .eq("referred_id", user.id)
          .maybeSingle();

        if (!alreadyReferred) {
          console.log("Found pending referral for:", refName);
          await processReferral(user.id, refName);

          // Optional: Trigger a refresh of your friends list
          // if you have a local state for it
          if (typeof fetchFriends === "function") fetchFriends();
        } else {
          // If they were already referred, we should clear the stale item anyway
          localStorage.removeItem("tg_referrer");
        }
      }
    };

    checkReferral();
  }, []);

  // --- 3. Profile & Deck Fetching (The "Waterfall" Start) ---
  useEffect(() => {
    if (!user) return;

    const fetchUserEnvironment = async () => {
      // Fetch Profile & Deck in parallel for speed
      const [profileRes, deckRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user?.id).maybeSingle(),
        supabase
          .from("decks")
          .select("id")
          .eq("user_id", user?.id)
          .eq("is_default", true)
          .maybeSingle(),
      ]);

      if (profileRes.data) {
        const p = profileRes.data;
        setStreak(p.streak_count || 0);
        setAutoPlayJp(p.auto_play_jp ?? true);
        setAutoPlayEn(p.auto_play_en ?? false);
        setSfxEnabled(p.sfx_enabled ?? true);
        setHasOnboarded(p.has_onboarded);
        setStreak(p.max_streak || 0);
        setProfileName(p.full_name);

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
      .eq("user_scores.user_id", user?.id);

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

  useEffect(() => {
    const fetchFriends = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("friendships")
        .select(
          `
        id,
        status,
        user_id,
        friend_id,
        sender:profiles!friendships_user_id_fkey (*),
        receiver:profiles!friendships_friend_id_fkey (*)
      `,
        )
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

      if (data) {
        const formatted = data
          .map((row: any) => {
            // --- CRITICAL LOGIC START ---
            // A row's 'user_id' is ALWAYS the person who clicked "Add Friend"
            const isSentByMe = row.user_id === user.id;
            console.log(isSentByMe);
            // If I sent it, my friend is the 'receiver'.
            // If THEY sent it, my friend is the 'sender'.
            const friendProfile = isSentByMe ? row.receiver : row.sender;
            // --- CRITICAL LOGIC END ---

            if (!friendProfile) return null;

            return {
              friendshipId: row.id,
              id: friendProfile.id,
              name: friendProfile.full_name,
              avatar:
                friendProfile.avatar_url ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendProfile.id}`,
              status: row.status,
              isSentByMe: isSentByMe,
              // Add these if you display them in the list
              dailyProgress: friendProfile.cards_completed_today || 0,
              goal: friendProfile.daily_goal || 10,
              streak: friendProfile.streak_count || 0,
              isOnline: friendProfile.is_online,
            };
          })
          .filter((f): f is any => f !== null)
          // FINAL FILTER: If there's a duplicate ID, keep only the one we need
          .filter(
            (item, index, self) =>
              index === self.findIndex((t) => t.id === item.id),
          );

        setFriends(formatted);
      }
    };

    fetchFriends();

    // 2. REALTIME SUBSCRIPTION: Profile Updates (Progress bars)
    const profileChannel = supabase
      .channel("social-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setFriends((current) =>
            current.map((friend) =>
              friend.id === payload.new.id
                ? {
                    ...friend,
                    dailyProgress: payload.new.cards_completed_today,
                    isOnline: payload.new.is_online,
                    streak: payload.new.streak_count,
                  }
                : friend,
            ),
          );
        },
      )
      .subscribe();

    // 3. REALTIME SUBSCRIPTION: Friendship Changes (New requests/Accepts)
    const friendshipChannel = supabase
      .channel("friendship-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        (payload) => {
          fetchFriends();
        },
      )
      .subscribe();

    // CLEANUP: Remove both channels
    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(friendshipChannel);
    };
  }, []);

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
      .eq("id", user?.id)
      .single();
    if (!p || p.last_review_date === today) return;

    const newStreak =
      p.last_review_date === yesterdayStr ? p.streak_count + 1 : 1;
    await supabase
      .from("profiles")
      .update({ streak_count: newStreak, last_review_date: today })
      .eq("id", user?.id);
    setStreak(newStreak);
  };

  const incrementStudyCount = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Calls the Postgres function we just created
    const { error } = await supabase.rpc("increment_daily_review", {
      target_user_id: user?.id,
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

      // Ensure the specific mode stats exist (This is the NaN preventer)
      const stats = s[mode] || { pass: 0, fail: 0, total: 0, percent: 0 };

      const nextPass = isPass ? (stats.pass || 0) + 1 : stats.pass || 0;
      const nextTotal = (stats.total || 0) + 1;

      // Final check to ensure we aren't dividing by zero (though total + 1 prevents this)
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
          .eq("id", user?.id);
      }

      // 5. Database Sync (Upsert Score)
      await supabase.from("user_scores").upsert(
        {
          user_id: user?.id,
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

        // Update your profile in the DB
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("profiles")
            .update({
              cards_completed_today: cardsCompleted + 1,
              is_online: true,
            })
            .eq("id", user.id);
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

  // 1. Calculate Global Stats using your common function (or inline)
  const globalStats = useMemo(() => calculateGlobalStats(cards), [cards]);

  // 2. Select the current mode's data
  const currentMode = language === "jp" ? globalStats.jp : globalStats.en;

  // 3. Simple percentage calculation
  //   const accuracyPercent =
  //     currentMode.tries > 0
  //       ? Math.round((currentMode.pass / currentMode.tries) * 100)
  //       : 0;

  // 3. Diminishing Buffer Calculation
  const accuracyPercent = useMemo(() => {
    // If they haven't tried any cards, stay at 0%
    if (currentMode.tries === 0) return 0;

    // Buffer starts at 20 and shrinks as they play.
    // It hits 0 once they have 20 tries.
    const buffer = Math.max(0, 200 - currentMode.tries);

    // Calculate percentage with the shrinking buffer
    const raw = (currentMode.pass / (currentMode.tries + buffer)) * 100;

    // Round it and cap at 100
    return Math.min(100, Math.round(raw));
  }, [currentMode.pass, currentMode.tries]);

  // 4. Dynamic Colors based on mode
  const modeColorClass =
    language === "jp"
      ? "text-indigo-600 bg-indigo-50 border-indigo-100"
      : "text-orange-600 bg-orange-50 border-orange-100";

  // Get the first name from your profileName state, fallback to "Student" or "..."
  const displayName = profileName ? profileName.split(" ")[0] : "";
  const currentLevel = useMemo(
    () => Math.floor(accuracyPercent / 10) + 1,
    [accuracyPercent],
  );

  return (
    <>
      {" "}
      {/* 1. Add the opening fragment here */}
      <main className="fixed inset-0 h-[100dvh] w-full bg-slate-50 flex flex-col items-center overflow-hidden touch-none font-sans select-none pb-safe">
        {hasOnboarded === false && (
          <OnboardingModal
            defaultName={
              user?.user_metadata?.full_name || user?.user_metadata?.name || ""
            }
            userId={user?.id || ""}
            onComplete={(added) =>
              added ? window.location.reload() : setHasOnboarded(true)
            }
          />
        )}

        {/* --- 1. MOBILE NAVIGATION --- */}
        <div className="md:hidden sticky top-0 w-full z-50 px-4 py-4 flex justify-between items-start bg-slate-50/80 backdrop-blur-md">
          <div className="flex items-center gap-3 pointer-events-auto">
            <Link href="/" className="active:scale-95 transition-transform">
              <Logo className="w-10 h-12" />
            </Link>
            <div className="flex flex-col gap-1.5 bg-white/80 backdrop-blur-md px-3 py-2 rounded-2xl border border-white shadow-sm min-w-[170px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase tracking-tight text-slate-800 italic leading-none truncate max-w-[80px]">
                  {profileName?.split(" ")[0] || ""}
                </span>
                <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
                  {t.mastery}
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="relative flex-1 h-1.5 bg-slate-200/50 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${accuracyPercent}%` }}
                    className={`h-full transition-all duration-1000 ${language === "jp" ? "bg-indigo-500" : "bg-orange-500"}`}
                  />
                </div>
                <span className="text-[9px] font-black text-slate-500 min-w-[28px] text-right">
                  {accuracyPercent}%
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 pointer-events-auto">
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
            {/* NEW: Social Toggle */}
            <button
              onClick={() => setIsSocialOpen(!isSocialOpen)}
              className="bg-white h-9 w-9 md:h-11 md:w-11 rounded-full shadow-sm border border-slate-200 flex items-center justify-center hover:border-black transition-all active:scale-95"
            >
              <span className="text-sm md:text-lg">👥</span>
            </button>
          </div>
        </div>

        {/* --- 2. DESKTOP NAVIGATION --- */}
        <div className="hidden md:flex relative top-0 w-full z-50 px-8 py-8 items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-6 h-14">
            <Link
              href="/"
              className="flex items-center gap-5 hover:opacity-80 transition-opacity"
            >
              <Logo className="w-12 h-14" />
              <div className="flex items-center gap-5 bg-white px-6 py-4 rounded-[2rem] border-2 border-slate-50 shadow-xl shadow-slate-200/50 backdrop-blur-md">
                <div className="flex flex-col gap-2 min-w-[220px]">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-base font-black uppercase tracking-tighter text-slate-900 italic">
                      {profileName || ""}
                    </span>
                    <div
                      className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${language === "jp" ? "bg-indigo-50 border-indigo-100 text-indigo-600" : "bg-orange-50 border-orange-100 text-orange-600"}`}
                    >
                      <span>{t.mastery}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${accuracyPercent}%` }}
                        className={`h-full shadow-[0_0_12px_rgba(0,0,0,0.1)] transition-all duration-1000 ${language === "jp" ? "bg-indigo-500" : "bg-orange-500"}`}
                      />
                    </div>
                    <div className="flex flex-col items-end min-w-[45px]">
                      <span
                        className={`text-sm font-black leading-none ${language === "jp" ? "text-indigo-600" : "text-orange-600"}`}
                      >
                        {accuracyPercent}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <div className="h-11 flex items-center min-w-[200px]">
              <LanguageToggle language={language} setLanguage={setLanguage} />
            </div>
            <Link
              href="/stats"
              className="bg-white h-11 px-8 rounded-full shadow-sm border border-slate-100 flex items-center gap-3 hover:border-slate-300 transition-all active:scale-95"
            >
              <span className="text-xl leading-none">📊</span>
              <span className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
                {t.stats}
              </span>
            </Link>
            {/* NEW: Social Toggle */}
            <button
              onClick={() => setIsSocialOpen(!isSocialOpen)}
              className="bg-white h-9 w-9 md:h-11 md:w-11 rounded-full shadow-sm border border-slate-200 flex items-center justify-center hover:border-black transition-all active:scale-95"
            >
              <span className="text-sm md:text-lg">👥</span>
            </button>
          </div>
        </div>
        {/* --- 3. MAIN STUDY AREA (PULLED UP FOR MOBILE) --- */}
        <div className="flex-1 w-full flex flex-col items-center justify-start md:justify-center min-h-0 px-4 pt-10 md:pt-0">
          {/* pt-20: This provides a safe "buffer" for the absolute streak 
            on mobile so it doesn't hide under the header. 
        */}
          {/* HUD & ACCURACY STACK - MUST BE RELATIVE */}
          <div className="relative z-10 flex flex-col items-center gap-2 mb-6 w-full animate-in fade-in slide-in-from-top-2 duration-700">
            {/* --- 1. SESSION STREAK (FIXED PROPERTY NAME) --- */}
            {sessionStreak >= 3 && (
              <div className="absolute -top-8 left-0 right-0 flex justify-center pointer-events-none">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0, y: 10 }}
                  animate={{
                    scale: 1,
                    opacity: 1,
                    y: [0, -6, 0],
                    boxShadow: [
                      // <--- Changed from shadow to boxShadow
                      "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                      "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                      "0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)",
                    ],
                  }}
                  transition={{
                    y: {
                      duration: 3.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                    boxShadow: {
                      // <--- Changed from shadow to boxShadow
                      duration: 3.5,
                      repeat: Infinity,
                      ease: "easeInOut",
                    },
                    default: { duration: 0.7 },
                  }}
                  className="flex items-center gap-2 bg-white/70 backdrop-blur-sm px-4 py-1.5 rounded-full border border-orange-100 mb-1"
                >
                  <span className="text-lg">🔥</span>
                  <span className="font-black text-slate-800 tracking-tight text-[11px] uppercase">
                    {sessionStreak} {t.in_a_row}
                  </span>
                </motion.div>
              </div>
            )}

            {/* Daily Goal / Goal Met (Simple, No Background) */}
            <div className="flex flex-col items-center min-h-[32px] justify-center">
              {dailyProgress < DAILY_GOAL ? (
                <div className="flex flex-col items-center">
                  <div className="w-24 h-1 bg-slate-200 rounded-full overflow-hidden mb-1.5">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${(dailyProgress / DAILY_GOAL) * 100}%`,
                      }}
                      className="h-full bg-emerald-500 transition-all duration-500"
                    />
                  </div>
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    {t.goal}: {dailyProgress}/{DAILY_GOAL}
                  </p>
                </div>
              ) : (
                /* --- MINIMALIST STATUS --- */
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 py-1"
                >
                  {/* Minimalist Pulsing Dot */}
                  <div className="relative w-1.5 h-1.5">
                    <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25" />
                    <div className="relative w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  </div>

                  {/* Clean Typography */}
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em] leading-none">
                    {t.daily_goal_met}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Accuracy Label (Directly above the card) */}
            {!dataLoading && cards.length > 0 && currentCard && (
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] text-center">
                {language === "jp" ? `🇯🇵 ${t.recognition}` : `🇺🇸 ${t.recall}`} |{" "}
                <span className="font-black text-slate-300">
                  {currentCard.scores?.[
                    language === "jp" ? "jp_to_en" : "en_to_jp"
                  ]?.percent || 0}
                  % {t.accuracy}
                </span>
              </span>
            )}
          </div>

          {/* --- 3b. CARD ANCHOR (Locked Position) --- */}
          <div className="w-full flex justify-center relative">
            <div className="w-full max-w-[85vw] sm:max-w-[360px] aspect-[3/4] max-h-[40dvh] sm:max-h-[480px] relative">
              {/* SWIPE FEEDBACK OVERLAY */}
              <AnimatePresence>
                {swipeFeedback && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: -20 }}
                    exit={{ opacity: 0, scale: 1.1, y: -60 }}
                    className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
                  >
                    <div
                      className={`px-6 py-3 rounded-full font-black text-2xl shadow-2xl border-2 ${
                        swipeFeedback.isPass
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : "bg-rose-500 text-white border-rose-400"
                      }`}
                    >
                      {swipeFeedback.percent}%
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Flashcard Logic */}
              {(dataLoading || aiLoading) && !hasLoadedOnce ? (
                <div className="w-full h-full bg-white rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse">
                  <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    {t.syncing_deck}
                  </p>
                </div>
              ) : cards.length > 0 && currentCard ? (
                <Flashcard
                  key={currentCard.id}
                  card={currentCard}
                  language={language}
                  userId={user?.id || ""}
                  onSwipe={onSwipe}
                  autoPlayJp={autoPlayJp}
                  autoPlayEn={autoPlayEn}
                  sfxEnabled={sfxEnabled}
                  isFlipped={isFlipped}
                  onFlip={setIsFlipped}
                  audioPulse={audioPulse}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 p-8 text-center">
                  <div className="text-4xl mb-3">📭</div>
                  <h3 className="text-slate-800 font-black text-lg mb-1 italic uppercase leading-none">
                    {t.empty_deck}
                  </h3>
                  <Link
                    href="/stats"
                    className="text-white font-black bg-indigo-600 px-6 py-3 rounded-xl shadow-lg uppercase text-[10px] mt-4"
                  >
                    {t.get_started}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* --- 4. BOTTOM BUTTONS (LOWERED) --- */}
        {!dataLoading && cards.length > 0 && currentCard && (
          <div className="w-full flex justify-center pt-4 pb-12 md:pb-16 lg:pb-24">
            {/* pb-12: Pushes buttons UP on mobile to clear the home bar/keyboard.
              md:pb-16: Standard desktop height.
              lg:pb-24: Extra breathing room for larger MacBook screens.
          */}
            <div className="w-full max-w-md flex gap-4 px-6 mb-safe">
              <button
                onClick={() => handleScore(false)}
                className="flex-1 py-4 md:py-5 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
              >
                ✕ {t.fail}
              </button>
              <button
                onClick={() => handleScore(true)}
                className="flex-1 py-4 md:py-5 bg-emerald-500 text-white rounded-2xl font-black border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
              >
                ✓ {t.pass}
              </button>
            </div>
          </div>
        )}

        {/* Keyboard Legend */}
        <div className="hidden md:flex fixed bottom-8 w-full justify-center pointer-events-none z-0">
          <div className="bg-white/80 backdrop-blur-sm px-4 py-2 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-6">
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
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-slate-100 border-b-2 border-slate-300 rounded text-[10px] font-black text-slate-500 italic">
                ENTER
              </kbd>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                🔊
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
                {t.score}
              </span>
            </div>
          </div>
        </div>
      </main>
      {/* 2. Move AnimatePresence here, now it's a sibling to <main> */}
      <AnimatePresence>
        {isSocialOpen && (
          <SocialDock
            username={profileName}
            isOpen={isSocialOpen}
            friends={friends}
            onClose={() => setIsSocialOpen(false)}
            fetchFriends={fetchFriends}
          />
        )}
      </AnimatePresence>
    </>
  );
}
