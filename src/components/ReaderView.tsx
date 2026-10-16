"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Sparkles, Send, Loader2, List, BookOpen, NotebookText, Pencil, Check, Trash2, X } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import TappableText from "@/components/TappableText";
import NewWordsPanel from "@/components/NewWordsPanel";
import AddedWordsSummary from "@/components/AddedWordsSummary";
import WordLookupSheet from "@/components/WordLookupSheet";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useWordMining } from "@/hooks/useWordMining";
import { useAppAlert } from "@/context/AlertContext";
import { deleteSavedPassage, listSavedPassages, savePassage, updatePassage, type SavedPassage } from "@/lib/readerPassages";
import LineStudyBar, { type StudyRate } from "@/components/LineStudyBar";
import LineExplainSheet from "@/components/LineExplainSheet";
import { useLineExplain } from "@/hooks/useLineExplain";
import { splitSentences } from "@/lib/japaneseText";
import { speakSentence, stopSentence } from "@/lib/tts";

interface GrammarNote {
  pattern: string;
  explanation: string;
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof LEVELS)[number];
const MAX_CHARS = 1500;

// A one-line "title" for a saved passage in "My passages" — the user's own if they set
// one, else the topic for an AI-written one (more meaningful than its text), else a short
// lead-in to the pasted text.
function passageTitle(p: SavedPassage): string {
  if (p.title?.trim()) return p.title.trim();
  if (p.source === "generated" && p.gen_topic) return p.gen_topic;
  const clean = p.passage.replace(/\s+/g, " ").trim();
  return clean.length > 28 ? `${clean.slice(0, 28)}…` : clean;
}

/**
 * Paste any Japanese text (or have AI write one) and read it with the same
 * tap-a-kanji-to-look-it-up interaction as the Grammar/Reading quizzes —
 * dotted underline, Jisho lookup for the definition — plus grammar notes for
 * the specific passage and a question box scoped to it. Adding a looked-up
 * word queues it into the same "Not in your deck" list the passage itself
 * populates, for a batch add later — same deferred flow as the quizzes'
 * "Add to List", not a straight-to-deck add.
 */
