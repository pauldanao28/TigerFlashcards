"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import CardMetadataFilters from "@/components/CardMetadataFilters";
import { FILTERABLE_PARTS_OF_SPEECH } from "@/lib/textNormalize";
import type { CardType } from "@/lib/cardMetadata";

export type CardsProgressFilter = "none" | "slowReflex" | "recentlyReviewed" | "weakWords" | "favorites" | "mastered";

interface Props {
  onClose: () => void;
  jlptFilters: string[];
  onJlptChange: (values: string[]) => void;
  posFilters: string[];
  onPosChange: (values: string[]) => void;
  cardType: CardType | "all";
  onCardTypeChange: (value: CardType | "all") => void;
  situationFilters: string[];
  onSituationChange: (tags: string[]) => void;
  availableTags: string[];
  progressFilter: CardsProgressFilter;
  onProgressChange: (value: CardsProgressFilter) => void;
  matchingCount: number;
  onReset: () => void;
}

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"];
const PROGRESS = [
  ["mastered", "🏆 Mastered"],
  ["favorites", "⭐ Favorites"],
  ["slowReflex", "🐌 Slow Reflex"],
  ["recentlyReviewed", "🕐 Recently Reviewed"],
  ["weakWords", "😓 Weak Words"],
] as const;

export default function CardsFilterModal({
  onClose, jlptFilters, onJlptChange, posFilters, onPosChange,
  cardType, onCardTypeChange, situationFilters, onSituationChange, availableTags,
  progressFilter, onProgressChange, matchingCount, onReset,
}: Props) {
  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = priorOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const activeCount = jlptFilters.length + posFilters.length +
    (cardType === "all" ? 0 : 1) + situationFilters.length +
    (progressFilter === "none" ? 0 : 1);

  const chip = (active: boolean) => `px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 ${
    active ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-600 border-slate-200"
  }`;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-end justify-center sm:items-center sm:p-4" role="presentation">
      <motion.div
        initial={{opacity: 0}} animate={{opacity: 1}}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <motion.div
        role="dialog" aria-modal="true" aria-label="Filter cards"
        initial={{y: 60, opacity: 0}} animate={{y: 0, opacity: 1}}
        transition={{type: "spring", stiffness: 320, damping: 28}}
        className="relative flex flex-col w-full sm:max-w-lg max-h-[88dvh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
      >
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={16} className="text-indigo-600"/>
              <h2 className="text-slate-800 font-black text-sm uppercase tracking-tight">Filter Cards</h2>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              {activeCount ? `${activeCount} active selection${activeCount === 1 ? "" : "s"}` : "All cards"} · {matchingCount} matching
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close filters" className="rounded-xl p-2 bg-slate-50 text-slate-500 hover:bg-slate-100">
            <X size={18}/>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-4">
          <section>
            <h3 className="text-slate-800 font-black text-xs uppercase tracking-tight mb-1.5">JLPT Level</h3>
            <p className="text-[10px] text-slate-400 font-semibold mb-3">Choose one or several levels.</p>
            <div className="flex gap-2 flex-wrap">
              {["All", ...JLPT_LEVELS].map(level => {
                const active = level === "All" ? !jlptFilters.length : jlptFilters.includes(level);
                return <button key={level} type="button" aria-pressed={active} className={chip(active)}
                  onClick={() => onJlptChange(level === "All" ? [] : active ? jlptFilters.filter(v => v !== level) : [...jlptFilters, level])}>
                  {level}
                </button>;
              })}
            </div>
          </section>
          <div className="h-px bg-slate-100 -mx-5" />
          <section>
            <h3 className="text-slate-800 font-black text-xs uppercase tracking-tight mb-1.5">Part of Speech</h3>
            <p className="text-[10px] text-slate-400 font-semibold mb-3">Grammatical categories for vocabulary; phrases are under Card Type.</p>
            <div className="flex gap-2 flex-wrap">
              {["All", ...FILTERABLE_PARTS_OF_SPEECH].map(pos => {
                const active = pos === "All" ? !posFilters.length : posFilters.includes(pos);
                return <button key={pos} type="button" aria-pressed={active} className={chip(active)}
                  onClick={() => onPosChange(pos === "All" ? [] : active ? posFilters.filter(v => v !== pos) : [...posFilters, pos])}>
                  {pos}
                </button>;
              })}
            </div>
          </section>
          <div className="h-px bg-slate-100 -mx-5" />
          <CardMetadataFilters cardType={cardType} onCardTypeChange={onCardTypeChange}
            selectedTags={situationFilters} onTagsChange={onSituationChange} tags={availableTags} />
          <div className="h-px bg-slate-100 -mx-5" />
          <section>
            <h3 className="text-slate-800 font-black text-xs uppercase tracking-tight mb-1.5">Progress</h3>
            <p className="text-[10px] text-slate-400 font-semibold mb-3">Optional review focus. Select one at a time.</p>
            <div className="flex gap-2 flex-wrap">
              {([["none", "All"], ...PROGRESS] as const).map(([value, label]) => (
                <button type="button" key={value} aria-pressed={progressFilter === value}
                  className={chip(progressFilter === value)}
                  onClick={() => onProgressChange(value)}>{label}</button>
              ))}
            </div>
          </section>
        </div>

        <div className="shrink-0 flex items-center gap-3 border-t border-slate-100 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white">
          <button type="button" onClick={onReset} disabled={!activeCount}
            className="px-4 py-3 rounded-2xl text-xs font-black border border-slate-200 text-slate-600 disabled:opacity-40">
            Reset
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl text-xs font-black bg-indigo-600 text-white active:scale-95 transition-all">
            Show {matchingCount} Cards
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
