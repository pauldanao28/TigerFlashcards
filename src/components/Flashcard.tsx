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

  // Helper to determine font size based on text length
  const getFontSize = (text: string, isJapanese: boolean) => {
    const len = text.length;
    if (isJapanese) {
      if (len > 8) return 'text-3xl';
      if (len > 5) return 'text-4xl';
      return 'text-6xl';
    } else {
      if (len > 25) return 'text-xl';
      if (len > 15) return 'text-2xl';
      return 'text-4xl';
    }
  };

  const speak = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    setFlipped(false);
    if (card?.japanese) speak(card.japanese);
  }, [card.id]);

  useEffect(() => {
    if (flipped && card?.japanese) speak(card.japanese);
  }, [flipped, card.japanese]);

  const handlePlayAudio = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
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
          <span className={`font-black text-slate-800 leading-tight mb-8 transition-all ${getFontSize(frontText, language === 'jp')}`}>
            {frontText}
          </span>
          
          <button 
            onClick={(e) => handlePlayAudio(e, card.japanese)} 
            className="p-3 bg-slate-100 rounded-full hover:bg-indigo-100 transition active:scale-95"
          >
            🔊
          </button>
        </div>

        {/* BACK SIDE */}
        <div className="absolute inset-0 flex flex-col bg-indigo-600 text-white rounded-3xl shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] p-8 text-center">
          
          {/* Part of Speech Badge */}
          {card.partOfSpeech && (
            <div className="absolute top-4 right-4">
              <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-bold uppercase tracking-widest border border-white/10">
                {card.partOfSpeech}
              </span>
            </div>
          )}

          {/* Content Area (Centered) */}
          <div className="flex-1 flex flex-col items-center justify-center">
            {language === 'jp' && (
              <p className="text-indigo-200 text-xl mb-2 font-medium tracking-wide">{card.reading}</p>
            )}
            <h2 className={`font-bold leading-tight transition-all ${getFontSize(backText, language !== 'jp')}`}>
              {backText}
            </h2>
          </div>

          {/* Footer Area (Example + Sound) */}
          <div className="mt-auto pt-4 border-t border-indigo-400/50">
            {card.exampleSentence && (
              <p className="text-sm italic text-indigo-100 opacity-90 mb-4 line-clamp-3">
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