export default function CoachMarks({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div
      onClick={onDismiss}
      className="absolute inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] rounded-3xl flex flex-col justify-between p-8 pointer-events-none animate-in fade-in duration-500"
    >
      {/* Top Section */}
      <div className="text-center">
        <p className="bg-white/90 text-slate-800 px-4 py-2 rounded-full text-xs font-bold shadow-lg inline-block">
          HOW TO STUDY
        </p>
      </div>

      {/* Middle: Arrows */}
      <div className="flex justify-between items-center w-full">
        <div className="flex flex-col items-center gap-2 animate-pulse">
          <span className="text-4xl text-rose-500">←</span>
          <span className="text-[10px] font-black text-rose-600 bg-white/80 px-2 py-1 rounded uppercase">
            Forgot
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 animate-pulse">
          <span className="text-4xl text-emerald-500">→</span>
          <span className="text-[10px] font-black text-emerald-600 bg-white/80 px-2 py-1 rounded uppercase">
            Know it!
          </span>
        </div>
      </div>

      {/* Bottom: Instruction */}
      <div className="text-center">
        <p className="text-white font-bold text-sm drop-shadow-md">
          Swipe the card to start
        </p>
      </div>
    </div>
  );
}
