"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { useAddWords } from "@/hooks/useAddWords";

const t = translations.en;

/**
 * The same add-word bottom sheet (Word / Paste / Queue tabs, AI generation,
 * added-words summary) used by the stats page's Add Sheet — extracted so the
 * Study tab can open the identical flow from its own "+" button without
 * duplicating it. Each caller owns its own trigger button and open state;
 * this component owns everything from the sheet down.
 */
export default function AddWordsSheet({
  userId,
  deckId,
  isAdmin,
  blocklist,
  open,
  onClose,
  onAdded,
  onQueueCountChange,
  initialTab = "word",
}: {
  userId: string;
  deckId: string;
  isAdmin?: boolean;
  blocklist?: string[];
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
  onQueueCountChange?: (count: number) => void;
  initialTab?: "word" | "paste" | "queue";
}) {
  const {
    loading,
    addedWordsSummary,
    showSummary,
    setShowSummary,
    processWords,
    deleteFromSummary,
  } = useAddWords({ userId, deckId, isAdmin, blocklist, onAdded });

  const [input, setInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [addSheetTab, setAddSheetTab] = useState<"word" | "paste" | "queue">(initialTab);
  const [pendingWords, setPendingWords] = useState<string[]>([]);
  const [wordListText, setWordListText] = useState("");
  const [wordListAdding, setWordListAdding] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-populate from localStorage immediately, then reconcile with Supabase — same
  // merge-on-load as the stats page, so the queue is consistent between both entry points.
  useEffect(() => {
    if (!userId) return;
    let localWords: string[] = [];
    try {
      const stored = localStorage.getItem(`flashkado-word-list-${userId}`);
      localWords = stored ? JSON.parse(stored) : [];
      if (localWords.length > 0) setPendingWords(localWords);
    } catch {
      /* ignore */
    }

    supabase
      .from("profiles")
      .select("pending_words")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        const dbWords: string[] = data?.pending_words ?? [];
        const merged = [...new Set([...dbWords, ...localWords])];
        setPendingWords(merged);
        localStorage.setItem(`flashkado-word-list-${userId}`, JSON.stringify(merged));
      });
  }, [userId]);

  useEffect(() => {
    onQueueCountChange?.(pendingWords.length);
  }, [pendingWords.length, onQueueCountChange]);

  useEffect(() => {
    if (open) setAddSheetTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (open && addSheetTab === "queue") setWordListText(pendingWords.join("\n"));
  }, [open, addSheetTab, pendingWords]);

  const syncWordList = (newList: string[]) => {
    setPendingWords(newList);
    localStorage.setItem(`flashkado-word-list-${userId}`, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
        .then(({ error: e }) => { if (e) console.error("[DB word-list sync]", e.code, e.message); });
    }, 1000);
  };

  // Cancel any pending debounce and write immediately — used when closing the sheet or
  // adding to the deck, so a quick close/click right after typing can't lose the edit.
  const flushWordList = (newList: string[]) => {
    setPendingWords(newList);
    localStorage.setItem(`flashkado-word-list-${userId}`, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
      .then(({ error: e }) => { if (e) console.error("[DB word-list flush]", e.code, e.message); });
  };

  const closeAndFlush = () => {
    flushWordList(wordListText.split("\n").map((w) => w.trim()).filter(Boolean));
    onClose();
  };

  const addWordListToDeck = async (words: string[]) => {
    if (!words.length) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setWordListAdding(true);
    onClose();
    setBatchProcessing(true);
    try {
      const succeededWords = await processWords(words);
      flushWordList(words.filter((w) => !succeededWords.has(w)));
      setWordListText("");
    } finally {
      setWordListAdding(false);
      setBatchProcessing(false);
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[250] flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={closeAndFlush}
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
            className="relative bg-white rounded-t-[2rem] shadow-2xl flex flex-col max-h-[85dvh]"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>

            <div className="flex items-center gap-1 px-5 pt-2 pb-3 border-b border-slate-100">
              {(["word", "paste", "queue"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAddSheetTab(tab)}
                  className={`relative flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${addSheetTab === tab ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
                >
                  {tab === "word" && "Word"}
                  {tab === "paste" && "Paste"}
                  {tab === "queue" && "Queue"}
                  {tab === "queue" && pendingWords.length > 0 && (
                    <span className={`absolute -top-1.5 -right-1 text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center ${addSheetTab === "queue" ? "bg-white text-indigo-600" : "bg-indigo-600 text-white"}`}>
                      {pendingWords.length}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={closeAndFlush}
                className="ml-2 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-slate-200 shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {addSheetTab === "word" && (
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Japanese or English word</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && input.trim()) {
                            processWords(input.split("\n").filter((l) => l.trim()));
                          }
                        }}
                        placeholder="食べる / taberu / to eat…"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 text-base font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => { if (!input.trim()) return; processWords(input.split("\n").filter((l) => l.trim())); }}
                    disabled={loading || !input.trim()}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Generating…</> : <><Plus size={16} /> Add to Deck</>}
                  </button>
                  <p className="text-center text-[10px] text-slate-400 font-bold">AI generates the card — reading, meaning, JLPT level</p>
                </div>
              )}

              {addSheetTab === "paste" && (() => {
                const lines = batchInput.trim().split("\n").filter(Boolean);
                const hasJp = /[぀-ヿ一-龯]/.test(batchInput);
                const avgLen = batchInput.length / Math.max(lines.length, 1);
                let hint: { label: string; emoji: string } | null = null;
                if (batchInput.trim()) {
                  if (lines.length === 1) hint = { emoji: "🔤", label: "Single word" };
                  else if (hasJp && avgLen > 15) hint = { emoji: "🎵", label: "Japanese text — AI extracts vocabulary" };
                  else if (hasJp) hint = { emoji: "📋", label: "Japanese word list" };
                  else if (avgLen > 20) hint = { emoji: "📖", label: "English text (Japanese input works best)" };
                  else hint = { emoji: "📋", label: "English word list — one per line" };
                }
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Paste lyrics, a story, or a word list</p>
                      {hint && (
                        <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-0.5 rounded-full">
                          {hint.emoji} {hint.label}
                        </span>
                      )}
                    </div>
                    <textarea
                      value={batchInput}
                      onChange={(e) => setBatchInput(e.target.value)}
                      rows={9}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                      placeholder={"食べる\n勉強する\n\nor paste a full song / article in Japanese…"}
                    />
                    <button
                      onClick={async () => {
                        onClose();
                        setBatchProcessing(true);
                        try { await processWords([batchInput]); }
                        finally { setBatchProcessing(false); }
                      }}
                      disabled={loading || !batchInput.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      {loading ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Plus size={16} /> Extract &amp; Add</>}
                    </button>
                  </div>
                );
              })()}

              {addSheetTab === "queue" && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{pendingWords.length} word{pendingWords.length !== 1 ? "s" : ""} queued · one per line</p>
                    <button onClick={() => { flushWordList([]); setWordListText(""); }} className="text-[10px] font-black text-rose-400 hover:text-rose-500 uppercase tracking-widest">Clear all</button>
                  </div>
                  <textarea
                    value={wordListText}
                    onChange={(e) => setWordListText(e.target.value)}
                    onBlur={(e) => syncWordList(e.target.value.split("\n").map((w) => w.trim()).filter(Boolean))}
                    rows={10}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
                    placeholder={"食べる\n勉強\n彼女\n…"}
                  />
                  <button
                    onClick={() => addWordListToDeck(wordListText.split("\n").map((w) => w.trim()).filter(Boolean))}
                    disabled={wordListAdding || !wordListText.trim()}
                    className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {wordListAdding ? <><Loader2 size={16} className="animate-spin" /> Adding…</> : <><Plus size={16} /> Add All to Deck</>}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* Batch processing overlay — sheet closes immediately, this shows while AI works */}
      {batchProcessing && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Processing…</p>
          </div>
        </div>
      )}

      {showSummary && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start gap-3 bg-slate-50/50">
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">
                  {t.words_added}
                </h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 flex flex-wrap gap-x-1">
                  <span>{addedWordsSummary.filter((w) => !w.alreadyInDeck).length} new</span>
                  {addedWordsSummary.some((w) => w.alreadyInDeck) && (
                    <span className="text-teal-500 whitespace-nowrap">· {addedWordsSummary.filter((w) => w.alreadyInDeck).length} already in deck</span>
                  )}
                </p>
                {addedWordsSummary.length >= 50 && (
                  <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black border border-amber-200 animate-pulse">
                    {t.limit_notice}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowSummary(false)}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {addedWordsSummary.map((word, i) => (
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
                      onClick={() => deleteFromSummary(word.id)}
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
                onClick={() => setShowSummary(false)}
                className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg"
              >
                {t.got_it}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[220] flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-bold animate-pulse">{t.ai_building}</p>
        </div>
      )}
    </>
  );
}
