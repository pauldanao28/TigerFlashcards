"use client";
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FlashcardData } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardData;
  language: 'en' | 'jp'; 
}

export default function Flashcard({ card, language }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);

  // Helper for speech
  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // 1. Play sound immediately when a NEW card loads (Front Side)
  useEffect(() => {
    setFlipped(false);
    if (card?.japanese) {
      speak(card.japanese);
    }
  }, [card.id]);

  // 2. Play sound immediately when card is flipped (Back Side)
  useEffect(() => {
    if (flipped && card?.japanese) {
      speak(card.japanese);
    }
  }, [flipped, card.japanese]);

  const handlePlayAudio = (e: React.MouseEvent, text: string) => {
    e.stopPropagation(); // Critical: prevents card from flipping when clicking the button
    speak(text);
  };

  const frontText = language === 'jp' ? card.japanese : card.english;
  const backText = language === 'jp' ? card.english : card.japanese;

  return (
    <div className="w-80 h-96 [perspective:1000px] cursor-pointer" onClick={() => setFlipped(!flipped)}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* FRONT SIDE */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-3xl border-4 border-white shadow-2xl [backface-visibility:hidden] p-6 text-center">
          <span className={`font-black text-slate-800 leading-tight mb-8 ${language === 'jp' ? 'text-6xl' : 'text-3xl'}`}>
            {frontText}
          </span>
          
          {/* Front Sound Icon - Kept in original "Upfront" position */}
          <button 
            onClick={(e) => handlePlayAudio(e, card.japanese)} 
            className="p-3 bg-slate-100 rounded-full hover:bg-indigo-100 transition active:scale-95"
          >
            🔊
          </button>
        </div>

        {/* BACK SIDE */}
        <div className="absolute inset-0 flex flex-col bg-indigo-600 text-white rounded-3xl shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] p-8 text-center">
          
          {/* Content Area (Centered) */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {language === 'jp' && (
              <p className="text-indigo-200 text-xl mb-2 font-medium">{card.reading}</p>
            )}
            <h2 className={`font-bold leading-tight ${language === 'jp' ? 'text-4xl' : 'text-6xl'}`}>
              {backText}
            </h2>
          </div>

          {/* Footer Area (Example + Sound below) */}
          <div className="mt-auto pt-4 border-t border-indigo-400">
            {card.exampleSentence && (
              <p className="text-sm italic opacity-80 mb-4">
                "{card.exampleSentence.jp}"
              </p>
            )}
            <button 
              onClick={(e) => handlePlayAudio(e, card.japanese)}
              className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/20 active:scale-95"
            >
              🔊
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}