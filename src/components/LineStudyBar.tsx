"use client";
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";

export const STUDY_RATES = [0.5, 0.75, 1] as const;
export type StudyRate = (typeof STUDY_RATES)[number];

/**
 * Line-by-line study controls shared by Watch (caption lines of a YouTube video) and the
 * Reader (sentences read aloud): previous / play-pause / next / repeat line, auto-pause
 * after each line, and playback speed. Each screen supplies what the buttons do.
 */
export default function LineStudyBar({
  playing,
  onPlayPause,
  onPrev,
  onNext,
  onRepeat,
  autoPause,
  onToggleAutoPause,
  rate,
  onRate,
  position,
  unit = "line",
  disabled = false,
  lineControls = true,
}: {
  playing: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRepeat: () => void;
  autoPause: boolean;
  onToggleAutoPause: () => void;
  rate: StudyRate;
  onRate: (r: StudyRate) => void;
  position?: { index: number; total: number }; // 0-based index; shown as "Line 3 / 20"
  unit?: "line" | "sentence";
  disabled?: boolean;
  lineControls?: boolean; // false → only play/pause and speed (e.g. Watch with no transcript)
}) {
  const label = unit === "line" ? "Line" : "Sentence";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          onClick={onPrev}
          disabled={disabled || !lineControls}
          aria-label={`Previous ${unit}`}
          className="w-10 h-10 shrink-0 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
        >
          <SkipBack size={16} />
        </button>
        <button
          onClick={onPlayPause}
          disabled={disabled}
          aria-label={playing ? "Pause" : "Play"}
          className="w-11 h-11 shrink-0 rounded-2xl bg-indigo-600 text-white flex items-center justify-center active:scale-90 transition-all shadow-md shadow-indigo-200 disabled:opacity-40"
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={onNext}
          disabled={disabled || !lineControls}
          aria-label={`Next ${unit}`}
          className="w-10 h-10 shrink-0 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
        >
          <SkipForward size={16} />
        </button>
        <button
          onClick={onRepeat}
          disabled={disabled || !lineControls}
          aria-label={`Repeat ${unit}`}
          className="w-10 h-10 shrink-0 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 transition-all disabled:opacity-40"
        >
          <RotateCcw size={15} />
        </button>
        {position && position.total > 0 && (
          <span className="ml-auto text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">
            {label} {Math.max(position.index + 1, 1)} / {position.total}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={onToggleAutoPause}
          disabled={!lineControls}
          aria-pressed={autoPause}
          className={`h-8 px-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${autoPause ? "bg-indigo-50 text-indigo-600 border border-indigo-200" : "bg-slate-100 text-slate-500 border border-transparent"} disabled:opacity-40`}
        >
          Pause each {unit}
        </button>
        <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5">
          {STUDY_RATES.map((r) => (
            <button
              key={r}
              onClick={() => onRate(r)}
              aria-pressed={rate === r}
              className={`h-7 px-2 rounded-lg text-[10px] font-black transition-colors ${rate === r ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
