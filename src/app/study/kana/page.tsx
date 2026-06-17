"use client";

import { useState } from "react";
import { HIRAGANA_DATA, KATAKANA_DATA, type KanaCharacter } from "@/lib/kana";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";

export default function KanaPage() {
  const [mode, setMode] = useState<"hiragana" | "katakana">("hiragana");
  const data = mode === "hiragana" ? HIRAGANA_DATA : KATAKANA_DATA;

  const [isQuizMode, setIsQuizMode] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [shuffledData, setShuffledData] = useState<KanaCharacter[]>([]);

  const playSound = (text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const startQuiz = () => {
    // Filter out the null spaces used for grid alignment
    const validKana = data.filter(
      (item) => item.jp !== null,
    ) as KanaCharacter[];
    const shuffled = [...validKana].sort(() => Math.random() - 0.5);

    setShuffledData(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setIsQuizMode(true);
  };

  const nextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      if (currentIndex < shuffledData.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setIsQuizMode(false);
        setIsComplete(true);
      }
    }, 150);
  };

  return (
    <>
      <div className="max-w-4xl mx-auto px-6 py-10 min-h-screen bg-slate-50">
        <Link
          href="/"
          className="flex items-center gap-1 text-slate-400 hover:text-indigo-600 mb-4 transition-colors w-fit group"
        >
          <ChevronLeft
            size={16}
            strokeWidth={3}
            className="transition-transform group-hover:-translate-x-1"
          />
          <span className="text-xs font-black uppercase tracking-widest">
            Back
          </span>
        </Link>
        {/* Header & Toggle */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-black text-slate-800 italic tracking-tighter uppercase">
              {mode === "hiragana" ? "あ Hiragana" : "ア Katakana"}
            </h1>
            <p className="text-slate-400 font-bold text-[10px] tracking-widest uppercase mt-1">
              The Alphabet of Japan
            </p>
          </div>

          <div className="flex items-center gap-3">
            {" "}
            {/* Reduced gap slightly for density */}
            {/* Practice Mode Button */}
            <button
              onClick={startQuiz}
              className="bg-slate-800 text-white px-6 py-3 rounded-2xl font-black text-[10px] tracking-widest hover:bg-slate-700 transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-slate-200"
            >
              <span>PRACTICE</span>
              <span className="text-amber-400">⚡️</span>
            </button>
            <div className="flex bg-white p-1 rounded-2xl border border-slate-100 shadow-sm">
              <button
                onClick={() => setMode("hiragana")}
                className={`px-6 py-2 rounded-xl font-black text-xs transition-all ${
                  mode === "hiragana"
                    ? "bg-indigo-600 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                HIRA
              </button>
              <button
                onClick={() => setMode("katakana")}
                className={`px-6 py-2 rounded-xl font-black text-xs transition-all ${
                  mode === "katakana"
                    ? "bg-rose-500 text-white shadow-lg"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                KATA
              </button>
            </div>
            {/* New Integrated Back Button */}
            {/* <Link
              href="/stats"
              className="w-10 h-10 flex items-center justify-center bg-white border border-slate-100 rounded-2xl shadow-sm text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all active:scale-90"
              title="Exit to Dashboard"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Link> */}
          </div>
        </div>

        {/* The Grid mapping */}
        <div className="grid grid-cols-5 gap-4">
          {data.map((item, index) => (
            <div key={index}>
              {item.jp ? (
                <button
                  onClick={() => playSound(item.jp!)}
                  className="group relative w-full aspect-square bg-white border border-slate-100 rounded-[2rem] flex flex-col items-center justify-center shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all hover:-translate-y-1 active:scale-95"
                >
                  <div className="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-3 w-3 text-indigo-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                      />
                    </svg>
                  </div>

                  <span className="text-3xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                    {item.jp}
                  </span>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1">
                    {item.romaji}
                  </span>
                </button>
              ) : (
                <div className="aspect-square opacity-0 pointer-events-none" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Completion Overlay */}
      {isComplete && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6">
          <div className="text-7xl mb-6">🎉</div>
          <h2 className="text-white font-black text-3xl uppercase tracking-tighter italic mb-2">
            Otsukaresama!
          </h2>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-12">
            You finished the set!
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => { setIsComplete(false); startQuiz(); }}
              className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
            >
              Practice Again <span className="text-amber-400">⚡️</span>
            </button>
            <button
              onClick={() => setIsComplete(false)}
              className="px-8 py-4 rounded-2xl font-black text-xs text-white/50 hover:text-white uppercase tracking-widest transition-all"
            >
              Back to Grid
            </button>
          </div>
        </div>
      )}

      {/* Quiz Overlay */}
      {isQuizMode && shuffledData.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-md flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md mb-8">
            <div className="flex justify-between text-white text-[10px] font-black uppercase tracking-widest mb-2">
              <span>Progress</span>
              <span>
                {currentIndex + 1} / {shuffledData.length}
              </span>
            </div>
            <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{
                  width: `${((currentIndex + 1) / shuffledData.length) * 100}%`,
                }}
              />
            </div>
          </div>

          <div
            onClick={() => {
              setIsFlipped(!isFlipped);
              if (!isFlipped) playSound(shuffledData[currentIndex].jp!);
            }}
            className="relative w-64 h-80 cursor-pointer [perspective:1000px] group"
          >
            <div
              className={`relative w-full h-full transition-all duration-500 [transform-style:preserve-3d] ${isFlipped ? "[transform:rotateY(180deg)]" : ""}`}
            >
              <div className="absolute inset-0 bg-white rounded-[3rem] shadow-2xl flex items-center justify-center border-4 border-slate-100 [backface-visibility:hidden]">
                <span className="text-8xl font-black text-slate-800 italic">
                  {shuffledData[currentIndex].jp}
                </span>
              </div>
              <div className="absolute inset-0 bg-indigo-600 rounded-[3rem] shadow-2xl flex flex-col items-center justify-center text-white [transform:rotateY(180deg)] [backface-visibility:hidden]">
                <span className="text-6xl font-black">
                  {shuffledData[currentIndex].romaji}
                </span>
                <span className="text-xs font-bold uppercase tracking-widest mt-4 opacity-70">
                  Romaji
                </span>
              </div>
            </div>
          </div>

          <div className="mt-12 flex gap-4">
            <button
              onClick={() => setIsQuizMode(false)}
              className="px-8 py-4 rounded-2xl font-black text-[10px] text-white/50 hover:text-white uppercase tracking-widest transition-all"
            >
              Exit Quiz
            </button>

            {isFlipped && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  nextCard();
                }}
                className="bg-white text-slate-900 px-10 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all animate-in fade-in zoom-in duration-300"
              >
                Next Character →
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
