"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import Logo from "@/components/Logo";

// ── Demo data ─────────────────────────────────────────────────────────

const DEMO_WORDS = [
  { japanese: "食べる",   reading: "たべる",     english: "to eat"             },
  { japanese: "水",       reading: "みず",       english: "water"              },
  { japanese: "大きい",   reading: "おおきい",   english: "big, large"         },
  { japanese: "行く",     reading: "いく",       english: "to go"              },
  { japanese: "友達",     reading: "ともだち",   english: "friend"             },
  { japanese: "見る",     reading: "みる",       english: "to see, watch"      },
  { japanese: "日本語",   reading: "にほんご",   english: "Japanese language"  },
  { japanese: "勉強する", reading: "べんきょうする", english: "to study"       },
];

const GAMES = [
  { emoji: "🎯", name: "Color Focus",   reveal: "Trains word-recognition speed under time pressure" },
  { emoji: "⚡", name: "Speed Match",   reveal: "Reveals words you know vs. only think you know"   },
  { emoji: "💀", name: "Survival",      reveal: "Exposes your weakest cards under real pressure"    },
  { emoji: "👂", name: "Listen & Pick", reveal: "Tests if you can hear what you've memorized"      },
];

// ── Hooks ─────────────────────────────────────────────────────────────

function useInView(threshold = 0.25) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

function useCountUp(target: number, durationMs = 1400, active = false) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, active]);
  return val;
}

// ── Main component ────────────────────────────────────────────────────