export default function ReaderView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const mining = useWordMining(userId);
  const { addedWords, queueWord, newWords, getWordStatus } = mining;
  const isQueued = (w: string) => addedWords.has(w) || newWords.some((nw) => nw.word === w);

  const [phase, setPhase] = useState<"input" | "loading" | "reading">("input");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [genOpen, setGenOpen] = useState(false);
  const [genLevel, setGenLevel] = useState<Level>("N4");
  const [genTopic, setGenTopic] = useState("");
  const [generating, setGenerating] = useState(false);

  const [passage, setPassage] = useState("");
  const [grammarNotes, setGrammarNotes] = useState<GrammarNote[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const notesRef = useRef<HTMLDivElement>(null);
  // The notes button lives in the fixed header, but the panel it reveals sits far down
  // the scroll (after the passage and "Not in your deck") — scroll it into view so
  // opening it doesn't look like nothing happened.
  useEffect(() => {
    if (showNotes && grammarNotes.length > 0) notesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [showNotes, grammarNotes.length]);
  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [askInput, setAskInput] = useState("");
  const [asking, setAsking] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // ── Tap a word → shared lookup sheet (Jisho + deck status), same as the quizzes ──
  const { lookup, openLookup, setEditWord, closeLookup } = useWordLookup(userId);
  const handleWordTap = (word: string, e: React.MouseEvent | React.TouchEvent, reading = "") => openLookup(word, reading, e);

  useEffect(() => {
    qaEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qa.length]);

  // Saved passages (reader_passages) — synced across devices, with resume. `savedIdRef`
  // is the current session's row id (set on first save, or when opening a saved one);
  // `resumeIdxRef` is the sentence index to jump to once a reopened passage is ready.
  const savedIdRef = useRef<string | null>(null);
  const resumeIdxRef = useRef<number | null>(null);

  // `opts.notes` skips the AI annotate call entirely — used when reopening a saved
  // passage, whose grammar notes were already computed and saved the first time.
  const annotate = async (
    text: string,
    opts?: { notes?: GrammarNote[]; source?: "pasted" | "generated"; genLevel?: Level; genTopic?: string },
  ) => {
    setPhase("loading");
    setError(null);
    try {
      let notes: GrammarNote[];
      if (opts?.notes) {
        notes = opts.notes;
      } else {
        const res = await authedFetch("/api/reader/annotate", {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to process passage");
        notes = data.grammarNotes ?? [];
      }
      setPassage(text);
      setGrammarNotes(notes);
      setQa([]);
      setShowNotes(false);
      await Promise.all([mining.loadWordStatus(text), mining.loadNewWords(text)]);
      setPhase("reading");
      // A brand-new passage (not a reopened saved one) — save it now.
      if (!savedIdRef.current) {
        savePassage(userId, {
          passage: text,
          source: opts?.source ?? "pasted",
          gen_level: opts?.genLevel ?? null,
          gen_topic: opts?.genTopic ?? null,
          grammar_notes: notes,
          read_idx: 0,
        }).then((id) => { if (id) savedIdRef.current = id; });
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong");
      setPhase("input");
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    const topic = genTopic.trim();
    try {
      const res = await authedFetch("/api/reader/generate", {
        method: "POST",
        body: JSON.stringify({ level: genLevel, topic: topic || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate a passage");
      setGenOpen(false);
      setGenTopic("");
      await annotate(data.text, { source: "generated", genLevel, genTopic: topic || undefined });
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  };

  // ── Saved passages list (input phase) ──
  const { showConfirm } = useAppAlert();
  const [savedPassages, setSavedPassages] = useState<SavedPassage[]>([]);
  const [showAllSaved, setShowAllSaved] = useState(false);
  const [openingSaved, setOpeningSaved] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (phase !== "input") return;
    listSavedPassages(userId).then(setSavedPassages).catch(() => setSavedPassages([]));
  }, [phase, userId]);

  const openSaved = async (p: SavedPassage) => {
    setOpeningSaved(p.id);
    savedIdRef.current = p.id;
    resumeIdxRef.current = p.read_idx;
    await annotate(p.passage, { notes: p.grammar_notes });
    setOpeningSaved(null);
  };

  const removeSaved = async (p: SavedPassage) => {
    const ok = await showConfirm("Remove this saved passage from My passages?", { confirmLabel: "Remove", danger: true });
    if (!ok) return;
    try {
      await deleteSavedPassage(p.id);
      setSavedPassages((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      setError("Couldn't remove that passage — try again.");
    }
  };

  const startRename = (p: SavedPassage) => {
    setRenamingId(p.id);
    setRenameValue(passageTitle(p));
  };
  const saveRename = async (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    await updatePassage(id, { title: title || null });
    setSavedPassages((prev) => prev.map((x) => (x.id === id ? { ...x, title: title || null } : x)));
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

  // ── Read aloud, sentence by sentence (browser voice — free, no AI) ──
  const sentences = useMemo(() => splitSentences(passage), [passage]);
  const speakable = useMemo(() => sentences.flatMap((s, i) => (s.speakable ? [i] : [])), [sentences]);
  const [readIdx, setReadIdx] = useState(-1);  // index into `sentences`, -1 = not started
  const [speaking, setSpeaking] = useState(false);
  const [autoPause, setAutoPause] = useState(false);
  const [rate, setRate] = useState<StudyRate>(0.75);
  // Read by the onEnd callback, which outlives the render that started the sentence.
  const readRef = useRef({ autoPause, rate, speakable, sentences });
  useEffect(() => { readRef.current = { autoPause, rate, speakable, sentences }; }, [autoPause, rate, speakable, sentences]);
  const finishedRef = useRef(false); // current sentence ended on its own (so Play moves on)

  const speakAt = (i: number) => {
    const { sentences: ss, speakable: sp, rate: r } = readRef.current;
    if (!ss[i]) { stopSentence(); setSpeaking(false); return; }
    finishedRef.current = false;
    setReadIdx(i);
    setSpeaking(true);
    speakSentence(ss[i].text, {
      rate: r,
      onEnd: () => {
        finishedRef.current = true;
        const next = sp[sp.indexOf(i) + 1];
        if (readRef.current.autoPause || next === undefined) setSpeaking(false);
        else speakAt(next);
      },
    });
  };

  const stopReading = () => { stopSentence(); setSpeaking(false); };
  useEffect(() => () => stopSentence(), []);

  // Jump to a reopened passage's saved position once its sentences are ready.
  useEffect(() => {
    if (phase !== "reading" || resumeIdxRef.current === null) return;
    const r = resumeIdxRef.current;
    resumeIdxRef.current = null;
    if (sentences[r]) setReadIdx(r);
  }, [phase, sentences]);

  // Persist reading progress — debounced, so scrubbing through sentences doesn't spam writes.
  useEffect(() => {
    if (phase !== "reading" || !savedIdRef.current || readIdx < 0) return;
    const id = savedIdRef.current;
    const t = setTimeout(() => updatePassage(id, { read_idx: readIdx }), 1000);
    return () => clearTimeout(t);
  }, [phase, readIdx]);

  // Flush the position immediately when leaving (new passage / close).
  const savePosition = () => {
    if (savedIdRef.current && readIdx >= 0) updatePassage(savedIdRef.current, { read_idx: readIdx });
  };

  const readPos = speakable.indexOf(readIdx); // -1 before starting
  const togglePlayRead = () => {
    if (speaking) { stopReading(); return; }
    if (readPos < 0) { speakAt(speakable[0]); return; }
    // After a sentence finished (auto-pause), Play continues with the next one; at the end it starts over.
    const next = finishedRef.current ? speakable[readPos + 1] ?? speakable[0] : readIdx;
    speakAt(next);
  };
  const prevSentence = () => speakAt(speakable[Math.max(readPos - 1, 0)]);
  const nextSentence = () => speakAt(speakable[Math.min(readPos + 1, speakable.length - 1)]);
  const repeatSentence = () => speakAt(readPos < 0 ? speakable[0] : readIdx);

  // ── Explain this sentence (AI) — `pos` indexes speakable sentences; ‹ › step through them ──
  const { explain, openExplain, closeExplain } = useLineExplain(userId);
  const explainSentence = (pos: number) => {
    const i = speakable[pos];
    if (i === undefined) return;
    stopReading();
    setReadIdx(i); // highlight the sentence being explained
    const near = [...speakable.slice(Math.max(0, pos - 2), pos), ...speakable.slice(pos + 1, pos + 3)];
    openExplain(pos, sentences[i].text, near.map((j) => sentences[j].text.trim()).join("\n"), { source: "reader" });
  };

  const reset = () => {
    savePosition();
    stopReading();
    savedIdRef.current = null;
    setReadIdx(-1);
    setPhase("input");
    setDraft("");
    setPassage("");
    setGrammarNotes([]);
    setQa([]);
    setError(null);
    mining.clearNewWords();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={phase === "reading" ? reset : () => { stopReading(); onClose(); }}
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
          {savedPassages.length > 0 && (
            <div className="mb-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">My passages</p>
              <div className="flex flex-col gap-2">
                {(showAllSaved ? savedPassages : savedPassages.slice(0, 4)).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-white border border-slate-100 rounded-2xl p-2 shadow-sm">
                    {renamingId === p.id ? (
                      <div className="flex-1 min-w-0 flex items-center gap-2 px-1">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveRename(p.id)}
                          className="flex-1 min-w-0 text-sm font-black text-slate-800 bg-slate-50 border border-indigo-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-400"
                        />
                        <button
                          onClick={() => saveRename(p.id)}
                          aria-label="Save name"
                          className="shrink-0 p-2 rounded-xl text-emerald-500 hover:bg-emerald-50 transition-colors"
                        >
                          <Check size={15} />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          aria-label="Cancel"
                          className="shrink-0 p-2 rounded-xl text-slate-300 hover:bg-slate-100 transition-colors"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => openSaved(p)}
                          disabled={openingSaved !== null}
                          className="flex-1 min-w-0 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:opacity-60"
                        >
                          <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-50 flex items-center justify-center">
                            <BookOpen size={16} className="text-indigo-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800 leading-snug truncate">{passageTitle(p)}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                              {openingSaved === p.id ? "Opening…" : [
                                p.source === "generated" ? `AI${p.gen_level ? ` · ${p.gen_level}` : ""}` : "Pasted",
                                p.read_idx ? "in progress" : null,
                              ].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </button>
                        <button
                          onClick={() => startRename(p)}
                          aria-label="Rename passage"
                          className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removeSaved(p)}
                          aria-label="Remove passage"
                          className="shrink-0 p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              {savedPassages.length > 4 && (
                <button
                  onClick={() => setShowAllSaved((v) => !v)}
                  className="mt-2 text-[10px] font-black uppercase tracking-widest text-indigo-500"
                >
                  {showAllSaved ? "Show fewer" : `Show all ${savedPassages.length}`}
                </button>
              )}
            </div>
          )}

          <h2 className="text-xl font-black text-slate-900 mb-1">{savedPassages.length > 0 ? "Add a passage" : "Paste something to read"}</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Lyrics, a manga page, a news snippet, anything. Tap any kanji to look it up and add it to your deck — and get grammar notes for the specific text. Saved to My passages so you can come back to it on any device.
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
              <div className="sticky top-0 z-10 -mx-5 px-5 pt-1 pb-3 mb-2 bg-slate-50/95 backdrop-blur-sm">
                <LineStudyBar
                  playing={speaking}
                  onPlayPause={togglePlayRead}
                  onPrev={prevSentence}
                  onNext={nextSentence}
                  onRepeat={repeatSentence}
                  autoPause={autoPause}
                  onToggleAutoPause={() => setAutoPause((v) => !v)}
                  rate={rate}
                  onRate={setRate}
                  position={{ index: readPos, total: speakable.length }}
                  unit="sentence"
                  disabled={speakable.length === 0}
                  onExplain={() => explainSentence(Math.max(readPos, 0))}
                />
              </div>
              <div className="flex items-center gap-4 mb-3 px-1">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-violet-200 border border-violet-500" /> Not in deck
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-100/70 border border-rose-400" /> Weak
                </span>
              </div>
              <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-6 text-xl leading-[2.6] whitespace-pre-wrap break-words">
                {sentences.map((sentence, i) => (
                  <span
                    key={i}
                    onClick={sentence.speakable ? () => speakAt(i) : undefined}
                    className={`${sentence.speakable ? "cursor-pointer" : ""} ${i === readIdx ? "bg-indigo-50 rounded-lg ring-1 ring-indigo-100" : ""}`}
                  >
                    <TappableText text={sentence.text} keyPrefix={`s${i}`} onWordTap={(word, reading, e) => handleWordTap(word, e, reading)} getStatus={getWordStatus} />
                  </span>
                ))}
              </div>

              <NewWordsPanel mining={mining} onWordTap={handleWordTap} className="mt-4" />

              <AnimatePresence>
                {showNotes && grammarNotes.length > 0 && (
                  <motion.div
                    ref={notesRef}
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

      {/* Word lookup (shared with the quizzes / Sensei chat) — queues into "Not in your deck" */}
      {lookup && (
        <WordLookupSheet
          lookup={lookup}
          onClose={closeLookup}
          onEditWord={setEditWord}
          onAdd={(w) => queueWord(w, lookup.reading)}
          isAdded={isQueued}
          addLabel="Add to List"
          addIcon={<List size={11} />}
          layerClassName={{ backdrop: "z-[310]", sheet: "z-[320] bottom-0 left-0 right-0" }}
        />
      )}

      {explain && (
        <LineExplainSheet
          explain={explain}
          onClose={closeExplain}
          onPrev={explain.index > 0 ? () => explainSentence(explain.index - 1) : undefined}
          onNext={explain.index < speakable.length - 1 ? () => explainSentence(explain.index + 1) : undefined}
          onAddWord={(w) => queueWord(w)}
          isAdded={isQueued}
          position={{ index: explain.index, total: speakable.length }}
          unit="sentence"
        />
      )}

      {/* Same "Words added" summary as the Add sheet (Study / Profile) */}
      {mining.showSummary && (
        <AddedWordsSummary
          words={mining.addedWordsSummary}
          onClose={mining.closeSummary}
          onDelete={mining.removeAdded}
          zClassName="z-[330]"
        />
      )}
    </div>
  );
}
