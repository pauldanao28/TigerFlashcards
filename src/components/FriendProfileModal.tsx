"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { jlptLevel } from "@/lib/scoring";

interface FriendProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  streak_count: number | null;
  max_streak: number | null;
  vocab_score: number | null;
  grammar_score: number | null;
  reading_score: number | null;
  listening_score: number | null;
  stats_hidden: boolean;
}

const SkillBar = ({ label, score }: { label: string; score: number | null }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-[10px] font-black text-slate-600">{score ?? "—"}</span>
    </div>
    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${score ?? 0}%` }} />
    </div>
  </div>
);

export const FriendProfileModal = ({ friendId, onClose }: { friendId: string; onClose: () => void }) => {
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc("get_friend_profile", { p_friend_id: friendId })
      .then(({ data, error }: { data: FriendProfile[] | null; error: { message: string } | null }) => {
        if (error) console.error("get_friend_profile failed:", error.message);
        if (!cancelled) {
          setProfile(data?.[0] ?? null);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [friendId]);

  const scores = profile
    ? [profile.vocab_score, profile.grammar_score, profile.reading_score, profile.listening_score].filter((s): s is number => s != null)
    : [];
  // No activity yet defaults to N5, same as the Dashboard's own overall-level badge.
  // Shown regardless of stats_hidden — that toggle only hides the detailed breakdown below.
  const nLevel = profile ? jlptLevel(scores.length > 0 ? Math.min(...scores) : 0) : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[210] cursor-pointer"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      >
        <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-xs font-black uppercase tracking-widest text-slate-800">Friend Profile</h2>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
              <X size={14} />
            </button>
          </div>

          {loading ? (
            <div className="p-10 text-center text-slate-400 text-xs font-bold">Loading…</div>
          ) : !profile ? (
            <div className="p-10 text-center text-slate-400 text-xs font-bold">Couldn't load this profile.</div>
          ) : (
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <img
                  src={profile.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.id}`}
                  alt={profile.full_name}
                  className="w-16 h-16 rounded-full border-2 border-slate-100 object-cover"
                />
                <div>
                  <p className="text-lg font-black uppercase italic text-slate-800 leading-tight">{profile.full_name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    {nLevel && (
                      <span className="text-[9px] font-black px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-600 uppercase tracking-widest">
                        {nLevel}
                      </span>
                    )}
                    {(profile.streak_count ?? 0) > 0 && (
                      <span className="text-[10px] font-bold text-orange-500 flex items-center gap-0.5">
                        🔥 {profile.streak_count} day streak
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {profile.stats_hidden ? (
                <div className="py-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-lg mb-1">🔒</p>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Locked</p>
                  <p className="text-[10px] text-slate-400 mt-1">{profile.full_name} has hidden their detailed progress.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <SkillBar label="Vocab" score={profile.vocab_score} />
                  <SkillBar label="Grammar" score={profile.grammar_score} />
                  <SkillBar label="Reading" score={profile.reading_score} />
                  <SkillBar label="Listening" score={profile.listening_score} />
                  {(profile.max_streak ?? 0) > 0 && (
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest pt-2 border-t border-slate-100">
                      Best streak: {profile.max_streak} days
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
};
