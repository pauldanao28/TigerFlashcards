"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, List, Volume2, ChevronLeft, Ear } from "lucide-react";
import { speak, playTTS, stopTTS } from "@/lib/tts";
import { listeningScore, jlptLevel } from "@/lib/scoring";

interface ListeningQuestion {
  word: string;
  reading: string;
  english: string;
  sentence_jp: string;
  sentence_en: string;
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

interface ListeningQuizProps {
  userId: string;
  isAdmin?: boolean;
  onClose: () => void;
}

const QUESTIONS_PER_ROUND = 20;

type WordTapHandler = (word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => void;

// Strip furigana parentheses (e.g. 食べる（たべる）→ 食べる) so readings are hidden until tapped.
function stripFurigana(text: string): string {
  return text.replace(/([一-龯々〻㐀-䶿][一-龯々〻㐀-䶿ぁ-ん]*)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g, "$1");
}

// Strips markup that shouldn't be spoken aloud (highlight brackets, furigana) before sending to TTS.
function toSpeechText(text: string): string {
  return stripFurigana(text).replace(/[【】]/g, "");
}

// Renders a plain (non-highlighted) text chunk with tappable kanji words, dotted-underlined —
// mirrors the chatbot's tap-to-lookup behavior (no inline furigana, reading fetched on tap).
function TappableText({ text, keyPrefix, onWordTap }: { text: string; keyPrefix: string; onWordTap: WordTapHandler }) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const segmenter = getSegmenter();
  const subSegs = segmenter ? [...segmenter.segment(stripFurigana(text))] : [{ segment: stripFurigana(text), isWordLike: false }];
  return (
    <>
      {subSegs.map((sub, i) => {
        if (sub.isWordLike && kanjiRe.test(sub.segment)) {
          const word = sub.segment;
          return (
            <span key={`${keyPrefix}-${i}`} className="cursor-pointer active:opacity-60 transition-opacity"
              onClick={(e) => { e.stopPropagation(); onWordTap(word, "", e); }}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, "", e as unknown as React.MouseEvent); }
              }}>
              {word.split("").map((ch, ci) =>
                kanjiRe.test(ch) ? <span key={ci} className="underline decoration-dotted decoration-indigo-400 underline-offset-2">{ch}</span> : ch
              )}
            </span>
          );
        }
        return <span key={`${keyPrefix}-${i}`}>{sub.segment}</span>;
      })}
    </>
  );
}

// Highlighted target chunk — each kanji-bearing word inside it is independently tappable
// (a chunk like 電話をかける is 電話 + を + かける, not one lookup unit), while the whole
// span stays visually marked as the chunk being drilled. Reading stays hidden until revealed.
function HighlightedChunk({ text, onWordTap }: { text: string; onWordTap: WordTapHandler }) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const segmenter = getSegmenter();
  const subSegs = segmenter ? [...segmenter.segment(text)] : [{ segment: text, isWordLike: false }];
  return (
    <mark className="bg-amber-200 dark:bg-amber-700 text-amber-900 dark:text-amber-100 rounded-sm px-0.5 not-italic font-black">
      {subSegs.map((sub, i) => {
        if (sub.isWordLike && kanjiRe.test(sub.segment)) {
          const word = sub.segment;
          return (
            <span key={i} className="cursor-pointer active:opacity-70 transition-opacity underline decoration-dotted decoration-amber-800 underline-offset-2"
              onClick={(e) => { e.stopPropagation(); onWordTap(word, "", e); }}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, "", e as unknown as React.MouseEvent); }
              }}>
              {word}
            </span>
          );
        }
        return <span key={i}>{sub.segment}</span>;
      })}
    </mark>
  );
}

function ListeningSentence({ sentence, onWordTap }: { sentence: string; onWordTap: WordTapHandler }) {
  if (sentence.includes("【")) {
    const parts = sentence.split(/【(.*?)】/);
    return (
      <>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <HighlightedChunk key={i} text={part} onWordTap={onWordTap} />
          ) : (
            <TappableText key={i} text={part} keyPrefix={`p${i}`} onWordTap={onWordTap} />
          )
        )}
      </>
    );
  }
  return <TappableText text={sentence} keyPrefix="full" onWordTap={onWordTap} />;
}

