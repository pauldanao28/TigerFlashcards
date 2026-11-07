import { ImageResponse } from "next/og";
import { loadOgFonts } from "@/lib/ogFont";

// Draws the 1080×1920 vocabulary-progress card for /api/og/share?kind=vocab_stats —
// same canvas size and brand gradient as renderShareCard, but a dashboard-style
// breakdown (JLPT level bars + part-of-speech chips) instead of one big hero stat, so
// it's kept as its own template rather than bolted onto renderShareCard's layout.

export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

const LEVELS: JlptLevel[] = ["N5", "N4", "N3", "N2", "N1"];

// Mirrors the in-app palette (JLPT_BAR_COLOR/JLPT_BAR_LIGHT_COLOR/JLPT_BADGE_COLOR in
// Dashboard.tsx) as literal values — next/og's Satori renderer only understands inline
// styles, not Tailwind classes.
const JLPT_COLOR: Record<JlptLevel, { solid: string; light: string; badgeBg: string; badgeText: string }> = {
  N5: { solid: "#10b981", light: "#a7f3d0", badgeBg: "#d1fae5", badgeText: "#047857" },
  N4: { solid: "#0ea5e9", light: "#bae6fd", badgeBg: "#e0f2fe", badgeText: "#0369a1" },
  N3: { solid: "#f59e0b", light: "#fde68a", badgeBg: "#fef3c7", badgeText: "#b45309" },
  N2: { solid: "#f97316", light: "#fed7aa", badgeBg: "#ffedd5", badgeText: "#c2410c" },
  N1: { solid: "#f43f5e", light: "#fecdd3", badgeBg: "#ffe4e6", badgeText: "#be123c" },
};

// Matches scoring.ts's JLPT_VOCAB_INCREMENT — the per-level mastery floor used to
// size each bar's fill, same math as the in-app "Vocabulary by Level" card.
const JLPT_FLOOR: Record<JlptLevel, number> = { N5: 800, N4: 700, N3: 2250, N2: 2250, N1: 4000 };

const POS_LABELS = ["noun", "verb", "adjective", "adverb", "particle", "pronoun", "conjunction", "number", "phrase"];

// Matches SKILL_TILE in skillTheme.ts (grammar violet, reading blue, listening sky) —
// literal hex since Satori only understands inline styles, not Tailwind classes.
const SKILL_COLOR = {
  grammar: { bg: "rgba(139,92,246,0.22)", text: "#ddd6fe" },
  reading: { bg: "rgba(59,130,246,0.22)", text: "#bfdbfe" },
  listening: { bg: "rgba(14,165,233,0.22)", text: "#bae6fd" },
} as const;

export type StatsCardProps = {
  name: string;
  avatar: string;
  shareHost: string;
  deckSize: number;
  vocabNlevel: string;
  grammarScore: number;
  readingScore: number;
  listeningScore: number;
  jlptStats: Record<string, { total: number; mastered: number }>;
  posStats: Record<string, { total: number; mastered: number }>;
};

