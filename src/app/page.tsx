"use client";
import { useState, useEffect } from 'react';
import Flashcard from '@/components/Flashcard';
import LanguageToggle from '@/components/LanguageToggle';
import { FlashcardData } from '@/lib/types';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [language, setLanguage] = useState<'en' | 'jp'>('jp');

// --- 1. Fetch Cards from Supabase on Load ---
  useEffect(() => {
    console.log("Supabase URL Check:", process.env.NEXT_PUBLIC_SUPABASE_URL); // Is this undefined?
    
    const fetchInitialData = async () => {
      console.log("Starting fetch..."); // Does this even fire?
      const { data, error } = await supabase
        .from('flashcards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching cards:", error);
      } else {
        const loadedCards = data || [];
        setCards(loadedCards);
        // Use your existing logic to pick the first card
        if (loadedCards.length > 0) {
          setCurrentCard(getNextPriorityCard(loadedCards));
        }
      }
      setIsLoaded(true);
    };

    fetchInitialData();
  }, []);

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

    if (error) {
      console.error("Failed to update score:", error);
      return;
    }

    // Update Local State for UI
    const updatedCards = cards.map(c => 
      c.id === currentCard.id ? { ...c, scores: updatedScores, score: newPercent } : c
    );
    
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

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      {/* <LanguageToggle language={language} setLanguage={setLanguage} /> */}

      <div className="absolute top-8 right-8 flex flex-col items-end gap-2 z-50">
  {/* Stats Button */}
  <Link 
    href="/stats" 
    className="bg-white px-4 py-2 rounded-full shadow-sm font-bold text-slate-600 hover:text-indigo-600 transition-all border border-slate-100"
  >
    📊 View Stats
  </Link>

  {/* Language Toggle */}
  <div className="scale-90 origin-right">
    <LanguageToggle language={language} setLanguage={setLanguage} />
  </div>
</div>

      <div className="w-full max-w-md flex flex-col items-center gap-8">
        {loading ? (
          <div className="w-80 h-96 bg-white rounded-3xl border-4 border-dashed border-slate-200 flex items-center justify-center animate-pulse">
            <p className="text-slate-400 font-bold">AI is writing...</p>
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
          <div className="text-center p-10 bg-white rounded-3xl border-2 border-dashed border-slate-200 w-80 h-96 flex flex-col justify-center">
            <p className="text-slate-500 font-bold">No cards found.</p>
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