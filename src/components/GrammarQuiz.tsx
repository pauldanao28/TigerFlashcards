"use client";
import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X, ChevronLeft, Loader2, List, Volume2 } from "lucide-react";
import { speak } from "@/lib/tts";
import { sessionScore, rollingAvg } from "@/lib/scoring";

interface GrammarQuizProps {
  userId: string;
  onClose: () => void;
}

type Phase = "intro" | "loading" | "quiz" | "done";

type QuizQuestion =
  | { type: "grammar"; sentence: string; blank_hint: string; choices: string[]; answer: string; explanation: string }
  | { type: "reading"; japanese: string; choices: string[]; answer: string; explanation: string }
  | { type: "writing"; english: string; answer: string; hint?: string; explanation: string };

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

let _jaSegmenter: Intl.Segmenter | null = null;
function getSegmenter(): Intl.Segmenter | null {
  if (typeof window === "undefined") return null;
  if (!_jaSegmenter) {
    try { _jaSegmenter = new Intl.Segmenter("ja", { granularity: "word" }); } catch { return null; }
  }
  return _jaSegmenter;
}

function stripFurigana(text: string): string {
  return text.replace(/([一-龯々〻㐀-䶿][一-龯々〻㐀-䶿ぁ-ん]*)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g, "$1");
}

