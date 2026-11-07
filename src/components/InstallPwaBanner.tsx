"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

const DISMISS_KEY = "pwa_install_dismissed";

// Mounted once in the root layout, signed-in only. There was previously no nudge
// anywhere to install this as a PWA or enable notifications — on iOS specifically,
// Web Push literally doesn't work at all in a plain Safari tab, only after "Add to
// Home Screen", so anyone who never installed was structurally unreachable by any of
// the push-based reminders (streak-reminder, etc.) no matter what they'd have chosen
// if asked. iOS has no programmatic install trigger (no beforeinstallprompt event),
// so that platform gets an instructional banner instead of an Install button.
export default function InstallPwaBanner() {
  const { user } = useAuth();
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt?: () => void; userChoice?: Promise<unknown> } | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {}

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      setPlatform("ios");
      setDismissed(false);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt?: () => void; userChoice?: Promise<unknown> });
      setPlatform("android");
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferredPrompt?.prompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    dismiss();
  };

  if (!user || dismissed || !platform) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-[190] bg-slate-900 text-white rounded-2xl p-4 shadow-2xl flex items-center gap-3"
      style={{ marginBottom: "env(safe-area-inset-bottom)" }}
    >
      <span className="text-2xl shrink-0">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest">Install FlashKado</p>
        <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
          {platform === "ios"
            ? 'Tap the Share icon, then "Add to Home Screen" — needed for reminders to work.'
            : "Add it to your home screen for the full app experience and reminders."}
        </p>
      </div>
      {platform === "android" && (
        <button
          onClick={install}
          className="shrink-0 bg-indigo-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
        >
          Install
        </button>
      )}
      <button onClick={dismiss} className="shrink-0 text-slate-400 hover:text-white text-lg leading-none px-1">
        ✕
      </button>
    </div>
  );
}
