"use client";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { X } from "lucide-react";
import { sessionScore, rollingAvg } from "@/lib/scoring";

interface GrammarQuizProps {
  userId: string;
  onClose: () => void;
}

type QuizQuestion =
  | { type: "grammar"; sentence: string; blank_hint: string; choices: string[]; answer: string; explanation: string }
  | { type: "reading"; japanese: string; choices: string[]; answer: string; explanation: string }
  | { type: "writing"; english: string; answer: string; hint?: string; explanation: string };

function stripFurigana(text: string): string {
  return text.replace(/([一-龯々〻㐀-䶿][一-龯々〻㐀-䶿ぁ-ん]*)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g, "$1");
}

export default function GrammarQuiz({ userId, onClose }: GrammarQuizProps) {
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [writingInput, setWritingInput] = useState("");
  const [writingSubmitted, setWritingSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [wrong, setWrong] = useState<{ mistake: string; correct: string; reason: string }[]>([]);
  const grammarScoreRef = useRef<number>(0);
  const startedRef = useRef(false);

  const startQuiz = async () => {
    setLoading(true);
    setInitError(false);
    setQuestions([]);
    setIndex(0);
    setSelected(null);
    setScore(0);
    setDone(false);
    setWrong([]);
    setWritingInput("");
    setWritingSubmitted(false);

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
      } else {
        setInitError(true);
      }
    } catch {
      setInitError(true);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishQuiz = (finalScore: number, totalQ: number, finalWrong: typeof wrong) => {
    setDone(true);
    if (finalWrong.length > 0) {
      supabase.from("grammar_corrections").insert(
        finalWrong.map(w => ({ user_id: userId, mistake: w.mistake, correct: w.correct, reason: w.reason }))
      );
    }
    const sess = sessionScore(finalScore, totalQ, grammarScoreRef.current);
    const newScore = rollingAvg(grammarScoreRef.current, sess);
    grammarScoreRef.current = newScore;
    supabase.from("profiles").update({ grammar_score: newScore }).eq("id", userId);
  };

  const pct = done && questions.length > 0 ? score / questions.length : 0;

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-base">📝</span>
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Grammar Quiz</span>
          {!loading && questions.length > 0 && !done && (
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 ml-1">
              {index + 1} / {questions.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 transition-colors active:scale-90">
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-9 h-9 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest">Generating quiz…</p>
        </div>
      )}

      {/* Error */}
      {!loading && (initError || questions.length === 0) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <span className="text-5xl">😓</span>
          <p className="text-slate-600 font-bold text-sm">Failed to generate quiz.</p>
          <div className="flex gap-3">
            <button onClick={onClose}
              className="px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
              Close
            </button>
            <button onClick={startQuiz}
              className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Done screen */}
      {!loading && done && (
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
            <button onClick={startQuiz}
              className="flex-1 py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all shadow-sm">
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Questions */}
      {!loading && !done && questions.length > 0 && (() => {
        const q = questions[index];
        const isLast = index + 1 >= questions.length;

        const advance = (wrongItem?: { mistake: string; correct: string; reason: string }, bonusScore = 0) => {
          const nextWrong = wrongItem ? [...wrong, wrongItem] : wrong;
          if (wrongItem) setWrong(nextWrong);
          const effectiveScore = score + bonusScore;
          if (bonusScore > 0) setScore(effectiveScore);
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
                    {q.blank_hint && <p className="text-[11px] text-slate-400 font-bold mb-2">{stripFurigana(q.blank_hint)}</p>}
                    <p className="text-xl leading-relaxed text-slate-800 font-medium">{stripFurigana(q.sentence)}</p>
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
                          {stripFurigana(choice)}
                        </button>
                      );
                    })}
                  </div>
                  {answered && (
                    <div className={`rounded-2xl p-4 text-sm ${isCorrect ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
                      <p className="font-black mb-1">
                        {isCorrect ? "✓ Correct!" : <span>✗ Answer: {stripFurigana(q.answer)}</span>}
                      </p>
                      <p className="text-xs leading-relaxed">{stripFurigana(q.explanation)}</p>
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
                    <p className="text-xl leading-relaxed text-slate-800 font-medium">{stripFurigana(q.japanese)}</p>
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
                      <p className="text-xs leading-relaxed">{stripFurigana(q.explanation)}</p>
                    </div>
                  )}
                  {answered && advanceBtn(isCorrect ? undefined : { mistake: selected!, correct: q.answer, reason: q.japanese })}
                </div>
              );
            })()}

            {/* Writing: EN → JP free text */}
            {q.type === "writing" && (
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-6 py-5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-3">Write in Japanese</p>
                  <p className="text-xl leading-relaxed text-slate-800 font-medium">{q.english}</p>
                  {q.hint && <p className="text-[11px] text-amber-600 font-bold mt-3">💡 {stripFurigana(q.hint)}</p>}
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
                      <p className="text-base font-bold text-slate-800">{stripFurigana(q.answer)}</p>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{stripFurigana(q.explanation)}</p>
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
    </div>
  );
}
