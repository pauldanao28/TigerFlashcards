"use client";
import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { FlashcardData } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardData;
  language: 'en' | 'jp'; 
  onSwipe?: (direction: 'left' | 'right') => void;
}

export default function Flashcard({ card, language, onSwipe }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);

  // 1. Setup Motion Values for Swipe
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]); // Rotates as you drag
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]); // Fades out at edges

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;
    if (info.offset.x > swipeThreshold) {
      onSwipe?.('right');
    } else if (info.offset.x < -swipeThreshold) {
      onSwipe?.('left');
    }
  };
  
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
  
  // Optional: 300ms delay so audio plays when the new card is centered
  const timer = setTimeout(() => {
    if (card?.japanese) speak(card.japanese);
  }, 300);

  return () => clearTimeout(timer); // Clean up if the user swipes super fast
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
    <div className="w-80 h-96 [perspective:1000px] touch-none" onClick={() => setFlipped(!flipped)}>
      <motion.div
        style={{ x, rotate, opacity }} // Bind swipe values
        drag="x" // Enable horizontal dragging
        dragConstraints={{ left: 0, right: 0 }} // Snap back to center
        onDragEnd={handleDragEnd}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
        onClick={() => setFlipped(!flipped)}
        className="relative w-full h-full [transform-style:preserve-3d] cursor-grab active:cursor-grabbing"
      >
        {/* PASS GLOW (Right) */}
<motion.div 
  style={{ opacity: useTransform(x, [20, 150], [0, 1]) }}
  className="absolute inset-0 z-50 pointer-events-none rounded-3xl border-8 border-green-500 bg-green-500/10 flex items-center justify-center"
>
  <span className="text-green-500 text-5xl font-black rotate-[-12deg] drop-shadow-lg">PASS</span>
</motion.div>
{/* FAIL GLOW (Left) */}
<motion.div 
  style={{ opacity: useTransform(x, [-20, -150], [0, 1]) }}
  className="absolute inset-0 z-50 pointer-events-none rounded-3xl border-8 border-red-500 bg-red-500/10 flex items-center justify-center"
>
  <span className="text-red-500 text-5xl font-black rotate-[12deg] drop-shadow-lg">FAIL</span>
</motion.div>
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