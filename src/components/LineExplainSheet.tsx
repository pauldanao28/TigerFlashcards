"use client";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, Sparkles, Volume2, X } from "lucide-react";
import { speak } from "@/lib/tts";
import type { LineExplainState } from "@/hooks/useLineExplain";

/**
 * Bottom sheet for "Explain this line" (Reader sentences, Watch captions): translation,
 * grammar used, harder words (each addable to the deck), and a nuance note. ‹ › step to
 * the previous / next line without closing.
 */
export default function LineExplainSheet({
  explain,
  onClose,
  onPrev,
  onNext,
  onAddWord,
  isAdded,
  adding = false,
  position,
  unit = "line",
  zClassName = { backdrop: "z-[310]", sheet: "z-[320]" },
}: {
  explain: LineExplainState;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onAddWord: (word: string) => void | Promise<unknown>;
  isAdded: (word: string) => boolean;
  adding?: boolean;
  position?: { index: number; total: number };
  unit?: "line" | "sentence";
  zClassName?: { backdrop: string; sheet: string };
}) {
  const { data } = explain;
  return (
    <>
      <div className={`fixed inset-0 bg-black/20 ${zClassName.backdrop}`} onClick={onClose} />
      <div
        className={`fixed bottom-0 left-0 right-0 max-h-[80vh] flex flex-col bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 ${zClassName.sheet}`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: line + navigation */}
        <div className="p-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-indigo-600">
              <Sparkles size={12} /> Explain {unit}
              {position && <span className="text-slate-300">· {position.index + 1} / {position.total}</span>}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={onPrev} disabled={!onPrev} aria-label={`Previous ${unit}`} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ChevronLeft size={16} /></button>
              <button onClick={onNext} disabled={!onNext} aria-label={`Next ${unit}`} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"><ChevronRight size={16} /></button>
              <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-300 hover:text-slate-500"><X size={16} /></button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <p className="flex-1 text-lg font-bold text-slate-900 leading-relaxed">{explain.line}</p>
            <button onClick={() => speak(explain.line, "ja-JP")} aria-label="Listen" className="shrink-0 mt-1 p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50">
              <Volume2 size={14} />
            </button>
          </div>
          {data?.translation && <p className="text-sm text-slate-500 font-medium mt-1 leading-relaxed">{data.translation}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-5 pt-4 flex flex-col gap-4">
          {explain.loading && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Explaining…
            </div>
          )}
          {explain.error && <p className="text-xs font-bold text-rose-500">{explain.error}</p>}

          {data && data.grammar.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Grammar</p>
              <div className="flex flex-col gap-2">
                {data.grammar.map((g, i) => (
                  <div key={i} className="bg-slate-50 rounded-2xl p-3">
                    <p className="font-black text-indigo-600 text-sm">{g.pattern}</p>
                    <p className="text-xs text-slate-600 leading-relaxed mt-0.5">{g.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data && data.words.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Words</p>
              <div className="flex flex-col divide-y divide-slate-50">
                {data.words.map((w) => {
                  const added = isAdded(w.word);
                  return (
                    <div key={w.word} className="flex items-center gap-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-base font-black text-slate-800">{w.word}</span>
                        {w.reading && w.reading !== w.word && <span className="text-xs font-bold text-indigo-500 ml-2">{w.reading}</span>}
                        <p className="text-xs text-slate-500 truncate">{w.meaning}</p>
                      </div>
                      <button
                        onClick={() => onAddWord(w.word)}
                        disabled={adding || added}
                        className={`shrink-0 flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1.5 rounded-lg transition-colors active:scale-95 ${added ? "bg-emerald-50 text-emerald-600 cursor-default" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"}`}
                      >
                        {added ? <><Check size={10} /> Added</> : <><Plus size={10} /> Add</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data?.note && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-xs text-amber-800 leading-relaxed">
              💡 {data.note}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
