"use client";
import { useLang } from "@/context/LanguageContext";

export default function LoadingScreen() {
  const { t } = useLang();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-6">
      {/* Animated Icon Container */}
      <div className="relative">
        <div className="absolute inset-0 bg-orange-500/20 blur-3xl rounded-full animate-pulse" />
        <span className="relative inline-block text-6xl animate-bounce">
          🔥
        </span>
      </div>

      {/* Text with high-end typography */}
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-slate-900 font-black text-2xl uppercase tracking-tighter italic">
          {t.loading}
        </h2>
        {/* Modern thin progress bar */}
        <div className="w-48 h-1 bg-slate-200 rounded-full overflow-hidden">
          <div className="w-full h-full bg-gradient-to-r from-orange-500 to-red-600 animate-shimmer" />
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite linear;
        }
      `}</style>
    </div>
  );
}
