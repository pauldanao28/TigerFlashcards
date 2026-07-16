"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { getLevel, jlptLevel, JLPT_VOCAB_INCREMENT, grammarPatternScore } from "@/lib/scoring";
import LoadingScreen from "@/components/LoadingScreen";

type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const DAILY_GOAL = 10;

interface ProfileScores {
  name: string | null;
  streak: number;
  max_streak: number;
  daily_count: number;
  vocab_score: number | null;
  reading_score: number | null;
  listening_score: number | null;
  grammar_score: number | null;
  deck_size: number;
  jlpt_stats: Record<JlptLevel, { total: number; mastered: number }>;
  vocab_nlevel: JlptLevel;
}

// Solid = mastered portion, light = added-but-not-yet-mastered portion — same hue per level.
const JLPT_BAR_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-500",
  N4: "bg-teal-500",
  N3: "bg-amber-500",
  N2: "bg-orange-500",
  N1: "bg-rose-500",
};
const JLPT_BAR_LIGHT_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-200",
  N4: "bg-teal-200",
  N3: "bg-amber-200",
  N2: "bg-orange-200",
  N1: "bg-rose-200",
};
const JLPT_BADGE_COLOR: Record<JlptLevel, string> = {
  N5: "bg-emerald-100 text-emerald-700 border-emerald-200",
  N4: "bg-teal-100 text-teal-700 border-teal-200",
  N3: "bg-amber-100 text-amber-700 border-amber-200",
  N2: "bg-orange-100 text-orange-700 border-orange-200",
  N1: "bg-rose-100 text-rose-700 border-rose-200",
};
const JLPT_TEXT_COLOR: Record<JlptLevel, string> = {
  N5: "text-emerald-700",
  N4: "text-teal-700",
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

function OverallBanner({ level, score }: { level: string; score: number }) {
  const displayScore = useCountUp(score);
  return (
    <div className="mt-4 bg-indigo-600 rounded-2xl px-5 py-4 flex items-center justify-between">
      <div>
        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Overall Level</p>
        <p className="text-4xl font-black text-white mt-0.5">{level}</p>
      </div>
      <div className="text-right">
        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">Avg Score</p>
        <p className="text-3xl font-black text-white mt-0.5 tabular-nums">{displayScore}%</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<ProfileScores | null>(
    () => _dashboardCache.get(user?.id ?? "") ?? null
  );



  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Round 1: profile + default deck + today's review count in parallel
      const today = new Date().toLocaleDateString("en-CA");
      const [profileRes, deckRes, reviewRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, streak_count, max_streak, reading_score, listening_score, grammar_score")
          .eq("id", user.id)
          .single(),
        supabase.from("decks").select("id").eq("user_id", user.id).eq("is_default", true).single(),
        supabase.from("user_review_counts").select("count").eq("user_id", user.id).eq("study_date", today).maybeSingle(),
      ]);

      const p = profileRes.data;
      const deckId = deckRes.data?.id;

      // Round 2: paginate deck_cards and user_scores in parallel
      const PAGE = 1000;
      const fetchAllDeckCards = async (): Promise<{ card_id: string }[]> => {
        if (!deckId) return [];
        const rows: { card_id: string }[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from("deck_cards")
            .select("card_id")
            .eq("deck_id", deckId)
            .order("card_id")
            .range(from, from + PAGE - 1);
          if (data) rows.push(...data);
          if (!data || data.length < PAGE) break;
        }
        return rows;
      };
      const fetchAllScores = async (): Promise<{ card_id: string; scores_json: any }[]> => {
        const rows: { card_id: string; scores_json: any }[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from("user_scores")
            .select("card_id, scores_json")
            .eq("user_id", user.id)
            .order("card_id")
            .range(from, from + PAGE - 1);
          if (data) rows.push(...data);
          if (!data || data.length < PAGE) break;
        }
        return rows;
      };
      const fetchJlptCards = async (): Promise<{ id: string; jlpt_level: JlptLevel | null }[]> => {
        if (!deckId) return [];
        const rows: { id: string; jlpt_level: JlptLevel | null }[] = [];
        for (let from = 0; ; from += PAGE) {
          const { data } = await supabase
            .from("master_cards")
            .select("id, jlpt_level, deck_cards!inner(deck_id)")
            .eq("deck_cards.deck_id", deckId)
            .order("id")
            .range(from, from + PAGE - 1);
          if (data) rows.push(...(data as unknown as { id: string; jlpt_level: JlptLevel | null }[]));
          if (!data || data.length < PAGE) break;
        }
        return rows;
      };

      const [deckCards, scoreRows, jlptCards] = await Promise.all([fetchAllDeckCards(), fetchAllScores(), fetchJlptCards()]);

      // Build score map
      const scoreMap = new Map(scoreRows.map((s) => [s.card_id, s.scores_json]));
      const deckSize = deckCards.length;

      // Per-level stats: total cards and mastered (≥5 tries, ≥70%) for breakdown UI and scores.
      const jlptStats: Record<JlptLevel, { total: number; mastered: number }> = {
        N5: { total: 0, mastered: 0 },
        N4: { total: 0, mastered: 0 },
        N3: { total: 0, mastered: 0 },
        N2: { total: 0, mastered: 0 },
        N1: { total: 0, mastered: 0 },
      };
      for (const card of jlptCards) {
        if (!card.jlpt_level || !(card.jlpt_level in jlptStats)) continue;
        const sc = scoreMap.get(card.id);
        const lvl = card.jlpt_level as JlptLevel;
        jlptStats[lvl].total++;
        const jpM = (sc?.jp_to_en?.total ?? 0) >= 5 && (sc?.jp_to_en?.percent ?? 0) >= 70;
        const enM = (sc?.en_to_jp?.total ?? 0) >= 5 && (sc?.en_to_jp?.percent ?? 0) >= 70;
        if (jpM || enM) jlptStats[lvl].mastered++;
      }

      // Vocab score: either jp or en mastered per N level (both directions count).
      let rawVocabScore = 0;
      for (const lvl of ["N5", "N4", "N3", "N2", "N1"] as JlptLevel[]) {
        rawVocabScore += Math.min(jlptStats[lvl].mastered / JLPT_VOCAB_INCREMENT[lvl], 1) * 20;
      }
      const vocabScore = Math.round(rawVocabScore);

      // Determine vocab N-level: highest N-level (N1 > N2 > … > N5) where mastery % is greatest.
      // A level qualifies only when you have ≥50% of its JLPT vocab target in your deck
      // (e.g. N5 needs ≥400 cards, N4 ≥350). Guards tiny-sample inflation. Falls back to N5.
      const NLEVEL_ORDER: JlptLevel[] = ["N1", "N2", "N3", "N4", "N5"];
      let vocabNLevel: JlptLevel = "N5";
      let bestRatio = -1;
      for (const lvl of NLEVEL_ORDER) {
        const { total, mastered } = jlptStats[lvl];
        if (total < Math.floor(JLPT_VOCAB_INCREMENT[lvl] / 2)) continue;
        const ratio = mastered / total;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          vocabNLevel = lvl;
        }
      }

      const profileUpdates: Record<string, number> = { vocab_score: vocabScore };

      let grammarScore = p?.grammar_score ?? null;
      if (!grammarScore) {
        const [{ data: allPatterns }, { data: allGrammarScores }] = await Promise.all([
          supabase.from("grammar_patterns").select("id, jlpt_level"),
          supabase.from("user_grammar_scores").select("pattern_id, total, percent").eq("user_id", user.id),
        ]);
        if (allGrammarScores && allGrammarScores.length > 0) {
          const gScoreMap = new Map(allGrammarScores.map(s => [s.pattern_id, { total: s.total, percent: s.percent }]));
          grammarScore = grammarPatternScore(allPatterns ?? [], gScoreMap);
          profileUpdates.grammar_score = grammarScore;
        }
      }

      supabase.from("profiles").update(profileUpdates).eq("id", user.id);

      const fresh: ProfileScores = {
        name: p?.full_name ?? null,
        streak: p?.streak_count ?? 0,
        max_streak: p?.max_streak ?? 0,
        daily_count: reviewRes.data?.count ?? 0,
        vocab_score: vocabScore,
        reading_score: p?.reading_score ?? null,
        listening_score: p?.listening_score ?? null,
        grammar_score: grammarScore,
        deck_size: deckSize,
        jlpt_stats: jlptStats,
        vocab_nlevel: vocabNLevel,
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

  const { name, streak, max_streak, daily_count } = data;
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
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{greeting}</p>
        <h1 className="text-2xl font-black text-slate-900 italic mt-0.5 leading-tight">
          {name || "Learner"} 👋
        </h1>
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
      {/* Section label */}
      <p className="px-5 pt-5 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        Your Skills
      </p>

      {/* 2×2 skill tiles */}
      <div className="px-4 grid grid-cols-2 gap-3">
        <ScoreTile href="/study"                    emoji="🃏" label="Vocabulary" score={data.vocab_score}     sub={`${data.deck_size.toLocaleString()} cards in deck`} nlevelOverride={data.vocab_nlevel} />
        <ScoreTile href="/quizzes?open=grammar"    emoji="📝" label="Grammar"    score={data.grammar_score}   />
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
              const floorPct = Math.round((total / floor) * 100);
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
      </div>
    </div>
  );
}
