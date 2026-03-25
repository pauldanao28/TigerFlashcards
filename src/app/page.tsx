"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";

import Flashcard from "@/components/Flashcard";
import LanguageToggle from "@/components/LanguageToggle";
import OnboardingModal from "@/components/OnboardingModal";
import CoachMarks from "@/components/CoachMarks";
import Auth from "@/components/Auth";
import { FlashcardData } from "@/lib/types";

const DAILY_GOAL = 10;

export default function Home() {
  // --- 1. State Management ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [hasOnboarded, setHasOnboarded] = useState<boolean | null>(null);

  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);

  const [dataLoading, setDataLoading] = useState(true); // Cards loading
  const [aiLoading, setAiLoading] = useState(false); // AI Syncing

  const [language, setLanguage] = useState<"en" | "jp">("jp");
  const [streak, setStreak] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [dailyProgress, setDailyProgress] = useState(0);

  const [autoPlayJp, setAutoPlayJp] = useState(true);
  const [autoPlayEn, setAutoPlayEn] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const { t, setLang } = useLang();

  // --- 2. Auth Listener ---
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsAuthLoaded(true);
    });
    return () => subscription.unsubscribe();
  }, []);

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

    setDataLoading(true);
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
      if (flattened.length > 0) setCurrentCard(getNextPriorityCard(flattened));
    }
    setDataLoading(false);
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

  const handleScore = async (isPass: boolean) => {
    if (!currentCard || !user) return;

    const newSessionStreak = isPass ? sessionStreak + 1 : 0;
    setSessionStreak(newSessionStreak);
    incrementStudyCount(); // Add today's study count

    // If this session just broke the all-time record, update the profile
    // We compare against the 'streak' state (which we fetched from profiles.streak_count/max_streak earlier)
    if (isPass && newSessionStreak > streak) {
      setStreak(newSessionStreak); // Update local UI immediately
      await supabase
        .from("profiles")
        .update({ max_streak: newSessionStreak }) // Make sure this column exists in SQL!
        .eq("id", user.id);
    }

    const mode = language === "jp" ? "jp_to_en" : "en_to_jp";
    const s = currentCard.scores || {
      jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
      en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
    };

    const stats = s[mode];
    const updatedStats = {
      ...stats,
      pass: isPass ? stats.pass + 1 : stats.pass,
      fail: !isPass ? stats.fail + 1 : stats.fail,
      total: stats.total + 1,
      percent: Math.round(
        ((isPass ? stats.pass + 1 : stats.pass) / (stats.total + 1)) * 100,
      ),
    };

    const newScores = { ...s, [mode]: updatedStats };

    await supabase.from("user_scores").upsert(
      {
        user_id: user.id,
        card_id: currentCard.id,
        scores_json: newScores,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,card_id" },
    );

    if (isPass) {
      const prog = dailyProgress + 1;
      setDailyProgress(prog);
      if (prog === DAILY_GOAL) {
        updateStreak();
        alert(t.daily_streak_extended);
      }
    }

    const updatedCards = cards.map((c) =>
      c.id === currentCard.id ? { ...c, scores: newScores } : c,
    );
    setCards(updatedCards);
    setCurrentCard(getNextPriorityCard(updatedCards, currentCard.id));
  };

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
    handleScore(direction === "right");
  };

  // --- 8. Render Guards ---
  if (!isAuthLoaded)
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-bold text-slate-400">
        {t.loading_session}
      </div>
    );
  if (!user) return <Auth />;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center p-4 overflow-hidden font-sans">
      {hasOnboarded === false && (
        <OnboardingModal
          userId={user.id}
          onComplete={(added) =>
            added ? window.location.reload() : setHasOnboarded(true)
          }
        />
      )}

      {/* Top Navigation */}
      <div className="fixed top-5 left-0 w-full px-4 z-50 pointer-events-none flex items-center justify-between md:top-8 md:px-8 md:justify-end md:gap-4">
        <div className="pointer-events-auto scale-90 origin-left">
          <LanguageToggle language={language} setLanguage={setLanguage} />
        </div>
        <div className="pointer-events-auto">
          <Link
            href="/stats"
            className="bg-white px-4 py-2 rounded-full shadow-sm font-bold text-slate-600 border border-slate-100 flex items-center gap-2 h-10 transition-transform active:scale-95"
          >
            📊 {t.stats}
          </Link>
        </div>
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center mt-28 md:mt-14">
        {/* HUD / Progress Area */}
        {/* CHANGE: 
    h-24 mb-6 (Mobile: more breathing room) 
    md:h-20 md:mb-3 (Desktop: restored to original compact size) 
  */}
        <div className="w-full h-24 mb-6 flex flex-col items-center justify-end relative md:h-20 md:mb-3">
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
                {/* w-40 for mobile, w-32 for desktop */}
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
              <div className="bg-emerald-100 border border-emerald-200 px-5 py-2 rounded-full animate-pulse md:px-4 md:py-1">
                <p className="text-[11px] font-black text-emerald-700 uppercase md:text-[10px]">
                  {t.daily_goal_met}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Card Main Logic */}
        {dataLoading || aiLoading ? (
          <div className="w-80 h-[28rem] bg-white rounded-[2.5rem] border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse gap-4">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">
              {t.syncing_deck}
            </p>
          </div>
        ) : currentCard ? (
          <div className="flex flex-col items-center gap-6">
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              {language === "jp" ? `🇯🇵 ${t.recognition}}` : `🇺🇸 ${t.recall}`} |{" "}
              {currentCard.scores?.[language === "jp" ? "jp_to_en" : "en_to_jp"]
                ?.percent || 0}
              % {t.accuracy}
            </span>
            <div className="relative">
              {showHints && cards.length > 0 && (
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
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center p-10 bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200 w-80 h-[28rem] flex flex-col justify-center items-center gap-6">
            <div className="text-5xl">📭</div>
            <div>
              <p className="text-slate-800 font-black text-xl mb-2">
                {t.empty_deck}
              </p>
              <p className="text-slate-400 text-sm mb-6">{t.start_journey}</p>
            </div>
            <Link
              href="/stats"
              className="text-white font-bold bg-indigo-600 px-8 py-3 rounded-2xl shadow-lg shadow-indigo-100 transition-transform active:scale-95"
            >
              {t.get_started}
            </Link>
          </div>
        )}

        {/* Action Buttons */}
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
      </div>
    </main>
  );
}
