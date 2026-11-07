import { supabase } from "@/lib/supabase";
import { kanjiRe } from "@/lib/japaneseText";
import type { FlashcardData, ModeStats } from "@/lib/types";

// Duplicate cards in a deck (Cards page → Duplicates). Two kinds:
// - "kana":     a kana-only card (みず) whose kanji card (水) is in the deck at the same or an
//               easier JLPT level — the kanji card already teaches the reading. A kana card
//               is only worth keeping while its kanji is above the learner's level.
//               Words normally written in kana (ある, たくさん — USUALLY_KANA) go the other
//               way at any level: the kana card stays and the kanji card (有る, 沢山) goes.
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
// Kanji spellings Jisho marks "usually written using kana alone" — for these the kana card
// is the one to keep. From the starter packs' kana/kanji pairs; add more as they turn up.
export const USUALLY_KANA = new Set([
  "有る", "貴方", "何時", "眼鏡", "沢山", "下さい", "大体", "駄目", "酷い", "貰う", "殆ど", "先ず", "勿論",
]);
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

    if (kanaOnlyRe.test(jp)) {
      const kanjiCards = (kanjiByReading.get(jp) ?? []).filter((k) => sameMeaning(k, c));
      // Normally written in kana: the kanji card is the copy, whatever the levels
      const rareKanji = kanjiCards.find((k) => USUALLY_KANA.has(norm(k.japanese)));
      if (rareKanji) { out.push({ kind: "kana", keep: c, remove: rareKanji }); claimed.add(rareKanji.id); continue; }

      // Kana-only copy of a kanji card at the same or an easier level
      const keep = kanjiCards.find((k) => {
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

const DUP_COLUMNS = "id, japanese, reading, english, jlpt_level, partOfSpeech";
const CHUNK = 150;

async function selectChunked(column: string, values: string[], deckId?: string): Promise<FlashcardData[]> {
  const out: FlashcardData[] = [];
  for (let i = 0; i < values.length; i += CHUNK) {
    const chunk = values.slice(i, i + CHUNK);
    const { data, error } = deckId
      ? await supabase.from("master_cards").select(`${DUP_COLUMNS}, deck_cards!inner(deck_id)`).eq("deck_cards.deck_id", deckId).in(column, chunk)
      : await supabase.from("master_cards").select(DUP_COLUMNS).in(column, chunk);
    if (error) throw error;
    out.push(...((data ?? []) as unknown as FlashcardData[]));
  }
  return out;
}

/**
 * Run before linking cards into a deck (adding words, importing a pack): drops the ones
 * that duplicate a card already in the deck — or another card in the same batch — by the
 * same rules as findDuplicates. Returns the ids to link and what was skipped (with the
 * card it duplicates). If the check itself fails, nothing is skipped.
 */
export async function skipDeckDuplicates(deckId: string, cardIds: string[]): Promise<{ ids: string[]; skipped: Duplicate[] }> {
  if (cardIds.length === 0) return { ids: cardIds, skipped: [] };
  try {
    const candidates = await selectChunked("id", cardIds);
    const kana = candidates.map((c) => norm(c.japanese)).filter((jp) => kanaOnlyRe.test(jp));
    const bases = candidates.flatMap((c) => {
      const jp = norm(c.japanese);
      const p = CASE_PARTICLES.find((x) => jp.length > x.length && jp.endsWith(x));
      return p ? [jp.slice(0, -p.length)] : [];
    });
    // Kanji normally written in kana (有る) → is the kana card (ある) in the deck?
    const kanaForms = candidates.filter((c) => USUALLY_KANA.has(norm(c.japanese))).map((c) => norm(c.reading));
    const inDeck = [
      ...(kana.length ? await selectChunked("reading", kana, deckId) : []),
      ...(bases.length ? await selectChunked("japanese", bases, deckId) : []),
      ...(kanaForms.length ? await selectChunked("japanese", kanaForms, deckId) : []),
    ];
    const inDeckIds = new Set(inDeck.map((c) => c.id));
    const pool = [...new Map([...inDeck, ...candidates].map((c) => [c.id, c])).values()];
    const candidateIds = new Set(cardIds);
    // Only skip cards this call would newly link — one already in the deck is the review's job.
    const skipped = findDuplicates(pool).filter((d) => candidateIds.has(d.remove.id) && !inDeckIds.has(d.remove.id));
    const skippedIds = new Set(skipped.map((d) => d.remove.id));
    return { ids: cardIds.filter((id) => !skippedIds.has(id)), skipped };
  } catch (err) {
    console.error("[duplicates] check failed, linking everything:", err);
    return { ids: cardIds, skipped: [] };
  }
}
