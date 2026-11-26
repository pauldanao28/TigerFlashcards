"use client";
import { useEffect, useState } from "react";

const UPDATED_KEY = "flashkado-updated-from";

// Detect deployments without interrupting an active study session.
// A small toast appears only after the new version has actually loaded.
export default function SilentAppUpdater({ initialVersion }: { initialVersion: string }) {
  const [showUpdated, setShowUpdated] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!initialVersion || initialVersion === "development") return;

    const previous = sessionStorage.getItem(UPDATED_KEY);
    if (previous && previous !== initialVersion) {
      sessionStorage.removeItem(UPDATED_KEY);
      setShowUpdated(true);
    } else if (previous === initialVersion) {
      sessionStorage.removeItem(UPDATED_KEY);
    }
  }, [initialVersion]);

  useEffect(() => {
    if (!showUpdated) return;
    const timeout = window.setTimeout(() => setShowUpdated(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [showUpdated]);

  useEffect(() => {
    if (!initialVersion || initialVersion === "development") return;
    let checking = false;
    let disposed = false;

    async function check() {
      if (checking || !navigator.onLine) return;
      checking = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = await response.json();
        if (!disposed && version && version !== "development" && version !== initialVersion) setUpdateAvailable(true);
      } catch { /* Retry on the next focus or check. */ }
      finally { checking = false; }
    }

    function onVisibility() {
      // Sharing text via Android hides the PWA briefly. Never reload on that
      // transition: it interrupts the Cards view and active Study sessions.
      if (document.visibilityState === "visible") void check();
    }

    void check();
    const interval = window.setInterval(check, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", check);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", check);
    };
  }, [initialVersion]);

  return (
    <>
      {updateAvailable && (
        <div role="status" className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[500] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-200 bg-white px-4 py-2.5 shadow-lg">
          <span className="text-xs font-semibold text-slate-700">Update available</span>
          <button
            type="button"
            onClick={() => {
              // Only an explicit tap refreshes the running app; never during
              // Android Share, offline studying, or background/foreground events.
              sessionStorage.setItem(UPDATED_KEY, initialVersion);
              window.location.reload();
            }}
            className="shrink-0 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white"
          >
            Refresh
          </button>
          <button type="button" onClick={() => setUpdateAvailable(false)} aria-label="Dismiss update notification" className="text-slate-400 text-lg leading-none">×</button>
        </div>
      )}
      {!updateAvailable && showUpdated && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[500] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-center text-xs font-semibold text-slate-700 shadow-lg"
        >
          <span className="mr-1.5 text-emerald-600" aria-hidden="true">✓</span>
          FlashKado is up to date!
        </div>
      )}
    </>
  );
}
