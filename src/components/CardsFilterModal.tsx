"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { SlidersHorizontal, X } from "lucide-react";
import CardMetadataFilters from "@/components/CardMetadataFilters";
import { FILTERABLE_PARTS_OF_SPEECH } from "@/lib/textNormalize";
import type { CardType } from "@/lib/cardMetadata";
import type { FlashcardData } from "@/lib/types";

export type CardsProgressFilter = "none" | "slowReflex" | "recentlyReviewed" | "weakWords" | "favorites" | "mastered";

interface Props {
  onClose: () => void;
  cards: FlashcardData[];
  reviewWeek: number | null;
  onReviewWeekChange: (value: number | null) => void;
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

// Identical palette and markup to StudyView's white filter sheet.
const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type JlptLevel = typeof JLPT_LEVELS[number];
const JLPT_BAR_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-500", N4: "bg-sky-500", N3: "bg-amber-500",
  N2: "bg-orange-500", N1: "bg-rose-500",
};
const JLPT_BADGE_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-sky-100 text-sky-700 border-sky-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};
const REVIEW_WINDOWS = ["All time","This week","Last week","2 weeks ago","3 weeks ago","4 weeks ago","Never reviewed"] as const;
const PROGRESS = [
  ["mastered", "🏆 Mastered"],
  ["favorites", "⭐ Favorites"],
  ["slowReflex", "🐌 Slow Reflex"],
  ["recentlyReviewed", "🕐 Recently Reviewed"],
  ["weakWords", "😓 Weak Words"],
] as const;

export default function CardsFilterModal({
  onClose, cards, reviewWeek, onReviewWeekChange, jlptFilters, onJlptChange, posFilters, onPosChange,
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

  const mastery = useMemo(() => {
    const byLevel = {} as Record<JlptLevel, { total: number; mastered: number }>;
    const byPos: Record<string, { total: number; mastered: number }> = {};
    for (const level of JLPT_LEVELS) byLevel[level] = { total: 0, mastered: 0 };
    for (const pos of FILTERABLE_PARTS_OF_SPEECH) byPos[pos] = { total: 0, mastered: 0 };
    // Same recognition mastery formula as Study (JP→EN: 5+ passes, 70%+).
    for (const card of cards) {
      const score = card.scores?.jp_to_en;
      const mastered = (score?.pass ?? 0) >= 5 && (score?.percent ?? 0) >= 70;
      const level = card.jlpt_level;
      if (level && level in byLevel) {
        byLevel[level].total += 1;
        if (mastered) byLevel[level].mastered += 1;
      }
      const pos = card.partOfSpeech ?? "noun";
      if (pos in byPos) {
        byPos[pos].total += 1;
        if (mastered) byPos[pos].mastered += 1;
      }
    }
    return { byLevel, byPos };
  }, [cards]);
  const percent = (entry: { total: number; mastered: number }) =>
    entry.total ? Math.round(entry.mastered / entry.total * 100) : 0;

  const activeCount = (reviewWeek === null ? 0 : 1) + jlptFilters.length + posFilters.length +
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
            <h3 className="text-slate-800 font-black text-sm uppercase tracking-tight mb-1.5">JLPT Level</h3>
            <p className="text-[10px] font-bold text-slate-400 mb-4 leading-relaxed">
              Tap levels to filter your cards — pick as many as you like. Bars show your mastery of each level; the number on the right is how many cards you have.
            </p>
            <div className="flex gap-2 mb-5 flex-wrap">
              {(["All", ...JLPT_LEVELS] as const).map(level => {
                const isAll = level === "All";
                const active = isAll ? !jlptFilters.length : jlptFilters.includes(level);
                return (
                  <button type="button" key={level} aria-pressed={active}
                    onClick={() => onJlptChange(isAll ? [] : active ? jlptFilters.filter(v => v !== level) : [...jlptFilters, level])}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                      active
                        ? isAll ? "bg-slate-800 text-white border-slate-800" : `${JLPT_BAR_COLOR[level]} text-white border-transparent`
                        : isAll ? "bg-slate-50 text-slate-500 border-slate-200" : JLPT_BADGE_COLOR[level]
                    }`}>
                    {level}
                  </button>
                );
              })}
            </div>
            <div className="space-y-3">
              {JLPT_LEVELS.map(level => {
                const { total } = mastery.byLevel[level];
                const mastered = percent(mastery.byLevel[level]);
                return (
                  <div key={level} className="flex items-center gap-3">
                    <span className={`shrink-0 w-9 text-[10px] px-1.5 py-0.5 rounded-md border font-black text-center uppercase tracking-tighter ${JLPT_BADGE_COLOR[level]}`}>
                      {level}
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${JLPT_BAR_COLOR[level]}`} style={{width: `${mastered}%`}} />
                    </div>
                    <span className="shrink-0 w-14 text-right text-xs font-black text-slate-600">{total}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <div className="h-px bg-slate-100 -mx-5" />
          <section>
            <h3 className="text-slate-800 font-black text-sm uppercase tracking-tight mb-1.5">Part of Speech</h3>
            <p className="text-[10px] font-bold text-slate-400 mb-3 leading-relaxed">
              Narrow it further — pick as many as you like. Each pill fills left to right by how well you&apos;ve mastered that tag.
            </p>
            <div className="flex gap-2 flex-wrap">
              {(["All", ...FILTERABLE_PARTS_OF_SPEECH] as const).map(pos => {
                const isAll = pos === "All";
                const active = isAll ? !posFilters.length : posFilters.includes(pos);
                const mastered = isAll ? 0 : percent(mastery.byPos[pos]);
                return (
                  <button type="button" key={pos} aria-pressed={active}
                    onClick={() => onPosChange(isAll ? [] : active ? posFilters.filter(v => v !== pos) : [...posFilters, pos])}
                    className={`relative overflow-hidden px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all active:scale-95 ${
                      isAll
                        ? active ? "bg-slate-800 text-white border-slate-800" : "bg-slate-50 text-slate-500 border-slate-200"
                        : `bg-slate-50 text-slate-600 ${active ? "border-indigo-600 ring-2 ring-indigo-600 ring-offset-1" : "border-slate-200"}`
                    }`}>
                    {!isAll && <span aria-hidden className="absolute inset-y-0 left-0 bg-indigo-200" style={{width: `${mastered}%`}} />}
                    <span className="relative">{pos}{!isAll ? ` · ${mastered}%` : ""}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <div className="h-px bg-slate-100 -mx-5" />
          <CardMetadataFilters cardType={cardType} onCardTypeChange={onCardTypeChange}
            selectedTags={situationFilters} onTagsChange={onSituationChange} tags={availableTags} />
          <div className="h-px bg-slate-100 -mx-5" />
          <section>
            <h3 className="text-slate-800 font-black text-sm uppercase tracking-tight mb-2">Last reviewed</h3>
            <div className="flex gap-2 flex-wrap">
              {REVIEW_WINDOWS.map((label, i) => {
                const value = i === 0 ? null : i === 6 ? -1 : i - 1;
                return <button type="button" key={label} aria-pressed={reviewWeek === value}
                  onClick={() => onReviewWeekChange(value)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                    reviewWeek === value ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 text-slate-500 border-slate-200"
                  }`}>{label}</button>;
              })}
            </div>
          </section>
          <div className="h-px bg-slate-100 -mx-5" />
          <section>
            <h3 className="text-slate-800 font-black text-sm uppercase tracking-tight mb-1.5">Progress</h3>
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
