// One color per skill, shared by every place a skill is shown (Home tiles, friend
// page tiles) — matches the accents LevelUpModal already uses for each quiz. Tints
// stay at -50 so they label the tile without competing with the progress bar;
// borders sit one step darker (-200) for a bit more definition. All four stay in
// the indigo→violet→blue→sky family (vocab gets the app's own primary indigo,
// as its most-used skill) rather than mixing in a warm color like the old rose,
// so the row reads as one cohesive set instead of a rainbow.
export type SkillKey = "vocab" | "grammar" | "reading" | "listening";

export const SKILL_TILE: Record<SkillKey, { tile: string; track: string }> = {
  vocab:     { tile: "bg-indigo-50 border-indigo-200", track: "bg-indigo-100" },
  grammar:   { tile: "bg-violet-50 border-violet-200", track: "bg-violet-100" },
  reading:   { tile: "bg-blue-50 border-blue-200",     track: "bg-blue-100" },
  listening: { tile: "bg-sky-50 border-sky-200",       track: "bg-sky-100" },
};
