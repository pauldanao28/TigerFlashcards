"use client";
import { useEffect } from "react";

// Detect deploys independently of changes to the service worker.
// Refresh only when the user leaves the app, not during a study session.
export default function SilentAppUpdater({ initialVersion }: { initialVersion: string }) {
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
        if (pending) window.location.reload();
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
  return null;
}
