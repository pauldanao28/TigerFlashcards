"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, X, Mic, Square, ArrowRightLeft, List, Volume2 } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { speak } from "@/lib/tts";
import TappableText from "@/components/TappableText";
import NewWordsPanel from "@/components/NewWordsPanel";
import AddedWordsSummary from "@/components/AddedWordsSummary";
import WordLookupSheet from "@/components/WordLookupSheet";
import { useWordLookup } from "@/hooks/useWordLookup";
import { useWordMining } from "@/hooks/useWordMining";

const MAX_CHARS = 500;

interface TranslateResult {
  detectedLanguage: string;
  casual: { japanese: string; explanation: string };
  polite: { japanese: string; explanation: string };
  notes: string;
}

// Minimal Web Speech API shape — not in lib.dom.d.ts in a cross-browser-safe way,
// and only Chrome/Safari actually implement it (feature-detected below, no polyfill).
type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
interface SRInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => SRInstance;
    webkitSpeechRecognition?: new () => SRInstance;
  }
}
function getSpeechRecognitionCtor(): (new () => SRInstance) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Paste (or speak) anything in any language and get it translated into Japanese —
 * casual and polite versions, each with a short explanation of what makes it that
 * register, plus tappable kanji using the exact same tap-to-lookup/add-to-deck flow
 * as the Reader and Watch (TappableText, useWordLookup, useWordMining).
 */
export default function TranslateView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const mining = useWordMining(userId);
  const { lookup, openLookup, setEditWord, closeLookup } = useWordLookup(userId);
  const handleWordTap = (word: string, e: React.MouseEvent | React.TouchEvent, reading = "") => openLookup(word, reading, e);
  const isQueued = (w: string) => mining.addedWords.has(w) || mining.newWords.some((nw) => nw.word === w);

  const [phase, setPhase] = useState<"input" | "loading" | "result">("input");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslateResult | null>(null);

  // ── Voice input (browser Web Speech API — free, no AI, same philosophy as the
  // Reader's read-aloud using SpeechSynthesis instead of a Gemini TTS call) ──
  const speechSupported = typeof window !== "undefined" && !!getSpeechRecognitionCtor();
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SRInstance | null>(null);
  useEffect(() => () => recognitionRef.current?.stop(), []);

  const toggleListening = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    const base = draft.trim();
    let finalTranscript = "";
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += piece;
        else interim += piece;
      }
      const combined = [base, (finalTranscript + interim).trim()].filter(Boolean).join(" ");
      setDraft(combined.slice(0, MAX_CHARS));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const translate = async () => {
    const text = draft.trim();
    if (!text) return;
    recognitionRef.current?.stop();
    setPhase("loading");
    setError(null);
    try {
      const res = await authedFetch("/api/translate", { method: "POST", body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translation failed");
      setResult(data as TranslateResult);
      setPhase("result");
      const combined = `${data.casual.japanese}\n${data.polite.japanese}`;
      await Promise.all([mining.loadWordStatus(combined), mining.loadNewWords(combined)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("input");
    }
  };

  const reset = () => {
    recognitionRef.current?.stop();
    setPhase("input");
    setDraft("");
    setResult(null);
    setError(null);
    mining.clearNewWords();
  };

  return (
    <div className="fixed inset-0 z-[300] bg-slate-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={phase === "result" ? reset : onClose}
          className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all"
        >
          <ChevronLeft size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">
            {phase === "result" ? "New Translation" : "Back"}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <ArrowRightLeft size={15} className="text-indigo-500" />
          <span className="font-black text-[11px] uppercase tracking-widest text-slate-700">Translate</span>
        </div>
        <div className="w-[92px] flex justify-end">
          {phase !== "result" && <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 active:scale-90"><X size={16} /></button>}
        </div>
      </div>

      {/* INPUT PHASE */}
      {phase === "input" && (
        <div className="flex-1 overflow-y-auto px-5 py-6 max-w-xl mx-auto w-full">
          <h2 className="text-xl font-black text-slate-900 mb-1">Say it in Japanese</h2>
          <p className="text-slate-500 text-sm font-medium mb-4 leading-relaxed">
            Type or speak anything, in any language — Gemini translates it into natural
            Japanese with both a casual and a polite version, each explained. Tap any kanji
            to look it up and add it to your deck.
          </p>

          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
              rows={6}
              placeholder="Type anything, in any language…"
              className="w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 pr-14 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none leading-relaxed"
            />
            {speechSupported && (
              <button
                onClick={toggleListening}
                aria-label={listening ? "Stop recording" : "Speak instead of typing"}
                className={`absolute right-3 top-3 w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  listening ? "bg-rose-500 text-white animate-pulse" : "bg-indigo-50 text-indigo-500"
                }`}
              >
                {listening ? <Square size={14} /> : <Mic size={16} />}
              </button>
            )}
          </div>
          <p className="text-right text-[10px] font-bold text-slate-300 mt-1">{draft.length}/{MAX_CHARS}</p>
          {listening && <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mt-1">Listening…</p>}

          {error && <p className="text-rose-500 font-bold text-xs mt-2">{error}</p>}

          <button
            onClick={translate}
            disabled={!draft.trim()}
            className="w-full mt-3 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            <ArrowRightLeft size={16} /> Translate
          </button>
        </div>
      )}

      {/* LOADING PHASE */}
      {phase === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Translating…</p>
        </div>
      )}

      {/* RESULT PHASE */}
      {phase === "result" && result && (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-xl mx-auto w-full px-5 py-6">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Detected: {result.detectedLanguage}
              </span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-violet-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-violet-200 border border-violet-500" /> Not in deck
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-600">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-100/70 border border-rose-400" /> Weak
                </span>
              </div>
            </div>

            {([
              { key: "casual" as const, label: "Casual", color: "text-sky-600", bg: "bg-sky-50", border: "border-sky-100" },
              { key: "polite" as const, label: "Polite", color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-100" },
            ]).map(({ key, label, color, bg, border }) => {
              const r = result[key];
              return (
                <div key={key} className={`bg-white rounded-[2rem] border-2 ${border} shadow-sm p-6 mb-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${bg} ${color}`}>
                      {label}
                    </span>
                    <button
                      onClick={() => speak(r.japanese)}
                      aria-label={`Listen to the ${label.toLowerCase()} version`}
                      className="text-slate-300 hover:text-slate-500 active:scale-90 transition-all"
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                  <p className="text-xl leading-[2.4] break-words">
                    <TappableText text={r.japanese} keyPrefix={key} onWordTap={(word, reading, e) => handleWordTap(word, e, reading)} getStatus={mining.getWordStatus} />
                  </p>
                  {r.explanation && (
                    <p className="text-xs text-slate-500 leading-relaxed mt-3 pt-3 border-t border-slate-50">{r.explanation}</p>
                  )}
                </div>
              );
            })}

            {result.notes && (
              <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Notes</p>
                <p className="text-xs text-slate-600 leading-relaxed">{result.notes}</p>
              </div>
            )}

            <NewWordsPanel mining={mining} onWordTap={handleWordTap} />
          </div>
        </div>
      )}

      {/* Word lookup (shared with the quizzes / Reader / Sensei chat) — queues into "Not in your deck" */}
      {lookup && (
        <WordLookupSheet
          lookup={lookup}
          onClose={closeLookup}
          onEditWord={setEditWord}
          onAdd={(w) => mining.queueWord(w, lookup.reading)}
          isAdded={isQueued}
          addLabel="Add to List"
          addIcon={<List size={11} />}
          layerClassName={{ backdrop: "z-[310]", sheet: "z-[320] bottom-0 left-0 right-0" }}
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
