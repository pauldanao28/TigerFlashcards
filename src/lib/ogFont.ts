// Loads Noto Sans JP from Google Fonts for next/og image routes, subset to exactly the
// characters being drawn (the `text=` param) so it stays a few KB and still covers
// Japanese names. Without a browser User-Agent Google serves TTF, which is what
// Satori needs (it can't read woff2). Returns [] on failure so the image still renders
// with the default font instead of erroring.
export async function loadOgFonts(text: string) {
  const weights = [500, 900] as const;
  const fonts = await Promise.all(
    weights.map(async (weight) => {
      try {
        const css = await (
          await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`)
        ).text();
        const url = css.match(/src: url\((.+?)\) format/)?.[1];
        if (!url) return null;
        const data = await (await fetch(url)).arrayBuffer();
        return { name: "Noto Sans JP", data, weight, style: "normal" as const };
      } catch {
        return null;
      }
    })
  );
  return fonts.filter((f): f is NonNullable<typeof f> => f !== null);
}
