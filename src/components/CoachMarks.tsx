export default function CoachMarks({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      // CHANGED: Removed backdrop-blur, lowered background opacity for clarity
      className="absolute inset-0 z-40 bg-slate-900/10 rounded-3xl flex flex-col justify-between p-8 pointer-events-none animate-in fade-in duration-300"
    >
      {/* Top Section */}
      <div className="text-center">
        <p className="bg-slate-800 text-white px-5 py-2 rounded-full text-[10px] font-black tracking-widest shadow-xl inline-block border border-slate-700/50">
          HOW TO STUDY
        </p>
      </div>

      {/* Middle: Arrows - Sharp High Contrast */}
      <div className="flex justify-between items-center w-full px-4">
        <div className="flex flex-col items-center gap-1 animate-pulse">
          <span className="text-5xl text-rose-500 drop-shadow-[0_2px_10px_rgba(244,63,94,0.4)]">
            ←
          </span>
          <span className="text-[9px] font-black text-white bg-rose-600 px-2.5 py-1 rounded-md uppercase tracking-tighter shadow-lg">
            Forgot
          </span>
        </div>

        <div className="flex flex-col items-center gap-1 animate-pulse">
          <span className="text-5xl text-emerald-500 drop-shadow-[0_2px_10px_rgba(16,185,129,0.4)]">
            →
          </span>
          <span className="text-[9px] font-black text-white bg-emerald-600 px-2.5 py-1 rounded-md uppercase tracking-tighter shadow-lg">
            Know it!
          </span>
        </div>
      </div>

      {/* Bottom: Instruction */}
      <div className="text-center">
        <div className="bg-slate-900/80 backdrop-blur-sm px-4 py-2 rounded-2xl inline-block border border-white/10">
          <p className="text-white font-black text-xs uppercase tracking-widest">
            Swipe the card to start
          </p>
        </div>
      </div>
    </div>
  );
}
