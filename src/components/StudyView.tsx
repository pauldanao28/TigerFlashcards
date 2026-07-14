"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { calculateGlobalStats } from "@/lib/stats";
import { processReferral } from "@/lib/social";
import { rollingAvg, vocabMastery, JLPT_VOCAB_INCREMENT } from "@/lib/scoring";

import Auth from "@/components/Auth";
import Logo from "@/components/Logo";
import Flashcard from "@/components/Flashcard";
import OnboardingModal from "@/components/OnboardingModal";
import LoadingScreen from "@/components/LoadingScreen";
import CoachMarks from "@/components/CoachMarks";
import { SocialDock } from "@/components/SocialDock";
import SentenceQuiz from "@/components/SentenceQuiz";
import ListeningQuiz from "@/components/ListeningQuiz";
import { FlashcardData } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";
const DAILY_GOAL = 10;

const JLPT_BAR_COLOR: Record<"N5" | "N4" | "N3" | "N2" | "N1", string> = {
  N5: "bg-emerald-500",
  N4: "bg-teal-500",
  N3: "bg-amber-500",
  N2: "bg-orange-500",
  N1: "bg-rose-500",
};
const JLPT_BADGE_COLOR: Record<"N5" | "N4" | "N3" | "N2" | "N1", string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-teal-100 text-teal-700 border-teal-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};

interface StudyCacheEntry {
  userId: string;
  cards: FlashcardData[];
  deckId: string | null;
  currentCard: FlashcardData | null;
}
let _studyCache: StudyCacheEntry | null = null;

function getNextPriorityCard(
  allCards: FlashcardData[],
  lang: "jp" | "en",
  lastCardId?: string,
): FlashcardData | null {
  if (allCards.length === 0) return null;
  const mode = lang === "jp" ? "jp_to_en" : "en_to_jp";

  const getScore = (c: FlashcardData) => c.scores?.[mode]?.percent || 0;
  const getTries = (c: FlashcardData) => c.scores?.[mode]?.total || 0;

  const sorted = [...allCards].sort((a, b) => getScore(a) - getScore(b));
  const hardCards = sorted.slice(0, 10);
  const easyCards = allCards.filter(
    (c) => getScore(c) >= 80 && getTries(c) >= 15,
  );
  const mediumCards = allCards.filter(
    (c) =>
      !hardCards.some((h) => h.id === c.id) &&
      !easyCards.some((e) => e.id === c.id),
  );

  const roll = Math.random();
  let pool =
    roll < 0.65 && hardCards.length
      ? hardCards
      : roll < 0.95 && mediumCards.length
        ? mediumCards
        : easyCards.length
          ? easyCards
          : allCards;

  const filtered = pool.filter((c) => c.id !== lastCardId);
  return filtered.length
    ? filtered[Math.floor(Math.random() * filtered.length)]
    : allCards[0];
}

