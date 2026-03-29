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
        <h2 className="text-base md:text-lg font-bold text-slate-400 uppercase tracking-[0.2em] mb-12 max-w-sm mx-auto leading-relaxed">
          {lang === "en" ? <>Master Japanese</> : <>日本語をマスター</>}
        </h2>

        <div className="flex flex-col w-full max-w-xs gap-4">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-500 mb-2 animate-pulse">
            {lang === "en"
              ? "Learn Faster. Forget Less."
              : "速く学び、忘れにくい。"}
          </p>

          <Link
            href="/login"
            className="bg-indigo-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-2xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all"
          >
            {t.get_started || "Get Started"}
          </Link>

          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300 mt-2 opacity-50">
            Smart Japanese Flashcards with AI
          </p>
        </div>
      </div>
    </main>
  );
}
