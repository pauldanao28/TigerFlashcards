"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { jlptLevel, JLPT_VOCAB_INCREMENT } from "@/lib/scoring";
import { ALLOWED_PARTS_OF_SPEECH } from "@/lib/textNormalize";
import LoadingScreen from "@/components/LoadingScreen";
import { SocialDock } from "@/components/SocialDock";
import SocialToast from "@/components/SocialToast";
import BadgeToast from "@/components/BadgeToast";
import NotificationBell from "@/components/NotificationBell";
import ShareButton from "@/components/ShareButton";
import { SKILL_TILE, type SkillKey } from "@/lib/skillTheme";
import { Share2, ChevronRight, Trophy, TrendingUp, BookOpen, Headphones, PenTool, Layers, BarChart3, X } from "lucide-react";
import { useFriendsContext } from "@/context/FriendsContext";
import { pickDailyQuests, questProgress } from "@/lib/dailyQuests";
import { BADGES } from "@/lib/badges";
import { CONFETTI_PARTICLES } from "@/lib/confetti";
import SparkLine from "@/components/SparkLine";

type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const DAILY_GOAL = 10;
// Same targets Study uses for its reviews-today / mastered-today chips — kept identical
// so the same numbers mean the same thing on both tabs.
const REVIEW_TARGET = 100;
const MASTERED_GOAL = 20;

// Keeps big tries counts (19,095 reviews deep into a word) from blowing out the
// fixed-width Directional Comparison tiles — "19.1K" reads fine where "19095" doesn't.
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

