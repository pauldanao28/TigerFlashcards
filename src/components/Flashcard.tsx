"use client";
import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { FlashcardData } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/context/LanguageContext";
import { speak } from "@/lib/tts";
import { useAppAlert } from "@/context/AlertContext";

interface FlashcardProps {
  card: FlashcardData;
  language: "en" | "jp";
  userId: string;
  onSwipe?: (direction: "left" | "right") => void;
  autoPlayJp?: boolean;
  autoPlayEn?: boolean;
  sfxEnabled?: boolean;
  isFlipped: boolean;
  onFlip: (state: boolean) => void;
  audioPulse?: number;
}

const triggerHaptic = (ms = 10) => {
  if (typeof window !== "undefined" && window.navigator.vibrate) {
    window.navigator.vibrate(ms);
  }
};


export default function Flashcard({
  card,
  language,
  userId,
  onSwipe,
  autoPlayJp,
  autoPlayEn,
  sfxEnabled,
  isFlipped, // Use prop instead of local state
  onFlip, // Use prop setter
  audioPulse,
}: FlashcardProps) {
  const { t } = useLang();
  const { showAlert } = useAppAlert();
  //const [flipped, setFlipped] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // 1. Setup Motion Values for Swipe
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(x, [-200, -150, 0, 150, 200], [0, 1, 1, 1, 0]);

  // Pass/Fail Glow transforms
  const passOpacity = useTransform(x, [20, 120], [0, 1]);
  const failOpacity = useTransform(x, [-20, -120], [0, 1]);

  const isAudioUnlocked = useRef(false);

  const playUISound = (type: "success" | "fail", enabled: boolean) => {
    if (!enabled || typeof window === "undefined") return;
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      if (type === "success") {
        // Soft ascending two-tone chime
        [523.25, 783.99].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(ctx.currentTime + i * 0.1);
          osc.stop(ctx.currentTime + i * 0.1 + 0.18);
          gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.18);
        });
      } else {
        // Soft single low thud
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
      }

      setTimeout(() => ctx.close(), 600);
    } catch { /* audio not available */ }
  };

  const forceUnlock = () => {
    isAudioUnlocked.current = true;
  };

  useEffect(() => {
    if (!card) return; // Guard clause: do nothing if card is null
    setIsReady(false);
    const timer = setTimeout(() => setIsReady(true), 50);
    return () => clearTimeout(timer);
  }, [card?.id]); // Added optional chaining here

  useEffect(() => {
    if (audioPulse === 0) return; // Don't play on initial mount

    const text = isFlipped
      ? card.japanese // Back text
      : language === "jp"
        ? card.japanese
        : card.english; // Front text

    const lang = isFlipped ? "ja-JP" : language === "jp" ? "ja-JP" : "en-US";

    speak(text, lang);
  }, [audioPulse]);

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

  // 3. Auto-play Audio on Front (When card appears)
  useEffect(() => {
    if (!card) return; // 🛡️ Safety Guard
    onFlip(false);

    // Check if ANY auto-play is enabled first
    const shouldPlayJp = language === "jp" && autoPlayJp;
    const shouldPlayEn = language === "en" && autoPlayEn;

    // If both are off, don't even start the timer
    if (!shouldPlayJp && !shouldPlayEn) return;

    const timer = setTimeout(() => {
      window.speechSynthesis.getVoices();

      if (shouldPlayJp) {
        speak(card.reading || card.japanese, "ja-JP");
      } else if (shouldPlayEn) {
        speak(card.english, "en-US");
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [card?.id, language, autoPlayJp, autoPlayEn]);

  // 4. Auto-play Audio on Flip (When card is turned over)
  useEffect(() => {
    if (!card || !isFlipped) return; // 🛡️ Safety Guard
    if (isFlipped) {
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
  }, [isFlipped, card?.id, autoPlayJp, autoPlayEn]);

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;

    // 🔥 THE FIX: Unlock immediately on the user's physical release
    forceUnlock();

    if (info.offset.x > swipeThreshold) {
      onSwipe?.("right");
      playUISound("success", sfxEnabled ?? false);
    } else if (info.offset.x < -swipeThreshold) {
      onSwipe?.("left");
      playUISound("fail", sfxEnabled ?? false);
    }
    setHasVibrated(false);
  };

  // --- THE FIX: UNIFIED AUDIO LOGIC ---
  const handlePlayAudio = (e: React.MouseEvent, isBackSide: boolean) => {
    e.stopPropagation();

    let textToSpeak = "";
    let langToUse: "ja-JP" | "en-US" = "en-US";

    if (!isBackSide) {
      // Front Side Logic
      if (language === "jp") {
        textToSpeak = card.reading || card.japanese;
        langToUse = "ja-JP";
      } else {
        textToSpeak = card.english;
        langToUse = "en-US";
      }
    } else {
      // Back Side Logic
      // if (language === "jp") {
      //   textToSpeak = card.english;
      //   langToUse = "en-US";
      // } else {
      textToSpeak = card.reading || card.japanese;
      langToUse = "ja-JP";
    }

    speak(textToSpeak, langToUse);
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
      showAlert(error.message);
    } else {
      showAlert(t.report_sent);
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

  // const handlePlayAudio = (
  //   e: React.MouseEvent,
  //   text: string,
  //   lang: "ja-JP" | "en-US",
  // ) => {
  //   e.stopPropagation();
  //   speak(text, lang);
  // };
  // --- SAFETY CHECK FOR TEXT LOGIC ---
  // Fallback to empty strings if card is null to prevent the crash
  const frontText = card
    ? language === "jp"
      ? card.japanese
      : card.english
    : "";
  const backText = card
    ? language === "jp"
      ? card.english
      : card.japanese
    : "";

  // Use optional chaining here too
  const isBackJapanese = card ? backText === card.japanese : false;

  return (
    <div className="w-full max-w-[320px] h-96 [perspective:1000px] touch-none mx-auto">
      <motion.div
        style={{ x, rotate, opacity }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        className="relative w-full h-full cursor-grab active:cursor-grabbing mx-auto"
      >
        {/* --- REFINED: SUBTLE OVERLAYS --- */}
        <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden rounded-3xl">
          {/* PASS (Right) - Using /10 for a very light emerald tint */}
          <motion.div
            style={{ opacity: passOpacity }}
            className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center"
          >
            <span className="text-emerald-600/30 text-7xl font-black uppercase tracking-tighter -rotate-12">
              {t.pass}
            </span>
          </motion.div>

          {/* FAIL (Left) - Using /10 for a very light rose tint */}
          <motion.div
            style={{ opacity: failOpacity }}
            className="absolute inset-0 bg-rose-500/10 flex items-center justify-center"
          >
            <span className="text-rose-600/30 text-7xl font-black uppercase tracking-tighter rotate-12">
              {t.fail}
            </span>
          </motion.div>
        </div>
        {/* -------------------------------------- */}

        <motion.div
          // Use 'animate' directly linked to the prop
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          // Add 'initial' to ensure it starts correctly
          initial={false}
          transition={{
            duration: 0.6,
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
          // Ensure this handler is using the prop function
          onClick={() => onFlip(!isFlipped)}
          className="relative w-full h-full [transform-style:preserve-3d]"
        >
          {/* FRONT SIDE */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white rounded-3xl border-4 border-white shadow-2xl [backface-visibility:hidden] p-8 text-center overflow-hidden">
            <div className="flex-1 flex items-center justify-center w-full">
              <span
                className={`font-black text-slate-800 leading-tight break-words w-full 
    ${isReady ? "transition-all duration-300" : "transition-none"} 
    ${getFontSize(frontText, language === "jp")}`}
              >
                {frontText}
              </span>
            </div>
            <button
              onClick={(e) => handlePlayAudio(e, false)}
              className="mt-4 p-3 bg-slate-100 rounded-full hover:bg-indigo-100 transition active:scale-95"
            >
              🔊
            </button>
          </div>

          {/* BACK SIDE */}
          <div className="absolute inset-0 flex flex-col bg-indigo-600 text-white rounded-3xl shadow-2xl [transform:rotateY(180deg)] [backface-visibility:hidden] p-8 text-center overflow-hidden">
            {card?.partOfSpeech && (
              <div className="absolute top-4 right-4 z-10">
                <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest border border-white/10">
                  {card?.partOfSpeech}
                </span>
              </div>
            )}

            <div className="flex-1 flex flex-col items-center justify-center w-full overflow-hidden">
              {(language === "jp" || language === "en") && card?.reading && (
                <p className="text-indigo-200 text-lg mb-2 font-medium tracking-wide animate-fade-in truncate w-full">
                  {card?.reading}
                </p>
              )}

              <h2
                className={`font-bold leading-tight break-words w-full 
    ${isReady ? "transition-all duration-300" : "transition-none"} 
    ${getFontSize(backText, isBackJapanese)}`}
              >
                {backText}
              </h2>
            </div>

            {/* Footer Area */}
            <div className="mt-auto pt-4 border-t border-indigo-400/50 w-full">
              {card?.exampleSentence && (
                <p className="text-xs italic text-indigo-100 opacity-90 mb-4 line-clamp-2 overflow-hidden break-words px-2">
                  "{card?.exampleSentence.jp}"
                </p>
              )}

              <div className="flex justify-center items-center gap-4 relative">
                <button
                  onClick={(e) => handlePlayAudio(e, true)}
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
