import { ImageResponse } from "next/og";
import { loadOgFonts } from "@/lib/ogFont";

// Draws the 1080×1920 achievement card for /api/og/share. Kept separate from the
// route so the layout can be previewed with sample data without a signed-in user.
export type ShareCardProps = {
  name: string;
  avatar: string;
  shareHost: string;
  emoji: string;
  eyebrow: string;
  headline: string;
  headlineSize: number;
  subline: string;
  stats: { label: string; value: string }[];
  // The default tight tracking (-8) suits a short number/level headline (streak,
  // N-level) but crams an 8-character referral code together unreadably — callers
  // drawing a code as the headline pass a positive value instead.
  headlineLetterSpacing?: number;
};

export async function renderShareCard({
  name,
  avatar,
  shareHost,
  emoji,
  eyebrow,
  headline,
  headlineSize,
  subline,
  stats,
  headlineLetterSpacing = -8,
}: ShareCardProps): Promise<ImageResponse> {
  // Subset includes the uppercased eyebrow too — it's drawn with textTransform, so
  // its capital letters must be in the font or they fall back to another weight.
  const fonts = await loadOgFonts(
    `FlashKado${name}${eyebrow}${eyebrow.toUpperCase()}${headline}${subline}${stats.map((s) => s.label + s.value).join("")}Learn Japanese with me${shareHost}`
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "230px 90px 230px", // clear of IG Story header/reply bar
          background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 45%, #4338ca 100%)",
          color: "white",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 56, fontWeight: 900, letterSpacing: -1 }}>
          <span>Flash</span>
          <span style={{ color: "#a5b4fc" }}>Kado</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 160 }}>{emoji}</div>
          <div
            style={{
              display: "flex",
              marginTop: 32,
              padding: "14px 40px",
              borderRadius: 999,
              background: "rgba(255,255,255,0.12)",
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#c7d2fe",
            }}
          >
            {eyebrow}
          </div>
          <div style={{ display: "flex", fontSize: headlineSize, fontWeight: 900, lineHeight: 1, marginTop: 28, letterSpacing: headlineLetterSpacing }}>
            {headline}
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900, letterSpacing: 8, marginTop: 20, color: "#e0e7ff" }}>
            {subline}
          </div>
          {stats.length > 0 && (
            <div style={{ display: "flex", gap: 40, marginTop: 56 }}>
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "24px 56px",
                    borderRadius: 40,
                    background: "rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ display: "flex", fontSize: 88, fontWeight: 900 }}>{s.value}</div>
                  <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "#c7d2fe", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatar} width={110} height={110} style={{ borderRadius: 999, border: "6px solid rgba(255,255,255,0.3)" }} alt="" />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 52, fontWeight: 900 }}>{name}</div>
              <div style={{ display: "flex", fontSize: 34, fontWeight: 500, color: "#c7d2fe" }}>Learn Japanese with me</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 44, fontSize: 36, fontWeight: 500, color: "#a5b4fc" }}>{shareHost}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts: fonts.length ? fonts : undefined, emoji: "twemoji" }
  );
}
