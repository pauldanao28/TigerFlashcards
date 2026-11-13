"use client";
import { useRef } from "react";
import { kanjiRe, splitTappableText } from "@/lib/japaneseText";

// Shared tap-to-lookup text used everywhere — the Sensei chat, the quizzes (Grammar /
// Reading / Listening), the Reader and Watch: kanji words, with their okurigana (難しい,
// 食べて), get a dotted underline, and tapping one calls onWordTap so the caller can open
// its Jisho lookup. Inline furigana is never shown — a word written with it is one unit
// and its reading is passed to onWordTap (see splitTappableText).

export { kanjiRe, getSegmenter, stripFurigana } from "@/lib/japaneseText";

export type WordTapHandler = (word: string, reading: string, e: React.MouseEvent | React.TouchEvent) => void;

// "new" = not in the user's deck at all. "weak" = in the deck but struggling.
// "easy" = in the deck and mastered. "known" = in the deck, still learning — no highlight.
export type WordStatus = "new" | "weak" | "easy" | "known";

// Background tints the whole word (continuous, via the wrapping span) — reserved for the
// two statuses actually worth flagging at a glance (new to add, or weak and worth
// reviewing). Easy/known words just get the dotted underline like everything else, so the
// highlights don't compete with each other.
const STATUS_BG: Record<WordStatus, string> = {
  new: "bg-violet-200",
  weak: "bg-rose-100/70", // in the deck but struggling — same color as the stats page's Struggling list
  easy: "",
  known: "",
};
const STATUS_DECORATION: Record<WordStatus, string> = {
  new: "decoration-violet-600",
  weak: "decoration-rose-500",
  easy: "decoration-emerald-500",
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
  const pieces = splitTappableText(text);
  return (
    <>
      {pieces.map((piece, i) => {
        if (piece.word) {
          const word = piece.text;
          const reading = piece.reading ?? "";
          const status = getStatus?.(word);
          // Only pad/round the span when it actually has a background to show — padding
          // with no visible fill just pushes into the next character, since Japanese text
          // runs with no spaces between words.
          const bg = status ? STATUS_BG[status] : "";
          return (
            <span
              key={`${keyPrefix}-${i}`}
              className={`cursor-pointer active:opacity-60 transition-opacity ${bg ? `rounded px-0.5 ${bg}` : ""}`}
              onClick={(e) => { e.stopPropagation(); onWordTap(word, reading, e); }}
              onTouchStart={(e) => { touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
              onTouchEnd={(e) => {
                const start = touchStartRef.current;
                touchStartRef.current = null;
                if (!start) return;
                const dx = Math.abs(e.changedTouches[0].clientX - start.x);
                const dy = Math.abs(e.changedTouches[0].clientY - start.y);
                if (dx < 8 && dy < 8) { e.preventDefault(); e.stopPropagation(); onWordTap(word, reading, e as unknown as React.MouseEvent); }
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
        return <span key={`${keyPrefix}-${i}`}>{piece.text}</span>;
      })}
    </>
  );
}
