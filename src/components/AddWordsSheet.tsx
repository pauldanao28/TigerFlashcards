"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/languages";
import { useAddWords } from "@/hooks/useAddWords";
import AddedWordsSummary from "@/components/AddedWordsSummary";

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
                      <div className="relative flex-1">
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
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-10 py-3.5 text-base font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                        {input && (
                          <button
                            type="button"
                            onClick={() => setInput("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-200 hover:text-slate-500 active:scale-90 transition-all"
                            title="Clear"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
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
                const lines = batchInput.split("\n").map((l) => l.trim()).filter(Boolean);
                const looksLikeText = lines.some((l) => l.length > 15 || /[。、！？]/.test(l));
                let hint: { label: string; emoji: string } | null = null;
                if (lines.length > 0) {
                  hint = looksLikeText
                    ? { emoji: "📖", label: "Looks like sentences — use the Reader" }
                    : { emoji: "📋", label: `${lines.length} word${lines.length !== 1 ? "s" : ""}` };
                }
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">One word per line</p>
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
                      placeholder={"食べる\n勉強する\n彼女\n…"}
                    />
                    <button
                      onClick={async () => {
                        onClose();
                        setBatchProcessing(true);
                        try { await processWords(lines); }
                        finally { setBatchProcessing(false); }
                      }}
                      disabled={loading || !batchInput.trim()}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                    >
                      {loading ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Plus size={16} /> Add {lines.length || ""} to Deck</>}
                    </button>
                    <p className="text-center text-[10px] text-slate-400 font-bold">
                      Have lyrics or a story? Paste it in Practice → Reader to pick out the words you don&apos;t have yet.
                    </p>
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

      {/* Batch processing overlay — sheet closes immediately, this shows while AI works.
          z-[260]: above the sheet itself (z-[250]) since the Word tab's single-add path
          leaves the sheet open, so this/the summary below must render on top of it, not behind. */}
      {batchProcessing && (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl px-10 py-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-10 h-10 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Processing…</p>
          </div>
        </div>
      )}

      {showSummary && (
        <AddedWordsSummary
          words={addedWordsSummary}
          onClose={() => setShowSummary(false)}
          onDelete={(word) => deleteFromSummary(word.id)}
        />
      )}

      {loading && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[260] flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-lg font-bold animate-pulse">{t.ai_building}</p>
        </div>
      )}
    </>
  );
}
