// Celebration UI events only. These never update study progress or award badges.
export type ExtraCelebration =
  | { kind: "reviewed"; count: number }
  | { kind: "mastered"; count: number }
  | { kind: "streak"; count: number }
  | { kind: "jlpt"; level: "N5" | "N4" | "N3" | "N2" | "N1" };

export const MAJOR_STREAKS = [7, 30, 50, 100, 200, 365, 500, 1000] as const;
export const JLPT_BADGE_LEVELS: Record<string, "N5" | "N4" | "N3" | "N2" | "N1"> = {
  jlpt_n5: "N5",
  jlpt_n4: "N4",
  jlpt_n3: "N3",
  jlpt_n2: "N2",
  jlpt_n1: "N1",
};

export const singaporeDay = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });

// Prevent repeated celebrations after a remount, new tab, or app resume.
// Study and award writes are separate; never gate them on this local-only marker.
export function claimCelebration(userId: string, key: string): boolean {
  try {
    const storageKey = `flashkado_celebration_seen_${userId}_${key}`;
    if (localStorage.getItem(storageKey) === "1") return false;
    localStorage.setItem(storageKey, "1");
  } catch {
    // Storage can be disabled; the event is still worth celebrating in-session.
  }
  return true;
}
