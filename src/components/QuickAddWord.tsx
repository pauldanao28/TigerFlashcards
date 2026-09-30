"use client";
import { useState } from "react";
import { translations } from "@/lib/languages";
import { useAddWords } from "@/hooks/useAddWords";

const t = translations.en;

/**
 * Standalone add-word modal for the Study tab, so adding a word doesn't
 * require navigating to the (much heavier) stats page. Shares the same
 * add-word pipeline as that page's Add Sheet via useAddWords, just with a
 * simpler single-purpose UI (no pending-words queue).
 */
export default function QuickAddWord({
  userId,
  deckId,
  isAdmin,
  blocklist,
  onClose,
  onAdded,
}: {
  userId: string;
  deckId: string;
  isAdmin?: boolean;
  blocklist?: string[];
  onClose: () => void;
  onAdded?: () => void;
}) {
  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const {
    loading,
    addedWordsSummary,
    showSummary,
    setShowSummary,
    processWords,
    deleteFromSummary,
  } = useAddWords({ userId, deckId, isAdmin, blocklist, onAdded });

  return (
    <div className="fixed inset-0 z-[220] flex items-start sm:items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden mt-16 sm:mt-0">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="text-lg font-black text-slate-800 uppercase italic tracking-tighter">
            {t.quick_add}
          </h2>
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.add_new_word}
              autoFocus
              className="flex-1 bg-white border-none rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold"
              onKeyDown={(e) => {
                if (e.key === "Enter" && input.trim()) {
                  processWords(input.split("\n").filter((l) => l.trim()));
                }
              }}
            />
            <button
              onClick={() => {
                if (!input.trim()) return;
                processWords(input.split("\n").filter((l) => l.trim()));
              }}
              disabled={loading}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? "..." : t.ai_add}
            </button>
          </div>

          <button
            onClick={() => setShowBatch(!showBatch)}
            className="w-full px-6 py-2 bg-slate-800 text-white rounded-2xl font-bold hover:bg-slate-700 transition-colors text-sm"
          >
            {showBatch ? t.close : t.batch_upload}
          </button>

          {showBatch && (
            <div className="p-4 bg-indigo-50 rounded-3xl border-2 border-dashed border-indigo-200">
              <textarea
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                className="w-full h-40 p-4 rounded-xl border-none outline-none mb-3 text-sm font-mono shadow-inner"
                placeholder={`FORMAT OPTIONS:\n1. List: words (1 kanji/english word per line)\n2. Lyrics: Paste a whole song or text. I'll pick out the new words for you!`}
              />
              <button
                onClick={() => processWords([batchInput])}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {loading ? t.ai_processing : `${t.batch_upload} (BETA)`}
              </button>
            </div>
          )}

          {showSummary && (
            <div className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between gap-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {addedWordsSummary.filter((w) => !w.alreadyInDeck).length} new
                  {addedWordsSummary.some((w) => w.alreadyInDeck) && (
                    <span className="text-teal-500">
                      {" "}
                      · {addedWordsSummary.filter((w) => w.alreadyInDeck).length} already in deck
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setShowSummary(false)}
                  className="text-slate-300 hover:text-slate-500 shrink-0"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto p-3 space-y-2 bg-slate-50/30">
                {addedWordsSummary.map((word) => (
                  <div
                    key={word.id}
                    className={`group p-3 rounded-xl border shadow-sm flex items-start gap-3 ${word.alreadyInDeck ? "bg-slate-50 border-slate-200 opacity-70" : "bg-white border-slate-100"}`}
                  >
                    <div
                      className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center border ${word.alreadyInDeck ? "bg-slate-100 border-slate-200" : "bg-indigo-50 border-indigo-100"}`}
                    >
                      <span
                        className={`font-black text-sm ${word.alreadyInDeck ? "text-slate-400" : "text-indigo-600"}`}
                      >
                        {word.japanese[0]}
                      </span>
                    </div>
                    <div className="flex-1 flex flex-col text-left min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-black text-slate-800">
                          {word.japanese}
                        </span>
                        <span className="text-[10px] font-bold text-rose-500 uppercase">
                          {word.reading}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium leading-tight truncate">
                        {word.english}
                      </p>
                      {word.alreadyInDeck && (
                        <span className="mt-1 self-start text-[9px] font-black uppercase tracking-widest text-teal-600 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md">
                          Already in deck
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteFromSummary(word.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all active:scale-90"
                      title={t.delete}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
