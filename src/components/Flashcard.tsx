"use client";
import { useState, useEffect } from "react";
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
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9; // Slightly slower for N5 clarity
    utterance.pitch = 1.0;

    const voices = synth.getVoices();

    // Priority: 1. Google Japanese, 2. Any Japanese, 3. Default
    const selectedVoice =
      voices.find((v) => v.lang === lang && v.name.includes("Google")) ||
      voices.find((v) => v.lang === lang);

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

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

    const timer = setTimeout(() => {
      // If voices aren't loaded yet, calling getVoices() here
      // can sometimes trigger the internal browser load
      window.speechSynthesis.getVoices();

      if (language === "jp" && autoPlayJp) {
        speak(card.reading || card.japanese, "ja-JP");
      } else if (language === "en" && autoPlayEn) {
        speak(card.english, "en-US");
      }
    }, 300); // Increased to 300ms to give the engine a heartbeat to initialize

    return () => clearTimeout(timer);
  }, [card.id, language, autoPlayJp, autoPlayEn]);

  // 4. Auto-play Audio on Flip (When card is turned over)
  useEffect(() => {
    if (flipped) {
      // If we were looking at Japanese, play English on the back
      if (language === "jp" && autoPlayEn) {
        speak(card.english, "en-US");
      }
      // If we were looking at English, play Japanese on the back
      else if (language === "en" && autoPlayJp) {
        speak(card.japanese, "ja-JP");
      }
    }
  }, [flipped, card.id, language, autoPlayJp, autoPlayEn]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;
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
