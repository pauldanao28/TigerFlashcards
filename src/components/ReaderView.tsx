"use client";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Sparkles, Send, Loader2, List, Volume2, BookOpen, NotebookText, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { speak } from "@/lib/tts";

interface GrammarNote {
  pattern: string;
  explanation: string;
}

interface WordTooltip {
  word: string;
  reading: string;
  editWord: string;
  knownEnglish?: string | null;
  jishoLoading?: boolean;
  jishoMeanings?: { definition: string; pos: string }[];
  jlpt?: string[];
  isCommon?: boolean;
  compounds?: { word: string; reading: string; meaning: string; jlpt: string[]; is_common: boolean }[];
}

const LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
type Level = (typeof LEVELS)[number];
const MAX_CHARS = 1500;

const kanjiRe = /[一-龯㐀-䶿々〻]/;

// Lazy-init: avoid module-level Intl.Segmenter which crashes during Next.js SSR
let _jaSegmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (typeof window === "undefined") return null;
  if (!_jaSegmenter) {
    try { _jaSegmenter = new Intl.Segmenter("ja", { granularity: "word" }); } catch { return null; }
  }
  return _jaSegmenter;
}

type WordTapHandler = (word: string, e: React.MouseEvent | React.TouchEvent) => void;

// Same tap-to-lookup rendering as SentenceQuiz/GrammarQuiz: kanji words get a dotted
// underline, no furigana shown until tapped (so reading it stays a real reading exercise).
function TappableText({ text, keyPrefix, onWordTap }: { text: string; keyPrefix: string; onWordTap: WordTapHandler }) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const segmenter = getSegmenter();
  const subSegs = segmenter ? [...segmenter.segment(text)] : [{ segment: text, isWordLike: false }];
  return (
    <>
      {subSegs.map((sub, i) => {
        if (sub.isWordLike && kanjiRe.test(sub.segment)) {
          const word = sub.segment;
          return (
            <span
              key={`${keyPrefix}-${i}`}
              className="cursor-pointer active:opacity-60 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onWordTap(word, e); }}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, e as unknown as React.MouseEvent); }
              }}
            >
              {word.split("").map((ch, ci) =>
                kanjiRe.test(ch) ? <span key={ci} className="underline decoration-dotted decoration-indigo-400 underline-offset-2">{ch}</span> : ch,
              )}
            </span>
          );
        }
        return <span key={`${keyPrefix}-${i}`}>{sub.segment}</span>;
      })}
    </>
  );
}

/**
 * Paste any Japanese text (or have AI write one) and read it with the same
 * tap-a-kanji-to-look-it-up interaction as the Grammar/Reading quizzes —
 * dotted underline, Jisho lookup, add to the shared word queue — plus
 * grammar notes for the specific passage and a question box scoped to it.
 */