export default function ListeningQuiz({ userId, isAdmin = false, onClose }: ListeningQuizProps) {
  const [phase, setPhase] = useState<"intro" | "loading" | "quiz" | "done">("intro");
  const [starting, setStarting] = useState(false);
  const [focusWeak, setFocusWeak] = useState(true);
  const [questions, setQuestions] = useState<ListeningQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [results, setResults] = useState<{ q: ListeningQuestion; gotIt: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const [backConfirm, setBackConfirm] = useState(false);

  // Warn on accidental refresh/tab-close mid-quiz — progress lives only in React state
  // and a lost quiz still burns one of today's limited slots.
  useEffect(() => {
    if (phase !== "quiz") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // ── Pending word list — shared with the Sensei chat's list (same profiles.pending_words field) ──
  const [wordList, setWordList] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);
  const [addedSummary, setAddedSummary] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const WORD_LIST_KEY = `flashkado-word-list-${userId}`;

  const loadingRef = useRef(false);
  const listeningScoreRef = useRef<number>(0);
  const listeningStatsRef = useRef<Record<string, { correct: number; total: number }>>({});

  useEffect(() => {
    supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  useEffect(() => {
    supabase.from("profiles").select("listening_score, listening_stats").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data?.listening_score != null) listeningScoreRef.current = data.listening_score;
        if (data?.listening_stats) listeningStatsRef.current = data.listening_stats;
      });
  }, [userId]);

  const recentMistakesRef = useRef<{ mistake: string; correct: string; reason: string }[]>([]);
  useEffect(() => {
    supabase.from("listening_corrections").select("mistake, correct, reason")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(20)
      .then(({ data }) => { if (data) recentMistakesRef.current = data; });
  }, [userId]);

  useEffect(() => {
    supabase.from("profiles").select("pending_words").eq("id", userId).maybeSingle()
      .then(({ data, error: dbErr }) => {
        if (dbErr) { console.error("[DB word-list load]", dbErr.code, dbErr.message); return; }
        // The DB is always the source of truth — an empty list here means the user
        // cleared it (or never had one), not that a save failed. localStorage is only
        // ever written FROM the DB (a display cache), never read back INTO it — reading
        // it back used to resurrect stale/cleared words from a previous session.
        const dbWords: string[] = data?.pending_words ?? [];
        setWordList(dbWords);
        localStorage.setItem(WORD_LIST_KEY, JSON.stringify(dbWords));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Stop any in-flight audio when the quiz closes or unmounts.
  useEffect(() => () => stopTTS(), []);

  const syncWordList = useCallback((newList: string[]) => {
    setWordList(newList);
    localStorage.setItem(WORD_LIST_KEY, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
        .then(({ error: e }) => { if (e) console.error("[DB word-list sync]", e.code, e.message); });
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Cancel any pending debounce and write immediately — used when closing the list panel
  // so a quick close right after typing can't lose the edit.
  const flushWordList = useCallback((newList: string[] = wordList) => {
    setWordList(newList);
    localStorage.setItem(WORD_LIST_KEY, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    supabase.from("profiles").update({ pending_words: newList }).eq("id", userId)
      .then(({ error: e }) => { if (e) console.error("[DB word-list flush]", e.code, e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, wordList]);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    stopTTS();
    setTooltip(null);
    loadingRef.current = true;
    setPhase("loading");
    setCurrentIdx(0);
    setResults([]);
    setRevealed(false);
    setIsPlaying(false);
    setError(null);

    try {
      // Fetch weak deck cards to anchor chunks to words the user struggles with —
      // skipped entirely in "Random" mode so chunks are drawn without deck bias.
      let weakWords: { japanese: string; english: string }[] = [];
      if (focusWeak) {
        const { data: deckRow } = await supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).single();
        if (deckRow?.id) {
          const { data: dcRows } = await supabase.from("deck_cards").select("card_id").eq("deck_id", deckRow.id).limit(300);
          const cardIds = (dcRows ?? []).map(r => r.card_id);
          if (cardIds.length > 0) {
            const [{ data: cards }, { data: scores }] = await Promise.all([
              supabase.from("master_cards").select("id, japanese, english").in("id", cardIds),
              supabase.from("user_scores").select("card_id, scores_json").eq("user_id", userId).in("card_id", cardIds),
            ]);
            const scoreMap = new Map((scores ?? []).map(s => [s.card_id, s.scores_json]));
            weakWords = (cards ?? [])
              .map(c => {
                const sc = scoreMap.get(c.id);
                const combined = ((sc?.jp_to_en?.percent ?? 0) + (sc?.en_to_jp?.percent ?? 0)) / 2;
                return { japanese: c.japanese, english: c.english, combined };
              })
              .sort((a, b) => a.combined - b.combined)
              .slice(0, 10)
              .map(({ japanese, english }) => ({ japanese, english }));
          }
        }
      }

      const res = await fetch("/api/quiz/listening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: QUESTIONS_PER_ROUND, difficulty: listeningScoreRef.current, recentMistakes: recentMistakesRef.current, weakWords }),
      });
      if (!res.ok) throw new Error("Failed to generate listening quiz");
      const { questions: qs } = await res.json();
      if (!Array.isArray(qs) || qs.length === 0) throw new Error("No questions generated");

      setQuestions(qs);
      setPhase("quiz");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      loadingRef.current = false;
    }
  }, [isAdmin, focusWeak]);

  // ── Tap a kanji word → tooltip with Jisho lookup, same as the Sensei chat ────
  const handleWordClick = useCallback((word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const extractWord = (text: string): string => {
      const seg = getSegmenter();
      if (!seg) return text;
      const first = [...seg.segment(text)].find(s => s.isWordLike && kanjiRe.test(s.segment));
      return first?.segment ?? text;
    };
    const editWord = extractWord(word);
    setTooltip({ word, reading, editWord, knownEnglish: undefined, jishoLoading: true });

    (async () => {
      const { data: card } = await supabase.from("master_cards").select("id, english").eq("japanese", editWord).maybeSingle();
      if (!card) { setTooltip(prev => prev ? { ...prev, knownEnglish: null } : prev); return; }
      const { data: score } = await supabase.from("user_scores").select("id").eq("user_id", userId).eq("card_id", card.id).maybeSingle();
      setTooltip(prev => prev ? { ...prev, knownEnglish: score ? card.english : null } : prev);
    })();

    const isSingleKanji = editWord.length === 1 && kanjiRe.test(editWord);
    const jishoUrl = isSingleKanji
      ? `/api/jisho?word=${encodeURIComponent(editWord)}&compounds=true`
      : `/api/jisho?word=${encodeURIComponent(editWord)}`;
    fetch(jishoUrl)
      .then(r => r.json())
      .then(d => setTooltip(prev => prev ? {
        ...prev,
        jishoLoading: false,
        ...(isSingleKanji
          ? { compounds: d.compounds ?? [] }
          : {
              reading: prev.reading || (d.found ? d.reading : ""),
              jishoMeanings: d.found ? d.meanings : [],
              jlpt: d.found ? d.jlpt : [],
              isCommon: d.found ? d.is_common : false,
            }),
      } : prev))
      .catch(() => setTooltip(prev => prev ? { ...prev, jishoLoading: false } : prev));
  }, [userId]);

  // Debounced Jisho re-lookup when the user edits the word in the tooltip input
  const jishoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const word = tooltip?.editWord?.trim();
    if (!word || !kanjiRe.test(word)) return;
    if (jishoDebounceRef.current) clearTimeout(jishoDebounceRef.current);
    jishoDebounceRef.current = setTimeout(() => {
      setTooltip(prev => prev ? { ...prev, jishoLoading: true, jishoMeanings: [], jlpt: [], isCommon: false } : prev);
      fetch(`/api/jisho?word=${encodeURIComponent(word)}`)
        .then(r => r.json())
        .then(d => setTooltip(prev => prev ? {
          ...prev,
          jishoLoading: false,
          reading: d.found ? d.reading : "",
          jishoMeanings: d.found ? d.meanings : [],
          jlpt: d.found ? d.jlpt : [],
          isCommon: d.found ? d.is_common : false,
        } : prev))
        .catch(() => setTooltip(prev => prev ? { ...prev, jishoLoading: false } : prev));
    }, 500);
    return () => { if (jishoDebounceRef.current) clearTimeout(jishoDebounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip?.editWord]);

  // ── Batch add — same logic as the Sensei chat's "Add All" ────────────────────
  const addListToDeck = async (text: string) => {
    const words = [...new Set(text.split("\n").map(w => w.trim()).filter(Boolean))];
    if (!words.length || !defaultDeckId) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    setBatchAdding(true);

    const performLinking = async (cardIds: string[]) => {
      await Promise.all([
        supabase.from("deck_cards").upsert(cardIds.map(id => ({ deck_id: defaultDeckId, card_id: id })), { onConflict: "deck_id,card_id" }),
        supabase.from("user_scores").upsert(cardIds.map(id => ({ user_id: userId, card_id: id, scores_json: { jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 }, en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 } } })), { onConflict: "user_id,card_id" }),
      ]);
    };

    let allProcessed: any[] = [];
    const succeededWords = new Set<string>();
    try {
      const { data: existing } = await supabase.from("master_cards").select("*").in("japanese", words);
      if (existing?.length) {
        await performLinking(existing.map((c: any) => c.id));
        allProcessed = [...existing];
        existing.forEach((c: any) => succeededWords.add(c.japanese));
      }

      const existingSet = new Set(existing?.map((c: any) => c.japanese) ?? []);
      const wordsForAI = words.filter(w => !existingSet.has(w));

      if (wordsForAI.length > 0) {
        try {
          const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: wordsForAI }) });
          if (!res.ok) throw new Error("AI error");
          const items = await res.json();
          const itemsArray = Array.isArray(items) ? items : [items];
          const seen = new Set<string>();
          const deduped = itemsArray
            .map((item: any) => ({ japanese: String(item.japanese).trim(), reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""), english: String(item.english || "").trim(), partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(), jlpt_level: item.jlpt_level ?? null, exampleSentence: item.exampleSentence || { jp: "", en: "" }, creator_id: userId }))
            .filter((item: any) => { if (seen.has(item.japanese)) return false; seen.add(item.japanese); return true; });
          const { data: newCards, error: mErr } = await supabase.from("master_cards").upsert(deduped, { onConflict: "japanese" }).select("*");
          if (mErr) throw mErr;
          if (newCards?.length) { await performLinking(newCards.map((c: any) => c.id)); allProcessed = [...allProcessed, ...newCards]; }
          wordsForAI.forEach(w => succeededWords.add(w));
        } catch (aiErr) {
          console.error("AI step failed:", aiErr);
        }
      }
    } catch (err) {
      console.error("Batch add failed:", err);
    } finally {
      const remaining = words.filter(w => !succeededWords.has(w));
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      setWordList(remaining);
      localStorage.setItem(WORD_LIST_KEY, JSON.stringify(remaining));
      supabase.from("profiles").update({ pending_words: remaining }).eq("id", userId);
      setShowList(false);
      if (allProcessed.length > 0) {
        setAddedSummary(Array.from(new Map(allProcessed.map(c => [c.japanese, c])).values()));
        setShowSummary(true);
      }
      setBatchAdding(false);
    }
  };

  const handlePlay = useCallback(() => {
    const q = questions[currentIdx];
    if (!q) return;
    setIsPlaying(true);
    playTTS(toSpeechText(q.sentence_jp), "ja-JP", { onEnd: () => setIsPlaying(false) });
  }, [questions, currentIdx]);

  const handleRate = (gotIt: boolean) => {
    const q = questions[currentIdx];
    stopTTS();
    const newResults = [...results, { q, gotIt }];
    setResults(newResults);
    if (currentIdx + 1 >= questions.length) {
      setPhase("done");
      const gotCount = newResults.filter(r => r.gotIt).length;
      const level = jlptLevel(listeningScoreRef.current);
      const prev = listeningStatsRef.current[level] ?? { correct: 0, total: 0 };
      const updatedStats = {
        ...listeningStatsRef.current,
        [level]: { correct: prev.correct + gotCount, total: prev.total + newResults.length },
      };
      listeningStatsRef.current = updatedStats;
      const newListeningScore = listeningScore(updatedStats);
      listeningScoreRef.current = newListeningScore;
      supabase.from("profiles").update({ listening_score: newListeningScore, listening_stats: updatedStats }).eq("id", userId)
        .then(({ error }) => { if (error) console.error("[listening_score save]", error.code, error.message); });
      const missed = newResults.filter(r => !r.gotIt).map(r => ({
        user_id: userId,
        mistake: r.q.word,
        correct: r.q.english,
        reason: r.q.sentence_jp,
      }));
      if (missed.length > 0) supabase.from("listening_corrections").insert(missed);
    } else {
      setCurrentIdx(i => i + 1);
      setRevealed(false);
      setIsPlaying(false);
    }
  };

  const gotItCount = results.filter(r => r.gotIt).length;
  const currentQ = questions[currentIdx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[300] bg-slate-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => phase === "intro" || phase === "done" ? onClose() : setBackConfirm(true)} className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all">
            <ChevronLeft size={14} />
            <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
          </button>
          <div className="flex items-center gap-2.5">
            <span className="text-base">🎧</span>
            <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Listening Chunks</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowList(true)} className="relative p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
            <List size={16} className="text-slate-500" />
            {wordList.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Intro */}
      {phase === "intro" && !error && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full text-center gap-5">
          <span className="text-5xl">🎧</span>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">How it works</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">
              You&apos;ll hear a sentence built around a common verb or noun+verb chunk (電話をかける, 気をつける…).
              Listen first — no text — then reveal to check what you heard and see the chunk broken down.
            </p>
          </div>
          <div className="w-full bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 text-left">
            <p className="text-indigo-800 font-bold text-xs leading-relaxed">
              🎯 {QUESTIONS_PER_ROUND} sentences per round at your current N level. Chunks you miss get re-drilled in the next round. Score well to advance levels.
            </p>
          </div>
          <div className="w-full flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Chunk selection</p>
            <button
              onClick={() => setFocusWeak(v => !v)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${
                focusWeak
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-slate-100 border-slate-200 text-slate-500"
              }`}
            >
              {focusWeak ? "🎯 Weak cards" : "🎲 Random"}
            </button>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">20 questions · ~10–15 min</p>
          <button
            onClick={() => { setStarting(true); load(); }}
            disabled={starting}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : null}
            {starting ? "Please wait…" : "Start Listening"}
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && !error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Generating quiz…</p>
          <p className="text-slate-300 font-bold text-[10px]">Please wait, this can take a few seconds</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="text-5xl">😓</span>
          <p className="text-slate-600 font-bold text-sm">{error}</p>
          <button onClick={onClose} className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
            Close
          </button>
        </div>
      )}

      {/* Quiz */}
      {phase === "quiz" && currentQ && (
        <div className="flex-1 flex flex-col px-5 py-5 max-w-lg mx-auto w-full min-h-0">
          {/* Progress bar */}
          <div className="mb-5 shrink-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{currentIdx + 1} / {questions.length}</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{gotItCount} got it</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-indigo-500 rounded-full"
                animate={{ width: `${(currentIdx / questions.length) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentIdx}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
              className="flex-1 flex flex-col gap-3 min-h-0"
            >
              {!revealed ? (
                /* Listen-only stage — no text shown yet */
                <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-10">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tap to listen</p>
                  <button
                    onClick={handlePlay}
                    className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all ${isPlaying ? "bg-indigo-700" : "bg-indigo-600"}`}
                  >
                    {isPlaying ? <Loader2 size={32} className="text-white animate-spin" /> : <Ear size={32} className="text-white" />}
                  </button>
                  <p className="text-slate-400 font-medium text-xs text-center">Listen as many times as you need, then reveal to check yourself.</p>
                </div>
              ) : (
                /* Revealed — tappable sentence + chunk meaning */
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">You heard</p>
                    <button onClick={handlePlay} className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-50">
                      {isPlaying ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />} Replay
                    </button>
                  </div>
                  <p className="text-xl leading-relaxed text-slate-800 font-medium">
                    <ListeningSentence sentence={currentQ.sentence_jp} onWordTap={handleWordClick} />
                  </p>
                  <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mt-4">Chunk meaning</p>
                  <p className="text-indigo-600 font-bold text-base">
                    {currentQ.word}
                    {currentQ.reading && <span className="text-sm font-medium text-indigo-400 ml-1">（{currentQ.reading}）</span>}
                    {" — "}{currentQ.english}
                  </p>
                  <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mt-2">Translation</p>
                  <p className="text-slate-500 text-sm italic">{currentQ.sentence_en}</p>
                </div>
              )}

              <div className="mt-auto shrink-0 pb-safe">
                {!revealed ? (
                  <button
                    onClick={() => setRevealed(true)}
                    className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm"
                  >
                    Reveal Text
                  </button>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleRate(false)}
                      className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
                    >
                      ✕ Missed It
                    </button>
                    <button
                      onClick={() => handleRate(true)}
                      className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black border-b-4 border-emerald-700 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest"
                    >
                      ✓ Got It
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="flex-1 flex flex-col items-center overflow-y-auto px-6 py-8 max-w-lg mx-auto w-full">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="text-center mb-8 w-full"
          >
            <div className="text-6xl mb-4">
              {gotItCount >= 16 ? "🏆" : gotItCount >= 10 ? "💪" : "📚"}
            </div>
            <h2 className="text-4xl font-black text-slate-900 mb-1">{gotItCount}<span className="text-slate-300 font-bold text-2xl"> / {results.length}</span></h2>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-1">
              {results.length > 0 ? Math.round((gotItCount / results.length) * 100) : 0}% caught by ear
            </p>
          </motion.div>

          {results.filter(r => !r.gotIt).length > 0 && (
            <div className="w-full bg-white rounded-3xl border border-slate-100 shadow-sm px-5 py-4 mb-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-400 mb-3">Review these chunks</p>
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
                {results.filter(r => !r.gotIt).map((r, i) => (
                  <div key={i} className="bg-rose-50 border border-rose-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                    <span className="text-sm font-black text-rose-700">{r.q.word}</span>
                    <span className="text-[10px] text-rose-400">{r.q.english}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all"
            >
              Done
            </button>
            <button
              onClick={load}
              className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm"
            >
              Play Again
            </button>
          </div>
        </div>
      )}

      {/* ── Leave confirmation ── */}
      {backConfirm && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setBackConfirm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-black text-slate-800 mb-1">Leave the quiz?</p>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">This counts as one of today&apos;s quiz slots. You&apos;ll need to generate a new quiz when you return.</p>
            <div className="flex gap-3">
              <button onClick={() => setBackConfirm(false)}
                className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all">
                Cancel
              </button>
              <button onClick={onClose}
                className="flex-1 py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm">
                Leave
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Word tooltip (tap-to-lookup, same as the Sensei chat) ── */}
      {tooltip && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setTooltip(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-slate-100 p-5"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}>
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
                  <button onClick={() => speak(tooltip.editWord, "ja-JP")}
                    className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-indigo-500 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-indigo-50">
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
                        className={`shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-colors active:scale-95 ${wordList.includes(c.word) ? "bg-emerald-50 text-emerald-600 cursor-default" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
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
              onChange={(e) => setTooltip((prev) => prev ? { ...prev, editWord: e.target.value } : prev)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="e.g. 食べる"
            />
            <button
              onClick={() => { const word = tooltip.editWord.trim(); if (word && !wordList.includes(word)) syncWordList([...wordList, word]); setTooltip(null); }}
              disabled={!tooltip.editWord.trim()}
              className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40">
              <List size={11} /> Add to List
            </button>
          </div>
        </>
      )}

      {/* ── Word list panel ── */}
      {showList && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-4 pt-4 pb-28 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-h-[80vh]">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-base font-black text-slate-800 uppercase italic tracking-tighter">To Add</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{wordList.length} word{wordList.length !== 1 ? "s" : ""} · one per line</p>
              </div>
              <button onClick={() => { flushWordList(); setShowList(false); }} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                defaultValue={wordList.join("\n")}
                onChange={(e) => syncWordList(e.target.value.split("\n").map(w => w.trim()).filter(Boolean))}
                placeholder="Tap kanji in the quiz to add words here…"
                className="w-full min-h-[160px] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
              />
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => flushWordList([])} disabled={wordList.length === 0}
                className="px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 bg-slate-100 hover:bg-slate-200 transition-all disabled:opacity-40">
                Clear
              </button>
              <button onClick={() => addListToDeck(wordList.join("\n"))} disabled={batchAdding || wordList.length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40">
                {batchAdding ? <Loader2 size={13} className="animate-spin" /> : null}
                {batchAdding ? "Adding…" : "Add All to Deck"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Summary modal ── */}
      {showSummary && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase italic tracking-tighter">Words Added</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">{addedSummary.length} new {addedSummary.length === 1 ? "entry" : "entries"}</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors text-slate-400">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/30">
              {addedSummary.map((word, i) => (
                <div key={i} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center border border-indigo-100 shadow-sm">
                    <span className="text-indigo-600 font-black text-xl">{word.japanese[0]}</span>
                  </div>
                  <div className="flex-1 flex flex-col text-left">
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-black text-slate-800">{word.japanese}</span>
                      <span className="text-xs font-bold text-rose-500 uppercase tracking-tighter">{word.reading}</span>
                    </div>
                    <p className="text-sm text-slate-600 font-medium mt-0.5 leading-tight pr-10">{word.english}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowSummary(false)} className="w-full py-4 bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-[0.98] shadow-lg">Got it</button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
