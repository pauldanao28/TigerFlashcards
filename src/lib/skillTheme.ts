// One color per skill, shared by every place a skill is shown (Home tiles, friend
// page tiles) — matches the accents LevelUpModal already uses for each quiz. Tints
// stay at -50/-100 so they label the tile without competing with the progress bar.
export type SkillKey = "vocab" | "grammar" | "reading" | "listening";

export const SKILL_TILE: Record<SkillKey, { tile: string; track: string }> = {
  vocab:     { tile: "bg-rose-50 border-rose-100",     track: "bg-rose-100" },
  grammar:   { tile: "bg-violet-50 border-violet-100", track: "bg-violet-100" },
  reading:   { tile: "bg-indigo-50 border-indigo-100", track: "bg-indigo-100" },
  listening: { tile: "bg-sky-50 border-sky-100",       track: "bg-sky-100" },
};