export default function ReaderView({ userId, onClose }: { userId: string; onClose: () => void }) {
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

  const [qa, setQa] = useState<{ q: string; a: string }[]>([]);
  const [askInput, setAskInput] = useState("");
  const [asking, setAsking] = useState(false);
  const qaEndRef = useRef<HTMLDivElement>(null);

  // ── Pending word list — shared with the Add Sheet and the Sensei chat (same
  // profiles.pending_words field), so a word queued here shows up there too. ──
  const [wordList, setWordList] = useState<string[]>([]);
  const WORD_LIST_KEY = `flashkado-word-list-${userId}`;

  useEffect(() => {
    if (!userId) return;
    let localWords: string[] = [];
    try {
      const stored = localStorage.getItem(WORD_LIST_KEY);
      localWords = stored ? JSON.parse(stored) : [];
      if (localWords.length > 0) setWordList(localWords);
    } catch { /* ignore */ }

    supabase.from("profiles").select("pending_words").eq("id", userId).maybeSingle().then(({ data }) => {
      const dbWords: string[] = data?.pending_words ?? [];
      const merged = [...new Set([...dbWords, ...localWords])];
      setWordList(merged);
      localStorage.setItem(WORD_LIST_KEY, JSON.stringify(merged));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const syncWordList = (newList: string[]) => {
    setWordList(newList);
    localStorage.setItem(WORD_LIST_KEY, JSON.stringify(newList));
    supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
      .then(({ error: e }) => { if (e) console.error("[DB word-list sync]", e.code, e.message); });
  };

  // ── Tap a kanji word → tooltip with Jisho lookup, same as the quizzes/Sensei chat ──
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);

  const handleWordTap: WordTapHandler = (word, e) => {
    e.stopPropagation();
    setTooltip({ word, reading: "", editWord: word, knownEnglish: undefined, jishoLoading: true });

    (async () => {
      const { data: card } = await supabase.from("master_cards").select("id, english").eq("japanese", word).maybeSingle();
      if (!card) { setTooltip((prev) => (prev ? { ...prev, knownEnglish: null } : prev)); return; }
      const { data: score } = await supabase.from("user_scores").select("id").eq("user_id", userId).eq("card_id", card.id).maybeSingle();
      setTooltip((prev) => (prev ? { ...prev, knownEnglish: score ? card.english : null } : prev));
    })();

    const isSingleKanji = word.length === 1 && kanjiRe.test(word);
    const jishoUrl = isSingleKanji
      ? `/api/jisho?word=${encodeURIComponent(word)}&compounds=true`
      : `/api/jisho?word=${encodeURIComponent(word)}`;
    fetch(jishoUrl)
      .then((r) => r.json())
      .then((d) =>
        setTooltip((prev) =>
          prev
            ? {
                ...prev,
                jishoLoading: false,
                ...(isSingleKanji
                  ? { compounds: d.compounds ?? [] }
                  : {
                      reading: d.found ? d.reading : "",
                      jishoMeanings: d.found ? d.meanings : [],
                      jlpt: d.found ? d.jlpt : [],
                      isCommon: d.found ? d.is_common : false,
                    }),
              }
            : prev,
        ),
      )
      .catch(() => setTooltip((prev) => (prev ? { ...prev, jishoLoading: false } : prev)));
  };

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
      setGrammarNotes(data.grammarNotes ?? []);
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
          {wordList.length > 0 && (
            <span className="relative p-2 text-slate-400">
              <List size={16} />
              <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                {wordList.length}
              </span>
            </span>
          )}
          {phase !== "reading" && <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90"><X size={16} /></button>}
        </div>
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
          <h2 className="text-xl font-black text-slate-900 mb-1">Paste something to read</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Lyrics, a manga page, a news snippet, anything. Tap any kanji to look it up and queue it, just like in the quizzes — and get grammar notes for the specific text.
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
                <TappableText text={passage} keyPrefix="p" onWordTap={handleWordTap} />
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

      {/* Word tooltip (tap-to-lookup, same as the quizzes/Sensei chat) */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-[310] bg-black/20" onClick={() => setTooltip(null)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-[320] bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-2xl font-black text-slate-800">{tooltip.editWord}</div>
                  {tooltip.jlpt && tooltip.jlpt.length > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">{tooltip.jlpt[0].toUpperCase()}</span>
                  )}
                  {tooltip.isCommon && (
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded-full">common</span>
                  )}
                  <button
                    onClick={() => speak(tooltip.editWord, "ja-JP")}
                    className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-50"
                  >
                    <Volume2 size={11} /> Listen
                  </button>
                </div>
                <div className="text-sm text-indigo-500 font-bold mt-0.5">{tooltip.reading}</div>
                {tooltip.knownEnglish && (
                  <div className="mt-1 inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    ✓ in your deck
                  </div>
                )}
              </div>
              <button onClick={() => setTooltip(null)} className="text-slate-300 hover:text-slate-500 mt-1 shrink-0"><X size={16} /></button>
            </div>

            {tooltip.jishoLoading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3">
                <Loader2 size={11} className="animate-spin" />
                <span>Looking up…</span>
              </div>
            )}
            {!tooltip.jishoLoading && tooltip.compounds && tooltip.compounds.length > 0 && (
              <div className="mb-3 pb-3 border-b border-slate-100">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Words using 「{tooltip.editWord}」</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {tooltip.compounds.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-black text-slate-800">{c.word}</span>
                        <span className="text-xs text-indigo-500 font-bold ml-1.5">{c.reading}</span>
                        {c.jlpt?.[0] && <span className="ml-1.5 bg-amber-100 text-amber-700 text-[8px] font-black px-1 py-0.5 rounded-full">{c.jlpt[0].toUpperCase()}</span>}
                        <p className="text-[10px] text-slate-500 truncate">{c.meaning}</p>
                      </div>
                      <button
                        onClick={() => { if (!wordList.includes(c.word)) syncWordList([...wordList, c.word]); }}
                        disabled={wordList.includes(c.word)}
                        className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors active:scale-95 ${wordList.includes(c.word) ? "bg-emerald-50 text-emerald-600 cursor-default" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}
                      >
                        {wordList.includes(c.word) ? "Added" : "+ Add"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!tooltip.jishoLoading && !tooltip.compounds?.length && tooltip.jishoMeanings && tooltip.jishoMeanings.length > 0 && (
              <div className="mb-3 pb-3 border-b border-slate-100">
                {tooltip.jishoMeanings.map((m, i) => (
                  <div key={i} className="mb-1">
                    {m.pos && <span className="text-[9px] text-slate-400 font-bold mr-1">{m.pos}</span>}
                    <span className="text-xs text-slate-700">{m.definition}</span>
                  </div>
                ))}
              </div>
            )}
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Word to add</label>
            <input
              type="text"
              value={tooltip.editWord}
              onChange={(e) => setTooltip((prev) => (prev ? { ...prev, editWord: e.target.value } : prev))}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="e.g. 食べる"
            />
            <button
              onClick={() => { const word = tooltip.editWord.trim(); if (word && !wordList.includes(word)) syncWordList([...wordList, word]); setTooltip(null); }}
              disabled={!tooltip.editWord.trim()}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40"
            >
              <List size={11} /> Add to List
            </button>
          </div>
        </>
      )}
    </div>
  );
}
