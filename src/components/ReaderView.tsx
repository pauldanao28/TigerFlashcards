"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Sparkles, Send, Loader2, Plus, Check, BookOpen, NotebookText, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { useAddWords } from "@/hooks/useAddWords";

interface Segment {
  text: string;
  isContent: boolean;
  reading?: string;
  english?: string;
  pos?: string;
}

interface GrammarNote {
  pattern: string;
  explanation: string;
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof LEVELS)[number];
const MAX_CHARS = 1500;
const KANJI_RE = /[一-龯々〻]/;

/**
 * Paste any Japanese text (or have AI write one) and read it with tap-to-gloss
 * furigana, grammar notes, and a question box scoped to the passage — the
 * "study with AI inside" reading mode. Tapping a word adds it to the deck via
 * the same useAddWords pipeline the Add Sheet uses, so it lands correctly
 * dictionary-formed even if tapped mid-conjugation.
 */
export default function ReaderView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blocklist, setBlocklist] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle(),
      supabase.from("profiles").select("is_admin, blocked_words").eq("id", userId).maybeSingle(),
    ]).then(([deckRes, profileRes]) => {
      setDeckId(deckRes.data?.id ?? null);
      setIsAdmin(!!profileRes.data?.is_admin);
      setBlocklist(profileRes.data?.blocked_words ?? []);
    });
  }, [userId]);

  const { loading: addLoading, processWords } = useAddWords({
    userId,
    deckId: deckId ?? "",
    isAdmin,
    blocklist,
  });

  const [phase, setPhase] = useState<"input" | "loading" | "reading">("input");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [genOpen, setGenOpen] = useState(false);
  const [genLevel, setGenLevel] = useState<Level>("N4");
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  const [passage, setPassage] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [grammarNotes, setGrammarNotes] = useState<GrammarNote[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [selected, setSelected] = useState<{ index: number; seg: Segment } | null>(null);
  const [addedIndices, setAddedIndices] = useState<Set<number>>(new Set());
  const [justAdded, setJustAdded] = useState(false);

  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [askInput, setAskInput] = useState("");
  const [asking, setAsking] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qa.length]);

  const annotate = async (text: string) => {
    setPhase("loading");
    setError(null);
    try {
      const res = await authedFetch("/api/reader/annotate", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process passage");
      setPassage(text);
      setSegments(data.segments);
      setGrammarNotes(data.grammarNotes ?? []);
      setAddedIndices(new Set());
      setQa([]);
      setShowNotes(false);
      setPhase("reading");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setPhase("input");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await authedFetch("/api/reader/generate", {
        method: "POST",
        body: JSON.stringify({ level: genLevel, topic: genTopic.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate a passage");
      setGenOpen(false);
      setGenTopic("");
      await annotate(data.text);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  const handleAdd = async (index: number, seg: Segment) => {
    setJustAdded(false);
    await processWords([seg.text]);
    setAddedIndices((prev) => new Set(prev).add(index));
    setJustAdded(true);
    setTimeout(() => setSelected(null), 700);
  };

  const handleAsk = async () => {
    if (!askInput.trim() || asking) return;
    const question = askInput.trim();
    setAskInput("");
    setAsking(true);
    setQa((prev) => [...prev, { q: question, a: "" }]);
    try {
      const res = await authedFetch("/api/reader/ask", {
        method: "POST",
        body: JSON.stringify({ passage, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to get an answer");
      setQa((prev) => prev.map((item, i) => (i === prev.length - 1 ? { ...item, a: data.answer } : item)));
    } catch (e: any) {
      setQa((prev) =>
        prev.map((item, i) => (i === prev.length - 1 ? { ...item, a: `⚠️ ${e.message || "Something went wrong"}` } : item)),
      );
    } finally {
      setAsking(false);
    }
  };

  const reset = () => {
    setPhase("input");
    setDraft("");
    setPassage("");
    setSegments([]);
    setGrammarNotes([]);
    setQa([]);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={phase === "reading" ? reset : onClose}
          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
        >
          <ChevronLeft size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">
            {phase === "reading" ? "New Passage" : "Back"}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-indigo-500" />
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Reader</span>
        </div>
        <div className="flex items-center gap-1 w-[92px] justify-end">
          {phase === "reading" && grammarNotes.length > 0 && (
            <button
              onClick={() => setShowNotes((v) => !v)}
              className={`relative p-2 rounded-full transition-colors active:scale-90 ${showNotes ? "bg-indigo-50 text-indigo-600" : "hover:bg-slate-100 text-slate-500"}`}
            >
              <NotebookText size={16} />
              <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {grammarNotes.length}
              </span>
            </button>
          )}
          {phase !== "reading" && <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90"><X size={16} /></button>}
        </div>
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
          <h2 className="text-xl font-black text-slate-900 mb-1">Paste something to read</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Lyrics, a manga page, a news snippet, anything. Unknown words get furigana and a tap-to-add button; grammar patterns get explained.
          </p>

          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
            rows={9}
            placeholder={"日本語のテキストをここに貼り付けてください…"}
            className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono leading-relaxed"
          />
          <p className="text-right text-[10px] font-bold text-slate-300 mt-1">{draft.length}/{MAX_CHARS}</p>

          {error && <p className="text-rose-500 font-bold text-xs mt-2">{error}</p>}

          <button
            onClick={() => annotate(draft.trim())}
            disabled={!draft.trim()}
            className="w-full mt-3 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            <BookOpen size={16} /> Read This
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">or</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          {!genOpen ? (
            <button
              onClick={() => setGenOpen(true)}
              className="w-full py-4 bg-white border-2 border-dashed border-indigo-200 text-indigo-600 rounded-2xl font-black text-sm uppercase tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Sparkles size={16} /> Let AI Write Me a Passage
            </button>
          ) : (
            <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-3xl p-4 flex flex-col gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Level</p>
              <div className="flex gap-1.5">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setGenLevel(lvl)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all ${genLevel === lvl ? "bg-indigo-600 text-white shadow-sm" : "bg-white text-slate-400 border border-slate-200"}`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={genTopic}
                onChange={(e) => setGenTopic(e.target.value)}
                placeholder="Topic (optional) — e.g. ramen, a rainy day, cats…"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? <><Loader2 size={16} className="animate-spin" /> Writing…</> : <><Sparkles size={16} /> Generate</>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* LOADING PHASE */}
      {phase === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reading closely…</p>
        </div>
      )}

      {/* READING PHASE */}
      {phase === "reading" && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto w-full px-5 py-6">
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 text-xl leading-[2.6] whitespace-pre-wrap break-words">
                {segments.map((seg, i) => {
                  if (!seg.isContent) {
                    return <span key={i}>{seg.text}</span>;
                  }
                  const hasKanji = KANJI_RE.test(seg.text);
                  const added = addedIndices.has(i);
                  return (
                    <ruby
                      key={i}
                      onClick={() => setSelected({ index: i, seg })}
                      className={`cursor-pointer rounded px-0.5 transition-colors ${added ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50/60 hover:bg-indigo-100 text-slate-800"}`}
                    >
                      {seg.text}
                      {hasKanji && <rt className="text-[9px] text-indigo-400 font-sans">{seg.reading}</rt>}
                    </ruby>
                  );
                })}
              </div>

              <AnimatePresence>
                {showNotes && grammarNotes.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grammar Notes</p>
                      {grammarNotes.map((note, i) => (
                        <div key={i} className="bg-slate-50 rounded-2xl p-4">
                          <p className="font-black text-indigo-600 text-sm mb-1">{note.pattern}</p>
                          <p className="text-slate-600 text-xs leading-relaxed">{note.explanation}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {qa.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  {qa.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="self-end bg-indigo-600 text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm font-bold max-w-[85%]">
                        {item.q}
                      </div>
                      <div className="self-start bg-white border border-slate-100 shadow-sm rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-slate-700 max-w-[85%] leading-relaxed">
                        {item.a || <Loader2 size={14} className="animate-spin text-slate-300" />}
                      </div>
                    </div>
                  ))}
                  <div ref={qaEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Ask bar */}
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2">
            <input
              type="text"
              value={askInput}
              onChange={(e) => setAskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="Ask Sensei about this passage…"
              className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
            <button
              onClick={handleAsk}
              disabled={asking || !askInput.trim()}
              className="w-10 h-10 shrink-0 bg-indigo-600 text-white rounded-2xl flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
            >
              {asking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Word popover */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-[310] flex flex-col justify-end">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => setSelected(null)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="relative bg-white rounded-t-[2rem] shadow-2xl p-6 pb-8"
            >
              <div className="flex justify-center mb-4">
                <div className="w-10 h-1 bg-slate-200 rounded-full" />
              </div>
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-3xl font-black text-slate-900">{selected.seg.text}</span>
                {selected.seg.reading && (
                  <span className="text-sm font-bold text-indigo-500">{selected.seg.reading}</span>
                )}
              </div>
              <p className="text-slate-600 font-medium mb-1">{selected.seg.english}</p>
              {selected.seg.pos && (
                <span className="inline-block text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md mb-4">
                  {selected.seg.pos}
                </span>
              )}
              <button
                onClick={() => handleAdd(selected.index, selected.seg)}
                disabled={addLoading || addedIndices.has(selected.index)}
                className="w-full mt-2 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
              >
                {addedIndices.has(selected.index) || justAdded ? (
                  <><Check size={16} /> Added to Deck</>
                ) : addLoading ? (
                  <><Loader2 size={16} className="animate-spin" /> Adding…</>
                ) : (
                  <><Plus size={16} /> Add to Deck</>
                )}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
