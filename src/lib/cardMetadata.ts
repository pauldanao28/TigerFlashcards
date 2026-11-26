import type { MasterCard } from "@/lib/types";

export type CardType = "vocabulary" | "phrase";
export const SITUATION_TAGS = [
  "Friends", "Anime", "Daily Conversation", "Reactions", "Feelings",
  "Restaurant", "Shopping", "Travel", "Work", "Texting / LINE",
  "Making Plans", "Apologising", "Misunderstanding", "Greetings",
] as const;

export function normalizeSituationTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.map(tag => tag.trim()).filter(tag => {
    const key = tag.toLocaleLowerCase();
    if (!key || key.length > 60 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cardMatchesMetadata(
  card: Pick<MasterCard, "card_type" | "situation_tags">,
  type: CardType | "all",
  selectedTags: string[],
): boolean {
  if (type !== "all" && (card.card_type ?? "vocabulary") !== type) return false;
  if (!selectedTags.length) return true;
  const tags = new Set((card.situation_tags ?? []).map(tag => tag.toLocaleLowerCase()));
  return selectedTags.some(tag => tags.has(tag.toLocaleLowerCase()));
}

export function availableSituationTags(cards: Pick<MasterCard, "situation_tags">[]): string[] {
  const tags = normalizeSituationTags([
    ...SITUATION_TAGS,
    ...cards.flatMap(card => card.situation_tags ?? []),
  ]);
  return tags.sort((a, b) => {
    const ai = SITUATION_TAGS.indexOf(a as typeof SITUATION_TAGS[number]);
    const bi = SITUATION_TAGS.indexOf(b as typeof SITUATION_TAGS[number]);
    return ai < 0 ? (bi < 0 ? a.localeCompare(b) : 1) : (bi < 0 ? -1 : ai - bi);
  });
}

export function cardIsMastered(card: { scores?: { jp_to_en?: {pass?: number; percent?: number}; en_to_jp?: {pass?: number; percent?: number} } }): boolean {
  const jp = card.scores?.jp_to_en, en = card.scores?.en_to_jp;
  return ((jp?.pass ?? 0) >= 5 && (jp?.percent ?? 0) >= 70) || ((en?.pass ?? 0) >= 5 && (en?.percent ?? 0) >= 70);
}
