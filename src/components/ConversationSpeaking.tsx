"use client";
import { useEffect, useRef, useState } from "react";
import { X, Mic, Square, Loader2, RotateCcw } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import CustomSelect from "@/components/CustomSelect";

type Turn = { staff_jp: string; task_en: string; reference_jp: string; reference_en: string; tip_en: string };
type Feedback = { acceptable: boolean; feedback: string; suggestion: string };
type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type Recognizer = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: SpeechResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type SpeechWindow = { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer };

const scenarios = [
  { value: "restaurant", label: "🍜 Restaurant" }, { value: "shopping", label: "🛍️ Shopping" },
  { value: "travel", label: "🚆 Travel & Trains" }, { value: "hotel", label: "🏨 Hotel" },
  { value: "daily", label: "☀️ Daily Life" }, { value: "friends", label: "💬 Friends" },
];

export default function ConversationSpeaking({ onClose }: { onClose: () => void }) {
  const [scenario, setScenario] = useState("restaurant");
  const [level, setLevel] = useState("N4");
  const [style, setStyle] = useState("mixed");
  const [direction, setDirection] = useState<"en-ja" | "ja-en">("en-ja");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const recognizer = useRef<Recognizer | null>(null);
  useEffect(() => () => { recognizer.current?.stop(); }, []);

  const start = async () => {
    setLoading(true); setError("");
    try {
      const response = await authedFetch("/api/quiz/conversation-speaking", { method: "POST", body: JSON.stringify({ scenario, level, style }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Generation failed");
      if (!Array.isArray(body.turns) || !body.turns.length) throw new Error("No conversation generated");
      setTurns(body.turns); setIndex(0); setAnswer(""); setFeedback(null); setRevealed(false); setCorrect(0); setAttempts(0); setDone(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not start"); }
    finally { setLoading(false); }
  };

  const speak = () => {
    if (listening) { recognizer.current?.stop(); return; }
    const w = window as unknown as SpeechWindow;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) { setError("Speech recognition is not available in this browser. Please type instead."); return; }
    try {
      const instance = new Ctor();
      recognizer.current = instance;
      instance.lang = direction === "en-ja" ? "ja-JP" : "en-US"; instance.continuous = false; instance.interimResults = false;
      instance.onresult = e => { setAnswer(e.results[0]?.[0]?.transcript || ""); setFeedback(null); setRevealed(false); setError(""); };
      instance.onerror = () => { setError("Microphone recognition failed. Check permissions or type your answer."); setListening(false); };
      instance.onend = () => { setListening(false); recognizer.current = null; };
      instance.start(); setListening(true); setError("");
    } catch { setListening(false); setError("Could not start microphone. Try typing instead."); }
  };

  const check = async () => {
    const turn = turns[index];
    if (!turn || !answer.trim() || checking) return;
    setChecking(true); setError("");
    try {
      const response = await authedFetch("/api/quiz/sentence-feedback", {
        method: "POST",
        body: JSON.stringify({ english: direction === "ja-en" ? turn.reference_jp : turn.task_en, reference: direction === "ja-en" ? turn.reference_en : turn.reference_jp, answer: answer.trim(), direction }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Feedback unavailable");
      setFeedback(body); setRevealed(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not check answer"); }
    finally { setChecking(false); }
  };

  const retry = () => { recognizer.current?.stop(); setAnswer(""); setFeedback(null); setRevealed(false); setAttempts(a => a + 1); setError(""); };
  const next = () => {
    if (feedback?.acceptable) setCorrect(c => c + 1);
    recognizer.current?.stop();
    if (index + 1 >= turns.length) { setDone(true); return; }
    setIndex(i => i + 1); setAnswer(""); setFeedback(null); setRevealed(false); setAttempts(0); setError("");
  };
  const turn = turns[index];
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-2xl min-h-screen px-4 pt-8 pb-24">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Japanese speaking</p><h2 className="text-2xl font-black">Conversation Speaking</h2></div>
          <button type="button" onClick={onClose} aria-label="Close conversation speaking" className="p-3 rounded-full bg-white border border-slate-200"><X size={20}/></button>
        </div>
        {!turns.length ? (
          <div className="space-y-5">
            <p className="text-sm text-slate-600">Practise a connected conversation, one spoken Japanese response at a time. Your settings start with Restaurant · N4 · Mixed.</p>
            <div className="grid grid-cols-2 gap-2">
              {scenarios.map(item => <button key={item.value} type="button" onClick={() => setScenario(item.value)} aria-pressed={scenario === item.value} className={`rounded-xl p-3 text-left text-sm font-bold border ${scenario === item.value ? "border-indigo-500 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white"}`}>{item.label}</button>)}
            </div>
            <CustomSelect label="Practice direction" value={direction} onChange={value => setDirection(value as "en-ja" | "ja-en")} options={[
              { value: "en-ja", label: "English → Japanese · Speak Japanese" },
              { value: "ja-en", label: "Japanese → English · Explain in English" },
            ]} />
            <CustomSelect label="Difficulty" value={level} onChange={setLevel} options={["N5", "N4", "N3", "N2"].map(v => ({ value: v, label: v }))} />
            <CustomSelect label="Speaking style" value={style} onChange={setStyle} options={[
              { value: "mixed", label: "Mixed — natural everyday Japanese" },
              { value: "polite", label: "Polite — です・ます" },
              { value: "casual", label: "Casual — タメ口" },
            ]} />
            <div className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">{direction === "en-ja" ? "English → Japanese speaking" : "Japanese → English comprehension"} · 10 connected turns · AI feedback and retries</div>
            <button type="button" onClick={start} disabled={loading} className="w-full rounded-2xl bg-indigo-600 text-white font-black py-4 disabled:opacity-50">{loading ? "Generating conversation…" : "Start Conversation"}</button>
          </div>
        ) : done ? (
          <div className="rounded-2xl bg-white border border-slate-100 p-6 space-y-4 text-center">
            <h3 className="text-xl font-black">Conversation complete!</h3>
            <p className="text-slate-600">You completed {turns.length} speaking turns. {correct} were accepted by AI on the final checked attempt.</p>
            <p className="text-xs text-slate-500">AI feedback is approximate and does not grade pronunciation.</p>
            <button type="button" onClick={() => { setTurns([]); setDone(false); }} className="w-full rounded-xl bg-indigo-600 text-white py-3 font-bold">New conversation</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between text-xs font-bold text-slate-500"><span>{scenarios.find(s => s.value === scenario)?.label} · {level} · {style} · {direction === "en-ja" ? "EN → JP" : "JP → EN"}</span><span>Turn {index + 1} / {turns.length}</span></div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${(index / turns.length) * 100}%` }}/></div>
            <div className="rounded-2xl bg-white border border-slate-100 p-5 space-y-2"><p className="text-[10px] font-black uppercase text-slate-400">Conversation partner says</p><p className="text-xl leading-relaxed font-semibold">{turn.staff_jp}</p><button type="button" onClick={() => { if ("speechSynthesis" in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(turn.staff_jp); u.lang = "ja-JP"; window.speechSynthesis.speak(u); } }} className="text-xs font-bold text-indigo-600">🔊 Listen</button></div>
            <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-5 space-y-2"><p className="text-[10px] font-black uppercase text-indigo-600">{direction === "en-ja" ? "Say this in Japanese" : "Translate this reply into English"}</p><p className="text-lg font-semibold">{direction === "en-ja" ? turn.task_en : turn.reference_jp}</p></div>
            <div className="rounded-2xl bg-white border border-slate-100 p-4 space-y-3">
              <div className="flex gap-2 items-start"><textarea aria-label={direction === "en-ja" ? "Your Japanese response" : "Your English translation"} rows={3} value={answer} onChange={e => { setAnswer(e.target.value); setFeedback(null); setRevealed(false); }} placeholder={direction === "en-ja" ? "日本語で話す・書く…" : "Speak or type the English meaning…"} className="flex-1 min-w-0 rounded-xl border border-slate-200 p-3 text-base"/><button type="button" onClick={speak} className={`rounded-xl p-3 text-white ${listening ? "bg-rose-500" : "bg-indigo-600"}`} aria-label={listening ? "Stop recording" : direction === "en-ja" ? "Speak Japanese" : "Speak English"}>{listening ? <Square size={22}/> : <Mic size={22}/>}</button></div>
              <p className="text-[11px] text-slate-500">Microphone converts speech to text; it does not measure pronunciation.</p>
              <button type="button" onClick={check} disabled={!answer.trim() || checking} className="w-full rounded-xl bg-indigo-600 py-3 text-white font-bold disabled:opacity-40">{checking ? <span className="inline-flex gap-2 items-center"><Loader2 className="animate-spin" size={16}/> Checking…</span> : direction === "en-ja" ? "Check my Japanese" : "Check my English"}</button>
              {attempts > 0 && <p className="text-xs text-slate-500">Retry attempt {attempts + 1}</p>}
            </div>
            {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
            {revealed && <div className="rounded-2xl bg-white border border-slate-100 p-4 space-y-3">
              {feedback && <><p className={`font-black ${feedback.acceptable ? "text-emerald-700" : "text-amber-700"}`}>{feedback.acceptable ? "Natural answer accepted" : "Let's improve this sentence"}</p><p className="text-sm">{feedback.feedback}</p></>}
              <p className="text-xs font-bold text-slate-500">{direction === "en-ja" ? "Reference Japanese" : "Reference English"}</p><p className="text-lg font-semibold">{direction === "en-ja" ? turn.reference_jp : turn.reference_en}</p>
              {feedback?.suggestion && <p className="text-sm text-slate-600">Suggestion: {feedback.suggestion}</p>}
              <p className="text-sm text-slate-500">Tip: {turn.tip_en}</p>
              <div className="flex gap-2"><button type="button" onClick={retry} className="flex-1 inline-flex justify-center items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 py-3 font-bold text-indigo-700"><RotateCcw size={16}/> Retry</button><button type="button" onClick={next} className="flex-1 rounded-xl bg-indigo-600 py-3 font-bold text-white">{index + 1 === turns.length ? "Finish" : "Next turn"}</button></div>
            </div>}
          </div>
        )}
      </div>
    </div>
  );
}
