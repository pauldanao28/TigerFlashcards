"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Star, Lightbulb, Loader2, X } from "lucide-react";
import { FlashcardData, KanjiMnemonic } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { speak } from "@/lib/tts";
import { useAppAlert } from "@/context/AlertContext";
import { authedFetch } from "@/lib/authedFetch";

// Only kanji carry a radical/origin story worth explaining — hiragana, katakana,
// and punctuation in the word (okurigana, particles) don't.
const KANJI_RE = /[一-鿿]/;

const JLPT_BADGE_COLOR: Record<string, string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-teal-100 text-teal-700 border-teal-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};

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
  isPriority?: boolean;
  onTogglePriority?: () => void;
  onMnemonicGenerated?: (cardId: string, mnemonic: KanjiMnemonic) => void;
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
  isPriority,
  onTogglePriority,
  onMnemonicGenerated,
}: FlashcardProps) {
  const t = translations.en;
  const { showAlert, showConfirm } = useAppAlert();
  //const [flipped, setFlipped] = useState(false);
  const [hasVibrated, setHasVibrated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [mnemonicLoading, setMnemonicLoading] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);

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
        triggerHaptic(50);
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

  const swipeHaptic = (type: "success" | "fail") => {
    if (typeof window === "undefined" || /iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    if (!navigator.vibrate) return;
    navigator.vibrate(type === "success" ? [80] : [30, 60, 30]);
  };

  const handleDragEnd = (event: any, info: any) => {
    const swipeThreshold = 100;

    forceUnlock();

    if (info.offset.x > swipeThreshold) {
      onSwipe?.("right");
      playUISound("success", sfxEnabled ?? false);
      swipeHaptic("success");
    } else if (info.offset.x < -swipeThreshold) {
      onSwipe?.("left");
      playUISound("fail", sfxEnabled ?? false);
      swipeHaptic("fail");
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

  const handleOpenMnemonic = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Only confirm when this is about to spend an AI call — viewing an already-cached
    // mnemonic is free, so no need to make the user tap through a dialog for that.
    if (!card.mnemonic && !mnemonicLoading) {
      const confirmed = await showConfirm(
        `Generate a memory aid for ${card.japanese}? This uses one of your daily AI lookups.`,
        { title: "Remember this kanji?", confirmLabel: "Generate" },
      );
      if (!confirmed) return;
    }

    setShowMnemonic(true);
    if (card.mnemonic || mnemonicLoading) return; // already cached or already fetching

    setMnemonicLoading(true);
    setMnemonicError(null);
    try {
      const res = await authedFetch("/api/mnemonic", {
        method: "POST",
        body: JSON.stringify({ japanese: card.japanese, reading: card.reading, english: card.english }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMnemonicError(data.error || "Couldn't generate a mnemonic right now.");
        return;
      }
      const mnemonic: KanjiMnemonic = { entries: data.entries, origin: data.origin };
      // Cache on the shared card row — same mnemonic for every user who studies this word.
      await supabase.from("master_cards").update({ mnemonic }).eq("id", card.id);
      onMnemonicGenerated?.(card.id, mnemonic);
    } catch {
      setMnemonicError("Couldn't generate a mnemonic right now.");
    } finally {
      setMnemonicLoading(false);
    }
  };

  const getFontSize = (text: string, isJapanese: boolean) => {
    const len = text.length;
    if (isJapanese) {
      if (len > 15) return "text-xl"; // Long sentences
      if (len > 10) return "text-2xl";
      if (len > 8) return "text-3xl";
      if (len > 5) return "text-4xl";
      return "text-5xl sm:text-6xl"; // Single Kanji/Short words
    } else {
      if (len > 50) return "text-lg"; // Very long definitions
      if (len > 35) return "text-xl";
      if (len > 25) return "text-2xl";
      if (len > 15) return "text-3xl";
      return "text-3xl sm:text-4xl";
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
    <>
    <div className="w-full max-w-[320px] h-full [perspective:1000px] touch-none mx-auto">
      <motion.div
        style={{ x, rotate, opacity }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7}
        onDragEnd={handleDragEnd}
        onPointerDown={() => { if (typeof window !== "undefined" && !/iPad|iPhone|iPod/.test(navigator.userAgent)) navigator.vibrate?.(10); }}
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
            {onTogglePriority && (
              <button
                onClick={(e) => { e.stopPropagation(); onTogglePriority(); }}
                className="absolute top-4 right-4 z-10 p-2 rounded-full hover:bg-amber-50 active:scale-90 transition-all"
                title={isPriority ? "Remove from Priority" : "Add to Priority"}
              >
                <Star
                  size={20}
                  className={isPriority ? "text-amber-500" : "text-slate-300"}
                  fill={isPriority ? "currentColor" : "none"}
                />
              </button>
            )}
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
            {card?.jlpt_level && (
              <div className="absolute top-4 left-4 z-10">
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${JLPT_BADGE_COLOR[card.jlpt_level] ?? "bg-white/20 text-white border-white/10"}`}>
                  {card.jlpt_level}
                </span>
              </div>
            )}
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
              {card?.exampleSentence?.jp && (
                <div className="mb-4 px-2 text-center">
                  <p className="text-base italic text-indigo-50 line-clamp-3 overflow-hidden break-words">
                    "{card.exampleSentence.jp}"
                  </p>
                  {card.exampleSentence.en && (
                    <p className="text-xs text-indigo-200/80 mt-1 line-clamp-2 overflow-hidden break-words">
                      {card.exampleSentence.en}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-center items-center gap-4 relative">
                <button
                  onClick={(e) => handlePlayAudio(e, true)}
                  className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/20 active:scale-95"
                >
                  🔊
                </button>

                {card?.japanese && KANJI_RE.test(card.japanese) && (
                  <button
                    onClick={handleOpenMnemonic}
                    className="p-3 bg-white/10 hover:bg-white/20 rounded-full transition-all border border-white/20 active:scale-95"
                    title="Remember this kanji"
                  >
                    <Lightbulb size={18} />
                  </button>
                )}

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

    {/* Rendered via portal — the drag/flip motion.divs above apply CSS transforms,
        which would otherwise hijack position:fixed on any descendant and anchor
        this modal to the card instead of the viewport. */}
    {showMnemonic && typeof document !== "undefined" && createPortal(
      <>
        <div className="fixed inset-0 z-[300] bg-black/40" onClick={() => setShowMnemonic(false)} />
        <div
          className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[301] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 p-6 w-full sm:max-w-sm max-h-[80vh] overflow-y-auto"
          style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-500" />
              <p className="text-slate-800 font-black text-sm uppercase tracking-tight">Remember this kanji</p>
            </div>
            <button onClick={() => setShowMnemonic(false)} className="text-slate-300 hover:text-slate-500 shrink-0">
              <X size={18} />
            </button>
          </div>

          {mnemonicLoading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-6 justify-center">
              <Loader2 size={16} className="animate-spin" />
              <span>Thinking of a way to remember it…</span>
            </div>
          )}

          {!mnemonicLoading && mnemonicError && (
            <p className="text-center text-rose-500 text-xs font-bold py-6">{mnemonicError}</p>
          )}

          {!mnemonicLoading && !mnemonicError && card.mnemonic && (
            <div className="space-y-4">
              {card.mnemonic.entries.map((entry, i) => (
                <div key={i} className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-3xl font-black text-slate-800 mb-1">{entry.character}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-1.5">
                    {entry.radicals}
                  </p>
                  <p className="text-sm text-slate-600 leading-snug">{entry.story}</p>
                </div>
              ))}
              {card.mnemonic.origin && (
                <p className="text-xs text-slate-400 italic leading-snug pt-1">{card.mnemonic.origin}</p>
              )}
            </div>
          )}
        </div>
      </>,
      document.body,
    )}
    </>
  );
}
