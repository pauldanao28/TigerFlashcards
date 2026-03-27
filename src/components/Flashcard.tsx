"use client";
import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { FlashcardData } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";

interface FlashcardProps {
  card: FlashcardData;
  language: "en" | "jp";
  userId: string;
  onSwipe?: (direction: "left" | "right") => void;
  autoPlayJp?: boolean;
  autoPlayEn?: boolean;
}

const triggerHaptic = (ms = 10) => {
  if (typeof window !== "undefined" && window.navigator.vibrate) {
    window.navigator.vibrate(ms);
  }
};

// const speak = (text: string, lang: "ja-JP" | "en-US") => {
//   if (typeof window !== "undefined" && window.speechSynthesis) {
//     window.speechSynthesis.cancel();
//     const utterance = new SpeechSynthesisUtterance(text);
//     utterance.lang = lang;
//     utterance.rate = 0.9;
//     window.speechSynthesis.speak(utterance);
//   }
// };

// const speak = (text: string, lang: "ja-JP" | "en-US") => {
//   if (typeof window !== "undefined" && window.speechSynthesis) {
//     window.speechSynthesis.cancel();

//     const utterance = new SpeechSynthesisUtterance(text);
//     utterance.lang = lang;
//     utterance.rate = 0.9;
//     utterance.pitch = 1.0;

//     // Optional: Pick a specific Japanese voice if it exists on the system
//     const voices = window.speechSynthesis.getVoices();
//     const jaVoice = voices.find(
//       (v) => v.lang === "ja-JP" && v.name.includes("Google"),
//     );
//     if (jaVoice) utterance.voice = jaVoice;

//     window.speechSynthesis.speak(utterance);
//   }
// };

const speak = (text: string, lang: "ja-JP" | "en-US") => {
  const synth = window.speechSynthesis;
  if (typeof window !== "undefined" && synth) {
    // 🔥 MANDATORY FOR IOS: Resume every single time
    synth.resume();
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85; // Slightly slower for better N5/N4 recognition

    // iOS sometimes ignores the voice if it's not explicitly set from the loaded list
    const voices = synth.getVoices();
    const voice = voices.find((v) => v.lang === lang);
    if (voice) utterance.voice = voice;

    synth.speak(utterance);
  }
};

