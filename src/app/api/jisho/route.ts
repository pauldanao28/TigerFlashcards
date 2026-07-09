import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const word = searchParams.get("word");
  if (!word) return NextResponse.json({ found: false });

  try {
    const res = await fetch(
      `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return NextResponse.json({ found: false });
    const data = await res.json();
    const entry = data.data?.[0];
    if (!entry) return NextResponse.json({ found: false });

    return NextResponse.json(
      {
        found: true,
        word: entry.japanese?.[0]?.word ?? word,
        reading: entry.japanese?.[0]?.reading ?? "",
        meanings: (entry.senses ?? []).slice(0, 3).map((s: any) => ({
          definition: (s.english_definitions ?? []).join(", "),
          pos: (s.parts_of_speech ?? [])[0] ?? "",
        })),
        jlpt: entry.jlpt ?? [],
        is_common: entry.is_common ?? false,
      },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    );
  } catch {
    return NextResponse.json({ found: false });
  }
}
