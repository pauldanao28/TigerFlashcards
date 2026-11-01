import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { loadOgFonts } from "@/lib/ogFont";

// Link-preview card (1200×630) for /join/[code] invite links. Public — link
// unfurlers fetch it anonymously — so it shows only the inviter's name, via the same
// narrow anon RPC the join page itself uses.
export async function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") || "").toUpperCase().slice(0, 16);
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = code ? await supabase.rpc("find_user_by_referral_code", { p_code: code }) : { data: null };
  const name = ((data?.[0]?.full_name as string | undefined) || "A friend").slice(0, 24);

  const headline = `${name} invited you`;
  const sub = "Learn Japanese together on FlashKado";
  const fonts = await loadOgFonts(`FlashKado${headline}${sub}🔥`);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4338ca 100%)",
          color: "white",
          fontFamily: "Noto Sans JP",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 900 }}>
          <span>Flash</span>
          <span style={{ color: "#a5b4fc" }}>Kado</span>
        </div>
        <div style={{ display: "flex", fontSize: 84, fontWeight: 900, marginTop: 40, lineHeight: 1.1 }}>{headline}</div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 500, marginTop: 20, color: "#c7d2fe" }}>{sub}</div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length ? fonts : undefined,
      emoji: "twemoji",
      headers: { "Cache-Control": "public, max-age=3600" },
    }
  );
}
