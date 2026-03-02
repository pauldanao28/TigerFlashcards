"use client";
import { useState, useEffect } from 'react';
import Flashcard from '@/components/Flashcard';
import LanguageToggle from '@/components/LanguageToggle';
import { FlashcardData } from '@/lib/types';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Auth from '@/components/Auth';
import { User } from '@supabase/supabase-js';

export default function Home() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [language, setLanguage] = useState<'en' | 'jp'>('jp');
  const [streak, setStreak] = useState(0);
const [bestStreak, setBestStreak] = useState(0);
const [user, setUser] = useState<User | null>(null);
const [dailyProgress, setDailyProgress] = useState(0);
const DAILY_GOAL = 10; 

// Fetch Profile Data on Load
useEffect(() => {
  const fetchProfile = async () => {
    // 1. Safety Check: If no user, don't even try
    if (!user?.id) return;

    const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  if (data) {
    setStreak(data.streak_count);
    
    // CHECK: If the last_review_date is TODAY, 
    // set progress to 10 so the UI shows the goal is met.
    const today = new Date().toISOString().split('T')[0];
    if (data.last_review_date === today) {
      setDailyProgress(DAILY_GOAL); 
    }
  }
  };

  fetchProfile();
}, [user?.id]); // Watch for the specific ID to change


const updateStreak = async () => {
  if (!user?.id) return;

  const today = new Date().toISOString().split('T')[0];
  
  // 1. Get current profile
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('streak_count, last_review_date')
    .eq('id', user.id)
    .single();

  if (error || !profile) return;

  const lastDate = profile.last_review_date;
  let newStreak = profile.streak_count;

  // 2. Already updated today? Exit.
  if (lastDate === today) return;

  // 3. Calculate Yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // 4. Increment or Reset
  if (lastDate === yesterdayStr) {
    newStreak += 1;
  } else {
    newStreak = 1;
  }

  // 5. Save back to Supabase
  await supabase
    .from('profiles')
    .update({ 
      streak_count: newStreak, 
      last_review_date: today 
    })
    .eq('id', user.id);
  
  setStreak(newStreak);
};

// 1. Listen for Auth Changes (Keep this as is)
  useEffect(() => {
    // 1. Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoaded(true);
    });

    // 2. Listen for auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

// 2. NEW: Fetch Data ONLY when the session is confirmed
useEffect(() => {
  const fetchInitialData = async () => {
    if (!user) {
      setCards([]);
      setDataLoading(false); // Stop loading if no user
      return;
    }

    setDataLoading(true); // Start loading animation
    const { data, error } = await supabase
      .from('flashcards')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCards(data);
      if (data.length > 0) {
        setCurrentCard(getNextPriorityCard(data));
      }
    }
    setDataLoading(false); // Data is now here
  };

  if (isLoaded && user) {
    fetchInitialData();
  }
}, [isLoaded, user]);

  // --- 2. Update Scoring in Supabase ---
  const handleScore = async (isPass: boolean) => {
    if (!currentCard) return;

    const mode = language === 'jp' ? 'jp_to_en' : 'en_to_jp';
    
    // Calculate new stats locally first
    const scores = currentCard.scores || {
      jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
      en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 }
    };

    const currentModeStats = scores[mode];
    const newPass = isPass ? currentModeStats.pass + 1 : currentModeStats.pass;
    const newTotal = currentModeStats.total + 1;
    const newPercent = Math.round((newPass / newTotal) * 100);

    const updatedScores = {
      ...scores,
      [mode]: {
        ...currentModeStats,
        pass: newPass,
        fail: !isPass ? currentModeStats.fail + 1 : currentModeStats.fail,
        total: newTotal,
        percent: newPercent
      }
    };

    // Update Supabase
    const { error } = await supabase
      .from('flashcards')
      .update({ 
        scores: updatedScores,
        score: updatedScores.jp_to_en.percent // Main score for legacy support
      })
      .eq('id', currentCard.id);

      // Update Streak Logic
  if (isPass) {
    const newProgress = dailyProgress + 1;
    setDailyProgress(newProgress);

    // If they hit the goal (e.g., 10 correct cards)
    if (newProgress === DAILY_GOAL) {
      updateStreak(); 
      // Optional: trigger confetti here!
    }
  }

    if (error) {
      console.error("Failed to update score:", error);
      return;
    }

    // Update Local State for UI
    const updatedCards = cards.map(c => 
      c.id === currentCard.id ? { ...c, scores: updatedScores, score: newPercent } : c
    );
    
    // Update session progress
  const newProgress = dailyProgress + 1;
  setDailyProgress(newProgress);

  // If they just hit the goal, update the database streak
  if (newProgress === DAILY_GOAL) {
    alert("🎉 Daily Goal Reached! Streak Extended!");
    updateStreak();
    // Optional: confetti!
  }

    setCards(updatedCards);
    setCurrentCard(getNextPriorityCard(updatedCards, currentCard.id));
  };

  // --- 3. Sync AI Data to Supabase ---
  // (Updated syncMissingData to save to DB so you don't keep calling AI)
  useEffect(() => {
    const syncMissingData = async () => {
      if (currentCard && currentCard.english === "Pending AI Sync") {
        setLoading(true);
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({ topic: currentCard.japanese }),
          });
          const fetchedData = await res.json();

          // Save AI results to Supabase
          await supabase
            .from('flashcards')
            .update({ 
              reading: fetchedData.reading, 
              english: fetchedData.english 
            })
            .eq('id', currentCard.id);

          // Update Local UI
          const updated = { ...currentCard, ...fetchedData };
          setCurrentCard(updated);
          setCards(prev => prev.map(c => c.id === currentCard.id ? updated : c));
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      }
    };
    syncMissingData();
  }, [currentCard?.id]);

  /* ... Keep getNextPriorityCard logic here ... */

  // --- Logic: Get Next Card Based on Weights ---
  // Update the function signature to accept the last ID
