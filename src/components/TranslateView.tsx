"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, X, Mic, Square, ArrowRightLeft, Loader2, List, Volume2, Check, Plus } from "lucide-react";
import { authedFetch } from "@/lib/authedFetch";
import { speak } from "@/lib/tts";
import { queuePendingWords } from "@/lib/pendingWords";
import { markFeatureUsedToday } from "@/lib/featureUsage";
import TappableText, { kanjiRe } from "@/components/TappableText";
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
 * register, plus tappable kanji using the same tap-to-lookup flow as the Reader and
 * Watch (TappableText, useWordLookup, useWordMining for highlighting/extraction).
 * Unlike Reader/Watch, nothing here goes straight into the deck — a translated
 * phrase is often just a one-off curiosity, not necessarily something to study, so
 * "add" only ever stages a word into the same pending_words queue AddWordsSheet's
 * Queue tab reviews later (queuePendingWords), never useAddWords.processWords.
 */
export default function TranslateView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const mining = useWordMining(userId);
  const { lookup, openLookup, setEditWord, closeLookup } = useWordLookup(userId);
  const handleWordTap = (word: string, e: React.MouseEvent | React.TouchEvent, reading = "") => openLookup(word, reading, e);

  const [phase, setPhase] = useState<"input" | "result">("input");
  const [draft, setDraft] = useState("");
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranslateResult | null>(null);
  const requestIdRef = useRef(0);

  // Words staged into the pending_words queue this session — tap-to-add (the lookup
  // sheet) and the panel below both just mark a word here instead of adding it to
  // the deck; it disappears from "Not in your deck" once queued.
  const [queuedWords, setQueuedWords] = useState<Set<string>>(new Set());
  const [queuing, setQueuing] = useState(false);
  const queueWords = async (words: string[]) => {
    if (!words.length) return;
    try {
      await queuePendingWords(userId, words);
      setQueuedWords((prev) => new Set([...prev, ...words]));
    } catch {
      setError("Couldn't queue that word — try again.");
    }
  };

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

  // Stays on the input screen the whole time (no full-screen takeover) — the
  // textbox is never locked, so clearing it and firing another translate() while
  // one's still in flight is fine; the request id guard below just makes sure an
  // older response landing late can't clobber a newer one.
  const translate = async () => {
    const text = draft.trim();
    if (!text) return;
    const id = ++requestIdRef.current;
    setTranslating(true);
    setError(null);
    try {
      const res = await authedFetch("/api/translate", { method: "POST", body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Translation failed");
      if (requestIdRef.current !== id) return;
      setResult(data as TranslateResult);
      setPhase("result");
      setQueuedWords(new Set());
      markFeatureUsedToday("translate");
      const combined = `${data.casual.japanese}\n${data.polite.japanese}`;
      await Promise.all([mining.loadWordStatus(combined), mining.loadNewWords(combined)]);
    } catch (e) {
      if (requestIdRef.current !== id) return;
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      if (requestIdRef.current === id) setTranslating(false);
    }
  };

  const reset = () => {
    recognitionRef.current?.stop();
    setPhase("input");
    setDraft("");
    setResult(null);
    setError(null);
    setQueuedWords(new Set());
    mining.clearNewWords();
  };

  const visibleWords = mining.visibleNewWords.filter((w) => !queuedWords.has(w.word));
  const visibleSelectedCount = visibleWords.filter((w) => mining.selectedNew.has(w.word)).length;

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
            Type or speak anything, in any language — AI translates it into natural
            Japanese with both a casual and a polite version, each explained. Tap any kanji
            to look it up and queue it for Add Cards.
          </p>

          <div className="relative">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
              rows={6}
              placeholder="Type anything, in any language…"
              className={`w-full bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none leading-relaxed ${speechSupported ? "pr-24" : "pr-14"}`}
            />
            {draft.length > 0 && (
              <button
                onClick={() => { recognitionRef.current?.stop(); setDraft(""); }}
                aria-label="Clear text"
                className={`absolute top-3 w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 active:scale-90 transition-all ${speechSupported ? "right-14" : "right-3"}`}
              >
                <X size={16} />
              </button>
            )}
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

          {/* Below the textbox only, never a full-screen takeover — the textbox
              stays put the whole time a request is in flight. The button itself is
              disabled while translating so a second tap can't fire a duplicate call. */}
          <button
            onClick={translate}
            disabled={translating || !draft.trim()}
            className="w-full mt-3 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-indigo-700 transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            {translating ? (
              <><Loader2 size={16} className="animate-spin" /> Translating…</>
            ) : (
              <><ArrowRightLeft size={16} /> Translate</>
            )}
          </button>
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

            {/* "Not in your deck" — same extraction as Reader/Watch (mining.loadNewWords),
                but confirming here only queues into pending_words for later review in
                Add Cards' Queue tab, never straight into the deck. */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">
                  Not in your deck · {visibleWords.length}
                </p>
                {visibleWords.length > 0 && (
                  <button
                    onClick={mining.toggleAllNewWords}
                    className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    {visibleSelectedCount === visibleWords.length ? "Select none" : "Select all"}
                  </button>
                )}
              </div>

              {mining.newWordsLoading ? (
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                  <Loader2 size={12} className="animate-spin" /> Finding words…
                </div>
              ) : mining.newWordsError ? (
                <p className="text-xs font-bold text-rose-500">Couldn&apos;t build the word list — tapping words still works.</p>
              ) : visibleWords.length === 0 ? (
                <p className="text-xs font-bold text-slate-400">
                  {queuedWords.size > 0 ? "All queued for Add Cards. 🎉" : "Every word here is already in your deck. 🎉"}
                </p>
              ) : (
                <>
                  <div className="flex flex-col divide-y divide-slate-50">
                    {visibleWords.map((w) => {
                      const checked = mining.selectedNew.has(w.word);
                      return (
                        <div key={w.word} className="flex items-center gap-3 py-2">
                          <button
                            onClick={() => mining.toggleNewWord(w.word)}
                            aria-label={checked ? `Deselect ${w.word}` : `Select ${w.word}`}
                            className={`w-5 h-5 shrink-0 rounded-md border-2 flex items-center justify-center transition-colors active:scale-90 ${checked ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-300 bg-white"}`}
                          >
                            {checked && <Check size={12} strokeWidth={3} />}
                          </button>
                          <button onClick={(e) => handleWordTap(w.word, e)} className="flex-1 min-w-0 text-left">
                            <span className="text-base font-black text-slate-800">{w.word}</span>
                            {w.reading && kanjiRe.test(w.word) && (
                              <span className="text-xs font-bold text-indigo-500 ml-2">{w.reading}</span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={async () => {
                      const words = visibleWords.filter((w) => mining.selectedNew.has(w.word)).map((w) => w.word);
                      setQueuing(true);
                      await queueWords(words);
                      setQueuing(false);
                    }}
                    disabled={queuing || visibleSelectedCount === 0}
                    className="mt-3 w-full flex items-center justify-center gap-1.5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40"
                  >
                    {queuing ? (
                      <><Loader2 size={12} className="animate-spin" /> Queuing…</>
                    ) : (
                      <><Plus size={12} /> Queue {visibleSelectedCount} for Add Cards</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Word lookup (shared with the quizzes / Reader / Sensei chat) — queues into
          pending_words here instead of straight into the deck (see file header). */}
      {lookup && (
        <WordLookupSheet
          lookup={lookup}
          onClose={closeLookup}
          onEditWord={setEditWord}
          onAdd={(w) => queueWords([w])}
          isAdded={(w) => queuedWords.has(w)}
          addLabel="Add to List"
          addIcon={<List size={11} />}
          layerClassName={{ backdrop: "z-[310]", sheet: "z-[320] bottom-0 left-0 right-0" }}
        />
      )}
    </div>
  );
}
