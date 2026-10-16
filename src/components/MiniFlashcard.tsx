"use client";
import { motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { FlashcardData } from "@/lib/types";

// A deliberately stripped-down card for Mini Mode: just the word, tap to flip,
// swipe to grade. No audio, mnemonic, example sentence, priority star, or report
// button — those belong to the full study screen, not a tiny discreet widget.

interface MiniFlashcardProps {
  card: FlashcardData;
  language: "en" | "jp";
  isFlipped: boolean;
  onFlip: (state: boolean) => void;
  onSwipe?: (direction: "left" | "right") => void;
}

const JLPT_BADGE_COLOR: Record<string, string> = {
  N5: "bg-emerald-100 text-emerald-700",
  N4: "bg-sky-100 text-sky-700",
  N3: "bg-amber-100 text-amber-700",
  N2: "bg-orange-100 text-orange-700",
  N1: "bg-rose-100 text-rose-700",
};

const getFontSize = (text: string, isJapanese: boolean) => {
  const len = text.length;
  if (isJapanese) {
    if (len > 12) return "text-lg";
    if (len > 8) return "text-xl";
    if (len > 5) return "text-2xl";
    return "text-3xl";
  }
  if (len > 40) return "text-sm";
  if (len > 24) return "text-base";
  if (len > 14) return "text-lg";
  return "text-xl";
};

export default function MiniFlashcard({ card, language, isFlipped, onFlip, onSwipe }: MiniFlashcardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-15, 15]);
  const opacity = useTransform(x, [-150, -100, 0, 100, 150], [0, 1, 1, 1, 0]);
  const passOpacity = useTransform(x, [15, 90], [0, 1]);
  const failOpacity = useTransform(x, [-15, -90], [0, 1]);

  const frontText = language === "jp" ? card.japanese : card.english;
  const backText = language === "jp" ? card.english : card.japanese;
  const isBackJapanese = backText === card.japanese;

  const handleDragEnd = (_e: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const threshold = 70;
    if (info.offset.x > threshold) onSwipe?.("right");
    else if (info.offset.x < -threshold) onSwipe?.("left");
  };

  return (
    <div className="w-full h-full [perspective:1000px] touch-none">
      <motion.div
        style={{ x, rotate, opacity }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.6}
        onDragEnd={handleDragEnd}
        className="relative w-full h-full cursor-grab active:cursor-grabbing"
      >
        <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden rounded-2xl">
          <motion.div style={{ opacity: passOpacity }} className="absolute inset-0 bg-emerald-500/10" />
          <motion.div style={{ opacity: failOpacity }} className="absolute inset-0 bg-rose-500/10" />
        </div>

        <motion.div
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          initial={false}
          transition={{ duration: 0.45, type: "spring", stiffness: 280, damping: 24 }}
          onClick={() => onFlip(!isFlipped)}
          className="relative w-full h-full"
          style={{ transformStyle: "preserve-3d", WebkitTransformStyle: "preserve-3d" } as React.CSSProperties}
        >
          {/* FRONT */}
          <div
            className="absolute inset-0 flex items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-md p-4 text-center"
            style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" } as React.CSSProperties}
          >
            <span className={`font-black text-slate-800 leading-tight break-words ${getFontSize(frontText, language === "jp")}`}>
              {frontText}
            </span>
          </div>

          {/* BACK */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-indigo-600 text-white rounded-2xl shadow-md p-4 text-center"
            style={{
              transform: "rotateY(180deg)",
              WebkitTransform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
            } as React.CSSProperties}
          >
            {card.jlpt_level && (
              <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${JLPT_BADGE_COLOR[card.jlpt_level] ?? "bg-white/20 text-white"}`}>
                {card.jlpt_level}
              </span>
            )}
            {card.reading && (
              <p className="text-indigo-200 text-xs font-medium truncate w-full">{card.reading}</p>
            )}
            <h2 className={`font-bold leading-tight break-words ${getFontSize(backText, isBackJapanese)}`}>
              {backText}
            </h2>
            {(card.transitivity || card.verb_type || card.adjective_type) && (
              <div className="flex flex-wrap items-center justify-center gap-1">
                {card.transitivity && (
                  <span className="px-1.5 py-0.5 bg-white/15 rounded-full text-[7px] font-black uppercase tracking-widest">
                    {card.transitivity === "transitive" ? "Trans." : "Intrans."}
                  </span>
                )}
                {card.verb_type && (
                  <span className="px-1.5 py-0.5 bg-white/15 rounded-full text-[7px] font-black uppercase tracking-widest">
                    {card.verb_type === "godan" ? "Godan" : card.verb_type === "ichidan" ? "Ichidan" : "Irregular"}
                  </span>
                )}
                {card.adjective_type && (
                  <span className="px-1.5 py-0.5 bg-white/15 rounded-full text-[7px] font-black uppercase tracking-widest">
                    {card.adjective_type === "i" ? "い-adj" : "な-adj"}
                  </span>
                )}
              </div>
            )}
            {card.te_form && (
              <p className="text-indigo-200 text-[10px] font-medium">
                Te: <span className="text-white font-bold">{card.te_form}</span>
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
