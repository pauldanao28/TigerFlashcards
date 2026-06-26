"use client";

import Link from "next/link";
import Logo from "./Logo";
import LanguageToggle from "./LanguageToggle";
import { useLang } from "@/context/LanguageContext";

export default function WelcomeView() {
  const { t, lang, setLang } = useLang();

  return (
    /* CHANGE: 
       1. Changed 'min-h-screen' to 'h-[100dvh]' (Dynamic Viewport Height).
       2. Added 'max-h-[100dvh]' and 'fixed' to lock the container.
       3. Added 'touch-none' to prevent pull-to-refresh or bounce on mobile.
    */
    <main className="h-[100dvh] max-h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden fixed inset-0 touch-none">
      {/* Top Middle Toggle */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-40 h-10 md:w-48">
        <LanguageToggle language={lang} setLanguage={setLang} />
      </div>

      {/* Adjusting margin slightly to ensure centering feels "right" on small screens */}
      <div className="flex flex-col items-center justify-center w-full">
        <Logo className="w-16 h-20 mb-8 opacity-90" />

        {/* BRAND NAME */}
        <h1 className="text-5xl md:text-6xl font-black text-slate-900 uppercase tracking-tighter italic mb-3 leading-none">
          FlashKado
        </h1>

        {/* SUBTITLE */}
        <h2 className="text-base md:text-lg font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 max-w-sm mx-auto leading-relaxed">
          {lang === "en" ? <>Master Japanese</> : <>日本語をマスター</>}
        </h2>

        {/* VALUE PROP */}
        <p className="text-xs font-bold text-slate-500 max-w-xs mx-auto mb-10 leading-relaxed">
          {lang === "en"
            ? "AI builds your flashcards. Spaced repetition does the rest."
            : "AIがカードを作る。あとは間隔反復が全部やる。"}
        </p>

        <div className="flex flex-col w-full max-w-xs gap-4">
          <Link
            href="/login"
            className="bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            {t.get_started || "Get Started"}
          </Link>

          <Link
            href="/study/kana"
            className="bg-white text-slate-600 py-4 rounded-2xl font-black uppercase tracking-widest text-xs border border-slate-100 shadow-sm hover:border-indigo-200 hover:text-indigo-600 active:scale-95 transition-all"
          >
            {lang === "en" ? "あ Study Kana — Free" : "あ 仮名を学ぶ — 無料"}
          </Link>

          {/* JLPT LEVEL LINKS */}
          <div className="mt-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300 mb-2">
              {lang === "en" ? "Study by JLPT Level" : "JLPTレベルで学ぶ"}
            </p>
            <div className="flex justify-center gap-2">
              {["N5", "N4", "N3", "N2", "N1"].map((level) => (
                <Link
                  key={level}
                  href={`/jlpt/${level.toLowerCase()}`}
                  className="text-[10px] font-black text-slate-400 hover:text-indigo-600 transition-colors px-1"
                >
                  {level}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