type WordTapHandler = (word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => void;

function TappableText({ text, keyPrefix, onWordTap }: { text: string; keyPrefix: string; onWordTap: WordTapHandler }) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const segmenter = getSegmenter();
  const subSegs = segmenter
    ? [...segmenter.segment(stripFurigana(text))]
    : [{ segment: stripFurigana(text), isWordLike: false }];
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

export default function GrammarQuiz({ userId, onClose }: GrammarQuizProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [writingInput, setWritingInput] = useState("");
  const [writingSubmitted, setWritingSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState<{ mistake: string; correct: string; reason: string }[]>([]);
  const grammarScoreRef = useRef<number>(0);

  // Word list
  const [wordList, setWordList] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);
  const [batchAdding, setBatchAdding] = useState(false);
  const [addedSummary, setAddedSummary] = useState<any[]>([]);
  const [showSummary, setShowSummary] = useState(false);
  const [defaultDeckId, setDefaultDeckId] = useState<string | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const WORD_LIST_KEY = `flashkado-word-list-${userId}`;

  // Tooltip
  const [tooltip, setTooltip] = useState<WordTooltip | null>(null);
  const jishoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back confirm
  const [backConfirm, setBackConfirm] = useState(false);

  useEffect(() => {
    supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).single()
      .then(({ data }) => { if (data) setDefaultDeckId(data.id); });
  }, [userId]);

  useEffect(() => {
    supabase.from("profiles").select("pending_words").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        const dbWords: string[] | null = data?.pending_words ?? null;
        if (dbWords && dbWords.length > 0) {
          setWordList(dbWords);
          localStorage.setItem(WORD_LIST_KEY, JSON.stringify(dbWords));
        } else {
          try {
            const saved = localStorage.getItem(WORD_LIST_KEY);
            setWordList(saved ? JSON.parse(saved) : []);
          } catch { setWordList([]); }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Jisho re-lookup when editWord changes
  useEffect(() => {
    const word = tooltip?.editWord?.trim();
    if (!word || !kanjiRe.test(word)) return;
    if (jishoDebounceRef.current) clearTimeout(jishoDebounceRef.current);
    jishoDebounceRef.current = setTimeout(() => {
      setTooltip(prev => prev ? { ...prev, jishoLoading: true, jishoMeanings: [], jlpt: [], isCommon: false } : prev);
      fetch(`/api/jisho?word=${encodeURIComponent(word)}`)
        .then(r => r.json())
        .then(d => setTooltip(prev => prev ? {
          ...prev, jishoLoading: false,
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

  const syncWordList = useCallback((newList: string[]) => {
    setWordList(newList);
    localStorage.setItem(WORD_LIST_KEY, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      supabase.from("profiles").update({ pending_words: newList }).eq("id", userId);
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const flushWordList = useCallback((newList: string[] = wordList) => {
    setWordList(newList);
    localStorage.setItem(WORD_LIST_KEY, JSON.stringify(newList));
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    supabase.from("profiles").update({ pending_words: newList }).eq("id", userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, wordList]);

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
      const { data: scoreRow } = await supabase.from("user_scores").select("id").eq("user_id", userId).eq("card_id", card.id).maybeSingle();
      setTooltip(prev => prev ? { ...prev, knownEnglish: scoreRow ? card.english : null } : prev);
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

    try {
      let allProcessed: any[] = [];
      const { data: existing } = await supabase.from("master_cards").select("*").in("japanese", words);
      if (existing?.length) { await performLinking(existing.map((c: any) => c.id)); allProcessed = [...existing]; }

      const existingSet = new Set(existing?.map((c: any) => c.japanese) ?? []);
      const wordsForAI = words.filter(w => !existingSet.has(w));

      if (wordsForAI.length > 0) {
        const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words: wordsForAI }) });
        if (!res.ok) throw new Error("AI error");
        const items = await res.json();
        const itemsArray = Array.isArray(items) ? items : [items];
        const seen = new Set<string>();
        const deduped = itemsArray
          .map((item: any) => ({ japanese: String(item.japanese).trim(), reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""), english: String(item.english || "").trim(), partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(), exampleSentence: item.exampleSentence || { jp: "", en: "" }, creator_id: userId }))
          .filter((item: any) => { if (seen.has(item.japanese)) return false; seen.add(item.japanese); return true; });
        const { data: newCards, error: mErr } = await supabase.from("master_cards").upsert(deduped, { onConflict: "japanese" }).select("*");
        if (mErr) throw mErr;
        if (newCards?.length) { await performLinking(newCards.map((c: any) => c.id)); allProcessed = [...allProcessed, ...newCards]; }
      }

      flushWordList([]);
      setShowList(false);
      if (allProcessed.length > 0) {
        setAddedSummary(Array.from(new Map(allProcessed.map(c => [c.japanese, c])).values()));
        setShowSummary(true);
      }
    } catch (err) {
      console.error("Batch add failed:", err);
    } finally {
      setBatchAdding(false);
    }
  };

  const load = async () => {
    setStarting(true);
    setPhase("loading");
    setError(null);
    setTooltip(null);
    try {
      const [profileRes, spRes, mistakesRes] = await Promise.all([
        supabase.from("profiles").select("grammar_score").eq("id", userId).single(),
        supabase.from("sensei_profile").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("grammar_corrections").select("mistake, correct, reason").eq("user_id", userId).limit(20),
      ]);

      if (profileRes.data?.grammar_score != null) {
        grammarScoreRef.current = profileRes.data.grammar_score;
      }

      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: spRes.data ?? null, recentMistakes: mistakesRes.data ?? [] }),
      });
      const data = await res.json();
      if (Array.isArray(data.questions) && data.questions.length > 0) {
        setQuestions(data.questions);
        setIndex(0);
        setSelected(null);
        setScore(0);
        setWrong([]);
        setWritingInput("");
        setWritingSubmitted(false);
        setPhase("quiz");
      } else {
        setError("Failed to generate quiz. Please try again.");
        setPhase("intro");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setPhase("intro");
    }
    setStarting(false);
  };

  const finishQuiz = (finalScore: number, totalQ: number, finalWrong: typeof wrong) => {
    setPhase("done");
    if (finalWrong.length > 0) {
      supabase.from("grammar_corrections").insert(
        finalWrong.map(w => ({ user_id: userId, mistake: w.mistake, correct: w.correct, reason: w.reason }))
      );
    }
    const sess = sessionScore(finalScore, totalQ, grammarScoreRef.current);
    const newGrammarScore = grammarScoreRef.current === 0 ? Math.round(sess) : rollingAvg(grammarScoreRef.current, sess);
    grammarScoreRef.current = newGrammarScore;
    supabase.from("profiles").update({ grammar_score: newGrammarScore }).eq("id", userId)
      .then(({ error }) => { if (error) console.error("[grammar_score save]", error.code, error.message); });
  };

  const pct = phase === "done" && questions.length > 0 ? score / questions.length : 0;

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {phase === "quiz" ? (
            <button onClick={() => setBackConfirm(true)} className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all">
              <ChevronLeft size={14} />
              <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
            </button>
          ) : null}
          <div className="flex items-center gap-2.5">
            <span className="text-base">📝</span>
            <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Grammar Quiz</span>
            {phase === "quiz" && questions.length > 0 && (
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 ml-1">
                {index + 1} / {questions.length}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowList(true)} className="relative p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
            <List size={16} className="text-slate-500" />
            {wordList.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-indigo-600 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">{wordList.length}</span>
            )}
          </button>
          <button onClick={phase === "loading" || phase === "quiz" ? () => setBackConfirm(true) : onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
            <X size={16} className="text-slate-500" />
          </button>
        </div>
      </div>

      {/* Intro */}
      {phase === "intro" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full text-center gap-5">
          <span className="text-5xl">📝</span>
          <div>
            <h2 className="text-xl font-black text-slate-900 mb-2">How it works</h2>
            <p className="text-slate-500 font-medium text-sm leading-relaxed">
              A short AI-generated quiz based on your level and past mistakes. You&apos;ll get fill-in-the-blank grammar questions, Japanese-to-English reading, and free-writing prompts.
            </p>
          </div>
          <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 text-left">
            <p className="text-emerald-800 font-bold text-xs leading-relaxed">
              🧠 Questions are tailored to your grammar level and common mistakes from Sensei chats. Tap any kanji to look it up.
            </p>
          </div>
          {error && <p className="text-red-500 font-bold text-xs">{error}</p>}
          <button onClick={load} disabled={starting}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] active:scale-95 transition-all shadow-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {starting ? <Loader2 size={14} className="animate-spin" /> : null}
            {starting ? "Please wait…" : "Start Quiz"}
          </button>
        </div>
      )}

      {/* Loading */}
      {phase === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Generating quiz…</p>
          <p className="text-slate-300 font-bold text-[10px]">Please wait, this can take a few seconds</p>
        </div>
      )}

      {/* Done */}
      {phase === "done" && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-lg mx-auto w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">{pct >= 0.8 ? "🏆" : pct >= 0.5 ? "💪" : "📚"}</div>
            <h2 className="text-4xl font-black text-slate-900 mb-1">
              {score}<span className="text-slate-300 font-bold text-2xl"> / {questions.length}</span>
            </h2>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px] mt-1">
              {Math.round(pct * 100)}% correct · {pct >= 0.8 ? "Excellent!" : pct >= 0.5 ? "Good work!" : "Keep practicing!"}
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <button onClick={onClose}
              className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">
              Done
            </button>
            <button onClick={load}
              className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Quiz */}
      {phase === "quiz" && questions.length > 0 && (() => {
        const q = questions[index];
        const isLast = index + 1 >= questions.length;

        const advance = (wrongItem?: { mistake: string; correct: string; reason: string }, bonusScore = 0) => {
          const nextWrong = wrongItem ? [...wrong, wrongItem] : wrong;
          if (wrongItem) setWrong(nextWrong);
          const effectiveScore = score + bonusScore;
          if (bonusScore > 0) setScore(effectiveScore);
          setTooltip(null);
          if (isLast) {
            finishQuiz(effectiveScore, questions.length, nextWrong);
          } else {
            setIndex(i => i + 1);
            setSelected(null);
            setWritingInput("");
            setWritingSubmitted(false);
          }
        };

        const advanceBtn = (wrongItem?: Parameters<typeof advance>[0]) => (
          <button onClick={() => advance(wrongItem)}
            className="w-full py-4 bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all">
            {isLast ? "See Results" : "Next →"}
          </button>
        );

        return (
          <div className="flex-1 flex flex-col px-5 py-5 max-w-lg mx-auto w-full min-h-0 overflow-y-auto">
            {/* Progress bar */}
            <div className="mb-5 shrink-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{index + 1} / {questions.length}</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{score} correct</span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${(index / questions.length) * 100}%` }} />
              </div>
            </div>

            {/* Grammar: fill-in-the-blank */}
            {q.type === "grammar" && (() => {
              const answered = selected !== null;
              const isCorrect = selected === q.answer;
              return (
                <div className="flex flex-col gap-4">
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400 mb-3">Fill in the blank</p>
                    {q.blank_hint && (
                      <p className="text-[11px] text-slate-400 font-bold mb-2">
                        <TappableText text={q.blank_hint} keyPrefix="hint" onWordTap={handleWordClick} />
                      </p>
                    )}
                    <p className="text-xl leading-relaxed text-slate-800 font-medium">
                      <TappableText text={q.sentence} keyPrefix="sent" onWordTap={handleWordClick} />
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {q.choices.map((choice) => {
                      let style = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50";
                      if (answered) {
                        if (choice === q.answer) style = "bg-emerald-50 border-emerald-400 text-emerald-700";
                        else if (choice === selected) style = "bg-red-50 border-red-400 text-red-700";
                        else style = "bg-white border-slate-200 text-slate-400";
                      }
                      return (
                        <button key={choice}
                          onClick={() => { if (!answered) { setSelected(choice); if (choice === q.answer) setScore(s => s + 1); } }}
                          className={`px-4 py-4 rounded-2xl border-2 text-sm font-black transition-all ${style}`}>
                          <TappableText text={choice} keyPrefix={`ch-${choice}`} onWordTap={handleWordClick} />
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <div className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                      <p className="font-black mb-1">
                        {isCorrect ? "✓ Correct!" : <span>✗ Answer: <TappableText text={q.answer} keyPrefix="ans" onWordTap={handleWordClick} /></span>}
                      </p>
                      <p className="text-xs leading-relaxed">
                        <TappableText text={q.explanation} keyPrefix="exp" onWordTap={handleWordClick} />
                      </p>
                    </div>
                  )}
                  {answered && advanceBtn(isCorrect ? undefined : { mistake: selected!, correct: q.answer, reason: q.sentence })}
                </div>
              );
            })()}

            {/* Reading: JP → EN */}
            {q.type === "reading" && (() => {
              const answered = selected !== null;
              const isCorrect = selected === q.answer;
              return (
                <div className="flex flex-col gap-4">
                  <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mb-3">Translate to English</p>
                    <p className="text-xl leading-relaxed text-slate-800 font-medium">
                      <TappableText text={q.japanese} keyPrefix="jp" onWordTap={handleWordClick} />
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {q.choices.map((choice) => {
                      let style = "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 text-left";
                      if (answered) {
                        if (choice === q.answer) style = "bg-emerald-50 border-emerald-400 text-emerald-700 text-left";
                        else if (choice === selected) style = "bg-red-50 border-red-400 text-red-700 text-left";
                        else style = "bg-white border-slate-200 text-slate-400 text-left";
                      }
                      return (
                        <button key={choice} disabled={answered}
                          onClick={() => { setSelected(choice); if (choice === q.answer) setScore(s => s + 1); }}
                          className={`px-4 py-4 rounded-2xl border-2 text-sm font-bold transition-all ${style}`}>
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <div className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                      <p className="font-black mb-1">{isCorrect ? "✓ Correct!" : `✗ Answer: ${q.answer}`}</p>
                      <p className="text-xs leading-relaxed">
                        <TappableText text={q.explanation} keyPrefix="rexp" onWordTap={handleWordClick} />
                      </p>
                    </div>
                  )}
                  {answered && advanceBtn(isCorrect ? undefined : { mistake: selected!, correct: q.answer, reason: q.japanese })}
                </div>
              );
            })()}

            {/* Writing: EN → JP */}
            {q.type === "writing" && (
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-3">Write in Japanese</p>
                  <p className="text-xl leading-relaxed text-slate-800 font-medium">{q.english}</p>
                  {q.hint && (
                    <p className="text-[11px] text-amber-600 font-bold mt-3">
                      💡 <TappableText text={q.hint} keyPrefix="whint" onWordTap={handleWordClick} />
                    </p>
                  )}
                </div>
                {!writingSubmitted ? (
                  <>
                    <textarea value={writingInput} onChange={e => setWritingInput(e.target.value)}
                      placeholder="日本語で書いてください..." rows={3}
                      className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-amber-400 resize-none bg-white" />
                    <button disabled={!writingInput.trim()} onClick={() => setWritingSubmitted(true)}
                      className="w-full py-4 bg-amber-500 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl active:scale-95 transition-all disabled:opacity-40">
                      Check Answer
                    </button>
                  </>
                ) : (
                  <>
                    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Model answer</p>
                      <p className="text-base font-bold text-slate-800">
                        <TappableText text={q.answer} keyPrefix="wans" onWordTap={handleWordClick} />
                      </p>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        <TappableText text={q.explanation} keyPrefix="wexp" onWordTap={handleWordClick} />
                      </p>
                    </div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest text-center">Did you get it right?</p>
                    <div className="flex gap-3">
                      <button onClick={() => advance(undefined, 1)}
                        className="flex-1 py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-black border-b-4 border-emerald-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest">
                        ✓ Got it
                      </button>
                      <button onClick={() => advance({ mistake: writingInput, correct: q.answer, reason: q.english })}
                        className="flex-1 py-4 bg-rose-50 text-rose-600 rounded-2xl font-black border-b-4 border-rose-200 active:border-b-0 active:translate-y-1 transition-all uppercase text-[10px] tracking-widest">
                        ✗ Missed
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

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

      {/* ── Word tooltip ── */}
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
                <Loader2 size={11} className="animate-spin" /><span>Looking up…</span>
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
                      <button onClick={() => { if (!wordList.includes(c.word)) syncWordList([...wordList, c.word]); }}
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
            <input type="text" value={tooltip.editWord}
              onChange={(e) => setTooltip(prev => prev ? { ...prev, editWord: e.target.value } : prev)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              placeholder="e.g. 食べる" />
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
                <h2 className="text-base font-black text-slate-800 uppercase italic tracking-tighter">Word List</h2>
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
              <button onClick={() => syncWordList([])} disabled={wordList.length === 0}
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
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 className="text-base font-black text-slate-800">Added to Deck</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{addedSummary.length} card{addedSummary.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => setShowSummary(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              {addedSummary.map((c, i) => (
                <div key={i} className="flex items-center gap-3 py-1">
                  <span className="text-sm font-black text-slate-800">{c.japanese}</span>
                  <span className="text-xs text-indigo-500 font-bold">{c.reading}</span>
                  <span className="text-xs text-slate-500 flex-1 truncate">{c.english}</span>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setShowSummary(false)}
                className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white active:scale-95 transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
