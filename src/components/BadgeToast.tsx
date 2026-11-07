"use client";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BADGE_BY_KEY } from "@/lib/badges";

// One badge at a time, auto-advancing — check_and_award_badges can return several
// at once (e.g. the first load after this feature ships, someone might instantly
// qualify for 3), and a stacked pile of toasts would be more disruptive than a
// quick one-at-a-time queue. Self-contained (own timer), unlike SocialToast whose
// timer lives in useFriends — badges are earned from two separate call sites
// (StudyView, Dashboard), so a shared context isn't worth it for v1.
export default function BadgeToast({
  queue,
  onAdvance,
}: {
  queue: string[];
  onAdvance: () => void;
}) {
  const current = queue[0] ?? null;
  const badge = current ? BADGE_BY_KEY[current] : null;

  useEffect(() => {
    if (!badge) return;
    const t = setTimeout(onAdvance, 3500);
    return () => clearTimeout(t);
  }, [badge, onAdvance]);

  return (
    <AnimatePresence>
      {badge && (
        <motion.div
          key={badge.key}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={onAdvance}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[260] flex items-center gap-3 bg-slate-900 text-white pl-3.5 pr-5 py-3 rounded-2xl shadow-2xl active:scale-95 transition-transform max-w-[90vw] cursor-pointer"
        >
          <span className="text-2xl shrink-0">{badge.icon}</span>
          <span className="text-xs font-bold text-left">
            <span className="block text-[9px] font-black uppercase tracking-widest text-amber-300">Badge Earned</span>
            <span className="font-black">{badge.name}</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
