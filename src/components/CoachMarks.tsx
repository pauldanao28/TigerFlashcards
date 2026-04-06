"use client";
import { useLang } from "@/context/LanguageContext";

export default function CoachMarks({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useLang();

  return (
    <div
      onClick={onDismiss}
      /* THE FIX: 
         - absolute inset-0: Puts it exactly in the corners of the 3/4 box.
         - max-h-full: Prevents it from ever being taller than that box.
         - overflow-hidden: Extra insurance.
      */
      className="absolute inset-0 z-[60] bg-slate-900/10 rounded-[2.5rem] flex flex-col justify-between p-6 sm:p-8 pointer-events-auto animate-in fade-in duration-300 overflow-hidden max-h-full"
    >
      {/* Top Section */}
      <div className="text-center mt-2 flex-shrink-0">
        <p className="bg-slate-800 text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest shadow-xl inline-block border border-white/10">
          {t.how_to_study}
        </p>
      </div>

      {/* Middle Section - Using flex-1 to keep arrows centered in whatever space is left */}
      <div className="flex justify-between items-center w-full px-2 flex-1">
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
      <div className="text-center mb-2 flex-shrink-0">
        <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-2xl inline-block border border-white/10">
          <p className="text-white font-black text-[10px] uppercase tracking-widest">
            {t.swipe_to_start}
          </p>
        </div>
      </div>
    </div>
  );
}
