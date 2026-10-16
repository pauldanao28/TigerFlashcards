import { supabase } from "@/lib/supabase";
import { kanjiRe } from "@/lib/japaneseText";
import type { FlashcardData, ModeStats } from "@/lib/types";

// Duplicate cards in a deck (Cards page → Duplicates). Two kinds:
// - "kana":     a kana-only card (みず) whose kanji card (水) is in the deck at the same or an
//               easier JLPT level — the kanji card already teaches the reading. A kana card
//               is only worth keeping while its kanji is above the learner's level.
// - "particle": a card that is another card plus one grammar particle (私は, 何を, 海に) with
//               the same meaning. Adverbs and set words (本当に, いつも, それから) are left alone.
// Either way `remove` is merged into `keep`: scores combined, then `remove` leaves the deck.

export type DuplicateKind = "kana" | "particle";

export interface Duplicate {
  kind: DuplicateKind;
  keep: FlashcardData;
  remove: FlashcardData;
}

const kanaOnlyRe = /^[ぁ-ゖァ-ヺー]+$/;
const CASE_PARTICLES = ["は", "が", "を", "に", "で", "へ", "と"];
const NOT_A_PARTICLE_COPY = /adverb|conjunction|particle|verb|adjective/i;
const STOP_WORDS = new Set(["the", "and", "for", "with", "something", "someone", "one", "get", "a", "an", "to", "of"]);

const meaningWords = (english: string | undefined) =>
  new Set((english ?? "").toLowerCase().match(/[a-z]+/g)?.filter((w) => w.length > 2 && !STOP_WORDS.has(w)) ?? []);
const sameMeaning = (a: FlashcardData, b: FlashcardData) => {
  const wa = meaningWords(a.english);
  if (wa.size === 0) return (a.english ?? "").trim().toLowerCase() === (b.english ?? "").trim().toLowerCase();
  return [...meaningWords(b.english)].some((w) => wa.has(w));
};
// N5 → 5 … N1 → 1; higher number = easier. Unknown counts as the same level as its pair.
const levelNum = (c: FlashcardData) => (c.jlpt_level ? Number(c.jlpt_level.slice(1)) : null);
const norm = (s: string | undefined) => (s ?? "").normalize("NFKC").trim();

export function findDuplicates(cards: FlashcardData[]): Duplicate[] {
  const out: Duplicate[] = [];
  const claimed = new Set<string>(); // each card is removed by at most one suggestion

  // Kanji cards by reading, cards by written form
  const kanjiByReading = new Map<string, FlashcardData[]>();
  const byJapanese = new Map<string, FlashcardData>();
  for (const c of cards) {
    const jp = norm(c.japanese);
    byJapanese.set(jp, c);
    if (kanjiRe.test(jp)) {
      const list = kanjiByReading.get(norm(c.reading)) ?? [];
      list.push(c);
      kanjiByReading.set(norm(c.reading), list);
    }
  }

  for (const c of cards) {
    const jp = norm(c.japanese);

    // Kana-only copy of a kanji card at the same or an easier level
    if (kanaOnlyRe.test(jp)) {
      const keep = (kanjiByReading.get(jp) ?? []).find((k) => {
        if (!sameMeaning(k, c)) return false;
        const kl = levelNum(k), cl = levelNum(c);
        return kl === null || cl === null || kl >= cl;
      });
      if (keep) { out.push({ kind: "kana", keep, remove: c }); claimed.add(c.id); continue; }
    }

    // Word + one case particle, same meaning, not an adverb/set word
    const particle = CASE_PARTICLES.find((p) => jp.length > p.length && jp.endsWith(p));
    if (particle && !NOT_A_PARTICLE_COPY.test(c.partOfSpeech ?? "")) {
      const keep = byJapanese.get(jp.slice(0, -particle.length));
      if (keep && keep.id !== c.id && sameMeaning(keep, c)) {
        out.push({ kind: "particle", keep, remove: c });
        claimed.add(c.id);
      }
    }
  }

  // A card kept by one suggestion must not be removed by another
  return out.filter((d) => !claimed.has(d.keep.id));
}

const EMPTY: ModeStats = { pass: 0, fail: 0, total: 0, percent: 0 };
function addStats(a: ModeStats | undefined, b: ModeStats | undefined): ModeStats {
  const x = a ?? EMPTY, y = b ?? EMPTY;
  const pass = (x.pass || 0) + (y.pass || 0);
  const total = (x.total || 0) + (y.total || 0);
  return { pass, fail: (x.fail || 0) + (y.fail || 0), total, percent: total ? Math.round((pass / total) * 100) : 0 };
}

/** The kept card's scores after taking in the removed card's history. */
export function mergedScores(keep: FlashcardData, remove: FlashcardData): FlashcardData["scores"] {
  return {
    jp_to_en: addStats(keep.scores?.jp_to_en, remove.scores?.jp_to_en),
    en_to_jp: addStats(keep.scores?.en_to_jp, remove.scores?.en_to_jp),
  };
}

/**
 * Applies one suggestion: combines the scores into `keep` (and its priority flag), then
 * takes `remove` out of the deck and drops its scores. The shared master card stays —
 * other users may have it.
 */
export async function resolveDuplicate(userId: string, deckId: string, d: Duplicate) {
  const keepPriority = !!(d.keep.is_priority || d.remove.is_priority);
  const prioritizedAt = [d.keep.prioritized_at, d.remove.prioritized_at].filter(Boolean).sort()[0] ?? null;
  const { error } = await supabase.from("user_scores").upsert(
    {
      user_id: userId,
      card_id: d.keep.id,
      scores_json: mergedScores(d.keep, d.remove),
      is_priority: keepPriority,
      prioritized_at: keepPriority ? prioritizedAt : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,card_id" },
  );
  if (error) throw error;
  const [{ error: linkErr }, { error: scoreErr }] = await Promise.all([
    supabase.from("deck_cards").delete().eq("deck_id", deckId).eq("card_id", d.remove.id),
    supabase.from("user_scores").delete().eq("user_id", userId).eq("card_id", d.remove.id),
  ]);
  if (linkErr || scoreErr) throw linkErr || scoreErr;
}
