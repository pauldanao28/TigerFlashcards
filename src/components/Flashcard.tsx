"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FlashcardData } from '@/lib/types';

export default function Flashcard({ card }: { card: FlashcardData }) {
  const [flipped, setFlipped] = useState(false);

  // --- NEW: Auto-play sound logic ---
  useEffect(() => {
    // We only want it to speak if we aren't loading and have a card
    if (card && card.japanese) {
      const utterance = new SpeechSynthesisUtterance(card.japanese);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.9; // Slightly slower is better for learning
      window.speechSynthesis.speak(utterance);
    }
    
    // Cleanup: Stop speaking if the user skips the card quickly
    return () => window.speechSynthesis.cancel();
  }, [card.id]); // This triggers every time the card ID changes

  // 2026 Browser Text-to-Speech (No API key needed!)
  const playAudio = (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't flip the card when clicking play
    const utterance = new SpeechSynthesisUtterance(card.japanese);
    utterance.lang = 'ja-JP';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="w-80 h-96 [perspective:1000px] cursor-pointer" onClick={() => setFlipped(!flipped)}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* FRONT: Kanji Only */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-3xl border-4 border-white shadow-2xl [backface-visibility:hidden]">
          <span className="text-7xl font-black text-slate-800">{card.japanese}</span>
          <button onClick={playAudio} className="mt-8 p-3 bg-slate-100 rounded-full hover:bg-indigo-100 transition">
            🔊
          </button>
        </div>

        {/* BACK: English, Furigana, Example */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-600 text-white rounded-3xl shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] p-8 text-center">
          <p className="text-indigo-200 text-xl mb-2 font-medium">{card.reading}</p>
          <h2 className="text-4xl font-bold mb-6">{card.english}</h2>
          {card.exampleSentence && (
            <p className="text-sm italic opacity-80 border-t border-indigo-400 pt-4">
              "{card.exampleSentence.jp}"
            </p>
          )}

          {card.alternatives && card.alternatives.length > 0 && (
          <div className="mt-4 pt-4 border-t border-indigo-400/30">
            <p className="text-[10px] uppercase tracking-widest text-indigo-200 mb-1">
              Other Kanji
            </p>
            <div className="flex flex-wrap gap-2 justify-center">
              {card.alternatives.map((alt, index) => (
                <span key={index} className="bg-white/10 px-2 py-1 rounded text-sm">
                  {alt}
                </span>
              ))}
            </div>
          </div>
        )}

        {card.contextNote && (
          <p className="mt-2 text-xs italic text-indigo-100 opacity-80">
            Note: {card.contextNote}
          </p>
        )}
        </div>
      </motion.div>
    </div>
  );
}