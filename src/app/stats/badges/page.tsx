"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { BADGES } from "@/lib/badges";
import LoadingScreen from "@/components/LoadingScreen";

export default function BadgesPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [earnedBadges, setEarnedBadges] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setSignedIn(true);

      // Re-checks (not just reads) — a cheap idempotent RPC, in case this page
      // loads before the other check-and-award call sites (Dashboard, StudyView) do.
      const [{ error: awardError }, { data, error: fetchError }] = await Promise.all([
        supabase.rpc("check_and_award_badges"),
        supabase.from("user_badges").select("badge_key").eq("user_id", user.id),
      ]);
      if (awardError) console.error("Error checking badges:", awardError.message);
      if (fetchError) console.error("Error fetching badges:", fetchError.message);
      setEarnedBadges(new Set((data ?? []).map((b) => b.badge_key)));
      setLoading(false);
    })();
  }, []);

  if (loading) return <LoadingScreen />;

  if (!signedIn) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-slate-500 font-bold mb-4">Sign in to see your badges.</p>
          <Link href="/" className="text-indigo-600 font-black text-sm">← Back home</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans overflow-x-hidden">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl md:text-3xl font-black text-slate-800 flex items-center gap-3">
            🏅 Badges <span className="text-slate-300 text-lg md:text-xl">· {earnedBadges.size}/{BADGES.length}</span>
          </h1>
          <Link
            href="/stats"
            className="bg-white px-5 py-2.5 rounded-xl shadow-sm font-bold text-indigo-600 border border-slate-100 flex items-center gap-2 hover:bg-slate-50 transition-all active:scale-95"
          >
            ← Back
          </Link>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {BADGES.map((badge) => {
            const earned = earnedBadges.has(badge.key);
            return (
              <div
                key={badge.key}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all ${
                  earned
                    ? "bg-white border-slate-100 shadow-sm"
                    : "bg-slate-50 border-slate-100 opacity-40 grayscale"
                }`}
              >
                <span className="text-2xl">{badge.icon}</span>
                <span className="text-[9px] font-black uppercase tracking-tight text-slate-600 leading-tight">
                  {badge.name}
                </span>
                <span className="text-[8px] text-slate-400 font-medium leading-tight">
                  {badge.description}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
