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

  const { ref: dashRef, inView: dashInView } = useInView(0.2);

  const word = DEMO_WORDS[cardIndex % DEMO_WORDS.length];

  // Dashboard count-ups
  const n5Count       = useCountUp(47,  1500, dashInView);
  const n4Count       = useCountUp(12,  1200, dashInView);
  const streakCount   = useCountUp(7,    800, dashInView);
  const masteredCount = useCountUp(47,  1500, dashInView);

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
            <h1 className="text-[2rem] font-black text-slate-900 leading-tight tracking-tighter italic mb-3">
              Build your Japanese.<br />Track the proof.
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
              Every word you study becomes part of your permanent Japanese profile —
              exactly which JLPT words you know and don&apos;t.
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
                  N5 Word · Tap to reveal
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

          {/* Mock dashboard */}
          <div ref={dashRef} className="bg-white rounded-3xl border border-slate-100 shadow-lg overflow-hidden">

            {/* Header strip */}
            <div className="bg-slate-900 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Vocabulary Level</p>
                <p className="text-white font-black text-xl tracking-tighter">JLPT N5</p>
              </div>
              <div className="flex gap-4 text-right">
                <div>
                  <p className="text-white font-black text-2xl tabular-nums leading-none">{streakCount}</p>
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Streak 🔥</p>
                </div>
                <div>
                  <p className="text-white font-black text-2xl tabular-nums leading-none">{masteredCount}</p>
                  <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Mastered ⭐</p>
                </div>
              </div>
            </div>

            {/* JLPT bars */}
            <div className="px-5 py-5 space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">JLPT Progress</p>

              {/* N5 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">N5</span>
                  <span className="text-[10px] font-black text-slate-400 tabular-nums">{n5Count} / 800 mastered</span>
                </div>
                <div className="h-2.5 bg-emerald-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-emerald-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: dashInView ? `${(47 / 800) * 100}%` : "0%" }}
                    transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1], delay: 0.1 }}
                  />
                </div>
              </div>

              {/* N4 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-black text-teal-700 bg-teal-100 border border-teal-200 px-2 py-0.5 rounded-full">N4</span>
                  <span className="text-[10px] font-black text-slate-400 tabular-nums">{n4Count} / 600 mastered</span>
                </div>
                <div className="h-2.5 bg-teal-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-teal-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: dashInView ? `${(12 / 600) * 100}%` : "0%" }}
                    transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1], delay: 0.2 }}
                  />
                </div>
              </div>

              {/* N3 locked */}
              <div className="opacity-25">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-black text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">N3</span>
                  <span className="text-[10px] font-black text-slate-400">🔒 Not started</span>
                </div>
                <div className="h-2.5 bg-amber-100 rounded-full" />
              </div>

              {/* Score tiles row */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {[
                  { label: "Vocab",     val: "N5", color: "text-emerald-600" },
                  { label: "Reading",   val: "N5", color: "text-teal-600"    },
                  { label: "Listening", val: "N5", color: "text-indigo-600"  },
                ].map(s => (
                  <div key={s.label} className="bg-slate-50 rounded-2xl p-2.5 text-center">
                    <p className={`font-black text-base ${s.color}`}>{s.val}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-slate-400 font-medium mt-3.5">
            Your numbers update every time you study.
          </p>
        </section>

        {/* ── Section 3: Mini games ──────────────────────────────────────── */}
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
                  icon: "✍️",
                  step: "01",
                  title: "Add any word",
                  sub:  "Type it — AI builds the card with furigana and example sentences instantly.",
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
