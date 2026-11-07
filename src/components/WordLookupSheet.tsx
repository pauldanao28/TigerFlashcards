"use client";
import { Check, Loader2, Volume2, X } from "lucide-react";
import { speak } from "@/lib/tts";
import type { WordLookup } from "@/hooks/useWordLookup";

/**
 * Bottom sheet shown after tapping a word (TappableText): Jisho reading/meanings (or
 * compound words for a single kanji), deck status, listen, and an editable "word to
 * add". Shared by the quizzes, the Reader and the Sensei chat — each one only decides
 * what "add" means (word list vs straight into the deck) via onAdd/isAdded.
 */
export default function WordLookupSheet({
  lookup,
  onClose,
  onEditWord,
  onAdd,
  isAdded,
  adding = false,
  addLabel,
  addIcon,
  layerClassName = { backdrop: "z-40", sheet: "z-50 bottom-0 left-0 right-0" },
}: {
  lookup: WordLookup;
  onClose: () => void;
  onEditWord: (value: string) => void;
  onAdd: (word: string) => void | Promise<unknown>;
  isAdded: (word: string) => boolean;
  adding?: boolean;
  addLabel: string;
  addIcon: React.ReactNode;
  // z-index + position, so the sheet stacks above whichever screen opened it
  layerClassName?: { backdrop: string; sheet: string };
}) {
  const editWord = lookup.editWord.trim();
  // Already in the deck from before this session (checked fresh against the DB by
  // useWordLookup, not just the session-local `isAdded` set) — treat the same as added.
  const alreadyInDeck = lookup.deckStatus !== undefined && lookup.deckStatus !== "new";
  const added = !!editWord && (isAdded(editWord) || alreadyInDeck);

  return (
    <>
      <div className={`fixed inset-0 bg-black/20 ${layerClassName.backdrop}`} onClick={onClose} />
      <div
        className={`fixed bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5 ${layerClassName.sheet}`}
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-2xl font-black text-slate-800">{lookup.editWord}</div>
              {lookup.jlpt && lookup.jlpt.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{lookup.jlpt[0].toUpperCase()}</span>
              )}
              {lookup.isCommon && (
                <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">common</span>
              )}
              <button
                onClick={() => speak(lookup.editWord, "ja-JP")}
                className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-50"
              >
                <Volume2 size={11} /> Listen
              </button>
            </div>
            <div className="text-sm text-indigo-500 font-bold mt-0.5">{lookup.reading}</div>
            {lookup.deckStatus === "weak" ? (
              <div className="mt-1 inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-xs font-bold px-2 py-0.5 rounded-full">
                ⚠️ Weak — {lookup.deckAccuracy}% accuracy
              </div>
            ) : lookup.deckStatus === "easy" ? (
              <div className="mt-1 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                ✓ Easy — {lookup.deckAccuracy}% accuracy
              </div>
            ) : lookup.deckStatus === "known" ? (
              <div className="mt-1 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                ✓ in your deck
              </div>
            ) : lookup.deckStatus === "new" ? (
              <div className="mt-1 inline-flex items-center gap-1 bg-violet-50 text-violet-700 text-xs font-bold px-2 py-0.5 rounded-full">
                Not in your deck yet
              </div>
            ) : null}
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 mt-1 shrink-0"><X size={16} /></button>
        </div>

        {lookup.jishoLoading && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
            <Loader2 size={11} className="animate-spin" />
            <span>Looking up…</span>
          </div>
        )}
        {!lookup.jishoLoading && lookup.compounds && lookup.compounds.length > 0 && (
          <div className="mb-3 pb-3 border-b border-slate-100">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Words using 「{lookup.editWord}」</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {lookup.compounds.map((c, i) => {
                const compoundAdded = isAdded(c.word);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 py-1">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-black text-slate-800">{c.word}</span>
                      <span className="text-xs text-indigo-500 font-bold ml-1.5">{c.reading}</span>
                      {c.jlpt?.[0] && <span className="ml-1.5 bg-amber-100 text-amber-700 text-[8px] font-black px-1 py-0.5 rounded-full">{c.jlpt[0].toUpperCase()}</span>}
                      <p className="text-[10px] text-slate-500 truncate">{c.meaning}</p>
                    </div>
                    <button
                      onClick={() => onAdd(c.word)}
                      disabled={adding || compoundAdded}
                      className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors active:scale-95 ${compoundAdded ? "bg-emerald-50 text-emerald-600 cursor-default" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                    >
                      {compoundAdded ? "Added" : "+ Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!lookup.jishoLoading && !lookup.compounds?.length && lookup.jishoMeanings && lookup.jishoMeanings.length > 0 && (
          <div className="mb-3 pb-3 border-b border-slate-100">
            {lookup.jishoMeanings.map((m, i) => (
              <div key={i} className="mb-1">
                {m.pos && <span className="text-[9px] text-slate-400 font-bold mr-1">{m.pos}</span>}
                <span className="text-xs text-slate-700">{m.definition}</span>
              </div>
            ))}
          </div>
        )}
        {!lookup.jishoLoading && !lookup.compounds?.length && lookup.jishoMeanings && lookup.jishoMeanings.length === 0 && (
          <p className="text-xs text-slate-400 mb-3 pb-3 border-b border-slate-100">
            No dictionary entry found for this — you can still add it below.
          </p>
        )}

        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Word to add</label>
        <input
          type="text"
          value={lookup.editWord}
          onChange={(e) => onEditWord(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
          placeholder="e.g. 食べる"
        />
        <button
          onClick={async () => {
            if (!editWord) return;
            await onAdd(editWord);
            onClose();
          }}
          disabled={!editWord || adding || added}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40"
        >
          {adding ? (
            <><Loader2 size={11} className="animate-spin" /> Adding…</>
          ) : added ? (
            <><Check size={11} /> Added</>
          ) : (
            <>{addIcon} {addLabel}</>
          )}
        </button>
      </div>
    </>
  );
}