export default function Flashcard({
  card,
  language,
  userId,
  onSwipe,
  autoPlayJp,
  autoPlayEn,
}: FlashcardProps) {
  const { t } = useLang();
  const [flipped, setFlipped] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);

  // 1. Setup Motion Values for Swipe
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  // Pass/Fail Glow transforms
  const passOpacity = useTransform(x, [20, 120], [0, 1]);
  const failOpacity = useTransform(x, [-20, -120], [0, 1]);

  const isAudioUnlocked = useRef(false);

  const forceUnlock = () => {
    if (isAudioUnlocked.current) return;

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    synth.speak(utterance);

    isAudioUnlocked.current = true;
    console.log("iOS Protocol: Audio Latched");
  };

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

  useEffect(() => {
    const synth = window.speechSynthesis;

    const loadVoices = () => {
      synth.getVoices(); // Force population of the list
    };

    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    loadVoices();
  }, []);

  // 3. Auto-play Audio on Front (When card appears)
  useEffect(() => {
    setFlipped(false);

    // Reduced delay to 50ms. 300ms is often too long for iOS to
    // associate the sound with the previous "Swipe" gesture.
    const timer = setTimeout(() => {
      window.speechSynthesis.getVoices();

      if (language === "jp" && autoPlayJp) {
        speak(card.reading || card.japanese, "ja-JP");
      } else if (language === "en" && autoPlayEn) {
        speak(card.english, "en-US");
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [card.id, language, autoPlayJp, autoPlayEn]);

  // 4. Auto-play Audio on Flip (When card is turned over)
  useEffect(() => {
    if (flipped) {
      // 🔥 ALWAYS speak Japanese on the back if autoPlayJp is enabled
      // regardless of whether the front was English or Japanese.
      if (autoPlayJp) {
        speak(card.reading || card.japanese, "ja-JP");
      }
      // Fallback: If they specifically want English auto-play and JP is off
      else if (language === "jp" && autoPlayEn) {
        speak(card.english, "en-US");
      }
    }
  }, [flipped, card.id, autoPlayJp, autoPlayEn]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;

    // 🔥 THE FIX: Unlock immediately on the user's physical release
    forceUnlock();

    if (info.offset.x > swipeThreshold) {
      onSwipe?.("right");
    } else if (info.offset.x < -swipeThreshold) {
      onSwipe?.("left");
    }
    setHasVibrated(false);
  };

  const handleReport = async (e: React.MouseEvent) => {
    e.stopPropagation(); // CRITICAL: Prevents the card from flipping/swiping when clicking report

    const suggestion = window.prompt(t.report_placeholder);

    if (!suggestion) return;

    const { error } = await supabase.from("card_reports").insert({
      card_id: card.id,
      user_id: userId,
      suggested_meaning: suggestion,
    });

    if (error) {
      alert(error.message);
    } else {
      alert(t.report_sent);
    }
  };

  const getFontSize = (text: string, isJapanese: boolean) => {
    const len = text.length;
    if (isJapanese) {
      if (len > 15) return "text-xl"; // Long sentences
      if (len > 10) return "text-2xl";
      if (len > 8) return "text-3xl";
      if (len > 5) return "text-4xl";
      return "text-6xl"; // Single Kanji/Short words
    } else {
      if (len > 50) return "text-lg"; // Very long definitions
      if (len > 35) return "text-xl";
      if (len > 25) return "text-2xl";
      if (len > 15) return "text-3xl";
      return "text-4xl";
    }
  };

  const handlePlayAudio = (
    e: React.MouseEvent,
    text: string,
    lang: "ja-JP" | "en-US",
  ) => {
    e.stopPropagation();
    speak(text, lang);
  };

  const frontText = language === "jp" ? card.japanese : card.english;
  const backText = language === "jp" ? card.english : card.japanese;
  const isBackJapanese = backText === card.japanese;

  return (
    <div className="w-80 h-96 [perspective:1000px] touch-none">
      <motion.div
        style={{ x, rotate, opacity }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
      >
        {/* SWIPE INDICATORS - (Keep existing code) */}

        <motion.div
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{
            duration: 0.6,
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
          onClick={() => setFlipped(!flipped)}
          className="relative w-full h-full [transform-style:preserve-3d]"
        >
          {/* FRONT SIDE */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-3xl border-4 border-white shadow-2xl [backface-visibility:hidden] p-8 text-center overflow-hidden">
            <div className="flex-1 flex items-center justify-center w-full">
              <span
                className={`font-black text-slate-800 leading-tight transition-all duration-300 break-words w-full ${getFontSize(frontText, language === "jp")}`}
              >
                {frontText}
              </span>
            </div>
            <button
              onClick={(e) =>
                handlePlayAudio(
                  e,
                  frontText,
                  language === "jp" ? "ja-JP" : "en-US",
                )
              }
              className="mt-4 p-3 bg-slate-100 rounded-full hover:bg-indigo-100 transition active:scale-95"
            >
              🔊
            </button>
          </div>

          {/* BACK SIDE */}
          <div className="absolute inset-0 flex flex-col bg-indigo-600 text-white rounded-3xl shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] p-8 text-center overflow-hidden">
            {card.partOfSpeech && (
              <div className="absolute top-4 right-4 z-10">
                <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                  {card.partOfSpeech}
                </span>
              </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
              {(language === "jp" || language === "en") && card.reading && (
                <p className="text-indigo-200 text-lg mb-2 font-medium tracking-wide animate-fade-in truncate w-full">
                  {card.reading}
                </p>
              )}

              <h2
                className={`font-bold leading-tight transition-all duration-300 break-words w-full ${getFontSize(backText, isBackJapanese)}`}
              >
                {backText}
              </h2>
            </div>

            {/* Footer Area */}
            <div className="mt-auto pt-4 border-t border-indigo-400/50 w-full">
              {card.exampleSentence && (
                <p className="text-xs italic text-indigo-100 opacity-90 mb-4 line-clamp-2 overflow-hidden break-words px-2">
                  "{card.exampleSentence.jp}"
                </p>
              )}

              <div className="flex justify-center items-center gap-4 relative">
                <button
                  onClick={(e) =>
                    handlePlayAudio(
                      e,
                      backText,
                      isBackJapanese ? "ja-JP" : "en-US",
                    )
                  }
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/20 active:scale-95"
                >
                  🔊
                </button>

                <button
                  onClick={handleReport}
                  className="absolute right-[-10px] bottom-[-10px] text-[9px] font-black uppercase tracking-widest text-indigo-300/40 hover:text-white transition-colors p-2"
                >
                  {t.report_issue}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
