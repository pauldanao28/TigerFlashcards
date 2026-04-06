"use client";
import { useLang } from "@/context/LanguageContext";

export default function CoachMarks({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useLang();

  return (
    <div
      onClick={onDismiss}
      /* 1. h-full w-full: Forces it to stay EXACTLY the same size as the parent card container.
         2. bg-slate-900/10: Very light overlay so it's not too dark.
         3. pointer-events-auto: Allows the click to dismiss.
      */
      className="absolute top-0 left-0 h-full w-full z-40 bg-slate-900/10 rounded-[2.5rem] flex flex-col justify-between p-8 pointer-events-auto animate-in fade-in duration-300 border-4 border-transparent overflow-hidden"
    >
      {/* Top Section */}
      <div className="text-center mt-2">
        <p className="bg-slate-800 text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest shadow-xl inline-block border border-white/10">
          {t.how_to_study}
        </p>
      </div>

      {/* Middle Section (The Arrows) */}
      <div className="flex justify-between items-center w-full px-2 mb-4">
        <div className="flex flex-col items-center gap-1 animate-pulse">
          <span className="text-5xl text-rose-500 drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]">
            ←
          </span>
          <span className="text-[9px] font-black text-white bg-rose-600 px-2.5 py-1 rounded-md uppercase tracking-tighter shadow-lg">
            {t.forgot}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 animate-pulse">
          <span className="text-5xl text-emerald-500 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
            →
          </span>
          <span className="text-[9px] font-black text-white bg-emerald-600 px-2.5 py-1 rounded-md uppercase tracking-tighter shadow-lg">
            {t.know_it}
          </span>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="text-center mb-2">
        <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-2xl inline-block border border-white/10">
          <p className="text-white font-black text-[10px] uppercase tracking-widest">
            {t.swipe_to_start}
          </p>
        </div>
      </div>
    </div>
  );
}
