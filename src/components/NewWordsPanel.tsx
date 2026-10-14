"use client";
import { Check, Loader2, Plus } from "lucide-react";
import { kanjiRe } from "@/components/TappableText";
import type { WordMining } from "@/hooks/useWordMining";

/**
 * "Not in your deck" checklist for the Reader and the Watch view: the words from the
 * text that aren't in the deck yet (dictionary form), all ticked by default, tap a
 * word for its Jisho lookup, and batch-add the ticked ones (that's the only AI step).
 */
export default function NewWordsPanel({
  mining,
  onWordTap,
  className = "",
}: {
  mining: WordMining;
  onWordTap: (word: string, e: React.MouseEvent) => void;
  className?: string;
}) {
  const { newWords, visibleNewWords, visibleSelectedCount, kanjiOnly, selectedNew, newWordsError, newWordsLoading, addLoading } = mining;
  const hiddenCount = newWords.length - visibleNewWords.length;

  return (
    <div className={`bg-white rounded-3xl border border-slate-100 shadow-sm p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
          Not in your deck · {visibleNewWords.length}
        </p>
        {visibleNewWords.length > 0 && (
          <button
            onClick={mining.toggleAllNewWords}
            className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
          >
            {visibleSelectedCount === visibleNewWords.length ? "Select none" : "Select all"}
          </button>
        )}
      </div>

      {/* Optionally hide words with no kanji at all (ちょっと, ラーメン) — kanji words keep their okurigana */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={mining.toggleKanjiOnly}
          aria-pressed={kanjiOnly}
          className={`flex items-center gap-1.5 text-[10px] font-black px-2.5 py-1 rounded-full border transition-colors active:scale-95 ${kanjiOnly ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200"}`}
        >
          {kanjiOnly && <Check size={10} strokeWidth={3} />} Kanji words only
        </button>
        {hiddenCount > 0 && <span className="text-[10px] font-bold text-slate-300">{hiddenCount} kana-only hidden</span>}
      </div>

      {newWordsLoading ? (
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Loader2 size={12} className="animate-spin" /> Finding words…
        </div>
      ) : newWordsError ? (
        <p className="text-xs font-bold text-rose-500">Couldn&apos;t build the word list — tapping words still works.</p>
      ) : newWords.length === 0 ? (
        <p className="text-xs font-bold text-slate-400">Every word here is already in your deck. 🎉</p>
      ) : visibleNewWords.length === 0 ? (
        <p className="text-xs font-bold text-slate-400">Only kana words left — turn off “Kanji words only” to see them.</p>
      ) : (
        <>
          <div className="flex flex-col divide-y divide-slate-50">
            {visibleNewWords.map((w) => {
              const checked = selectedNew.has(w.word);
              return (
                <div key={w.word} className="flex items-center gap-3 py-2">
                  <button
                    onClick={() => mining.toggleNewWord(w.word)}
                    aria-label={checked ? `Deselect ${w.word}` : `Select ${w.word}`}
                    className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors active:scale-90 ${checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"}`}
                  >
                    {checked && <Check size={12} strokeWidth={3} />}
                  </button>
                  <button onClick={(e) => onWordTap(w.word, e)} className="flex-1 min-w-0 text-left">
                    <span className="text-base font-black text-slate-800">{w.word}</span>
                    {w.reading && kanjiRe.test(w.word) && (
                      <span className="text-xs font-bold text-indigo-500 ml-2">{w.reading}</span>
                    )}
                  </button>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 shrink-0">{w.pos}</span>
                </div>
              );
            })}
          </div>
          <button
            onClick={mining.addSelectedNewWords}
            disabled={addLoading || visibleSelectedCount === 0}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40"
          >
            {addLoading ? (
              <><Loader2 size={12} className="animate-spin" /> Adding…</>
            ) : (
              <><Plus size={12} /> Add {visibleSelectedCount} to Deck</>
            )}
          </button>
        </>
      )}
    </div>
  );
}
