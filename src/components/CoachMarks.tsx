"use client";
import { useLang } from "@/context/LanguageContext";

export default function CoachMarks() {
  // Removed onDismiss prop if not used here
  const { t } = useLang();

  return (
    <div
      /* This container now just HOLDS the labels. 
         Everything inside is pointer-events-none so it's a total "ghost" overlay.
      */
      className="absolute inset-0 z-40 flex flex-col justify-between p-8 pointer-events-none animate-in fade-in duration-300 overflow-hidden"
    >
      {/* ❌ REMOVED the absolute invisible div with pointer-events-auto */}

      {/* --- CONTENT --- */}
      <div className="text-center mt-2 relative z-10">
        <p className="bg-slate-800 text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest shadow-xl inline-block border border-white/10">
          {t.how_to_study}
        </p>
      </div>

      <div className="flex justify-between items-center w-full px-2 mb-4 relative z-10">
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

      <div className="text-center mb-2 relative z-10">
        <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-2xl inline-block border border-white/10">
          <p className="text-white font-black text-[10px] uppercase tracking-widest">
            {t.swipe_to_start}
          </p>
        </div>
      </div>
    </div>
  );
}
