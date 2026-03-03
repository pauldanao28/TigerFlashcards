"use client";
import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { FlashcardData } from '@/lib/types';

interface FlashcardProps {
  card: FlashcardData;
  language: 'en' | 'jp'; 
  onSwipe?: (direction: 'left' | 'right') => void;
}

const triggerHaptic = (ms = 10) => {
  if (typeof window !== 'undefined' && window.navigator.vibrate) {
    window.navigator.vibrate(ms);
  }
};

const speak = (text: string, lang: 'ja-JP' | 'en-US') => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  }
};

export default function Flashcard({ card, language, onSwipe }: FlashcardProps) {
  const [flipped, setFlipped] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);

  // 1. Setup Motion Values for Swipe
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  // Pass/Fail Glow transforms
  const passOpacity = useTransform(x, [20, 120], [0, 1]);
  const failOpacity = useTransform(x, [-20, -120], [0, 1]);

  // 2. Monitor 'x' for Haptics
  useEffect(() => {
    const unsubscribe = x.on("change", (latestX) => {
      const threshold = 100;
      if (Math.abs(latestX) > threshold && !hasVibrated) {
        triggerHaptic(15);
        setHasVibrated(true);
      } else if (Math.abs(latestX) < threshold && hasVibrated) {
        setHasVibrated(false);
      }
    });
    return () => unsubscribe();
  }, [x, hasVibrated]);

  // 3. Auto-play Audio on Front
  useEffect(() => {
  // If we are in 'jp' mode, the front is Japanese. Play it!
  if (language === 'jp') {
    const timer = setTimeout(() => {
      speak(card.japanese, 'ja-JP');
    }, 100); // Tiny delay to ensure component is ready
    return () => clearTimeout(timer);
  }
}, [card.id, language]);

  // 4. Auto-play Audio on Flip
  useEffect(() => {
  if (flipped) {
    // If we are in 'en' mode, the front was English, but the back is Japanese.
    // We only want to hear Japanese.
    if (language === 'en') {
      speak(card.japanese, 'ja-JP');
    }
  }
}, [flipped, card.id, language]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;
    if (info.offset.x > swipeThreshold) {
      onSwipe?.('right');
    } else if (info.offset.x < -swipeThreshold) {
      onSwipe?.('left');
    }
    setHasVibrated(false);
  };

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

 const handlePlayAudio = (e: React.MouseEvent, text: string, lang: 'ja-JP' | 'en-US') => {
  e.stopPropagation();
  speak(text, lang);
};

  const frontText = language === 'jp' ? card.japanese : card.english;
  const backText = language === 'jp' ? card.english : card.japanese;

  return (
    <div className="w-80 h-96 [perspective:1000px] touch-none">
      {/* DRAG WRAPPER */}
      <motion.div
        style={{ x, rotate, opacity }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* INDICATORS (Outside flipping div so they stay oriented correctly) */}
        <motion.div 
          style={{ opacity: passOpacity }}
          className="absolute inset-0 z-50 pointer-events-none rounded-3xl border-8 border-green-500 bg-green-500/10 flex items-center justify-center"
        >
          <span className="text-green-500 text-5xl font-black rotate-[-12deg]">PASS</span>
        </motion.div>

        <motion.div 
          style={{ opacity: failOpacity }}
          className="absolute inset-0 z-50 pointer-events-none rounded-3xl border-8 border-red-500 bg-red-500/10 flex items-center justify-center"
        >
          <span className="text-red-500 text-5xl font-black rotate-[12deg]">FAIL</span>
        </motion.div>

        {/* FLIP CONTAINER */}
        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
          onClick={() => setFlipped(!flipped)}
          className="relative w-full h-full [transform-style:preserve-3d]"
        >
          {/* FRONT SIDE */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-3xl border-4 border-white shadow-2xl [backface-visibility:hidden] p-6 text-center">
            <span className={`font-black text-slate-800 leading-tight mb-8 transition-all ${getFontSize(frontText, language === 'jp')}`}>
              {frontText}
            </span>
            <button 
              onClick={(e) => handlePlayAudio(e, frontText, language === 'jp' ? 'ja-JP' : 'en-US')}
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
    {/* FIX: If the back text is Japanese (which happens in 'en' mode), 
       or if we are in 'jp' mode, show the reading.
    */}
    {(language === 'jp' || language  === 'en') && card.reading && (
      <p className="text-indigo-200 text-xl mb-2 font-medium tracking-wide animate-fade-in">
        {card.reading}
      </p>
    )}
    
    <h2 className={`font-bold leading-tight transition-all ${getFontSize(backText, backText === card.japanese)}`}>
      {backText}
    </h2>
  </div>

  {/* Footer Area */}
  <div className="mt-auto pt-4 border-t border-indigo-400/50">
    {card.exampleSentence && (
      <p className="text-sm italic text-indigo-100 opacity-90 mb-4 line-clamp-3">
        "{card.exampleSentence.jp}"
      </p>
    )}
    <button 
      onClick={(e) => handlePlayAudio(e, card.japanese, 'ja-JP')}
      className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/20 active:scale-95"
    >
      🔊
    </button>
  </div>
</div>
        </motion.div>
      </motion.div>
    </div>
  );
}