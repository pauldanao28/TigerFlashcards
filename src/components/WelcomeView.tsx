"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import LanguageToggle from "./LanguageToggle";
import { useLang } from "@/context/LanguageContext";

// ── Mini phone screen mockups ─────────────────────────────────────────

function FlashcardScreen() {
  return (
    <div className="flex flex-col h-full bg-slate-50 px-3 pt-2 pb-3 gap-2">
      <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Japanese → English</p>
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center justify-center gap-1">
        <p className="text-[22px] font-black text-slate-900">勉強する</p>
        <p className="text-[8px] text-slate-400 font-medium">べんきょうする</p>
      </div>
      <div className="bg-indigo-600 rounded-xl py-2.5 text-center">
        <p className="text-white font-black text-xs">to study</p>
      </div>
      <div className="flex gap-2">
        <div className="flex-1 bg-rose-50 border border-rose-100 rounded-xl py-2 text-center">
          <p className="text-[8px] font-black text-rose-500">✗ Again</p>
        </div>
        <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl py-2 text-center">
          <p className="text-[8px] font-black text-emerald-600">✓ Got it</p>
        </div>
      </div>
    </div>
  );
}

function ListeningScreen() {
  return (
    <div className="flex flex-col h-full bg-slate-50 px-3 pt-2 pb-3 gap-2">
      <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Listen &amp; choose</p>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-2.5 flex items-center gap-2">
        <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
          <span className="text-white text-[7px] ml-0.5">▶</span>
        </div>
        <div className="flex gap-px items-end h-5 flex-1">
          {[3, 5, 4, 7, 5, 3, 6, 4, 5, 3, 6, 5, 4, 3, 5].map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${i < 6 ? "bg-indigo-400" : "bg-slate-200"}`}
              style={{ height: `${h * 3}px` }}
            />
          ))}
        </div>
        <span className="text-[7px] text-slate-400 font-bold">0:04</span>
      </div>
      <div className="flex-1 flex flex-col gap-1.5">
        {[
          { text: "I go to school every day", correct: true },
          { text: "I went to school today", correct: false },
          { text: "I came home from school", correct: false },
          { text: "I study hard at school", correct: false },
        ].map((opt, i) => (
          <div
            key={i}
            className={`rounded-xl px-2.5 py-2 flex items-center gap-2 flex-1 ${
              opt.correct
                ? "bg-emerald-50 border border-emerald-200"
                : "bg-white border border-slate-100 shadow-sm"
            }`}
          >
            <span
              className={`text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                opt.correct ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
              }`}
            >
              {opt.correct ? "✓" : String.fromCharCode(65 + i)}
            </span>
            <p className={`text-[8px] font-bold leading-tight ${opt.correct ? "text-emerald-700" : "text-slate-500"}`}>
              {opt.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function GrammarScreen() {
  return (
    <div className="flex flex-col h-full bg-slate-50 px-3 pt-2 pb-3 gap-2">
      <p className="text-[7px] font-black uppercase tracking-widest text-slate-400">Fill in — N4</p>
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-3">
        <p className="text-[11px] font-bold text-slate-800 leading-relaxed">
          毎日日本語を{" "}
          <span className="bg-amber-100 px-1.5 py-0.5 rounded text-amber-800">______</span>{" "}
          います。
        </p>
        <p className="text-[8px] text-slate-400 mt-1.5">I study Japanese every day.</p>
      </div>
      <div className="flex-1 grid grid-cols-2 gap-1.5">
        {[
          { text: "勉強して", correct: true },
          { text: "食べて", correct: false },
          { text: "飲んで", correct: false },
          { text: "読んで", correct: false },
        ].map((opt) => (
          <div
            key={opt.text}
            className={`rounded-xl flex items-center justify-center ${
              opt.correct
                ? "bg-emerald-100 border-2 border-emerald-400"
                : "bg-white border border-slate-100 shadow-sm"
            }`}
          >
            <p className={`text-[11px] font-black ${opt.correct ? "text-emerald-700" : "text-slate-700"}`}>
              {opt.text}
            </p>
          </div>
        ))}
      </div>
      <div className="bg-emerald-500 rounded-xl py-2.5 text-center">
        <p className="text-white font-black text-[9px] uppercase tracking-widest">✓ Correct!</p>
      </div>
    </div>
  );
}

function SenseiScreen() {
  return (
    <div className="flex flex-col justify-end h-full bg-slate-50 px-3 pt-2 pb-2 gap-2">
      <div className="flex-1 flex flex-col justify-end gap-2">
        <div className="bg-white rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm p-2.5 max-w-[88%]">
          <p className="text-[7px] text-indigo-500 font-black mb-0.5">AI先生</p>
          <p className="text-[8px] font-bold text-slate-700 leading-relaxed">日本語で話してみてください！</p>
        </div>
        <div className="bg-indigo-600 rounded-2xl rounded-tr-sm p-2.5 max-w-[88%] self-end">
          <p className="text-[8px] font-bold text-white leading-relaxed">今日学校に行きたかった</p>
        </div>
        <div className="bg-white rounded-2xl rounded-tl-sm border border-slate-100 shadow-sm p-2.5 max-w-[88%]">
          <p className="text-[7px] text-indigo-500 font-black mb-0.5">AI先生</p>
          <p className="text-[8px] font-bold text-slate-700 leading-relaxed">
            ✓ 自然！「行きました」でも正しいですよ。
          </p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2 shrink-0">
        <p className="flex-1 text-[8px] text-slate-300 font-medium">日本語を入力...</p>
        <div className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center shrink-0">
          <span className="text-white text-[7px]">↑</span>
        </div>
      </div>
    </div>
  );
}

// ── Slide data ────────────────────────────────────────────────────────

const SCREENS = [FlashcardScreen, ListeningScreen, GrammarScreen, SenseiScreen];

const COPY = {
  en: [
    {
      title: "AI Flashcards",
      desc: "Mine any word — AI builds the card with furigana and example sentences instantly.",
    },
    {
      title: "Listening Practice",
      desc: "Real Japanese audio, no text crutch. Listen, understand, choose.",
    },
    {
      title: "Grammar Quiz",
      desc: "N5→N1 fill-in & translation drills. Unlock harder patterns as you master each level.",
    },
    {
      title: "AI Sensei",
      desc: "Chat in Japanese. AI corrects your mistakes the way a real teacher would.",
    },
  ],
  ja: [
    {
      title: "AI単語カード",
      desc: "単語を追加するだけでAIがカードを自動生成。ふりがなと例文付き。",
    },
    {
      title: "リスニング練習",
      desc: "テキストなし、本物の音声で聴解力を鍛える。",
    },
    {
      title: "文法クイズ",
      desc: "N5からN1まで穴埋めと翻訳。レベルアップで難しいパターンも解放。",
    },
    {
      title: "AI先生",
      desc: "日本語でチャット。AIが自然に間違いを添削します。",
    },
  ],
};

// ── Component ─────────────────────────────────────────────────────────

export default function WelcomeView() {
  const { lang, setLang } = useLang();
  const [slide, setSlide] = useState(0);
  const [visible, setVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);

  const copies = COPY[lang === "ja" ? "ja" : "en"];
  const isLast = slide === SCREENS.length - 1;
  const { title, desc } = copies[slide];
  const Screen = SCREENS[slide];

  const goTo = (i: number) => {
    if (i === slide || i < 0 || i >= SCREENS.length) return;
    setVisible(false);
    setTimeout(() => {
      setSlide(i);
      setVisible(true);
    }, 150);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50) goTo(slide + 1);
    else if (diff < -50) goTo(slide - 1);
    touchStartX.current = null;
  };

  return (
    <main className="h-[100dvh] max-h-[100dvh] w-full bg-white flex flex-col fixed inset-0 overflow-hidden">
      {/* Language toggle */}
      <div className="absolute top-10 right-5 z-20 w-36">
        <LanguageToggle language={lang} setLanguage={setLang} />
      </div>

      {/* Phone mockup — fills remaining space, centered */}
      <div
        className="flex-1 flex items-center justify-center pt-16"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Phone frame */}
        <div
          className="relative bg-slate-900 rounded-[34px] shadow-2xl shadow-slate-300"
          style={{ width: 210, height: 350, padding: 3 }}
        >
          {/* Dynamic island */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-[52px] h-[14px] bg-slate-900 rounded-full z-10" />
          {/* Screen glass */}
          <div
            className="w-full h-full bg-white rounded-[31px] overflow-hidden transition-opacity duration-150"
            style={{ opacity: visible ? 1 : 0 }}
          >
            {/* Status bar */}
            <div className="flex justify-between items-center px-4 pt-5 pb-1 shrink-0">
              <span className="text-[8px] font-black text-slate-800">12:15</span>
              <div className="flex items-end gap-px">
                {[8, 11, 14, 17].map((h, i) => (
                  <div key={i} className="w-[2.5px] bg-slate-800 rounded-sm" style={{ height: h }} />
                ))}
                <span className="text-[8px] font-black text-slate-800 ml-1.5">5G</span>
              </div>
            </div>
            {/* Feature content */}
            <div className="h-[calc(100%-32px)]">
              <Screen />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: dots → title → desc → button → sign-in */}
      <div
        className="shrink-0 px-6 pb-8 flex flex-col items-center"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pagination dots */}
        <div className="flex gap-1.5 mb-5 mt-5">
          {SCREENS.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all duration-300 ${
                i === slide ? "w-6 h-2 bg-indigo-600" : "w-2 h-2 bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Title + description */}
        <div
          className="text-center mb-6 transition-opacity duration-150"
          style={{ opacity: visible ? 1 : 0 }}
        >
          <h2 className="text-2xl font-black text-slate-900 mb-2">{title}</h2>
          <p className="text-sm text-slate-400 leading-relaxed max-w-xs mx-auto">{desc}</p>
        </div>

        {/* CTA */}
        {isLast ? (
          <Link
            href="/login"
            className="w-full py-[1.1rem] bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.97] transition-all text-center"
          >
            {lang === "ja" ? "始める — 無料" : "Get Started — it's free"}
          </Link>
        ) : (
          <button
            onClick={() => goTo(slide + 1)}
            className="w-full py-[1.1rem] bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 active:scale-[0.97] transition-all"
          >
            {lang === "ja" ? "次へ" : "Next"}
          </button>
        )}

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
