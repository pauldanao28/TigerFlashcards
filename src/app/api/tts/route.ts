import { NextResponse } from "next/server";

const VOICES: Record<string, string> = {
  "ja-JP": "ja-JP-Wavenet-A",
  "en-US": "en-US-Standard-C",
};

export async function POST(req: Request) {
  const { text, lang = "ja-JP" } = await req.json();
  if (!text) return NextResponse.json({ error: "No text" }, { status: 400 });

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "TTS not configured" }, { status: 503 });

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: lang, name: VOICES[lang] ?? VOICES["ja-JP"] },
        audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("Google TTS error:", err);
    return NextResponse.json({ error: "TTS failed" }, { status: 500 });
  }

  const { audioContent } = await res.json();
  const buffer = Buffer.from(audioContent, "base64");
  return new Response(buffer, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
