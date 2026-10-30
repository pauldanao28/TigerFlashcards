"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { getLevel, jlptLevel, JLPT_VOCAB_INCREMENT } from "@/lib/scoring";
import { ALLOWED_PARTS_OF_SPEECH } from "@/lib/textNormalize";
import LoadingScreen from "@/components/LoadingScreen";
import { SocialDock } from "@/components/SocialDock";
import { useFriends } from "@/hooks/useFriends";

type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const DAILY_GOAL = 10;
// Same targets Study uses for its reviews-today / mastered-today chips — kept identical
// so the same numbers mean the same thing on both tabs.
const REVIEW_TARGET = 100;
const MASTERED_GOAL = 20;

interface ProfileScores {
  name: string | null;
  referral_code: string | null;
  streak: number;
  max_streak: number;
  daily_count: number;
  mastered_today: number;
  still_learning: number;
  vocab_score: number | null;
  reading_score: number | null;
  listening_score: number | null;
  grammar_score: number | null;
  deck_size: number;
  jlpt_stats: Record<JlptLevel, { total: number; mastered: number }>;
  pos_stats: Record<string, { total: number; mastered: number }>;
  vocab_nlevel: JlptLevel;
}

// Solid = mastered portion, light = added-but-not-yet-mastered portion — same hue per level.
const JLPT_BAR_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-500",
  N4: "bg-sky-500",
  N3: "bg-amber-500",
  N2: "bg-orange-500",
  N1: "bg-rose-500",
};
const JLPT_BAR_LIGHT_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-200",
  N4: "bg-sky-200",
  N3: "bg-amber-200",
  N2: "bg-orange-200",
  N1: "bg-rose-200",
};
const JLPT_BADGE_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-sky-100 text-sky-700 border-sky-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};
const JLPT_TEXT_COLOR: Record<JlptLevel, string> = {
  N5: "text-emerald-700",
  N4: "text-sky-700",
  N3: "text-amber-700",
  N2: "text-orange-700",
  N1: "text-rose-700",
};

function useCountUp(target: number): number {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (target === 0) { setDisplay(0); return; }
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplay(current);
      if (current >= target) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [target]);
  return display;
}

