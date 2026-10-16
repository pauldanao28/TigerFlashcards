"use client";
import { useEffect, useState } from "react";

const MINI_WIDTH = 460;

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