export default function StudyView() {
  const { user, loading } = useAuth();
  // --- 1. State Management ---
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const cached = _studyCache?.userId === user?.id ? _studyCache : null;
  const hasCachedData = !!cached && cached.cards.length > 0;
  const [cards, setCards] = useState<FlashcardData[]>(() => cached?.cards ?? []);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(() => cached?.currentCard ?? null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(() => cached?.deckId ?? null);

  const [dataLoading, setDataLoading] = useState(!hasCachedData);
  const [aiLoading, setAiLoading] = useState(false); // AI Syncing
  const [hasLoadedOnce, setHasLoadedOnce] = useState(hasCachedData);

  const [language, setLanguage] = useState<"en" | "jp">("jp");
  const [streak, setStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [dailyProgress, setDailyProgress] = useState(0);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [friends, setFriends] = useState<any[]>([]);
  const [showStreakBanner, setShowStreakBanner] = useState(false);
  const [goalStreak, setGoalStreak] = useState(0);
  const goalFired = useRef(false);
  const hasInteracted = useRef(false); // suppresses autoplay on first mount (tab switch)
  const vocabScoreRef = useRef<number>(0);
  const vocabSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showQuiz, setShowQuiz] = useState(false);
  const [showListeningQuiz, setShowListeningQuiz] = useState(false);
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
  const [jlptFilter, setJlptFilter] = useState<"All" | "N5" | "N4" | "N3" | "N2" | "N1">("All");
  const t = translations.en;

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
        setAutoPlayJp(p.auto_play_jp ?? true);
        setAutoPlayEn(p.auto_play_en ?? false);
        setSfxEnabled(p.sfx_enabled ?? true);
        setHasOnboarded(p.has_onboarded);
        setProfileName(p.full_name);
        setIsAdmin(p.is_admin ?? false);
        if (p.vocab_score != null) vocabScoreRef.current = p.vocab_score;

        // 1. Progress check
        const today = new Date().toLocaleDateString("en-CA");
        if (p.last_review_date === today) setDailyProgress(DAILY_GOAL);

        // 2. SAFE STREAK DISPLAY (No Auto-Reset)
        // We simply show whatever is in the DB.
        // We don't call .update() here anymore.
        setStreak(p.streak_count || 0);

        // Hint Logic
        if (
          !p.has_onboarded ||
          localStorage.getItem("show_first_timer_hint") === "true"
        ) {
          setShowHints(true);
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

    const allData: any[] = [];
    let error = null;
    const PAGE_SIZE = 1000;
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error: pageErr } = await supabase
        .from("master_cards")
        .select(
          `
          *,
          deck_cards!inner (deck_id),
          user_scores (scores_json)
        `,
        )
        .eq("deck_cards.deck_id", defaultDeckId)
        .eq("user_scores.user_id", user?.id)
        .range(from, from + PAGE_SIZE - 1);
      if (pageErr) { error = pageErr; break; }
      if (page) allData.push(...page);
      if (!page || page.length < PAGE_SIZE) break;
    }
    const data = allData;

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
          return getNextPriorityCard(flattened, "jp");
        });
        _studyCache = { userId: user.id, cards: flattened, deckId: defaultDeckId, currentCard: null };
      }
    }
    setDataLoading(false);
    setHasLoadedOnce(true);
  }, [user, defaultDeckId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const fetchFriends = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // 1. Get today's date string
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("friendships")
      .select(
        `
    id,
    status,
    user_id,
    friend_id,
    sender:profiles!friendships_user_id_fkey (
      *,
      stats:user_review_counts(count) 
    ),
    receiver:profiles!friendships_friend_id_fkey (
      *,
      stats:user_review_counts(count)
    )
  `,
      )
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
      // 2. Filter the sub-query so it only gets rows for TODAY
      .eq("sender.stats.study_date", today)
      .eq("receiver.stats.study_date", today);

    if (data) {
      const formatted = data
        .map((row: any) => {
          // --- CRITICAL LOGIC START ---
          // A row's 'user_id' is ALWAYS the person who clicked "Add Friend"
          const isSentByMe = row.user_id === user.id;
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
            // NEW LOGIC: Pull from the stats array we just joined
            dailyProgress: friendProfile.stats?.[0]?.count || 0,
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

  useEffect(() => {
    // 1. Initial Load
    fetchFriends();

    // 2. REALTIME: Profile Updates (Online Status & Streaks)
    const profileChannel = supabase
      .channel("profile-updates")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          setFriends((current) =>
            current.map((friend) =>
              friend.id === payload.new.id
                ? {
                    ...friend,
                    isOnline: payload.new.is_online,
                    streak: payload.new.streak_count,
                  }
                : friend,
            ),
          );
        },
      )
      .subscribe();

    // 3. REALTIME: Progress Updates (The New Table)
    const progressChannel = supabase
      .channel("progress-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_review_counts",
        },
        () => {
          // When someone's count changes, we re-fetch to get the new numbers
          fetchFriends();
        },
      )
      .subscribe();

    // 4. REALTIME: Friendship Changes (New requests/Accepts)
    const friendshipChannel = supabase
      .channel("friendship-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "friendships" },
        () => {
          fetchFriends();
        },
      )
      .subscribe();

    // CLEANUP: Remove all three channels
    return () => {
      supabase.removeChannel(profileChannel);
      supabase.removeChannel(progressChannel);
      supabase.removeChannel(friendshipChannel);
    };
  }, []);

  // Keep module-level cache in sync so re-mounting the component skips the loading spinner
  useEffect(() => {
    if (user?.id && cards.length > 0) {
      _studyCache = { userId: user.id, cards, deckId: defaultDeckId, currentCard };
    }
  }, [user?.id, cards, currentCard, defaultDeckId]);

  // --- 6. Interaction Handlers ---
  const updateStreak = async () => {
    if (!user) return;
    const today = new Date().toLocaleDateString("en-CA");
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString("en-CA");

    const { data: p } = await supabase
      .from("profiles")
      .select("streak_count, last_review_date")
      .eq("id", user?.id)
      .single();

    if (!p || p.last_review_date === today) return;

    // The logic only happens here!
    const isContinuous = p.last_review_date === yesterdayStr;
    const newStreak = isContinuous ? (p.streak_count || 0) + 1 : 1;

    await supabase
      .from("profiles")
      .update({ streak_count: newStreak, last_review_date: today })
      .eq("id", user?.id);

    setStreak(newStreak);
    return newStreak;
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
      hasInteracted.current = true;

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

      // 5b. Update local card scores and recompute mastery from full deck
      {
        const updatedCards = cards.map((c) =>
          c.id === currentCard.id ? { ...c, scores: newScores } : c
        );
        setCards(updatedCards);
        const modeKey = language === "jp" ? "jp_to_en" : "en_to_jp";
        const accuracies = updatedCards.map((c) => c.scores?.[modeKey]?.percent ?? 0);
        const newVocabScore = vocabMastery(accuracies, updatedCards.length);
        vocabScoreRef.current = newVocabScore;
        if (vocabSaveTimerRef.current) clearTimeout(vocabSaveTimerRef.current);
        vocabSaveTimerRef.current = setTimeout(() => {
          supabase.from("profiles").update({ vocab_score: newVocabScore }).eq("id", user?.id);
        }, 2000);
      }

      // 6. Progress & Daily Goal
      if (isPass) {
        const prog = dailyProgress + 1;
        setDailyProgress(prog);
        if (prog === DAILY_GOAL && !goalFired.current) {
          goalFired.current = true;
          const newStreak = await updateStreak();
          setGoalStreak(newStreak ?? streak);
          setShowStreakBanner(true);
          setTimeout(() => setShowStreakBanner(false), 4000);
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
      const pool = jlptFilter === "All" ? updatedCards : updatedCards.filter(c => c.jlpt_level === jlptFilter);
      setCurrentCard(getNextPriorityCard(pool.length > 0 ? pool : updatedCards, language, currentCard.id));
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
      jlptFilter,
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

  // Grammar-style mastery per mode: each N-level contributes up to 20 pts
  // (cards with ≥70% on the current side / JLPT increment × 20). Mirrors Dashboard.
  const masteryPercent = useMemo(() => {
    const mode = language === "jp" ? "jp_to_en" : "en_to_jp";
    let raw = 0;
    for (const lvl of ["N5", "N4", "N3", "N2", "N1"] as const) {
      const lvlCards = cards.filter(c => c.jlpt_level === lvl);
      const mastered = lvlCards.filter(c => (c.scores?.[mode]?.percent ?? 0) >= 70).length;
      raw += Math.min(mastered / JLPT_VOCAB_INCREMENT[lvl], 1) * 20;
    }
    return Math.round(raw);
  }, [cards, language]);

  // 4. Dynamic Colors based on mode
  const modeColorClass =
    language === "jp"
      ? "text-indigo-600 bg-indigo-50 border-indigo-100"
      : "text-orange-600 bg-orange-50 border-orange-100";

  // Get the first name from your profileName state, fallback to "Student" or "..."
  const displayName = profileName ? profileName.split(" ")[0] : "";
  const currentLevel = useMemo(
    () => Math.floor(masteryPercent / 10) + 1,
    [masteryPercent],
  );

  const jlptDistribution = useMemo(() => {
    const counts: Record<"N5" | "N4" | "N3" | "N2" | "N1", number> = {
      N5: 0,
      N4: 0,
      N3: 0,
      N2: 0,
      N1: 0,
    };
    for (const c of cards) {
      if (c.jlpt_level && c.jlpt_level in counts) counts[c.jlpt_level]++;
    }
    return counts;
  }, [cards]);
  const jlptTotal = cards.length;
  const dominantJlptLevel = useMemo(() => {
    const levels = (["N5", "N4", "N3", "N2", "N1"] as const);
    return levels.reduce((best, level) =>
      jlptDistribution[level] > jlptDistribution[best] ? level : best, levels[0]);
  }, [jlptDistribution]);
  const [showJlptBreakdown, setShowJlptBreakdown] = useState(false);
  const prevMasteryRef = useRef<{ percent: number; lang: "jp" | "en"; filter: string } | null>(null);
  const [levelUpToast, setLevelUpToast] = useState<{ level: string; lang: "jp" | "en"; direction: "up" | "down"; filter?: string } | null>(null);

  const filteredCards = useMemo(
    () => jlptFilter === "All" ? cards : cards.filter(c => c.jlpt_level === jlptFilter),
    [cards, jlptFilter],
  );

  // Mastery % for the selected N-level (known cards ≥70% in current mode / total at that level)
  const jlptLevelMastery = useMemo(() => {
    if (jlptFilter === "All" || filteredCards.length === 0) return null;
    const mode = language === "jp" ? "jp_to_en" : "en_to_jp";
    const known = filteredCards.filter(c => (c.scores?.[mode]?.percent ?? 0) >= 70).length;
    return Math.round((known / filteredCards.length) * 100);
  }, [filteredCards, jlptFilter, language]);

  // Level-up detection: track whichever % is visible — per-N-level when filtered, overall when "All"
  const trackedPercent = jlptFilter !== "All" ? (jlptLevelMastery ?? masteryPercent) : masteryPercent;
  useEffect(() => {
    const prev = prevMasteryRef.current;
    if (prev === null || prev.lang !== language || prev.filter !== jlptFilter) {
      prevMasteryRef.current = { percent: trackedPercent, lang: language, filter: jlptFilter };
      return;
    }
    if (trackedPercent > prev.percent) {
      setLevelUpToast({ level: `${trackedPercent}%`, lang: language, direction: "up", filter: jlptFilter !== "All" ? jlptFilter : undefined });
      navigator.vibrate?.([60, 40, 100]);
      setTimeout(() => setLevelUpToast(null), 4000);
    } else if (trackedPercent < prev.percent) {
      setLevelUpToast({ level: `${trackedPercent}%`, lang: language, direction: "down", filter: jlptFilter !== "All" ? jlptFilter : undefined });
      navigator.vibrate?.([30, 60, 30]);
      setTimeout(() => setLevelUpToast(null), 4000);
    }
    prevMasteryRef.current = { percent: trackedPercent, lang: language, filter: jlptFilter };
  }, [trackedPercent, language, jlptFilter]);

  // Reset to a card from the new pool whenever the filter changes
  useEffect(() => {
    if (filteredCards.length === 0) return;
    setCurrentCard(getNextPriorityCard(filteredCards, language));
    setIsFlipped(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jlptFilter]);

  return (
    <>
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

        {/* Level Toast (Up / Down) */}
        <AnimatePresence>
          {levelUpToast && (
            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed bottom-24 md:bottom-12 left-0 right-0 z-[200] flex justify-center pointer-events-none px-6"
            >
              <motion.div
                animate={levelUpToast.direction === "up" ? {
                  boxShadow: [
                    "0 0 0 0px rgba(99,102,241,0)",
                    "0 0 0 10px rgba(99,102,241,0.12)",
                    "0 0 0 0px rgba(99,102,241,0)",
                  ],
                } : {}}
                transition={{ duration: 1.4, repeat: 2, ease: "easeInOut" }}
                className={`relative overflow-hidden bg-white rounded-3xl shadow-2xl border px-8 py-5 flex items-center gap-5 max-w-sm w-full ${
                  levelUpToast.direction === "up"
                    ? "border-indigo-100 shadow-indigo-200/50"
                    : "border-amber-100 shadow-amber-200/40"
                }`}
              >
                {/* Shimmer sweep on level up */}
                {levelUpToast.direction === "up" && (
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "250%" }}
                    transition={{ duration: 0.75, delay: 0.2, ease: "easeOut" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent pointer-events-none z-10"
                  />
                )}

                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: levelUpToast.direction === "up" ? -30 : 15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 450, damping: 14, delay: 0.08 }}
                  className={`shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
                    levelUpToast.direction === "up" ? "bg-indigo-50" : "bg-amber-50"
                  }`}
                >
                  {levelUpToast.direction === "up" ? "🎖️" : "📉"}
                </motion.div>

                {/* Text */}
                <div className="flex flex-col gap-1 z-10">
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.18 }}
                    className="text-slate-800 font-black text-sm uppercase tracking-widest leading-none"
                  >
                    {levelUpToast.direction === "up" ? "Level Up!" : "Level Down"}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.28 }}
                    className={`font-bold text-[11px] uppercase tracking-wider leading-none mt-1 ${
                      levelUpToast.direction === "up" ? "text-indigo-500" : "text-amber-500"
                    }`}
                  >
                    {levelUpToast.filter ? `${levelUpToast.filter} · ` : ""}
                    {levelUpToast.lang === "jp" ? "🇯🇵 Recognition" : "🇺🇸 Recall"} is now{" "}
                    <span className="font-black">{levelUpToast.level}</span>
                  </motion.p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Streak Banner */}
        <AnimatePresence>
          {showStreakBanner && (
            <motion.div
              initial={{ opacity: 0, y: 80, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 80, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed bottom-24 md:bottom-12 left-0 right-0 z-[200] flex justify-center pointer-events-none px-6"
            >
              <div className="bg-white rounded-3xl shadow-2xl shadow-emerald-100/60 border border-emerald-100 px-8 py-5 flex items-center gap-5 max-w-sm w-full">
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-2xl">
                    🎉
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-white">
                    <div className="w-full h-full rounded-full bg-emerald-500 animate-ping opacity-75" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-slate-800 font-black text-sm uppercase tracking-widest leading-none">
                    {t.daily_goal_met}
                  </p>
                  <p className="text-emerald-600 font-bold text-[11px] uppercase tracking-wider leading-none mt-1">
                    🔥 {goalStreak} {t.days} {t.streak}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- 1. MOBILE NAVIGATION --- */}
        <div className="md:hidden sticky top-0 w-full z-50 px-4 py-4 flex justify-between items-start bg-slate-50/80 backdrop-blur-md">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex items-center gap-3">
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
                    animate={{ width: `${masteryPercent}%` }}
                    className={`h-full transition-all duration-1000 ${language === "jp" ? "bg-indigo-500" : "bg-orange-500"}`}
                  />
                </div>
                <span className="text-[9px] font-black text-slate-500 min-w-[28px] text-right">
                  {masteryPercent}%
                </span>
              </div>
              {jlptTotal > 0 && (
                <button
                  onClick={() => setShowJlptBreakdown(true)}
                  className="flex items-center gap-2 mt-0.5 active:scale-95 transition-transform"
                >
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden flex bg-slate-200">
                    {jlptFilter !== "All" ? (
                      <div className={`h-full rounded-full ${JLPT_BAR_COLOR[jlptFilter]}`} style={{ width: `${jlptLevelMastery ?? 0}%` }} />
                    ) : (["N5", "N4", "N3", "N2", "N1"] as const).map((level) => {
                      const pct = (jlptDistribution[level] / jlptTotal) * 100;
                      if (pct === 0) return null;
                      return <div key={level} className={JLPT_BAR_COLOR[level]} style={{ width: `${pct}%` }} />;
                    })}
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${jlptFilter !== "All" ? JLPT_BADGE_COLOR[jlptFilter].split(" ")[1] : "text-slate-500"}`}>
                    {jlptFilter !== "All"
                      ? `${jlptFilter} ${jlptLevelMastery ?? 0}%`
                      : `${dominantJlptLevel} ${Math.round((jlptDistribution[dominantJlptLevel] / jlptTotal) * 100)}%`}
                  </span>
                </button>
              )}
            </div>
            </div>
          </div>
          {/* Mode toggle — top right */}
          <button
            onClick={() => setLanguage((l) => (l === "jp" ? "en" : "jp"))}
            className={`pointer-events-auto flex flex-col items-center gap-0.5 px-3 py-2 rounded-2xl border font-black transition-all active:scale-95 ${
              language === "jp"
                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                : "bg-orange-50 border-orange-100 text-orange-600"
            }`}
          >
            <span className="text-base leading-none">{language === "jp" ? "🇯🇵" : "🇺🇸"}</span>
            <span className="text-[8px] uppercase tracking-widest leading-none">
              {language === "jp" ? t.recognition : t.recall}
            </span>
          </button>
        </div>

        {/* --- 2. DESKTOP NAVIGATION --- */}
        <div className="hidden md:flex relative top-0 w-full z-50 px-8 py-8 items-center justify-between pointer-events-auto">
          {/* Mode toggle — desktop top right */}
          <button
            onClick={() => setLanguage((l) => (l === "jp" ? "en" : "jp"))}
            className={`absolute right-8 top-8 flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl border font-black transition-all hover:scale-105 active:scale-95 shadow-sm ${
              language === "jp"
                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                : "bg-orange-50 border-orange-100 text-orange-600"
            }`}
          >
            <span className="text-lg leading-none">{language === "jp" ? "🇯🇵" : "🇺🇸"}</span>
            <span className="text-[9px] uppercase tracking-widest leading-none">
              {language === "jp" ? t.recognition : t.recall}
            </span>
          </button>
          <div className="flex items-center gap-6 h-14">
            <Link href="/" className="hover:opacity-80 transition-opacity">
              <Logo className="w-12 h-14" />
            </Link>
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
                      animate={{ width: `${masteryPercent}%` }}
                      className={`h-full shadow-[0_0_12px_rgba(0,0,0,0.1)] transition-all duration-1000 ${language === "jp" ? "bg-indigo-500" : "bg-orange-500"}`}
                    />
                  </div>
                  <div className="flex flex-col items-end min-w-[45px]">
                    <span
                      className={`text-sm font-black leading-none ${language === "jp" ? "text-indigo-600" : "text-orange-600"}`}
                    >
                      {masteryPercent}%
                    </span>
                  </div>
                </div>
                {jlptTotal > 0 && (
                  <button
                    onClick={() => setShowJlptBreakdown(true)}
                    className="flex items-center gap-2.5 -mt-0.5 hover:opacity-80 active:scale-95 transition-all"
                  >
                    <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-slate-200">
                      {jlptFilter !== "All" ? (
                        <div className={`h-full rounded-full ${JLPT_BAR_COLOR[jlptFilter]}`} style={{ width: `${jlptLevelMastery ?? 0}%` }} />
                      ) : (["N5", "N4", "N3", "N2", "N1"] as const).map((level) => {
                        const pct = (jlptDistribution[level] / jlptTotal) * 100;
                        if (pct === 0) return null;
                        return <div key={level} className={JLPT_BAR_COLOR[level]} style={{ width: `${pct}%` }} />;
                      })}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${jlptFilter !== "All" ? JLPT_BADGE_COLOR[jlptFilter].split(" ")[1] : "text-slate-500"}`}>
                      {jlptFilter !== "All"
                        ? `${jlptFilter} ${jlptLevelMastery ?? 0}%`
                        : `${dominantJlptLevel} ${Math.round((jlptDistribution[dominantJlptLevel] / jlptTotal) * 100)}%`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* --- 3. MAIN STUDY AREA (PULLED UP FOR MOBILE) --- */}
        <div className="flex-1 w-full flex flex-col items-center justify-start md:justify-center min-h-0 px-4 pt-10 md:pt-0 gap-2 md:gap-12">
          {/* pt-20: This provides a safe "buffer" for the absolute streak 
            on mobile so it doesn't hide under the header. 
        */}
          {/* HUD & ACCURACY STACK - MUST BE RELATIVE */}
          <div className="relative z-10 flex flex-col items-center gap-2 mb-2 md:mb-6 w-full animate-in fade-in slide-in-from-top-2 duration-700">
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

            {/* Accuracy info */}
            {!dataLoading && cards.length > 0 && currentCard && (
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] text-center">
                {language === "jp" ? `🇯🇵 ${t.recognition}` : `🇺🇸 ${t.recall}`}
                {" | "}
                <span className="font-black text-slate-300">
                  {currentCard.scores?.[language === "jp" ? "jp_to_en" : "en_to_jp"]?.percent || 0}% {t.accuracy}
                </span>
              </span>
            )}
          </div>

          {/* --- 3b. CARD ANCHOR (Locked Position) --- */}
          <div className="w-full flex-1 flex flex-col justify-center items-center relative min-h-0 pt-2 md:pt-0">
            <div className="w-full flex justify-center relative">
              {/* THE "LOCKED" BOX: 
        1. 'aspect-[3/4]' + 'w-full' + 'max-w-...' creates the same shape on all screens.
        2. 'overflow-hidden' + 'rounded-[2.5rem]' is the "Cookie Cutter" that 
           clips the CoachMarks so they can't be longer than the card.
    */}
              <div className="relative isolate bg-transparent w-full max-w-[80vw] sm:max-w-[360px] aspect-[3/4] rounded-[2.5rem]">
                {/* --- COACHMARKS OVERLAY --- */}
                <AnimatePresence>
                  {showHints && !dataLoading && <CoachMarks />}
                </AnimatePresence>
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
                {(dataLoading && !hasLoadedOnce && cards.length === 0) ||
                aiLoading ? (
                  <div className="w-full h-full aspect-[3/4] bg-white rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse">
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
                    autoPlayJp={autoPlayJp && hasInteracted.current}
                    autoPlayEn={autoPlayEn && hasInteracted.current}
                    sfxEnabled={sfxEnabled}
                    isFlipped={isFlipped}
                    onFlip={setIsFlipped}
                    audioPulse={audioPulse}
                  />
                ) : !dataLoading && cards.length === 0 && hasLoadedOnce ? (
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
                ) : (
                  <div className="w-full h-full bg-white rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse">
                    <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                      {t.syncing_deck}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* --- 4. BOTTOM BUTTONS (LOWERED) --- */}
        {!dataLoading && cards.length > 0 && currentCard && (
          <div className="w-full flex justify-center pt-4 pb-28 md:pb-16 lg:pb-24">
            {/* pb-28: Clears fixed BottomNav (h-14) + home bar on mobile.
              md:pb-16: Standard desktop height (BottomNav is hidden on md+).
              lg:pb-24: Extra breathing room for larger MacBook screens.
          */}
            <div className="w-full max-w-md flex gap-4 px-6 mb-safe">
              <button
                onClick={() => { navigator.vibrate?.([30, 60, 30]); handleScore(false); }}
                className="flex-1 py-4 md:py-5 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
              >
                ✕ {t.fail}
              </button>
              <button
                onClick={() => { navigator.vibrate?.([80]); handleScore(true); }}
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
                {t.flip_control}
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
        {isSocialOpen && profileName && user?.id && (
          <SocialDock
            userId={user.id}
            username={profileName}
            friends={friends}
            onClose={() => setIsSocialOpen(false)}
            fetchFriends={fetchFriends}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showQuiz && user?.id && (
          <SentenceQuiz userId={user.id} isAdmin={isAdmin} onClose={() => setShowQuiz(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showListeningQuiz && user?.id && (
          <ListeningQuiz userId={user.id} isAdmin={isAdmin} onClose={() => setShowListeningQuiz(false)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showJlptBreakdown && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[210] bg-black/20"
              onClick={() => setShowJlptBreakdown(false)}
            />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[211] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 p-6 w-full sm:max-w-sm"
              style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-slate-800 font-black text-sm uppercase tracking-tight">{t.by_level}</p>
                <button onClick={() => setShowJlptBreakdown(false)} className="text-slate-300 hover:text-slate-500">✕</button>
              </div>
              {/* Filter chips */}
              <div className="flex gap-2 mb-5 flex-wrap">
                {(["All", "N5", "N4", "N3", "N2", "N1"] as const).map((lvl) => {
                  const isActive = jlptFilter === lvl;
                  const isAll = lvl === "All";
                  return (
                    <button
                      key={lvl}
                      onClick={() => { setJlptFilter(lvl); setShowJlptBreakdown(false); }}
                      className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                        isActive
                          ? isAll
                            ? "bg-slate-800 text-white border-slate-800"
                            : `${JLPT_BAR_COLOR[lvl]} text-white border-transparent`
                          : isAll
                            ? "bg-slate-50 text-slate-500 border-slate-200"
                            : JLPT_BADGE_COLOR[lvl]
                      }`}
                    >
                      {lvl}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3">
                {(["N5", "N4", "N3", "N2", "N1"] as const).map((level) => {
                  const count = jlptDistribution[level];
                  const pct = jlptTotal > 0 ? Math.round((count / jlptTotal) * 100) : 0;
                  return (
                    <div key={level} className="flex items-center gap-3">
                      <span className={`shrink-0 w-9 text-[10px] px-1.5 py-0.5 rounded-md border font-black text-center uppercase tracking-tighter ${JLPT_BADGE_COLOR[level]}`}>
                        {level}
                      </span>
                      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${JLPT_BAR_COLOR[level]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="shrink-0 w-20 text-right text-xs font-black text-slate-600">
                        {count} <span className="text-slate-400 font-bold">· {pct}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

{
  /* <div className="w-full flex justify-center relative">
            <div className="w-full max-w-[85vw] sm:max-w-[360px] aspect-[3/4] max-h-[40dvh] sm:max-h-[480px] relative"> */
}