function ScoreTile({
  href,
  emoji,
  label,
  score,
  sub,
  nlevelOverride,
}: {
  href: string;
  emoji: string;
  label: string;
  score: number | null;
  sub?: string;
  nlevelOverride?: JlptLevel;
}) {
  const s = score ?? 0;
  const displayScore = useCountUp(s);
  const level = getLevel(s);
  const nlevel = nlevelOverride ?? jlptLevel(s);
  const barColor = s >= 80 ? "bg-red-400" : s >= 60 ? "bg-orange-400" : s >= 40 ? "bg-amber-400" : s >= 20 ? "bg-emerald-400" : "bg-indigo-400";
  return (
    <Link href={href} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm active:scale-95 transition-all flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{emoji}</span>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${JLPT_BADGE_COLOR[nlevel as JlptLevel]}`}>
            {nlevel}
          </span>
          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-100 text-slate-500`}>
            {level.nameJp}
          </span>
        </div>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <div>
        <div className="flex items-end justify-between mb-1">
          <span className={`text-2xl font-black tabular-nums ${JLPT_TEXT_COLOR[nlevel as JlptLevel]}`}>{displayScore}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${s}%` }}
          />
        </div>
      </div>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </Link>
  );
}

// Module-level cache — survives Next.js client-side navigation, clears on full reload
const _dashboardCache = new Map<string, ProfileScores>();

const OVERALL_SEGMENTS = [
  { label: "N5", color: "bg-emerald-400" },
  { label: "N4", color: "bg-sky-400"     },
  { label: "N3", color: "bg-amber-500"   },
  { label: "N2", color: "bg-orange-500"  },
  { label: "N1", color: "bg-red-500"     },
];

const MAX_TAPS = 5;
const COOLDOWN_MS = 4000;

function randomPetals(count = 7) {
  return Array.from({ length: count }, () => ({
    left:   5 + Math.random() * 88,
    delay:  Math.random() * 0.25,
    drift:  (Math.random() - 0.5) * 72,
    rotate: (Math.random() - 0.5) * 400,
    size:   13 + Math.random() * 9,
  }));
}

type PetalBurst = { id: number; petals: ReturnType<typeof randomPetals> };

function OverallBanner({ level, score }: { level: string; score: number }) {
  const displayScore = useCountUp(score);
  const [bursts, setBursts] = useState<PetalBurst[]>([]);
  const [tapsLeft, setTapsLeft] = useState(MAX_TAPS);
  const [coolingDown, setCoolingDown] = useState(false);
  const nextId = useRef(0);
  const springControls = useAnimationControls();

  const handleTap = useCallback(() => {
    if (coolingDown) return;

    const id = nextId.current++;
    setBursts(prev => [...prev, { id, petals: randomPetals() }]);
    setTimeout(() => setBursts(prev => prev.filter(b => b.id !== id)), 1800);

    springControls.start({
      scale: [1, 0.95, 1.04, 0.98, 1],
      transition: { duration: 0.45, ease: "easeInOut" },
    });

    setTapsLeft(prev => {
      const next = prev - 1;
      if (next <= 0) {
        setCoolingDown(true);
        setTimeout(() => { setTapsLeft(MAX_TAPS); setCoolingDown(false); }, COOLDOWN_MS);
      }
      return next;
    });
  }, [coolingDown, springControls]);

  return (
    <div className="mt-4 relative" onClick={handleTap}>
      <motion.div
        animate={springControls}
        whileTap={coolingDown ? {} : { scale: 0.98 }}
        className="bg-indigo-600 rounded-2xl px-5 pt-4 pb-5 select-none cursor-pointer"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Overall Level</p>
            <p className="text-4xl font-black text-white mt-0.5">{level}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Avg Score</p>
            <p className="text-3xl font-black text-white mt-0.5 tabular-nums">{displayScore}%</p>
          </div>
        </div>

        {/* Segmented N-level progress bar */}
        <div className="flex gap-1">
          {OVERALL_SEGMENTS.map((seg, i) => {
            const segStart = i * 20;
            const fill = Math.min(Math.max(score - segStart, 0), 20) / 20;
            const reached = score >= segStart + 20;
            const active = fill > 0 && !reached;
            return (
              <div key={i} className="flex-1 flex flex-col gap-1">
                <div className="h-2 rounded-full overflow-hidden bg-indigo-800/60">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${fill > 0 ? seg.color : ""}`}
                    style={{ width: `${fill * 100}%` }}
                  />
                </div>
                <p className={`text-center text-[8px] font-black uppercase tracking-widest transition-colors ${
                  reached ? "text-white" : active ? "text-indigo-300" : "text-indigo-400/70"
                }`}>
                  {seg.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Tap charge dots */}
        <div className="flex justify-center gap-1 mt-3">
          {Array.from({ length: MAX_TAPS }).map((_, i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full"
              animate={{ backgroundColor: i < tapsLeft ? "#a5b4fc" : "#3730a3" }}
              transition={{ duration: 0.3 }}
            />
          ))}
        </div>
      </motion.div>

      {/* Sakura petal bursts */}
      <AnimatePresence>
        {bursts.flatMap(burst =>
          burst.petals.map((p, i) => (
            <motion.div
              key={`${burst.id}-${i}`}
              className="absolute top-4 pointer-events-none select-none"
              style={{ left: `${p.left}%`, fontSize: p.size }}
              initial={{ y: 0, x: 0, opacity: 1, rotate: 0, scale: 1 }}
              animate={{ y: 170, x: p.drift, opacity: 0, rotate: p.rotate, scale: 0.5 }}
              transition={{ duration: 1.5, delay: p.delay, ease: [0.2, 0.6, 0.8, 1] }}
            >
              🌸
            </motion.div>
          ))
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileScores | null>(
    () => _dashboardCache.get(user?.id ?? "") ?? null
  );
  const [doneTodayQuizzes, setDoneTodayQuizzes] = useState({ reading: false, listening: false, grammar: false });
  const [isSocialOpen, setIsSocialOpen] = useState(false);
  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const { friends, fetchFriends } = useFriends();

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const today = new Date().toLocaleDateString("en-CA");

      // Everything Dashboard needs (profile fields, today's counters, deck-wide
      // JLPT/part-of-speech mastery stats, vocab/grammar score + their N-level
      // determination) in one round trip — get_dashboard_data does the same
      // per-card aggregation server-side (see its migration for why that's also
      // immune to PostgREST's 1000-row cap, not just faster) and persists the
      // recomputed vocab/grammar scores itself.
      const { data: raw, error } = await supabase.rpc("get_dashboard_data", { p_today: today });
      if (error || !raw) { console.error("[dashboard load]", error?.code, error?.message); return; }

      setDoneTodayQuizzes({
        reading: !!raw.done_today_quizzes?.reading,
        listening: !!raw.done_today_quizzes?.listening,
        grammar: !!raw.done_today_quizzes?.grammar,
      });

      const fresh: ProfileScores = {
        name: raw.name ?? null,
        referral_code: raw.referral_code ?? null,
        streak: raw.streak ?? 0,
        max_streak: raw.max_streak ?? 0,
        daily_count: raw.daily_count ?? 0,
        mastered_today: raw.mastered_today ?? 0,
        still_learning: raw.still_learning ?? 0,
        vocab_score: raw.vocab_score ?? 0,
        reading_score: raw.reading_score ?? null,
        listening_score: raw.listening_score ?? null,
        grammar_score: raw.grammar_score ?? null,
        deck_size: raw.deck_size ?? 0,
        jlpt_stats: raw.jlpt_stats,
        pos_stats: raw.pos_stats,
        vocab_nlevel: raw.vocab_nlevel ?? "N5",
      };
      _dashboardCache.set(user.id, fresh);
      setData(fresh);
    };
    load();
    // Depend on user.id (a stable primitive), not the user object — Supabase's
    // onAuthStateChange emits a new object reference on every event (token refresh,
    // tab focus, etc.) even for the same session, which was re-triggering this whole
    // fetch-and-recompute sequence repeatedly and made the displayed numbers flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!data) {
    return <LoadingScreen />;
  }

  const { name, streak, max_streak, daily_count, mastered_today, still_learning } = data;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  // Weighted avg: vocab 40%, others 20% each (nulls = 0)
  const v = data.vocab_score ?? 0;
  const g = data.grammar_score ?? 0;
  const r = data.reading_score ?? 0;
  const l = data.listening_score ?? 0;
  const overallScore = v * 0.4 + g * 0.2 + r * 0.2 + l * 0.2;

  // Overall level = weakest pillar among attempted skills (mirrors real JLPT rules)
  const availableScores = [data.vocab_score, data.reading_score, data.listening_score, data.grammar_score].filter((s): s is number => s !== null);
  const weakestScore = availableScores.length > 0 ? Math.min(...availableScores) : 0;
  const overallLevel = jlptLevel(weakestScore);

  return (
    <div className="min-h-screen bg-slate-50 pb-28 md:pb-8">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-5 pt-14 md:pt-8 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{greeting}</p>
            <h1 className="text-2xl font-black text-slate-900 italic mt-0.5 leading-tight">
              {name || "Learner"} 👋
            </h1>
          </div>
          <button
            onClick={() => setIsSocialOpen(true)}
            className="relative flex items-center justify-center w-11 h-11 rounded-2xl border bg-slate-50 border-slate-100 shadow-sm active:scale-95 transition-all shrink-0"
          >
            <span className="text-lg">👥</span>
            {friends.some((f) => f.status === "pending" && !f.isSentByMe) && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-500 rounded-full border border-white" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full">
              <span>🔥</span>
              <span className="text-[10px] font-black text-orange-600">{streak} day streak</span>
            </span>
          )}
          {max_streak > 0 && (
            <span className="inline-flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-1 rounded-full">
              <span>⚡</span>
              <span className="text-[10px] font-black text-amber-600">{max_streak} best passes</span>
            </span>
          )}
          {/* Daily goal ring */}
          {(() => {
            const radius = 14;
            const circ = 2 * Math.PI * radius;
            const pct = Math.min(daily_count / DAILY_GOAL, 1);
            const done = pct >= 1;
            return (
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${done ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"}`}>
                <svg width="28" height="28" viewBox="0 0 36 36" className="-rotate-90">
                  <circle cx="18" cy="18" r={radius} fill="none" strokeWidth="3.5" className="stroke-slate-100" />
                  <circle
                    cx="18" cy="18" r={radius} fill="none" strokeWidth="3.5"
                    strokeDasharray={circ}
                    strokeDashoffset={circ - pct * circ}
                    strokeLinecap="round"
                    className={done ? "stroke-emerald-500" : "stroke-indigo-400"}
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                </svg>
                <div className="flex flex-col leading-none">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${done ? "text-emerald-600" : "text-slate-400"}`}>
                    Daily goal
                  </span>
                  <span className={`text-[11px] font-black ${done ? "text-emerald-600" : "text-slate-600"}`}>
                    {done ? `${DAILY_GOAL}/${DAILY_GOAL} ✓` : `${daily_count}/${DAILY_GOAL}`}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Overall level banner */}
        <OverallBanner level={overallLevel} score={Math.round(overallScore)} />
      </div>

      <div className="max-w-2xl mx-auto">
      {/* Section label + today's activity pills */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Skills</p>
        <div className="flex items-center gap-1.5">
          {/* Vocab: shows daily progress */}
          {(() => {
            const done = daily_count >= DAILY_GOAL;
            return (
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${done ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                🃏 {done ? "✓" : `${daily_count}/${DAILY_GOAL}`}
              </span>
            );
          })()}
          {/* Reading done today */}
          <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black border ${doneTodayQuizzes.reading ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
            📖 {doneTodayQuizzes.reading ? "✓" : "·"}
          </span>
          {/* Listening done today */}
          <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black border ${doneTodayQuizzes.listening ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
            🎧 {doneTodayQuizzes.listening ? "✓" : "·"}
          </span>
          {/* Grammar done today */}
          <span className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black border ${doneTodayQuizzes.grammar ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
            📝 {doneTodayQuizzes.grammar ? "✓" : "·"}
          </span>
        </div>
      </div>

      {/* 2×2 skill tiles */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <ScoreTile href="/study"                   emoji="🃏" label="Vocabulary" score={data.vocab_score}     sub={`${data.deck_size.toLocaleString()} cards in deck`} nlevelOverride={data.vocab_nlevel} />
        <ScoreTile href="/quizzes?open=grammar"    emoji="📝" label="Grammar"    score={data.grammar_score} />
        <ScoreTile href="/quizzes?open=sentence"   emoji="📖" label="Reading"    score={data.reading_score}   sub="Sentence quiz" />
        <ScoreTile href="/quizzes?open=listening"  emoji="🎧" label="Listening"  score={data.listening_score} sub="Listening quiz" />
      </div>

      {/* Vocabulary by JLPT level */}
      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vocabulary by Level</p>
            <p className="text-[10px] font-black text-slate-400">{data.deck_size.toLocaleString()} cards</p>
          </div>
          <div className="space-y-3.5">
            {(["N5", "N4", "N3", "N2", "N1"] as const).map((level) => {
              const { total, mastered } = data.jlpt_stats[level];
              const floor = JLPT_VOCAB_INCREMENT[level];
              const floorPct = Math.min(100, Math.round((total / floor) * 100));
              const masteredOfFloorPct = Math.min(100, Math.round((mastered / floor) * 100));
              const addedNotMasteredOfFloorPct = Math.min(100 - masteredOfFloorPct, Math.round(((total - mastered) / floor) * 100));
              const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
              return (
                <div key={level} className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className={`shrink-0 w-9 text-[10px] px-1.5 py-0.5 rounded-md border font-black text-center uppercase tracking-tighter ${JLPT_BADGE_COLOR[level]}`}>
                      {level}
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className={`h-full ${JLPT_BAR_COLOR[level]}`} style={{ width: `${masteredOfFloorPct}%` }} />
                      <div className={`h-full ${JLPT_BAR_LIGHT_COLOR[level]}`} style={{ width: `${addedNotMasteredOfFloorPct}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pl-12 text-[10px] font-bold text-slate-400">
                    <span>{total}/{floor} = {floorPct}%</span>
                    <span>{mastered}/{total} Mastered ({masteryPct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vocabulary by Part of Speech — not a filter (that lives in Practice), tap a tag for its numbers */}
      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Vocabulary by Part of Speech</p>
          <div className="flex gap-2 flex-wrap">
            {ALLOWED_PARTS_OF_SPEECH.map((pos) => {
              const { total, mastered } = data.pos_stats[pos] ?? { total: 0, mastered: 0 };
              const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
              return (
                <button
                  key={pos}
                  onClick={() => setSelectedPos(pos)}
                  className="relative overflow-hidden px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200 bg-slate-50 text-slate-600 active:scale-95 transition-transform"
                >
                  <span aria-hidden className="absolute inset-y-0 left-0 bg-indigo-200" style={{ width: `${pct}%` }} />
                  <span className="relative">{pos} · {pct}%</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Today — same three daily chips shown in Study, just as a card here */}
      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Today</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-black text-slate-800 tabular-nums">
                {daily_count}<span className="text-slate-300 text-sm">/{REVIEW_TARGET}</span>
              </p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Reviews</p>
            </div>
            <div>
              <p className={`text-xl font-black tabular-nums ${mastered_today >= MASTERED_GOAL ? "text-emerald-600" : "text-slate-800"}`}>
                {mastered_today}<span className="text-slate-300 text-sm">/{MASTERED_GOAL}</span>
              </p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Mastered</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 tabular-nums">{still_learning}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Not Yet Mastered</p>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Part of speech detail modal */}
      <AnimatePresence>
        {selectedPos && (() => {
          const { total, mastered } = data.pos_stats[selectedPos] ?? { total: 0, mastered: 0 };
          const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
          return (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[210] bg-black/20"
                onClick={() => setSelectedPos(null)}
              />
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 60, opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="fixed bottom-0 left-0 right-0 sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 z-[211] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-100 p-6 w-full sm:max-w-sm"
                style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="text-slate-800 font-black text-sm uppercase tracking-tight">
                    {selectedPos.charAt(0).toUpperCase() + selectedPos.slice(1)}
                  </p>
                  <button onClick={() => setSelectedPos(null)} className="text-slate-300 hover:text-slate-500">✕</button>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-black text-slate-800 tabular-nums">{total}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">In Deck</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-600 tabular-nums">{mastered}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Mastered</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-indigo-600 tabular-nums">{pct}%</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Mastery</p>
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      <AnimatePresence>
        {isSocialOpen && user?.id && (
          <SocialDock
            userId={user.id}
            username={name || ""}
            referralCode={data.referral_code}
            friends={friends}
            onClose={() => setIsSocialOpen(false)}
            fetchFriends={fetchFriends}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
