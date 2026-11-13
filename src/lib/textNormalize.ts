export const stripParens = (s: string) =>
  s.replace(/\s*[\(\[（【][^)\]）】]*[\)\]）】]/g, "").trim();

const lowerFirst = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

// Split on any separator, drop a stray "to " prefix per part, cap at 3,
// rejoin with a single consistent " / " — used both for AI-generated cards
// and for normalizing pre-written pack data (which is often comma-separated).
export const normalizeEnglish = (s: string): string => {
  const cleaned = stripParens(s);
  const parts = cleaned
    .split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i)
    .map((p) => lowerFirst(p.trim().replace(/^to\s+/i, "")))
    .filter(Boolean)
    .slice(0, 3);
  return parts.length > 0 ? parts.join(" / ") : lowerFirst(cleaned.trim());
};

export const ALLOWED_PARTS_OF_SPEECH = [
  "noun", "verb", "adjective", "adverb", "particle",
  "pronoun", "conjunction", "number", "phrase",
] as const;

// Coerces into the controlled vocabulary instead of trusting raw input —
// handles stray qualifiers ("noun (suru-verb)", "na-adjective", wrong casing).
export const normalizePartOfSpeech = (s: string): string => {
  const cleaned = stripParens(s).trim().toLowerCase();
  if ((ALLOWED_PARTS_OF_SPEECH as readonly string[]).includes(cleaned)) return cleaned;
  return ALLOWED_PARTS_OF_SPEECH.find((tag) => cleaned.includes(tag)) ?? "phrase";
};
