"use client";
import { motion } from "framer-motion";

const CONFETTI_PARTICLES = [
  { color: "#6366f1", left: 8,  delay: 0,    drift: -40, h: 10, w: 10, round: true  },
  { color: "#f59e0b", left: 18, delay: 0.1,  drift: 35,  h: 6,  w: 12, round: false },
  { color: "#10b981", left: 28, delay: 0.25, drift: -20, h: 8,  w: 8,  round: true  },
  { color: "#f43f5e", left: 38, delay: 0.05, drift: 50,  h: 6,  w: 10, round: false },
  { color: "#3b82f6", left: 50, delay: 0.2,  drift: -55, h: 10, w: 6,  round: false },
  { color: "#8b5cf6", left: 60, delay: 0.15, drift: 25,  h: 6,  w: 8,  round: true  },
  { color: "#f59e0b", left: 70, delay: 0.3,  drift: -30, h: 8,  w: 8,  round: false },
  { color: "#6366f1", left: 80, delay: 0.1,  drift: 45,  h: 6,  w: 6,  round: true  },
  { color: "#10b981", left: 90, delay: 0.2,  drift: -50, h: 10, w: 6,  round: true  },
  { color: "#f43f5e", left: 13, delay: 0.35, drift: 60,  h: 6,  w: 10, round: false },
  { color: "#3b82f6", left: 33, delay: 0.08, drift: -65, h: 8,  w: 8,  round: true  },
  { color: "#8b5cf6", left: 55, delay: 0.22, drift: 30,  h: 6,  w: 6,  round: false },
  { color: "#f43f5e", left: 43, delay: 0.18, drift: -45, h: 8,  w: 6,  round: true  },
  { color: "#6366f1", left: 75, delay: 0.28, drift: 55,  h: 6,  w: 10, round: false },
];

const LEVEL_EMOJI: Record<string, string> = {
  N5: "🌱", N4: "🌿", N3: "⚡", N2: "🔥", N1: "🏆",
};

const LEVEL_NAME: Record<string, string> = {
  N5: "Beginner", N4: "Learner", N3: "Intermediate", N2: "Advanced", N1: "Expert",
};

const QUIZ_ACCENT: Record<string, string> = {
  reading: "bg-indigo-600 shadow-indigo-200",
  listening: "bg-sky-600 shadow-sky-200",
  grammar: "bg-violet-600 shadow-violet-200",
};

const QUIZ_GLOW: Record<string, string> = {
  reading: "from-indigo-50/70",
  listening: "from-sky-50/70",
  grammar: "from-violet-50/70",
};

interface LevelUpModalProps {
  from: string;
  to: string;
  quizType: "reading" | "listening" | "grammar";
  onDismiss: () => void;
}

export default function LevelUpModal({ from, to, quizType, onDismiss }: LevelUpModalProps) {
  const accent = QUIZ_ACCENT[quizType];
  const glow = QUIZ_GLOW[quizType];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      {/* Confetti */}
      {CONFETTI_PARTICLES.map((c, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{ backgroundColor: c.color, width: c.w, height: c.h, borderRadius: c.round ? "50%" : "2px", left: `${c.left}%`, top: -16 }}
          initial={{ y: -16, opacity: 1, rotate: 0 }}
          animate={{ y: "105vh", x: c.drift, opacity: [1, 1, 0.6, 0], rotate: 400 }}
          transition={{ duration: 2.2, delay: c.delay, ease: [0.2, 0.8, 0.6, 1] }}
        />
      ))}

      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-lg"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        onClick={onDismiss}
      />

      {/* Card */}
      <motion.div
        className="relative z-10 bg-white rounded-[3rem] px-10 py-10 text-center max-w-xs w-full shadow-2xl overflow-hidden"
        initial={{ scale: 0.6, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 24, delay: 0.05 }}
      >
        <div className={`absolute inset-0 bg-gradient-to-b ${glow} to-transparent pointer-events-none`} />

        <motion.div
          className="text-6xl mb-4 select-none"
          initial={{ scale: 0, rotate: -15 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.15 }}
        >
          🎉
        </motion.div>

        <motion.p
          className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          Level Up!
        </motion.p>

        <motion.div
          className="flex items-center justify-center gap-3 mb-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35 }}
        >
          <span className="text-xl font-black text-slate-300">{from}</span>
          <span className="text-slate-200 text-lg">→</span>
          <span className="text-5xl font-black text-slate-900">{to}</span>
        </motion.div>

        <motion.p
          className="text-2xl mb-1 select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          {LEVEL_EMOJI[to]}
        </motion.p>
        <motion.p
          className="text-lg font-black text-slate-800 mb-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.33, duration: 0.3 }}
        >
          {LEVEL_NAME[to]}
        </motion.p>
        <motion.p
          className="text-sm text-slate-400 font-medium mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.38, duration: 0.3 }}
        >
          You&apos;ve advanced to the next level — keep going!
        </motion.p>

        <motion.button
          onClick={onDismiss}
          className={`w-full ${accent} text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all shadow-lg`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.44, duration: 0.3 }}
          whileTap={{ scale: 0.96 }}
        >
          See Results →
        </motion.button>
      </motion.div>
    </div>
  );
}