interface ProfileScores {
  name: string | null;
  avatar_url: string | null;
  referral_code: string | null;
  streak: number;
  max_streak: number;
  daily_count: number;
  mastered_today: number;
  cards_added_today: number;
  daily_quests_enabled: boolean;
  still_learning: number;
  mastered_count: number;
  struggling_count: number;
  avg_reflex_seconds: number | null;
  avg_accuracy: number | null;
  jp_tries: number;
  jp_pass: number;
  en_tries: number;
  en_pass: number;
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
  skill,
}: {
  href: string;
  emoji: string;
  label: string;
  score: number | null;
  sub?: string;
  nlevelOverride?: JlptLevel;
  skill: SkillKey;
}) {
  const s = score ?? 0;
  const displayScore = useCountUp(s);
  const nlevel = nlevelOverride ?? jlptLevel(s);
  const barColor = s >= 80 ? "bg-red-400" : s >= 60 ? "bg-orange-400" : s >= 40 ? "bg-amber-400" : s >= 20 ? "bg-emerald-400" : "bg-indigo-400";
  return (
    <Link href={href} className={`rounded-2xl p-4 border shadow-sm active:scale-95 transition-all flex flex-col gap-2 ${SKILL_TILE[skill].tile}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{emoji}</span>
        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${JLPT_BADGE_COLOR[nlevel as JlptLevel]}`}>
          {nlevel}
        </span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <div>
        <div className="flex items-end justify-between mb-1">
          <span className={`text-2xl font-black tabular-nums ${JLPT_TEXT_COLOR[nlevel as JlptLevel]}`}>{displayScore}%</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${SKILL_TILE[skill].track}`}>
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${s}%` }}
          />
        </div>
      </div>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
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
  const [isStreakShareOpen, setIsStreakShareOpen] = useState(false);
  const [badgeQueue, setBadgeQueue] = useState<string[]>([]);
  const [isStatsShareOpen, setIsStatsShareOpen] = useState(false);
  const [selectedPos, setSelectedPos] = useState<string | null>(null);
  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(new Set());
  // Daily Progress — moved here from Cards (see fetchHistory below for why: both
  // queries are cheap daily-aggregate tables, not the full per-card dataset, so this
  // doesn't cost Home anything like Mastered/Struggling's drill-down would).
  const [dailyHistory, setDailyHistory] = useState<{ study_date: string; count: number }[]>([]);
  const [quizHistory, setQuizHistory] = useState<
    { study_date: string; reading: number | null; listening: number | null; grammar: number | null }[]
  >([]);
  const [historyTab, setHistoryTab] = useState<"flashcards" | "quizzes">("flashcards");
  const [showHistory, setShowHistory] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const { friends, fetchFriends, socialToast, dismissSocialToast } = useFriendsContext();

  // Same 14-day history fetch that used to live on Cards (user_review_counts +
  // quiz_daily_stats — small per-day aggregates, not the full deck).
  const fetchHistory = async () => {
    if (!user) return;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
    const since = fourteenDaysAgo.toLocaleDateString("en-CA");

    const [{ data: reviewData }, { data: quizData }] = await Promise.all([
      supabase
        .from("user_review_counts")
        .select("study_date, count")
        .eq("user_id", user.id)
        .gte("study_date", since)
        .order("study_date", { ascending: false }),
      supabase
        .from("quiz_daily_stats")
        .select("study_date, quiz_type, correct, total")
        .eq("user_id", user.id)
        .gte("study_date", since)
        .order("study_date", { ascending: false }),
    ]);

    // Build full 14-day grid (newest first: index 0 = today)
    const days: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString("en-CA"));
    }

    // Pad vocab to full 14 days (0 for days with no reviews)
    const vocabMap = new Map((reviewData ?? []).map((r) => [r.study_date, r.count]));
    setDailyHistory(days.map((date) => ({ study_date: date, count: vocabMap.get(date) ?? 0 })));
    const acc: Record<string, Record<string, { correct: number; total: number }>> = {};
    for (const row of quizData ?? []) {
      if (!acc[row.study_date]) acc[row.study_date] = {};
      const prev = acc[row.study_date][row.quiz_type] ?? { correct: 0, total: 0 };
      acc[row.study_date][row.quiz_type] = { correct: prev.correct + row.correct, total: prev.total + row.total };
    }
    setQuizHistory(days.map((date) => {
      const d = acc[date] ?? {};
      const pct = (type: string) => (d[type]?.total ? Math.round((d[type].correct / d[type].total) * 100) : null);
      return { study_date: date, reading: pct("reading"), listening: pct("listening"), grammar: pct("grammar") };
    }));
  };

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
        avatar_url: raw.avatar_url ?? null,
        referral_code: raw.referral_code ?? null,
        streak: raw.streak ?? 0,
        max_streak: raw.max_streak ?? 0,
        daily_count: raw.daily_count ?? 0,
        mastered_today: raw.mastered_today ?? 0,
        cards_added_today: raw.cards_added_today ?? 0,
        daily_quests_enabled: raw.daily_quests_enabled ?? true,
        still_learning: raw.still_learning ?? 0,
        mastered_count: raw.mastered_count ?? 0,
        struggling_count: raw.struggling_count ?? 0,
        avg_reflex_seconds: raw.avg_reflex_seconds ?? null,
        avg_accuracy: raw.avg_accuracy ?? null,
        jp_tries: raw.jp_tries ?? 0,
        jp_pass: raw.jp_pass ?? 0,
        en_tries: raw.en_tries ?? 0,
        en_pass: raw.en_pass ?? 0,
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

      // Catches badges that don't require hitting today's goal at all (mastery, JLPT
      // level, friends) — StudyView's own check (after updateStreak) only fires on a
      // goal-met moment, so this is what covers everything else.
      const { data: newBadges, error: badgeErr } = await supabase.rpc("check_and_award_badges");
      if (badgeErr) console.error("Error checking badges:", badgeErr.message);
      else {
        const keys = (newBadges ?? []).map((b: { badge_key: string }) => b.badge_key);
        if (keys.length > 0) setBadgeQueue((prev) => [...prev, ...keys]);
      }
    };
    load();
    // Depend on user.id (a stable primitive), not the user object — Supabase's
    // onAuthStateChange emits a new object reference on every event (token refresh,
    // tab focus, etc.) even for the same session, which was re-triggering this whole
    // fetch-and-recompute sequence repeatedly and made the displayed numbers flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Badges summary card — moved here from the Cards page so progress/motivation
  // content lives in one place. A cheap, targeted read (not the full-deck fetch
  // get_dashboard_data above was built to avoid), same query the Badges page uses.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_badges")
      .select("badge_key")
      .eq("user_id", user.id)
      .then(({ data: rows, error }) => {
        if (error) { console.error("Error fetching badges:", error.message); return; }
        setEarnedBadges(new Set((rows ?? []).map((b) => b.badge_key)));
      });
    // Same user?.id-not-user rationale as the load() effect above.
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{greeting}</p>
            <h1 className={`${(name?.length || 10) > 12 ? "text-xl" : "text-3xl"} font-black text-slate-800 italic uppercase tracking-tighter leading-none mt-1`}>
              {name || "Learner"} 👋
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && <NotificationBell userId={user.id} />}
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
        </div>
        <div className="flex items-center gap-3 mt-2">
          {streak > 0 && (
            <button
              onClick={() => setIsStreakShareOpen(true)}
              aria-label="Share your streak"
              className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 px-3 py-1 rounded-full active:scale-95 transition-all"
            >
              <span>🔥</span>
              <span className="text-[10px] font-black text-orange-600">{streak} day streak</span>
              <Share2 size={10} className="text-orange-400" />
            </button>
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
      {/* Badges — compact summary card; the full grid lives on its own page
          (/stats/badges). Moved here from Cards so progress/motivation content
          lives in one place instead of split across two tabs. Placed first since
          it's the most motivating glance before the day's to-do list. */}
      <Link
        href="/stats/badges"
        className="mx-4 mt-4 flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-slate-100 shadow-sm hover:border-indigo-200 transition-all"
      >
        <div className="flex items-center gap-3 min-w-0">
          {earnedBadges.size > 0 ? (
            <div className="flex -space-x-2 shrink-0">
              {BADGES.filter((b) => earnedBadges.has(b.key)).slice(0, 4).map((badge) => (
                <span
                  key={badge.key}
                  className="w-9 h-9 rounded-full bg-slate-50 border-2 border-white flex items-center justify-center text-base shadow-sm"
                >
                  {badge.icon}
                </span>
              ))}
            </div>
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Trophy size={16} className="text-slate-300" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-700">Badges</p>
            <p className="text-[10px] text-slate-500 font-medium">
              {earnedBadges.size}/{BADGES.length} earned
            </p>
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-300 shrink-0" />
      </Link>

      {/* Today — grouped together and placed right under the header since this is
          the most actionable content on the page (what to do today), rather than
          scattered between the skill/vocab breakdown sections below. */}
      {data.daily_quests_enabled && (() => {
        const todaySg = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
        const todaysQuests = user ? pickDailyQuests(user.id, todaySg) : [];
        const questStates = todaysQuests.map((quest) => {
          const progress = Math.min(
            quest.target,
            questProgress(quest.key, { ...data, done_today_quizzes: doneTodayQuizzes }),
          );
          return { quest, progress, done: progress >= quest.target };
        });
        const allQuestsDone = questStates.length > 0 && questStates.every((q) => q.done);
        return (
          <div className="mx-4 mt-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Today&apos;s Quests</p>
            <div className="flex flex-col gap-2.5">
              {questStates.map(({ quest, progress, done }) => (
                  <div
                    key={quest.key}
                    className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                      done ? "bg-emerald-50 border-emerald-100" : "bg-slate-50 border-slate-100"
                    }`}
                  >
                    <span className="text-xl shrink-0">{done ? "✅" : quest.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold truncate ${done ? "text-emerald-700" : "text-slate-700"}`}>
                        {quest.label}
                      </p>
                      {quest.target > 1 && (
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1.5 w-full">
                          <div
                            className={`h-full ${done ? "bg-emerald-500" : "bg-indigo-500"}`}
                            style={{ width: `${(progress / quest.target) * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {quest.target > 1 && (
                      <span className="text-[10px] font-black text-slate-400 tabular-nums shrink-0">
                        {progress}/{quest.target}
                      </span>
                    )}
                  </div>
              ))}
            </div>
            {allQuestsDone && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <ShareButton
                  params={{ kind: "quests", total: questStates.length }}
                  caption={`✅ Completed all ${questStates.length} of today's quests on FlashKado! Join me:`}
                  className="bg-indigo-600 text-white shadow-lg shadow-indigo-200"
                />
              </div>
            )}
          </div>
        );
      })()}

      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Today</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xl font-black text-slate-800 tabular-nums">
                {daily_count}<span className="text-slate-300 text-sm">/{REVIEW_TARGET}</span>
              </p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Reviews</p>
            </div>
            <div>
              <p className={`text-xl font-black tabular-nums ${mastered_today >= MASTERED_GOAL ? "text-emerald-600" : "text-slate-800"}`}>
                {mastered_today}<span className="text-slate-300 text-sm">/{MASTERED_GOAL}</span>
              </p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Mastered</p>
            </div>
            <div>
              <p className="text-xl font-black text-slate-800 tabular-nums">{still_learning}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Not Yet Mastered</p>
            </div>
          </div>
          <button
            onClick={() => { fetchHistory(); setShowCelebration(true); }}
            className="w-full flex items-center justify-between mt-4 pt-3 border-t border-slate-100 active:scale-[0.99] transition-all"
          >
            <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-600">
              <BarChart3 size={13} /> 14-Day Progress
            </span>
            <ChevronRight size={15} className="text-slate-300" />
          </button>
        </div>
      )}

      {/* Section label + today's activity pills */}
      <div className="px-5 pt-5 pb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Your Skills</p>
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
        <ScoreTile href="/study"                   skill="vocab"     emoji="🃏" label="Vocabulary" score={data.vocab_score}     sub={`${data.deck_size.toLocaleString()} cards in deck`} nlevelOverride={data.vocab_nlevel} />
        <ScoreTile href="/quizzes?open=grammar"    skill="grammar"   emoji="📝" label="Grammar"    score={data.grammar_score} />
        <ScoreTile href="/quizzes?open=sentence"   skill="reading"   emoji="📖" label="Reading"    score={data.reading_score}   sub="Sentence quiz" />
        <ScoreTile href="/quizzes?open=listening"  skill="listening" emoji="🎧" label="Listening"  score={data.listening_score} sub="Listening quiz" />
      </div>

      {/* Vocabulary by JLPT level */}
      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Vocabulary by Level</p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-black text-slate-500">{data.deck_size.toLocaleString()} cards</p>
              <button
                onClick={() => setIsStatsShareOpen(true)}
                aria-label="Share your vocabulary stats"
                className="text-slate-300 hover:text-slate-500 active:scale-90 transition-all"
              >
                <Share2 size={12} />
              </button>
            </div>
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
                  <div className="flex items-center justify-between pl-12 text-[10px] font-bold text-slate-500">
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
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Vocabulary by Part of Speech</p>
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

      {/* Deck Stats — Mastered/Struggling/Avg Reflex/Avg Accuracy, moved here from
          Cards; all four now come from get_dashboard_data itself (see its migration)
          instead of a client-side full-deck fetch, so this stays as cheap as the rest
          of Home. */}
      {data.deck_size > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Deck Stats</p>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-xl font-black text-emerald-600 tabular-nums">{data.mastered_count}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Mastered</p>
            </div>
            <div>
              <p className="text-xl font-black text-rose-600 tabular-nums">{data.struggling_count}</p>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Struggling</p>
            </div>
            {data.avg_reflex_seconds != null && (
              <div>
                <p className="text-xl font-black text-amber-600 tabular-nums">{data.avg_reflex_seconds.toFixed(1)}s</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Avg Reflex Speed</p>
              </div>
            )}
            {data.avg_accuracy != null && (
              <div>
                <p className="text-xl font-black text-indigo-600 tabular-nums">{data.avg_accuracy}%</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Avg Accuracy</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Directional Comparison — JP→EN (recognition) vs EN→JP (recall), moved here
          from Cards. Restyled to match the light cards around it (Deck Stats, Badges)
          instead of the dark hero-card treatment it had on Cards, where it stood alone
          rather than sandwiched between two white cards. */}
      {(data.jp_tries + data.en_tries) > 0 && (
        <div className="mx-4 mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
          <div className="flex flex-col md:flex-row gap-5 md:gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black rounded-md border border-indigo-100 uppercase tracking-widest">
                  Recognition
                </span>
                <p className="text-xs font-bold text-slate-400">🇯🇵 → 🇺🇸</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Tries</p>
                  <p className="text-lg font-black text-slate-800 tabular-nums">{formatCount(data.jp_tries)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-0.5">Accuracy</p>
                  <p className="text-lg font-black text-indigo-600 tabular-nums">
                    {data.jp_tries > 0 ? Math.round((data.jp_pass / data.jp_tries) * 100) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Pass</p>
                  <p className="text-lg font-black text-emerald-600 tabular-nums">{formatCount(data.jp_pass)}</p>
                </div>
              </div>
            </div>
            <div className="hidden md:block w-px bg-slate-100" />
            <div className="md:hidden h-px bg-slate-100" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-0.5 bg-orange-50 text-orange-600 text-[10px] font-black rounded-md border border-orange-100 uppercase tracking-widest">
                  Recall
                </span>
                <p className="text-xs font-bold text-slate-400">🇺🇸 → 🇯🇵</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-0.5">Tries</p>
                  <p className="text-lg font-black text-slate-800 tabular-nums">{formatCount(data.en_tries)}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-500 mb-0.5">Accuracy</p>
                  <p className="text-lg font-black text-orange-600 tabular-nums">
                    {data.en_tries > 0 ? Math.round((data.en_pass / data.en_tries) * 100) : 0}%
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Pass</p>
                  <p className="text-lg font-black text-emerald-600 tabular-nums">{formatCount(data.en_pass)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Stats — separate page, all live-computed. */}
      <Link
        href="/stats/insights"
        className="mx-4 mt-3 flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 font-black text-slate-700 hover:bg-slate-50 transition-all active:scale-[0.99]"
      >
        <span className="flex items-center gap-2 text-sm">
          <TrendingUp size={16} className="text-slate-400" /> Advanced Stats
        </span>
        <span className="text-slate-500 text-xs">View →</span>
      </Link>
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
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">In Deck</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-emerald-600 tabular-nums">{mastered}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Mastered</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black text-indigo-600 tabular-nums">{pct}%</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mt-0.5">Mastery</p>
                  </div>
                </div>
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      <SocialToast
        toast={socialToast}
        onTap={() => setIsSocialOpen(true)}
        onDismiss={dismissSocialToast}
      />
      <BadgeToast queue={badgeQueue} onAdvance={() => setBadgeQueue((prev) => prev.slice(1))} />

      {/* --- Celebration Modal (Daily Progress) --- */}
      {showCelebration && (() => {
        const msg = daily_count === 0
          ? { emoji: "📚", line1: "No reviews yet today,", line2: "let's change that!" }
          : daily_count >= 20
          ? { emoji: "🔥", line1: `${daily_count} words practiced`, line2: "You're on fire today!" }
          : { emoji: "🎉", line1: `${daily_count} ${daily_count === 1 ? "word" : "words"} practiced`, line2: "today — great work!" };
        return (
          <div className="fixed inset-0 z-[225] flex items-center justify-center p-4">
            {CONFETTI_PARTICLES.map((c, i) => (
              <motion.div
                key={i}
                className="absolute pointer-events-none"
                style={{
                  backgroundColor: c.color,
                  width: c.w,
                  height: c.h,
                  borderRadius: c.round ? "50%" : "2px",
                  left: `${c.left}%`,
                  top: -16,
                }}
                initial={{ y: -16, opacity: 1, rotate: 0 }}
                animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0.6, 0], rotate: 400 }}
                transition={{ duration: 2, delay: c.delay, ease: [0.2, 0.8, 0.6, 1] }}
              />
            ))}
            <motion.div
              className="absolute inset-0 bg-indigo-950/70 backdrop-blur-lg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              onClick={() => { setShowCelebration(false); setShowHistory(true); }}
            />
            <motion.div
              className="relative z-10 bg-white rounded-[3rem] p-10 text-center max-w-xs w-full shadow-2xl overflow-hidden"
              initial={{ scale: 0.6, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 360, damping: 24, delay: 0.05 }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/60 to-transparent pointer-events-none" />
              <motion.div
                className="text-6xl mb-5 select-none"
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
              >
                {msg.emoji}
              </motion.div>
              <motion.p
                className="text-5xl font-black text-indigo-600 tracking-tight leading-none mb-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.22, duration: 0.35 }}
              >
                {msg.line1}
              </motion.p>
              <motion.p
                className="text-base font-bold text-slate-500 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32, duration: 0.3 }}
              >
                {msg.line2}
              </motion.p>
              <motion.button
                onClick={() => { setShowCelebration(false); setShowHistory(true); }}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                whileTap={{ scale: 0.96 }}
              >
                See Full Progress →
              </motion.button>
            </motion.div>
          </div>
        );
      })()}

      {/* --- Daily Activity Overlay --- */}
      {showHistory && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 sm:p-6">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-xl animate-in fade-in duration-300"
            onClick={() => setShowHistory(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-50 flex justify-between items-start bg-gradient-to-b from-slate-50/50 to-transparent">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                  <h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight">
                    ✨ Activity Log
                  </h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setHistoryTab("flashcards")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "flashcards" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                  >
                    <Layers size={11} /> Flashcards
                  </button>
                  <button
                    onClick={() => setHistoryTab("quizzes")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === "quizzes" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                  >
                    <BarChart3 size={11} /> Quizzes
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="h-10 w-10 bg-white border border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-slate-800 hover:shadow-sm transition-all active:scale-90 shrink-0 ml-3"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-8 md:p-10 overflow-y-auto custom-scrollbar">
              {historyTab === "flashcards" && (
                <>
                  <div className="relative bg-slate-50/50 rounded-[2.5rem] p-6 border border-slate-100 mb-8">
                    <div className="absolute inset-0 grid grid-rows-4 px-6 py-6 opacity-[0.03] pointer-events-none">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="border-t border-black w-full" />
                      ))}
                    </div>
                    <div className="relative flex items-end justify-between gap-1.5 md:gap-3 h-56">
                      {[...dailyHistory].reverse().map((day, i) => {
                        const maxCount = Math.max(...dailyHistory.map((d) => d.count), 1);
                        const heightPercentage = Math.max((day.count / maxCount) * 100, 4);
                        const isToday = i === dailyHistory.length - 1;
                        return (
                          <div key={day.study_date} className="flex-1 flex flex-col items-center group h-full justify-end">
                            <div className="relative w-full flex flex-col justify-end h-full">
                              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-black px-2.5 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100 pointer-events-none z-10 shadow-xl">
                                {day.count} <span className="text-slate-400 font-bold ml-0.5">pts</span>
                              </div>
                              <div
                                style={{ height: `${heightPercentage}%` }}
                                className={`w-full rounded-t-2xl transition-all duration-700 ease-out cursor-default ${
                                  isToday
                                    ? "bg-gradient-to-t from-indigo-600 to-indigo-400 shadow-lg shadow-indigo-100"
                                    : "bg-slate-200 group-hover:bg-slate-300 group-hover:shadow-md"
                                }`}
                              />
                            </div>
                            <div className="mt-4 flex flex-col items-center">
                              <span className={`text-[8px] font-black uppercase tracking-tighter ${isToday ? "text-indigo-600" : "text-slate-400"}`}>
                                {new Date(day.study_date).toLocaleDateString("en-SG", { weekday: "short" })}
                              </span>
                              <span className="text-[7px] font-bold text-slate-300 mt-0.5">
                                {new Date(day.study_date).getDate()}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 hover:border-indigo-100 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-500">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                            </svg>
                          </div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</p>
                        </div>
                        <SparkLine values={[...dailyHistory].reverse().map((d) => d.count)} color="#6366f1" />
                      </div>
                      <p className="text-3xl font-black text-slate-800 tracking-tight">
                        {dailyHistory.reduce((acc, curr) => acc + curr.count, 0)}
                        <span className="text-[10px] font-bold text-slate-300 uppercase ml-2 tracking-widest">Reviews</span>
                      </p>
                    </div>

                    <div className="group bg-white p-6 rounded-[2.5rem] border border-slate-100 hover:border-emerald-100 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-500">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Average</p>
                        </div>
                        <SparkLine values={[...dailyHistory].reverse().map((d) => d.count)} color="#10b981" />
                      </div>
                      <p className="text-3xl font-black text-slate-800 tracking-tight">
                        {Math.round(dailyHistory.reduce((acc, curr) => acc + curr.count, 0) / (dailyHistory.length || 1))}
                        <span className="text-[10px] font-bold text-slate-300 uppercase ml-2 tracking-widest">Daily</span>
                      </p>
                    </div>
                  </div>
                </>
              )}

              {historyTab === "quizzes" && (
                <div>
                  {(() => {
                    const vocabVals = [...dailyHistory].reverse().map((d) => d.count);
                    const readVals = [...quizHistory].reverse().map((d) => d.reading);
                    const listenVals = [...quizHistory].reverse().map((d) => d.listening);
                    const grammarVals = [...quizHistory].reverse().map((d) => d.grammar);
                    const tiles = [
                      { key: "vocab",   label: "Vocab",   icon: Layers,     color: "#6366f1", values: vocabVals,   today: dailyHistory[0]?.count ?? 0, unit: "" },
                      { key: "read",    label: "Read",    icon: BookOpen,   color: "#4f46e5", values: readVals,    today: quizHistory[0]?.reading,     unit: "%" },
                      { key: "listen",  label: "Listen",  icon: Headphones, color: "#7c3aed", values: listenVals,  today: quizHistory[0]?.listening,   unit: "%" },
                      { key: "grammar", label: "Grammar", icon: PenTool,    color: "#d97706", values: grammarVals, today: quizHistory[0]?.grammar,     unit: "%" },
                    ];
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-6">
                        {tiles.map((tile) => (
                          <div key={tile.key} className="bg-white rounded-2xl border border-slate-100 px-3 pt-3 pb-2.5 flex flex-col gap-1">
                            <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: tile.color }}>
                              <tile.icon size={10} /> {tile.label}
                            </p>
                            <SparkLine values={tile.values} color={tile.color} />
                            <p className="text-sm font-black text-slate-700 leading-none">
                              {tile.today !== null && tile.today !== undefined
                                ? <>{tile.today}{tile.unit}</>
                                : <span className="text-slate-300 text-xs font-bold">—</span>}
                              {tile.unit === "" && <span className="text-[9px] font-bold text-slate-300 ml-1">today</span>}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Last 7 Days</p>
                  <div className="flex items-center gap-3 mb-1 px-2">
                    <span className="w-20 shrink-0" />
                    <span className="flex-1 flex justify-center text-indigo-400"><BookOpen size={12} /></span>
                    <span className="flex-1 flex justify-center text-violet-400"><Headphones size={12} /></span>
                    <span className="flex-1 flex justify-center text-amber-400"><PenTool size={12} /></span>
                  </div>
                  <div className="space-y-0.5">
                    {quizHistory.slice(0, 7).map((row, i) => {
                      const isToday = i === 0;
                      const dot = (pct: number | null) => {
                        if (pct === null) return <span className="text-slate-200 text-lg leading-none">·</span>;
                        const color = pct >= 80 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-rose-400";
                        return <span className={`text-base leading-none ${color}`} title={`${pct}%`}>●</span>;
                      };
                      return (
                        <div key={row.study_date} className={`flex items-center gap-3 py-2 px-2 rounded-xl ${isToday ? "bg-indigo-50" : ""}`}>
                          <div className="w-20 shrink-0 flex items-center gap-1.5">
                            <span className={`text-[10px] font-black ${isToday ? "text-indigo-600" : "text-slate-500"}`}>
                              {new Date(row.study_date + "T00:00:00").toLocaleDateString("en-SG", { month: "short", day: "numeric" })}
                            </span>
                            {isToday && <span className="text-[8px] font-black text-indigo-300 uppercase tracking-widest">now</span>}
                          </div>
                          <span className="flex-1 flex justify-center">{dot(row.reading)}</span>
                          <span className="flex-1 flex justify-center">{dot(row.listening)}</span>
                          <span className="flex-1 flex justify-center">{dot(row.grammar)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-5 px-2">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Key</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500"><span className="text-emerald-400">●</span> ≥80%</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500"><span className="text-amber-400">●</span> ≥60%</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500"><span className="text-rose-400">●</span> &lt;60%</span>
                    <span className="flex items-center gap-1 text-[9px] font-bold text-slate-500"><span className="text-slate-200 text-sm">·</span> none</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50/50 text-center mt-auto border-t border-slate-50">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] opacity-60">
                Focus • Consistency • Mastery
              </p>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isSocialOpen && user?.id && (
          <SocialDock
            userId={user.id}
            username={name || ""}
            myStreak={streak}
            myNLevel={overallLevel}
            myAvatar={data.avatar_url}
            referralCode={data.referral_code}
            friends={friends}
            onClose={() => setIsSocialOpen(false)}
            fetchFriends={fetchFriends}
          />
        )}
      </AnimatePresence>

      {/* Share your streak any time — tap the 🔥 badge in the header */}
      <AnimatePresence>
        {isStreakShareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsStreakShareOpen(false)}
            className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2rem] w-full max-w-xs p-6 flex flex-col gap-3 shadow-2xl"
            >
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Share your streak</p>
              <ShareButton
                preview
                params={{ kind: "streak", cards: daily_count }}
                caption={`🔥 ${streak}-day streak learning Japanese on FlashKado! Join me:`}
                className="bg-indigo-600 text-white shadow-lg shadow-indigo-200"
              />
              <button
                onClick={() => setIsStreakShareOpen(false)}
                className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share your vocabulary breakdown — tap the share icon on the Vocabulary by
          Level card. Same preview/ShareButton pattern as the streak-share modal
          above, just a different card kind (kind=vocab_stats). */}
      <AnimatePresence>
        {isStatsShareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsStatsShareOpen(false)}
            className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-[2rem] w-full max-w-xs p-6 flex flex-col gap-3 shadow-2xl"
            >
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-500">Share your vocabulary</p>
              <ShareButton
                preview
                params={{ kind: "vocab_stats" }}
                caption="My vocabulary progress on FlashKado! Join me:"
                className="bg-indigo-600 text-white shadow-lg shadow-indigo-200"
              />
              <button
                onClick={() => setIsStatsShareOpen(false)}
                className="mt-4 text-[10px] font-black uppercase tracking-widest text-slate-500"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