const getNextPriorityCard = (allCards: FlashcardData[], lastCardId?: string) => {
  if (allCards.length === 0) return null;
  if (allCards.length === 1) return allCards[0];

  // 1. Helper: Get score based on current language mode
  const getModeScore = (card: FlashcardData) => {
    const mode = language === 'jp' ? 'jp_to_en' : 'en_to_jp';
    return card.scores?.[mode]?.percent || 0;
  };

  const getModeTries = (card: FlashcardData) => {
    const mode = language === 'jp' ? 'jp_to_en' : 'en_to_jp';
    return card.scores?.[mode]?.total || 0;
  };

  // 2. Categorize the cards using the current mode's stats
  const sortedByPercent = [...allCards].sort((a, b) => getModeScore(a) - getModeScore(b));
  
  const hardCards = sortedByPercent.slice(0, 10);
  const easyCards = allCards.filter(c => getModeScore(c) >= 85 && getModeTries(c) >= 20);
  
  const hardIds = new Set(hardCards.map(c => c.id));
  const easyIds = new Set(easyCards.map(c => c.id));
  const mediumCards = allCards.filter(c => !hardIds.has(c.id) && !easyIds.has(c.id));

  // 3. Roll the dice (Spaced Repetition Logic)
  const roll = Math.random();
  let selectedBucket: FlashcardData[] = [];

  if (roll < 0.70 && hardCards.length > 0) {
    selectedBucket = hardCards;
  } else if (roll < 0.95 && mediumCards.length > 0) {
    selectedBucket = mediumCards;
  } else if (easyCards.length > 0) {
    selectedBucket = easyCards;
  } else {
    selectedBucket = allCards;
  }

  // 4. Filter out the current card so you don't get the same one twice in a row
  const filteredBucket = selectedBucket.filter(c => c.id !== lastCardId);
  
  if (filteredBucket.length === 0) {
    const fallback = allCards.filter(c => c.id !== lastCardId);
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return filteredBucket[Math.floor(Math.random() * filteredBucket.length)];
};

const onSwipe = (direction: 'left' | 'right') => {
  const isPass = direction === 'right';
  
  // Trigger your existing logic
  handleScore(isPass);
};

  if (!isLoaded) return <div>Loading Session...</div>;
if (!user) return <Auth />; // Only show Auth if user is explicitly null

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="fixed top-6 left-4 right-4 z-50 pointer-events-none 
                flex flex-row items-center justify-between
                md:flex-col md:items-end md:gap-2 md:top-8 md:right-8 md:left-auto">
  
  {/* Language Toggle: Left on Mobile, Bottom on Desktop */}
  <div className="pointer-events-auto order-1 md:order-2">
    <div className="scale-90 origin-left md:origin-right h-10 flex items-center">
      <LanguageToggle language={language} setLanguage={setLanguage} />
    </div>
  </div>

  {/* Stats Button: Right on Mobile, Top on Desktop */}
  <div className="pointer-events-auto order-2 md:order-1">
    <Link 
      href="/stats" 
      className="bg-white px-4 py-2 rounded-full shadow-sm font-bold text-slate-600 hover:text-indigo-600 transition-all border border-slate-100 flex items-center gap-2 whitespace-nowrap h-10"
    >
      📊 View Stats
    </Link>
  </div>
</div>


      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {/* PLACE STREAK UI HERE */}
  {streak > 1 && (
  <div className="absolute top-20 inset-x-0 flex justify-center z-10 pointer-events-none">
    <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500 to-red-500 text-white px-5 py-2 rounded-full shadow-xl animate-bounce">
      <span className="text-xl">🔥</span>
      <span className="font-black text-sm tracking-widest">{streak} STREAK</span>
    </div>
  </div>
)}

{dailyProgress < DAILY_GOAL && (
    <div className="mt-2 bg-slate-800/80 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-widest">
      Daily Goal: {dailyProgress} / {DAILY_GOAL}
    </div>
  )}

        {dataLoading || loading ? (
          <div className="w-80 h-96 bg-white rounded-3xl border-4 border-dashed border-slate-200 flex flex-col items-center justify-center animate-pulse gap-4">
      <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-400 font-bold">Loading your deck...</p>
    </div>
        ) : currentCard ? (
          <div className="flex flex-col items-center gap-4">
             {/* Show the bucket/percentage for debugging/insight */}
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {language === 'jp' ? '🇯🇵 → 🇺🇸' : '🇺🇸 → 🇯🇵'} Mode | 
              Success: {language === 'jp' 
                ? (currentCard.scores?.jp_to_en?.percent || 0) 
                : (currentCard.scores?.en_to_jp?.percent || 0)}%
            </span>
            <Flashcard key={currentCard.id} card={currentCard} language={language} onSwipe={onSwipe}/>
          </div>
        ) : (
          <div className="text-center p-10 bg-white rounded-3xl border-2 border-dashed border-slate-200 w-80 h-96 flex flex-col justify-center items-center gap-4">
      <p className="text-slate-500 font-bold text-xl">Empty Deck</p>
      <Link href="/stats" className="text-indigo-600 font-bold bg-indigo-50 px-4 py-2 rounded-xl">
        + Add your first cards
      </Link>
    </div>
        )}

        <div className="flex gap-4 w-full">
          <button onClick={() => handleScore(false)} className="flex-1 py-4 bg-rose-100 text-rose-700 rounded-2xl font-bold border-b-4 border-rose-300 active:border-b-0 active:translate-y-1">✕ Fail</button>
          <button onClick={() => handleScore(true)} className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-bold border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1">✓ Pass</button>
        </div>
      </div>
    </main>
  );
}