// Client-side Japanese text helpers shared by the tap-to-lookup UI (TappableText,
// useWordLookup, useWordMining). No React here, so it can be tested on its own.

export const kanjiRe = /[一-龯㐀-䶿々〻]/;

// Lazy-init: avoid module-level Intl.Segmenter which crashes during Next.js SSR
let _jaSegmenter: Intl.Segmenter | null = null;
export function getSegmenter(): Intl.Segmenter | null {
  if (typeof window === "undefined") return null;
  if (!_jaSegmenter) {
    try { _jaSegmenter = new Intl.Segmenter("ja", { granularity: "word" }); } catch { return null; }
  }
  return _jaSegmenter;
}

// Drops inline furigana like 漢字(かんじ) so only the kanji is shown and segmented.
export function stripFurigana(text: string): string {
  return text.replace(/([一-龯々〻㐀-䶿][一-龯々〻㐀-䶿ぁ-ん]*)[（(]([ぁ-んァ-ンっーゃゅょ・]+)[）)]/g, "$1");
}

const hiraganaRe = /^[ぁ-ゖー]+$/;
// Hiragana that starts the NEXT word rather than finishing this one: particles…
const PARTICLES = new Set([
  "は", "が", "を", "に", "へ", "で", "と", "も", "や", "の", "か", "ね", "よ", "な", "わ", "ぞ", "さ",
  "から", "まで", "より", "ので", "のに", "けど", "けれど", "だけ", "など", "って", "とか",
]);
// …and the copula (です/だ…) plus ください, which follow a word but aren't part of it.
const COPULA_RE = /です|でし|でしょ|だっ|だろ|じゃ|では|くだ/;

export interface TextPiece {
  text: string;
  word: boolean; // tappable kanji word
}

/**
 * Splits text into tappable kanji words and plain text. A word is a kanji-containing
 * segment plus the hiragana that follows it (okurigana / conjugation: 難しい, 難しかった,
 * 食べて), stopping at a particle or the copula so it never swallows the next word.
 *
 * Intl.Segmenter alone cuts these apart unpredictably (難|しか|っ|た, 食|べ|て), so its
 * segments are merged back together here.
 */
export function splitTappable(text: string, segmenter: Intl.Segmenter | null = getSegmenter()): TextPiece[] {
  if (!segmenter) return [{ text, word: false }];
  const segs = [...segmenter.segment(text)].map((s) => ({ text: s.segment, isWordLike: !!s.isWordLike }));
  const out: TextPiece[] = [];

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (!seg.isWordLike || !kanjiRe.test(seg.text)) {
      out.push({ text: seg.text, word: false });
      continue;
    }
    let word = seg.text;
    let j = i + 1;
    for (; j < segs.length; j++) {
      const next = segs[j].text;
      if (!hiraganaRe.test(next) || PARTICLES.has(next)) break;
      const cut = next.search(COPULA_RE);
      if (cut === 0) break;
      if (cut > 0) {
        // e.g. そうですね → keep そう, leave ですね as the next piece
        word += next.slice(0, cut);
        segs[j] = { text: next.slice(cut), isWordLike: false };
        break;
      }
      word += next;
    }
    out.push({ text: word, word: true });
    i = j - 1;
  }
  return out;
}

/**
 * Splits a passage into sentences — after 。！？!? (outside 「」/『』/（） quotes, so
 * 「行こう！」と言った。 stays one sentence) and at line breaks — keeping every character so
 * the pieces render back to the original text. Whitespace-only pieces have speakable: false.
 */
export function splitSentences(text: string): { text: string; speakable: boolean }[] {
  const out: { text: string; speakable: boolean }[] = [];
  let buf = "";
  let depth = 0;
  const push = () => {
    if (buf) out.push({ text: buf, speakable: /\S/.test(buf) });
    buf = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      push();
      let nl = ch;
      while (text[i + 1] === "\n") nl += text[++i];
      out.push({ text: nl, speakable: false });
      depth = 0;
      continue;
    }
    buf += ch;
    if ("「『（(".includes(ch)) depth++;
    else if ("」』）)".includes(ch)) depth = Math.max(0, depth - 1);
    else if ("。！？!?".includes(ch) && depth === 0) {
      while (text[i + 1] && "。！？!?」』）)\"".includes(text[i + 1])) buf += text[++i];
      push();
    }
  }
  push();
  return out;
}
