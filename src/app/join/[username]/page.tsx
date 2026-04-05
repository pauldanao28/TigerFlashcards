"use client";

import { useEffect, use } from "react";
import { useRouter } from "next/navigation";

interface JoinProps {
  params: Promise<{ username: string }>;
}

export default function JoinPage({ params }: JoinProps) {
  const router = useRouter();

  // Unwrap the promise for Next.js 16/React 19
  const resolvedParams = use(params);
  const username = resolvedParams.username;
  const referrerName = decodeURIComponent(username);

  useEffect(() => {
    if (referrerName) {
      // Store the referrer name for the Auth page to read
      localStorage.setItem("tg_referrer", referrerName);

      // Snappy redirect: 800ms is enough to read the name
      const timer = setTimeout(() => {
        router.push("/login"); // or wherever your Auth.tsx is located
      }, 800);

      return () => clearTimeout(timer);
    }
  }, [referrerName, router]);

  return (
    <div className="fixed inset-0 h-[100dvh] w-full bg-slate-50 flex flex-col items-center justify-center p-4 overflow-hidden overscroll-none">
      {/* Centered Card matching Auth.tsx style */}
      <div className="w-full max-w-md bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
        {/* Logo/Brand */}
        <h1 className="text-2xl font-black text-slate-800 mb-8 text-center italic uppercase tracking-tighter">
          FlashKado
        </h1>

        <div className="w-full space-y-6 text-center">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-300">
              You've been invited by
            </p>
            <p className="text-3xl font-black text-indigo-600 italic uppercase tracking-tight">
              {referrerName}
            </p>
          </div>

          {/* Animated Loading Element */}
          <div className="flex flex-col items-center gap-4 pt-4">
            <div className="w-12 h-1 bg-slate-100 rounded-full overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-indigo-500 w-1/2 animate-[loading_1s_ease-in-out_infinite]" />
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 animate-pulse">
              Preparing your circle...
            </p>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes loading {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(200%);
          }
        }
      `}</style>
    </div>
  );
}