export default function WelcomeView() {
  const [cardIndex, setCardIndex]     = useState(0);
  const [isFlipped, setIsFlipped]     = useState(false);
  const [transitioning, setTrans]     = useState(false);
  const [practiced, setPracticed]     = useState(0);
  const [showSticky, setShowSticky]   = useState(false);

  const heroCTARef  = useRef<HTMLDivElement>(null);
  const finalCTARef = useRef<HTMLDivElement>(null);

  const { ref: dashRef,  inView: dashInView  } = useInView(0.2);
  const { ref: jlptRef,  inView: jlptInView  } = useInView(0.2);

  const word = DEMO_WORDS[cardIndex % DEMO_WORDS.length];

  // Dashboard count-ups (mock values matching a realistic N5 learner)
  const streakCount = useCountUp(7,   800,  dashInView);
  const overallPct  = useCountUp(63, 1400,  dashInView);
  const vocabPct    = useCountUp(68, 1300,  dashInView);
  const grammarPct  = useCountUp(52, 1100,  dashInView);
  const readingPct  = useCountUp(71, 1350,  dashInView);
  const listenPct   = useCountUp(58, 1200,  dashInView);

  // Show sticky bar only after scrolling past the hero CTA
  useEffect(() => {
    const els = [heroCTARef.current, finalCTARef.current].filter(Boolean) as Element[];
    const observer = new IntersectionObserver(
      (entries) => setShowSticky(!entries.some(e => e.isIntersecting)),
      { threshold: 0.6 },
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleFlip = () => {
    if (!isFlipped && !transitioning) setIsFlipped(true);
  };

  const handleGrade = () => {
    if (transitioning) return;
    setPracticed(p => p + 1);
    setTrans(true);
    setTimeout(() => {
      setIsFlipped(false);
      setCardIndex(i => i + 1);
      setTrans(false);
    }, 360);
  };

  return (
    <main className="min-h-[100dvh] w-full bg-white overflow-y-auto overflow-x-hidden pb-28">

      {/* ── Sticky bottom bar ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showSticky && (
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100 px-5 py-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <Link
              href="/login"
              className="block w-full max-w-sm mx-auto py-3.5 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] text-center shadow-lg shadow-indigo-100 active:scale-[0.97] transition-all"
            >
              Get Started — it&apos;s free
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-md mx-auto px-5">

        {/* ── Section 1: Hero ────────────────────────────────────────────── */}
        <section className="pt-12 pb-12">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <Logo className="w-9 h-12 mb-3" />
            <p className="text-[9px] font-black uppercase tracking-[0.32em] text-indigo-400">FlashKado</p>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-3">✨ AI-Powered Japanese</p>
            <h1 className="text-[2rem] font-black text-slate-900 leading-tight tracking-tighter italic mb-3">
              Build your Japanese.<br />Track the proof.
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
              AI builds your cards, tracks your progress to JLPT, and tutors you in real conversation — all in one place.
            </p>
          </div>

          {/* ── Interactive flashcard ── */}
          <div style={{ perspective: "1200px" }} className="w-full mb-3">
            <div
              style={{
                transformStyle: "preserve-3d",
                transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transition: "transform 0.42s cubic-bezier(0.4,0,0.2,1)",
                position: "relative",
                height: "11.5rem",
              }}
            >
              {/* Front */}
              <div
                style={{ backfaceVisibility: "hidden" }}
                onClick={handleFlip}
                className="absolute inset-0 bg-white rounded-3xl shadow-xl border border-slate-100 flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-transform select-none"
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">
                  ✨ AI-built · N5 · Tap to reveal
                </p>
                <p className="text-5xl font-black text-slate-900 tracking-tighter">{word.japanese}</p>
                <p className="text-sm text-slate-400 font-medium">{word.reading}</p>
              </div>

              {/* Back */}
              <div
                style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                className="absolute inset-0 bg-white rounded-3xl shadow-xl border border-indigo-100 flex flex-col items-center justify-center gap-2 select-none"
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">N5 · Meaning</p>
                <p className="text-4xl font-black text-slate-900 tracking-tighter">{word.japanese}</p>
                <p className="text-xs text-slate-400 font-medium">{word.reading}</p>
                <p className="text-2xl font-black text-indigo-600 mt-0.5">{word.english}</p>
              </div>
            </div>
          </div>

          {/* Grade buttons — only when flipped */}
          <AnimatePresence mode="wait">
            {isFlipped && (
              <motion.div
                key="grade"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                className="flex gap-3 mb-4"
              >
                <button
                  onClick={handleGrade}
                  className="flex-1 bg-rose-50 border border-rose-100 rounded-2xl py-3.5 font-black text-sm text-rose-500 active:scale-95 transition-all"
                >
                  ✗ Again
                </button>
                <button
                  onClick={handleGrade}
                  className="flex-1 bg-emerald-50 border border-emerald-100 rounded-2xl py-3.5 font-black text-sm text-emerald-600 active:scale-95 transition-all"
                >
                  ✓ Got it
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Post-grade banner */}
          <AnimatePresence>
            {practiced > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 340, damping: 24 }}
                className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 flex items-center justify-between mb-5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🎌</span>
                  <div>
                    <p className="text-indigo-700 font-black text-xs leading-none mb-0.5">
                      {practiced} {practiced === 1 ? "word" : "words"} practiced
                    </p>
                    <p className="text-indigo-400 text-[10px] font-medium">Sign up to save your progress</p>
                  </div>
                </div>
                <Link
                  href="/login"
                  className="bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-xl active:scale-95 transition-all whitespace-nowrap shrink-0"
                >
                  Save →
                </Link>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero CTA */}
          <div ref={heroCTARef}>
            <Link
              href="/login"
              className="block w-full py-[1.1rem] bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.97] transition-all text-center"
            >
              Get Started — it&apos;s free
            </Link>
            <Link
              href="/login"
              className="block mt-3 text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Already a member? Sign in →
            </Link>
          </div>
        </section>

        {/* ── Section 2: Dashboard preview ──────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-7">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">Your Profile</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic leading-tight mb-2">
              Built automatically,<br />just by studying.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Not a vague score. The exact words you know — and the ones you don&apos;t yet.
            </p>
          </div>

          {/* Mock dashboard — mirrors the real stats page layout */}
          <div ref={dashRef} className="rounded-3xl border border-slate-100 shadow-lg overflow-hidden">

            {/* ── Header (white, same as real Dashboard) ── */}
            <div className="bg-white px-5 pt-5 pb-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Good morning</p>
              <h3 className="text-xl font-black text-slate-900 italic mt-0.5">Satoshi 👋</h3>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
                  <span>🔥</span>
                  <span className="text-[10px] font-black text-orange-600">{streakCount} day streak</span>
                </span>
                <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full">
                  <span>⚡</span>
                  <span className="text-[10px] font-black text-amber-600">14 best passes</span>
                </span>
                {/* Daily goal ring */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-slate-50 border-slate-100">
                  <svg width="28" height="28" viewBox="0 0 36 36" className="-rotate-90">
                    <circle cx="18" cy="18" r="14" fill="none" strokeWidth="3.5" stroke="#e2e8f0" />
                    <motion.circle
                      cx="18" cy="18" r="14" fill="none" strokeWidth="3.5"
                      stroke="#818cf8" strokeLinecap="round"
                      strokeDasharray="88 88"
                      initial={{ strokeDashoffset: 88 }}
                      animate={{ strokeDashoffset: dashInView ? 26.4 : 88 }}
                      transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                    />
                  </svg>
                  <div className="flex flex-col leading-none">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Daily goal</span>
                    <span className="text-[11px] font-black text-slate-600">7/10</span>
                  </div>
                </div>
              </div>

              {/* Overall level banner — indigo, same as real OverallBanner */}
              <div className="mt-4 bg-indigo-600 rounded-2xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Overall Level</p>
                  <p className="text-4xl font-black text-white mt-0.5">N5</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Avg Score</p>
                  <p className="text-3xl font-black text-white mt-0.5 tabular-nums">{overallPct}%</p>
                </div>
              </div>
            </div>

            {/* ── Skills + JLPT bars (slate-50 bg, same as real Dashboard body) ── */}
            <div className="bg-slate-50">
              <p className="px-5 pt-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Your Skills</p>

              {/* 2×2 skill tiles */}
              <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                {[
                  { emoji: "🃏", label: "Vocabulary", displayPct: vocabPct,   targetPct: 68, bar: "bg-orange-400", delay: 0.10 },
                  { emoji: "📝", label: "Grammar",    displayPct: grammarPct,  targetPct: 52, bar: "bg-amber-400",  delay: 0.18 },
                  { emoji: "📖", label: "Reading",    displayPct: readingPct,  targetPct: 71, bar: "bg-orange-400", delay: 0.26 },
                  { emoji: "🎧", label: "Listening",  displayPct: listenPct,   targetPct: 58, bar: "bg-amber-400",  delay: 0.34 },
                ].map(s => (
                  <div key={s.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{s.emoji}</span>
                      <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border bg-emerald-100 border-emerald-200 text-emerald-700">N5</span>
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                    <div>
                      <span className="text-2xl font-black tabular-nums text-emerald-700">{s.displayPct}%</span>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                        <motion.div
                          className={`h-full rounded-full ${s.bar}`}
                          initial={{ width: 0 }}
                          animate={{ width: dashInView ? `${s.targetPct}%` : "0%" }}
                          transition={{ duration: 1.3, ease: [0.4, 0, 0.2, 1], delay: s.delay }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Vocabulary by JLPT level — double-shade bars */}
              <div className="mx-4 mb-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vocabulary by Level</p>
                  <p className="text-[10px] font-black text-slate-400">520 cards</p>
                </div>
                <div className="space-y-3.5">
                  {([
                    { level: "N5", mastered: 270, total: 460, floor: 800, badge: "bg-emerald-100 text-emerald-700 border-emerald-200", fill: "bg-emerald-500", light: "bg-emerald-200", delay: 0.10 },
                    { level: "N4", mastered: 8,   total: 60,  floor: 600, badge: "bg-teal-100 text-teal-700 border-teal-200",           fill: "bg-teal-500",   light: "bg-teal-200",   delay: 0.20 },
                    { level: "N3", mastered: 0,   total: 0,   floor: 700, badge: "bg-amber-100 text-amber-700 border-amber-200",         fill: "bg-amber-500",  light: "bg-amber-200",  delay: 0.30 },
                  ] as const).map(({ level, mastered, total, floor, badge, fill, light, delay }) => {
                    const masteredPct = Math.round((mastered / floor) * 100);
                    const addedPct   = Math.min(100 - masteredPct, Math.round(((total - mastered) / floor) * 100));
                    const masteryOfTotal = total > 0 ? Math.round((mastered / total) * 100) : 0;
                    return (
                      <div key={level}>
                        <div className="flex items-center gap-3">
                          <span className={`shrink-0 w-9 text-[10px] px-1.5 py-0.5 rounded-md border font-black text-center uppercase tracking-tighter ${badge}`}>{level}</span>
                          <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                            <motion.div
                              className={`h-full ${fill} shrink-0`}
                              initial={{ width: 0 }}
                              animate={{ width: dashInView ? `${masteredPct}%` : "0%" }}
                              transition={{ duration: 1.3, ease: [0.4, 0, 0.2, 1], delay }}
                            />
                            <motion.div
                              className={`h-full ${light} shrink-0`}
                              initial={{ width: 0 }}
                              animate={{ width: dashInView ? `${addedPct}%` : "0%" }}
                              transition={{ duration: 1.3, ease: [0.4, 0, 0.2, 1], delay: delay + 0.05 }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between pl-12 mt-1 text-[10px] font-bold text-slate-400">
                          <span>{total}/{floor}</span>
                          <span>{mastered} Mastered ({masteryOfTotal}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400 font-medium mt-3.5">
            Your numbers update every time you study.
          </p>
        </section>

        {/* ── Section 3: AI Sensei ───────────────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-7">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">✨ AI Sensei</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic leading-tight mb-2">
              A tutor that adapts<br />to your level.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              4 AI personas. Real conversation. Scenarios from ramen shops to job interviews.
            </p>
          </div>

          {/* Persona row */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { emoji: "🧑‍🎓", label: "Senpai",  desc: "Friendly",    border: "border-indigo-100", bg: "bg-indigo-50",  text: "text-indigo-600" },
              { emoji: "👨‍🏫", label: "Sensei",  desc: "Strict",      border: "border-slate-200",  bg: "bg-slate-50",   text: "text-slate-700"  },
              { emoji: "⚔️",  label: "Samurai", desc: "Philosopher", border: "border-rose-100",   bg: "bg-rose-50",    text: "text-rose-700"   },
              { emoji: "⭐",  label: "Idol",    desc: "Coach",       border: "border-pink-100",   bg: "bg-pink-50",    text: "text-pink-600"   },
            ].map(p => (
              <div key={p.label} className={`border rounded-2xl p-2.5 flex flex-col items-center gap-1 text-center ${p.border} ${p.bg}`}>
                <span className="text-xl">{p.emoji}</span>
                <p className={`text-[9px] font-black leading-none ${p.text}`}>{p.label}</p>
                <p className="text-[8px] text-slate-400 font-medium leading-none">{p.desc}</p>
              </div>
            ))}
          </div>

          {/* Mock conversation */}
          <div className="bg-slate-50 rounded-3xl p-4 space-y-3 mb-4">
            <div className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-sm shrink-0">🧑‍🎓</div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm border border-slate-100 max-w-[78%]">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">ラーメン屋へようこそ！何にしますか？</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Welcome to the ramen shop! What&apos;ll it be?</p>
              </div>
            </div>
            <div className="flex gap-2.5 items-start justify-end">
              <div className="bg-indigo-600 rounded-2xl rounded-tr-sm px-3.5 py-2.5 max-w-[78%]">
                <p className="text-xs text-white font-medium leading-relaxed">えーと… 醤油ラーメンをください！</p>
                <p className="text-[9px] text-indigo-300 mt-0.5">Umm… soy sauce ramen please!</p>
              </div>
              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-sm shrink-0">😊</div>
            </div>
            <div className="flex gap-2.5 items-start">
              <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-sm shrink-0">🧑‍🎓</div>
              <div className="bg-white rounded-2xl rounded-tl-sm px-3.5 py-2.5 shadow-sm border border-slate-100 max-w-[78%]">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">いい選択！「醤油」の発音が良かったです ✨</p>
                <p className="text-[9px] text-slate-400 mt-0.5">Great choice! Your pronunciation was perfect ✨</p>
              </div>
            </div>
          </div>

          {/* Scenario chips */}
          <div className="flex flex-wrap gap-2">
            {["🍜 Ramen Shop", "🏪 Convenience Store", "💼 Job Interview", "✈️ Travel", "🏥 Doctor Visit"].map(s => (
              <span key={s} className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-full">{s}</span>
            ))}
          </div>
        </section>

        {/* ── Section: JLPT Level Filter ───────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-7">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">Study by JLPT Level</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic leading-tight mb-2">
              Focus on what<br />you&apos;re testing for.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Filter your deck to any JLPT level. Drilling for N3? See exactly how many cards you&apos;ve added — and how many you&apos;ve mastered.
            </p>
          </div>

          {/* Card showing the level picker + bars */}
          <div ref={jlptRef} className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">

            {/* Chip row */}
            <div className="flex gap-2 px-4 pt-4 pb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
              <span className="shrink-0 px-4 py-2 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest">ALL</span>
              {[
                { level: "N5", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
                { level: "N4", cls: "bg-teal-100 text-teal-700 border border-teal-200" },
                { level: "N3", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
                { level: "N2", cls: "bg-orange-100 text-orange-700 border border-orange-200" },
                { level: "N1", cls: "bg-rose-100 text-rose-700 border border-rose-200" },
              ].map(({ level, cls }) => (
                <span key={level} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${cls}`}>{level}</span>
              ))}
            </div>

            {/* Progress bars */}
            <div className="px-4 pb-5 space-y-3.5">
              {[
                { level: "N5", cards: 200, pct: 15, badge: "bg-emerald-100 text-emerald-700 border-emerald-200", fill: "bg-emerald-500", delay: 0.05 },
                { level: "N4", cards: 270, pct: 20, badge: "bg-teal-100 text-teal-700 border-teal-200",          fill: "bg-teal-500",   delay: 0.12 },
                { level: "N3", cards: 408, pct: 30, badge: "bg-amber-100 text-amber-700 border-amber-200",       fill: "bg-amber-500",  delay: 0.19 },
                { level: "N2", cards: 289, pct: 21, badge: "bg-orange-100 text-orange-700 border-orange-200",    fill: "bg-orange-500", delay: 0.26 },
                { level: "N1", cards: 178, pct: 13, badge: "bg-rose-100 text-rose-700 border-rose-200",          fill: "bg-rose-500",   delay: 0.33 },
              ].map(({ level, cards, pct, badge, fill, delay }) => (
                <div key={level} className="flex items-center gap-3">
                  <span className={`shrink-0 w-9 text-[10px] px-1.5 py-0.5 rounded-md border font-black text-center ${badge}`}>{level}</span>
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${fill} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: jlptInView ? `${pct}%` : "0%" }}
                      transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1], delay }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-400 tabular-nums whitespace-nowrap">{cards} · {pct}%</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400 font-medium mt-3.5">
            Your cards, organized by JLPT level. Study only what matters for your next exam.
          </p>
        </section>

        {/* ── Section 4: Mini games ──────────────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-7">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">Mini Games</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic leading-tight mb-2">
              Games that find<br />your gaps.
            </h2>
            <p className="text-slate-400 text-sm">Not just practice — diagnosis.</p>
          </div>

          {/* Horizontal scroll row */}
          <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-2 snap-x snap-mandatory" style={{ scrollbarWidth: "none" }}>
            {GAMES.map((g, i) => (
              <motion.div
                key={g.name}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
                className="flex-shrink-0 snap-start w-44 bg-slate-900 rounded-3xl p-4 flex flex-col gap-2.5"
              >
                <span className="text-3xl">{g.emoji}</span>
                <p className="text-white font-black text-sm leading-tight">{g.name}</p>
                <p className="text-slate-400 text-[11px] leading-snug font-medium">{g.reveal}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Section 4: The loop ────────────────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-8">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">How It Works</p>
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic">
              Everything compounds.
            </h2>
          </div>

          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-8 top-10 bottom-10 w-px bg-slate-100" />

            <div className="space-y-2">
              {[
                {
                  icon: "✨",
                  step: "01",
                  title: "Type any word",
                  sub:  "AI instantly builds the card — furigana, reading, meaning, example sentence, and audio.",
                },
                {
                  icon: "🃏",
                  step: "02",
                  title: "Study daily",
                  sub:  "Flashcards, listening quizzes, and games adapt to what you actually need.",
                },
                {
                  icon: "📈",
                  step: "03",
                  title: "Profile grows",
                  sub:  "JLPT level, mastery count, and scores update automatically — no setup.",
                },
              ].map((item) => (
                <div key={item.step} className="flex gap-4 p-3">
                  <div className="shrink-0 w-10 h-10 bg-white border border-slate-100 shadow-sm rounded-2xl flex items-center justify-center text-xl z-10">
                    {item.icon}
                  </div>
                  <div className="pt-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{item.step}</span>
                      <span className="text-sm font-black text-slate-900">{item.title}</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{item.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section 5: Final CTA ──────────────────────────────────────── */}
        <section className="py-12 border-t border-slate-100">
          <div className="text-center mb-7">
            <h2 className="text-2xl font-black text-slate-900 tracking-tighter italic leading-tight mb-3">
              Start your Japanese journey<br />in 30 seconds.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Free · No credit card · Bring your own words<br />or import 30 N5 words to begin.
            </p>
          </div>

          <div ref={finalCTARef}>
            <Link
              href="/login"
              className="block w-full py-[1.1rem] bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-[0.97] transition-all text-center mb-3"
            >
              Get Started — it&apos;s free
            </Link>
            <Link
              href="/login"
              className="block text-center text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Already a member? Sign in →
            </Link>
          </div>
        </section>

      </div>
    </main>
  );
}
