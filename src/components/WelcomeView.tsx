"use client";

import Link from "next/link";
import Logo from "./Logo";
import LanguageToggle from "./LanguageToggle";
import { useLang } from "@/context/LanguageContext";

const FEATURES = {
  en: [
    { icon: "🗃️", title: "AI Flashcards",  desc: "Mine any word, AI builds the card" },
    { icon: "🎧", title: "Listening",       desc: "Real sentence audio, no text crutch" },
    { icon: "📝", title: "Grammar Quiz",    desc: "N5→N1 patterns, fill-in & translate" },
    { icon: "✍️", title: "AI Sensei",       desc: "Chat corrections in plain Japanese" },
  ],
  ja: [
    { icon: "🗃️", title: "AI単語カード",  desc: "単語を追加するとAIがカードを作成" },
    { icon: "🎧", title: "リスニング",    desc: "テキストなしの本物の音声トレーニング" },
    { icon: "📝", title: "文法クイズ",    desc: "N5→N1のパターンで穴埋め・翻訳" },
    { icon: "✍️", title: "AI先生",        desc: "日本語でのチャット添削" },
  ],
};

export default function WelcomeView() {
  const { lang, setLang } = useLang();
  const features = FEATURES[lang === "ja" ? "ja" : "en"];

  return (
    <main className="h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col fixed inset-0 touch-none overflow-hidden">
      {/* Watermark — 語 means "language/word"; decorative but on-theme */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-8 -right-6 text-[220px] font-black leading-none text-slate-100 z-0"
      >
        語
      </div>

      {/* Language toggle — top right */}
      <div className="absolute top-10 right-5 z-10 w-36">
        <LanguageToggle language={lang} setLanguage={setLang} />
      </div>

      {/* Main content — vertically centered */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-10 max-w-sm mx-auto w-full">

        {/* Logo + wordmark */}
        <Logo className="w-12 h-16 mb-5 opacity-90" />
        <h1 className="text-[2.8rem] font-black text-slate-900 uppercase tracking-tighter italic leading-none mb-1">
          FlashKado
        </h1>
        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-indigo-400 mb-8">
          {lang === "ja" ? "速く学び、忘れにくい" : "Learn Faster · Forget Less"}
        </p>

        {/* Feature grid — 2×2 */}
        <div className="grid grid-cols-2 gap-2.5 w-full mb-8">
          {features.map((f, i) => (
            <div
              key={i}
              className="flex flex-col gap-1.5 bg-slate-50 border border-slate-100 rounded-2xl px-3.5 py-3.5"
            >
              <span className="text-lg leading-none">{f.icon}</span>
              <span className="text-[10px] font-black text-slate-700 leading-tight">{f.title}</span>
              <span className="text-[9px] font-medium text-slate-400 leading-snug">{f.desc}</span>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <Link
          href="/login"
          className="w-full py-[1.1rem] bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.97] transition-all text-center"
        >
          {lang === "ja" ? "始める" : "Get Started — it's free"}
        </Link>

        {/* Secondary: Sign in */}
        <Link
          href="/login"
          className="mt-3.5 text-[10px] font-bold text-slate-400 hover:text-slate-600 active:opacity-60 transition-colors"
        >
          {lang === "ja" ? "すでにアカウントをお持ちの方 →" : "Already a member? Sign in →"}
        </Link>
      </div>
    </main>
  );
}
