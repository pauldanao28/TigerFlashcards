"use client";
import { useEffect, useState } from "react";

const UPDATED_KEY = "flashkado-updated-from";

// Detect deployments without interrupting an active study session.
// A small toast appears only after the new version has actually loaded.
export default function SilentAppUpdater({ initialVersion }: { initialVersion: string }) {
  const [showUpdated, setShowUpdated] = useState(false);

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
    let pending = false;
    let checking = false;
    let disposed = false;

    async function check() {
      if (checking || !navigator.onLine) return;
      checking = true;
      try {
        const response = await fetch("/api/app-version", { cache: "no-store" });
        if (!response.ok) return;
        const { version } = await response.json();
        if (!disposed && version && version !== "development" && version !== initialVersion) pending = true;
      } catch { /* Retry on the next focus or check. */ }
      finally { checking = false; }
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        if (pending) {
          sessionStorage.setItem(UPDATED_KEY, initialVersion);
          window.location.reload();
        }
      } else {
        void check();
      }
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

  return showUpdated ? (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[500] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full border border-emerald-200 bg-white px-4 py-2.5 text-center text-xs font-semibold text-slate-700 shadow-lg"
    >
      <span className="mr-1.5 text-emerald-600" aria-hidden="true">✓</span>
      FlashKado is up to date!
    </div>
  ) : null;
}
