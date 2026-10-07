import { NextResponse } from "next/server";

const CACHE = { headers: { "Cache-Control": "public, max-age=86400" } };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const word = searchParams.get("word");
  const compounds = searchParams.get("compounds") === "true";
  if (!word) return NextResponse.json({ found: false });

  try {
    const res = await fetch(
      `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return NextResponse.json({ found: false });
    const data = await res.json();

    if (compounds) {
      const entries: any[] = data.data ?? [];
      const results = entries
        .filter((e: any) => {
          const w = e.japanese?.[0]?.word ?? "";
          return w.includes(word) && w.length > 1;
        })
        .slice(0, 8)
        .map((e: any) => ({
          word: e.japanese?.[0]?.word ?? "",
          reading: e.japanese?.[0]?.reading ?? "",
          meaning: (e.senses?.[0]?.english_definitions ?? []).slice(0, 2).join(", "),
          jlpt: e.jlpt ?? [],
          is_common: e.is_common ?? false,
        }));
      return NextResponse.json({ found: results.length > 0, compounds: results }, CACHE);
    }

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
      CACHE
    );
  } catch {
    return NextResponse.json({ found: false });
  }
}
