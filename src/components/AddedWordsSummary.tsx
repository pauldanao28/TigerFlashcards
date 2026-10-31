"use client";
import { translations } from "@/lib/languages";
import type { AddedWordSummary } from "@/hooks/useAddWords";

const t = translations.en;

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
const JLPT_BADGE_COLOR: Record<(typeof JLPT_LEVELS)[number], string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-sky-100 text-sky-700 border-sky-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};

/**
 * "Words added" summary shown after adding words to the deck — new vs already-in-deck
 * counts, JLPT breakdown, and each card (reading, meaning, level, part of speech) with a
 * delete button to undo it. Used by the Add sheet (Study / Profile), the Reader and Watch.
 */
export default function AddedWordsSummary({
  words,
  onClose,
  onDelete,
  zClassName = "z-[260]",
}: {
  words: AddedWordSummary[];
  onClose: () => void;
  onDelete: (word: AddedWordSummary) => void;
  zClassName?: string;
}) {
  return (
    <div className={`fixed inset-0 ${zClassName} flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300`}>
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-3 bg-slate-50/50">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
              {t.words_added}
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex flex-wrap gap-x-1">
              <span>{words.filter((w) => !w.alreadyInDeck).length} new</span>
              {words.some((w) => w.alreadyInDeck) && (
                <span className="text-teal-500 whitespace-nowrap">· {words.filter((w) => w.alreadyInDeck).length} already in deck</span>
              )}
            </p>
            {(() => {
              const levelCounts = words
                .filter((w) => !w.alreadyInDeck && w.jlpt_level)
                .reduce<Record<string, number>>((acc, w) => {
                  acc[w.jlpt_level as string] = (acc[w.jlpt_level as string] || 0) + 1;
                  return acc;
                }, {});
              const levelsPresent = JLPT_LEVELS.filter((lvl) => levelCounts[lvl]);
              if (levelsPresent.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {levelsPresent.map((lvl) => (
                    <span
                      key={lvl}
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border whitespace-nowrap ${JLPT_BADGE_COLOR[lvl]}`}
                    >
                      {lvl} · {levelCounts[lvl]}
                    </span>
                  ))}
                </div>
              );
            })()}
            {words.length >= 50 && (
              <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black border border-amber-200 animate-pulse">
                {t.limit_notice}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
          {words.map((word, i) => (
            <div
              key={i}
              className={`group p-4 rounded-2xl border shadow-sm flex items-start gap-4 transition-all ${word.alreadyInDeck ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-100 hover:border-indigo-100"}`}
            >
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border shadow-sm ${word.alreadyInDeck ? "bg-slate-100 border-slate-200" : "bg-indigo-50 border-indigo-100"}`}>
                <span className={`font-black text-xl ${word.alreadyInDeck ? "text-slate-400" : "text-indigo-600"}`}>
                  {word.japanese[0]}
                </span>
              </div>

              <div className="flex-1 min-w-0 flex flex-col text-left">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-black text-slate-800 truncate">
                    {word.japanese}
                  </span>
                  <span className="text-xs font-bold text-rose-500 uppercase tracking-tighter shrink-0 whitespace-nowrap">
                    {word.reading}
                  </span>
                </div>

                <p className="text-sm text-slate-600 font-medium mt-0.5 leading-tight pr-8 truncate">
                  {word.english}
                </p>

                <div className="mt-2 flex gap-1.5 flex-wrap">
                  {word.jlpt_level && (
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border whitespace-nowrap ${JLPT_BADGE_COLOR[word.jlpt_level]}`}
                    >
                      {word.jlpt_level}
                    </span>
                  )}
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md whitespace-nowrap">
                    {word.partOfSpeech}
                  </span>
                  {word.alreadyInDeck && (
                    <span className="text-[9px] font-black uppercase tracking-widest text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                      Already in deck
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0 -mt-1 -mr-1">
                <button
                  onClick={() => onDelete(word)}
                  className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
                  title={t.delete}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg"
          >
            {t.got_it}
          </button>
        </div>
      </div>
    </div>
  );
}