export async function renderStatsCard({
  name,
  avatar,
  shareHost,
  deckSize,
  vocabNlevel,
  grammarScore,
  readingScore,
  listeningScore,
  jlptStats,
  posStats,
}: StatsCardProps): Promise<ImageResponse> {
  const levelColor = JLPT_COLOR[vocabNlevel as JlptLevel] ?? JLPT_COLOR.N5;
  // Summed from posStats, not jlptStats — pos_stats buckets every deck card
  // (coalescing a missing partOfSpeech to "noun"), while jlpt_stats skips any card
  // whose jlpt_level is null, so it alone would undercount the true deck-wide total.
  const totalMastered = Object.values(posStats).reduce((sum, s) => sum + (s?.mastered ?? 0), 0);
  const posText = POS_LABELS.map((p) => p.toUpperCase()).join("");
  const fonts = await loadOgFonts(
    `FlashKado${name}CARDSMASTEREDOVERALLLEVEL${vocabNlevel}GRAMMARREADINGLISTENINGVOCABULARYBYLEVELBYPARTOFSPEECHmastered${posText}Learn Japanese with me${shareHost}0123456789%/()·`
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "90px 70px 70px",
          background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 45%, #4338ca 100%)",
          color: "white",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 50, fontWeight: 900, letterSpacing: -1 }}>
          <span>Flash</span>
          <span style={{ color: "#a5b4fc" }}>Kado</span>
        </div>

        {/* Mastered count gets the same badge treatment as Overall Level, same row —
            not a standalone giant hero number, just equal visual weight to it. */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ display: "flex", fontSize: 26, fontWeight: 900, letterSpacing: 2, color: "#c7d2fe", textTransform: "uppercase" }}>
              Overall Level
            </span>
            <div
              style={{
                display: "flex",
                padding: "8px 22px",
                borderRadius: 10,
                background: levelColor.badgeBg,
                color: levelColor.badgeText,
                fontSize: 32,
                fontWeight: 900,
              }}
            >
              {vocabNlevel}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ display: "flex", fontSize: 26, fontWeight: 900, letterSpacing: 2, color: "#c7d2fe", textTransform: "uppercase" }}>
              Mastered
            </span>
            <div
              style={{
                display: "flex",
                padding: "8px 22px",
                borderRadius: 10,
                background: "rgba(255,255,255,0.16)",
                color: "white",
                fontSize: 32,
                fontWeight: 900,
              }}
            >
              {totalMastered.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 24 }}>
          {([
            ["GRAMMAR", grammarScore, SKILL_COLOR.grammar],
            ["READING", readingScore, SKILL_COLOR.reading],
            ["LISTENING", listeningScore, SKILL_COLOR.listening],
          ] as const).map(([label, score, c]) => (
            <div
              key={label}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "16px 18px",
                borderRadius: 16,
                background: c.bg,
              }}
            >
              <span style={{ display: "flex", fontSize: 34, fontWeight: 900, color: "white" }}>{score}%</span>
              <span style={{ display: "flex", fontSize: 18, fontWeight: 700, letterSpacing: 1, color: c.text, marginTop: 2 }}>{label}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ display: "flex", fontSize: 30, fontWeight: 900, letterSpacing: 2, color: "#c7d2fe", textTransform: "uppercase" }}>
              Vocabulary by Level
            </span>
            <span style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#c7d2fe" }}>{deckSize.toLocaleString()} cards</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: 28, gap: 26 }}>
            {LEVELS.map((level) => {
              const { total, mastered } = jlptStats[level] ?? { total: 0, mastered: 0 };
              const floor = JLPT_FLOOR[level];
              const masteredPct = Math.min(100, Math.round((mastered / floor) * 100));
              const addedPct = Math.min(100 - masteredPct, Math.round(((total - mastered) / floor) * 100));
              const masteryPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
              const c = JLPT_COLOR[level];
              return (
                <div key={level} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div
                      style={{
                        display: "flex",
                        width: 76,
                        height: 40,
                        borderRadius: 10,
                        background: c.badgeBg,
                        color: c.badgeText,
                        fontSize: 24,
                        fontWeight: 900,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {level}
                    </div>
                    <div style={{ display: "flex", flex: 1, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
                      <div style={{ display: "flex", width: `${masteredPct}%`, height: "100%", background: c.solid }} />
                      <div style={{ display: "flex", width: `${addedPct}%`, height: "100%", background: c.light }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 22, fontWeight: 700, color: "#c7d2fe" }}>
                    {mastered}/{total} mastered ({masteryPct}%)
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 52 }}>
          <span style={{ display: "flex", fontSize: 30, fontWeight: 900, letterSpacing: 2, color: "#c7d2fe", textTransform: "uppercase" }}>
            By Part of Speech
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 24 }}>
            {POS_LABELS.map((pos) => {
              const { total, mastered } = posStats[pos] ?? { total: 0, mastered: 0 };
              const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
              return (
                <div
                  key={pos}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "14px 24px",
                    borderRadius: 999,
                    background: "rgba(255,255,255,0.12)",
                    fontSize: 24,
                    fontWeight: 900,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  {pos} · {pct}%
                </div>
              );
            })}
          </div>
        </div>

        {/* Fixed gap, not marginTop: "auto" — this card's content is shorter than the
            streak/referral cards sharing its 1920px canvas, so "auto" pushed the
            footer all the way to the bottom and left a large empty gap above it. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 80 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} width={84} height={84} style={{ borderRadius: 999, border: "5px solid rgba(255,255,255,0.3)" }} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 40, fontWeight: 900 }}>{name}</div>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#c7d2fe" }}>Learn Japanese with me</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 32, fontSize: 28, fontWeight: 500, color: "#a5b4fc" }}>{shareHost}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: fonts.length ? fonts : undefined, emoji: "twemoji" }
  );
}
