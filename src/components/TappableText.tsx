"use client";
import { useRef } from "react";

// Shared tap-to-lookup text used by the quizzes (Grammar / Reading / Listening) and the
// Reader: kanji words get a dotted underline, and tapping one calls onWordTap so the
// caller can open its Jisho lookup. Text is never shown with inline furigana — the
// reading comes from the lookup.

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

export type WordTapHandler = (word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => void;

// "new" = not in the user's deck at all. "weak" = in the deck but struggling.
// "known" = in the deck and not struggling — no special highlight needed.
export type WordStatus = "new" | "weak" | "known";

// Background tints the whole word (continuous, via the wrapping span); decoration colors
// only the dotted underline under each kanji character.
const STATUS_BG: Record<WordStatus, string> = {
  new: "bg-violet-100", // not in the deck yet — its own hue, not a difficulty/JLPT color
  weak: "bg-rose-100/70", // in the deck but struggling — same color as the stats page's Struggling list
  known: "",
};
const STATUS_DECORATION: Record<WordStatus, string> = {
  new: "decoration-violet-500",
  weak: "decoration-rose-500",
  known: "decoration-indigo-400",
};

/**
 * Pass `getStatus` to color words by deck status (the Reader does); without it every
 * kanji word gets the plain indigo dotted underline (the quizzes).
 */
export default function TappableText({
  text,
  keyPrefix,
  onWordTap,
  getStatus,
}: {
  text: string;
  keyPrefix: string;
  onWordTap: WordTapHandler;
  getStatus?: (word: string) => WordStatus;
}) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const segmenter = getSegmenter();
  const clean = stripFurigana(text);
  const subSegs = segmenter ? [...segmenter.segment(clean)] : [{ segment: clean, isWordLike: false }];
  return (
    <>
      {subSegs.map((sub, i) => {
        if (sub.isWordLike && kanjiRe.test(sub.segment)) {
          const word = sub.segment;
          const status = getStatus?.(word);
          return (
            <span
              key={`${keyPrefix}-${i}`}
              className={`cursor-pointer active:opacity-60 transition-opacity ${status ? `rounded px-0.5 ${STATUS_BG[status]}` : ""}`}
              onClick={(e) => { e.stopPropagation(); onWordTap(word, "", e); }}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, "", e as unknown as React.MouseEvent); }
              }}
            >
              {word.split("").map((ch, ci) =>
                kanjiRe.test(ch) ? (
                  <span key={ci} className={`underline decoration-dotted underline-offset-2 ${STATUS_DECORATION[status ?? "known"]}`}>{ch}</span>
                ) : ch,
              )}
            </span>
          );
        }
        return <span key={`${keyPrefix}-${i}`}>{sub.segment}</span>;
      })}
    </>
  );
}
