"use client";

import { AnimatePresence, motion } from "framer-motion";
import ShareButton from "@/components/ShareButton";
import type { ExtraCelebration } from "@/lib/celebrations";

// Fullscreen celebrations share a single visual slot and always show
// Share / Continue. Image generation remains inside ShareButton's tap handler.
export default function AchievementCelebration({
  achievement,
  onContinue,
}: {
  achievement: ExtraCelebration | null;
  onContinue: () => void;
}) {
  if (!achievement) return null;

  let emoji = "🎉";
  let title = "";
  let subtitle = "";
  let params: Record<string, string | number> = {};
  let caption = "";

  switch (achievement.kind) {
    case "reviewed":
      emoji = "🔁";
      title = "100 Reviewed Today!";
      subtitle = "Every attempt counts — including the hard ones.";
      params = { kind: "reviews" };
      caption = "🔁 I reviewed 100 Japanese cards today on FlashKado! Join me:";
      break;
    case "mastered":
      emoji = "⭐";
      title = "20 Mastered Today!";
      subtitle = "20 cards reached mastery today.";
      params = { kind: "mastered_today" };
      caption = "⭐ I mastered 20 Japanese cards today on FlashKado! Join me:";
      break;
    case "streak":
      emoji = "🔥";
      title = `${achievement.count}-Day Streak!`;
      subtitle = "A major consistency milestone.";
      params = { kind: "streak" };
      caption = `🔥 I reached a ${achievement.count}-day streak on FlashKado! Join me:`;
      break;
    case "jlpt":
      emoji = "🏆";
      title = `${achievement.level} Milestone!`;
      subtitle = `You've earned the ${achievement.level} vocabulary badge.`;
      params = { kind: "jlpt_badge", level: achievement.level };
      caption = `🏆 I earned the ${achievement.level} vocabulary badge on FlashKado! Join me:`;
      break;
  }

  return (
    <AnimatePresence>
      <motion.div
        key={`celebration-${achievement.kind}-${achievement.kind === "jlpt" ? achievement.level : achievement.count}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6"
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 36 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 flex flex-col items-center gap-6 shadow-2xl text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 14, delay: 0.1 }}
            className="text-6xl"
          >
            {emoji}
          </motion.div>
          <div>
            <p className="text-2xl font-black text-slate-900">{title}</p>
            <p className="text-xs font-semibold text-slate-500 mt-2">{subtitle}</p>
          </div>
          <div className="w-full flex flex-col gap-3">
            <ShareButton
              params={params}
              caption={caption}
              className="bg-indigo-600 text-white shadow-lg shadow-indigo-200"
            />
            <button
              type="button"
              onClick={onContinue}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
            >
              Continue
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
