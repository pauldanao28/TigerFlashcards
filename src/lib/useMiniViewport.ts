"use client";
import { useEffect, useState } from "react";

// Matches the app's own `md:` breakpoint (768px) on purpose — anywhere narrower than
// that, the rest of the UI already switches to its "mobile" CSS layout, so a desktop
// window dragged into that range should land straight in Mini Mode instead of a gap
// where it shows the phone-style header with nothing to get back to Mini Mode from.
const MINI_WIDTH = 768;

// True when the window looks like a desktop/laptop browser window that's been resized
// down small (a fine mouse pointer, narrow width) — distinct from an actual phone,
// which reports a coarse touch pointer regardless of how wide it is. Lets a desktop
// user shrink their browser window to the side of the monitor and have the page switch
// to a compact layout on its own, without touching how real mobile visitors see it.
export function useIsMiniViewport(): boolean {
  const [isMini, setIsMini] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const pointerFine = window.matchMedia("(pointer: fine)");
    const check = () => setIsMini(pointerFine.matches && window.innerWidth < MINI_WIDTH);
    check();
    window.addEventListener("resize", check);
    pointerFine.addEventListener?.("change", check);
    return () => {
      window.removeEventListener("resize", check);
      pointerFine.removeEventListener?.("change", check);
    };
  }, []);

  return isMini;
}
