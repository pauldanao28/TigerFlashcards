"use client";
import { useState, useEffect, useMemo } from 'react';
import Flashcard from '@/components/Flashcard';
import { FlashcardData } from '@/lib/types';
import Link from 'next/link';

const INITIAL_CARDS: FlashcardData[] = [
  { id: "1", japanese: "勉強", reading: "べんきょう", english: "Study", passCount: 0, failCount: 0, totalTries: 0, score: 0 },
  { id: "2", japanese: "簡単", reading: "かんたん", english: "Easy", passCount: 0, failCount: 0, totalTries: 0, score: 0 },
];

export default function Home() {
  const [cards, setCards] = useState<FlashcardData[]>([]);
  const [currentCard, setCurrentCard] = useState<FlashcardData | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
const [batchInput, setBatchInput] = useState("");

  // --- Logic: Get Next Card Based on Weights ---
  // Update the function signature to accept the last ID
const getNextPriorityCard = (allCards: FlashcardData[], lastCardId?: string) => {
  if (allCards.length === 0) return null;
  if (allCards.length === 1) return allCards[0]; // If only one card exists, we must show it

  // 1. Categorize the cards
  const sortedByPercent = [...allCards].sort((a, b) => (a.score || 0) - (b.score || 0));
  const hardCards = sortedByPercent.slice(0, 10);
  const easyCards = allCards.filter(c => (c.score || 0) >= 85 && (c.totalTries || 0) >= 20);
  
  const hardIds = new Set(hardCards.map(c => c.id));
  const easyIds = new Set(easyCards.map(c => c.id));
  const mediumCards = allCards.filter(c => !hardIds.has(c.id) && !easyIds.has(c.id));

  // 2. Roll the dice
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

  // --- NEW LOGIC: Filter out the current card ---
  const filteredBucket = selectedBucket.filter(c => c.id !== lastCardId);
  
  // If the bucket is empty after filtering (e.g., only 1 card in that bucket), 
  // fall back to the full deck minus the current card.
  if (filteredBucket.length === 0) {
    const fallback = allCards.filter(c => c.id !== lastCardId);
    return fallback[Math.floor(Math.random() * fallback.length)];
  }

  return filteredBucket[Math.floor(Math.random() * filteredBucket.length)];
};

  // --- Effect: Initial Load ---
  useEffect(() => {
  const syncMissingData = async () => {
    // 1. Check if the current card is missing its data
    if (currentCard && currentCard.english === "Pending AI Sync") {
      setLoading(true);
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          body: JSON.stringify({ topic: currentCard.japanese }),
        });
        const fetchedData = await res.json();

        // 2. Update the card in the main list
        const updatedCards = cards.map(c => 
          c.id === currentCard.id 
            ? { ...c, reading: fetchedData.reading, english: fetchedData.english } 
            : c
        );

        setCards(updatedCards);
        // 3. Update the card currently being displayed
        setCurrentCard({ 
          ...currentCard, 
          reading: fetchedData.reading, 
          english: fetchedData.english 
        });
      } catch (error) {
        console.error("AI Sync failed:", error);
      } finally {
        setLoading(false);
      }
    }
  };

  syncMissingData();
}, [currentCard]); // This runs every time a new card is shown

  useEffect(() => {
    const saved = localStorage.getItem('tiger-cards');
    let loadedCards = INITIAL_CARDS;
    
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) loadedCards = parsed;
    }
    
    setCards(loadedCards);
    // CRITICAL FIX: Pick the first card immediately upon loading
    setCurrentCard(getNextPriorityCard(loadedCards));
    setIsLoaded(true);
  }, []);

  // --- Effect: Save on Change ---
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('tiger-cards', JSON.stringify(cards));
    }
  }, [cards, isLoaded]);

  const generateCard = async () => {
    if (!input) return;
    const exists = cards.find(c => c.japanese === input || c.english.toLowerCase() === input.toLowerCase());
    if (exists) { alert("Already exists!"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/generate", { method: "POST", body: JSON.stringify({ topic: input }) });
      const newCardData = await res.json();
      const newCard: FlashcardData = {
        ...newCardData,
        id: Date.now().toString(),
        passCount: 0, failCount: 0, totalTries: 0, score: 0
      };
      
      const updatedCards = [...cards, newCard];
      setCards(updatedCards);
      // If there was no current card (deck was empty), show the new one
      if (!currentCard) setCurrentCard(newCard);
      setInput("");
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleScore = (isPass: boolean) => {
    if (!currentCard) return;

    const updatedCards = cards.map(c => {
      if (c.id === currentCard.id) {
        const newPass = isPass ? (c.passCount || 0) + 1 : (c.passCount || 0);
        const newFail = !isPass ? (c.failCount || 0) + 1 : (c.failCount || 0);
        const newTotal = (c.totalTries || 0) + 1;
        return {
          ...c,
          passCount: newPass,
          failCount: newFail,
          totalTries: newTotal,
          score: Math.round((newPass / newTotal) * 100)
        };
      }
      return c;
    });

    setCards(updatedCards);
    setCurrentCard(getNextPriorityCard(updatedCards));
  };

  if (!isLoaded) return null;

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="absolute top-8 right-8">
        <Link href="/stats" className="bg-white px-4 py-2 rounded-full shadow-sm font-bold text-slate-600 hover:text-indigo-600 transition-all">
          📊 View Stats
        </Link>
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
              Success Rate: {currentCard.score || 0}% | Tries: {currentCard.totalTries || 0}
            </span>
            <Flashcard key={currentCard.id} card={currentCard} />
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