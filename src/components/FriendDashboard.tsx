"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { JLPT_VOCAB_INCREMENT } from "@/lib/scoring";
import { ALLOWED_PARTS_OF_SPEECH } from "@/lib/textNormalize";
import LoadingScreen from "@/components/LoadingScreen";

type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

interface FriendDashboardData {
  name: string | null;
  avatar_url: string | null;
  streak: number;
  max_streak: number;
  stats_hidden: boolean;
  daily_count?: number;
  mastered_today?: number;
  still_learning?: number;
  vocab_score?: number | null;
  reading_score?: number | null;
  listening_score?: number | null;
  grammar_score?: number | null;
  deck_size?: number;
  jlpt_stats?: Record<JlptLevel, { total: number; mastered: number }>;
  pos_stats?: Record<string, { total: number; mastered: number }>;
  vocab_nlevel?: JlptLevel;
  done_today_quizzes?: { reading: boolean; listening: boolean; grammar: boolean };
}

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

function ScoreTile({ emoji, label, score, sub }: { emoji: string; label: string; score: number | null | undefined; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg">{emoji}</span>
        <span className="text-xl font-black text-slate-800 tabular-nums">
          {score ?? "—"}{score != null ? "%" : ""}
        </span>
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      {sub && <p className="text-[9px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Read-only friend profile view — same JLPT-by-level/mastery breakdown as your own
// Dashboard, but never writes anything (no quiz-launch CTAs, no tap-to-filter-study
// interactions) since it's someone else's account. Privacy-gated server-side by
// get_friend_dashboard_data: friendship is required, and stats_visible_to_friends
// hides everything below the streak/N-level if the friend has turned it off.
export default function FriendDashboard({ friendId }: { friendId: string }) {
  const [data, setData] = useState<FriendDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const today = new Date().toLocaleDateString("en-CA");
    supabase
      .rpc("get_friend_dashboard_data", { p_friend_id: friendId, p_today: today })
      .then(({ data: raw, error: err }) => {
        if (cancelled) return;
        if (err) {
          console.error("[friend dashboard]", err.code, err.message);
          setError("Couldn't load this profile.");
        } else if (!raw) {
          setError("You're not friends with this person, or they don't exist.");
        } else {
          setData(raw as FriendDashboardData);
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [friendId]);

  if (loading) return <LoadingScreen />;

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-slate-400 font-bold text-sm">{error ?? "Couldn't load this profile."}</p>
        <Link href="/" className="text-indigo-600 font-black text-xs uppercase tracking-widest">← Back home</Link>
      </div>
    );
  }

  const avatarUrl = data.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${friendId}`;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <div className="bg-white border-b border-slate-100 px-5 py-4 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-0.5 text-slate-400 hover:text-slate-700 active:scale-90 transition-all">
          <ChevronLeft size={16} />
          <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
        </Link>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Friend Profile</p>
      </div>

      <div className="max-w-2xl mx-auto px-5 pt-6">
        <div className="flex items-center gap-4 mb-6">
          <img
            src={avatarUrl}
            alt={data.name ?? "Friend"}
            className="w-16 h-16 rounded-full border-2 border-slate-100 object-cover"
          />
          <div>
            <p className="text-lg font-black uppercase italic text-slate-800 leading-tight">{data.name ?? "Friend"}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {data.vocab_nlevel && (
                <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 uppercase tracking-widest">
                  {data.vocab_nlevel}
                </span>
              )}
              {data.streak > 0 && (
                <span className="text-[10px] font-bold text-orange-500 flex items-center gap-0.5">🔥 {data.streak} day streak</span>
              )}
              {data.max_streak > 0 && (
                <span className="text-[10px] font-bold text-slate-400">Best: {data.max_streak}</span>
              )}
            </div>
          </div>
        </div>

        {data.stats_hidden ? (
          <div className="py-10 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <p className="text-2xl mb-2">🔒</p>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Locked</p>
            <p className="text-xs text-slate-400 mt-1">{data.name ?? "This person"} has hidden their detailed progress.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <ScoreTile emoji="🃏" label="Vocabulary" score={data.vocab_score} sub={`${(data.deck_size ?? 0).toLocaleString()} cards in deck`} />
              <ScoreTile emoji="📝" label="Grammar" score={data.grammar_score} />
              <ScoreTile emoji="📖" label="Reading" score={data.reading_score} />
              <ScoreTile emoji="🎧" label="Listening" score={data.listening_score} />
            </div>

            {(data.deck_size ?? 0) > 0 && data.jlpt_stats && (
              <div className="mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vocabulary by Level</p>
                  <p className="text-[10px] font-black text-slate-400">{(data.deck_size ?? 0).toLocaleString()} cards</p>
                </div>
                <div className="space-y-3.5">
                  {(["N5", "N4", "N3", "N2", "N1"] as const).map((level) => {
                    const { total, mastered } = data.jlpt_stats![level];
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

            {(data.deck_size ?? 0) > 0 && data.pos_stats && (
              <div className="mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Vocabulary by Part of Speech</p>
                <div className="flex gap-2 flex-wrap">
                  {ALLOWED_PARTS_OF_SPEECH.map((pos) => {
                    const { total, mastered } = data.pos_stats![pos] ?? { total: 0, mastered: 0 };
                    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
                    return (
                      <span
                        key={pos}
                        className="relative overflow-hidden px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200 bg-slate-50 text-slate-600"
                      >
                        <span aria-hidden className="absolute inset-y-0 left-0 bg-indigo-200" style={{ width: `${pct}%` }} />
                        <span className="relative">{pos} · {pct}%</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-3 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Today</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-black text-slate-800 tabular-nums">{data.daily_count ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Reviews</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800 tabular-nums">{data.mastered_today ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Mastered</p>
                </div>
                <div>
                  <p className="text-xl font-black text-slate-800 tabular-nums">{data.still_learning ?? 0}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Still Learning</p>
                </div>
              </div>
              <div className="flex items-center justify-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${data.done_today_quizzes?.reading ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  📖 {data.done_today_quizzes?.reading ? "✓" : "·"}
                </span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${data.done_today_quizzes?.listening ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  🎧 {data.done_today_quizzes?.listening ? "✓" : "·"}
                </span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black border ${data.done_today_quizzes?.grammar ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-400"}`}>
                  📝 {data.done_today_quizzes?.grammar ? "✓" : "·"}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
