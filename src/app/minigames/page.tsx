"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { supabase } from "@/lib/supabase";

const GAMES = [
  {
    id: "focus",
    href: "/minigames/focus",
    emoji: "🎯",
    name: "Color Focus",
    desc: "Swipe based on ink color, not the word. Pure focus, no vocab needed.",
    accent: "border-violet-600/40 hover:border-violet-500",
    badge: "bg-violet-500/10 text-violet-400",
  },
  {
    id: "type-hear",
    href: "/minigames/type-hear",
    emoji: "👂",
    name: "Listen & Pick",
    desc: "Hear a Japanese word. Pick the right English meaning from 4 options.",
    accent: "border-emerald-600/40 hover:border-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-400",
  },
  {
    id: "speed-match",
    href: "/minigames/speed-match",
    emoji: "⚡",
    name: "Speed Match",
    desc: "A Japanese word and English meaning flash up. Match or no match — decide fast.",
    accent: "border-amber-600/40 hover:border-amber-500",
    badge: "bg-amber-500/10 text-amber-400",
  },
  {
    id: "survival",
    href: "/minigames/survival",
    emoji: "💀",
    name: "Survival",
    desc: "Cards fall from above. Pick the right Japanese word before it hits the ground. 3 lives.",
    accent: "border-rose-600/40 hover:border-rose-500",
    badge: "bg-rose-500/10 text-rose-400",
  },
];

export default function MiniGamesMenu() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.push("/");
    });
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 shrink-0">
        <Link
          href="/stats"
          className="text-slate-400 hover:text-white transition-colors text-lg leading-none"
        >
          ←
        </Link>
        <span className="font-black text-[11px] uppercase tracking-widest text-slate-400">
          Mini Games
        </span>
      </div>

      <div className="flex-1 p-5 max-w-xl mx-auto w-full flex flex-col gap-3 pt-6">
        <h1 className="text-white font-black text-2xl mb-2">Choose a Game</h1>

        {GAMES.map((game, i) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <Link href={game.href}>
              <div
                className={`bg-slate-800 border-2 ${game.accent} rounded-3xl p-5 active:scale-[0.98] transition-all cursor-pointer flex items-start gap-4`}
              >
                <span className={`text-3xl shrink-0 mt-0.5 rounded-2xl p-2 ${game.badge}`}>
                  {game.emoji}
                </span>
                <div className="min-w-0">
                  <h2 className="text-white font-black text-base leading-tight">{game.name}</h2>
                  <p className="text-slate-400 text-sm leading-relaxed mt-1">{game.desc}</p>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
