import path from "path";
import kuromoji, { type Tokenizer } from "kuromoji";

// Server-only. Dictionary-based morphological analysis (no AI) — unlike Intl.Segmenter,
// which splits 食べた into 食|べた, this gives each word's dictionary form (食べる).
// Built once per server instance; the dictionary takes ~200ms to load.
let tokenizerPromise: Promise<Tokenizer> | null = null;

function getTokenizer(): Promise<Tokenizer> {
  if (!tokenizerPromise) {
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji
        .builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
        .build((err, tokenizer) => (err ? reject(err) : resolve(tokenizer)));
    });
    tokenizerPromise.catch(() => { tokenizerPromise = null; });
  }
  return tokenizerPromise;
}

export interface ExtractedWord {
  word: string;     // dictionary form
  reading: string;  // hiragana; empty when only the conjugated form's reading is known
  pos: string;      // noun | verb | adjective | adverb | interjection
}

const POS_MAP: Record<string, ExtractedWord["pos"]> = {
  名詞: "noun",
  動詞: "verb",
  形容詞: "adjective",
  副詞: "adverb",
  連体詞: "adverb",
  感動詞: "interjection",
};

// Grammatical helpers that tokenize as nouns/verbs but aren't vocabulary to mine.
const SKIP_DETAIL = new Set(["非自立", "接尾", "数", "代名詞", "特殊"]);
const SKIP_WORDS = new Set(["する", "いる", "ある", "なる", "くる", "くださる", "こと", "もの", "の"]);

const japaneseRe = /[ぁ-ゟ゠-ヿ一-龯㐀-䶿々]/;
const kanaOnlyRe = /^[ぁ-ゟ゠-ヿー]+$/;

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Reading of a dictionary form. The token's own reading is for the conjugated surface
// (食べた → タベタ), so re-tokenize the bare dictionary form when the two differ.
function readingOf(tokenizer: Tokenizer, word: string): string {
  const toks = tokenizer.tokenize(word);
  return toks.length === 1 && toks[0].reading ? toHiragana(toks[0].reading) : "";
}

function extract(tokenizer: Tokenizer, text: string): ExtractedWord[] {
  const seen = new Set<string>();
  const out: ExtractedWord[] = [];
  for (const t of tokenizer.tokenize(text)) {
    const pos = POS_MAP[t.pos];
    if (!pos || SKIP_DETAIL.has(t.pos_detail_1)) continue;
    const word = t.basic_form && t.basic_form !== "*" ? t.basic_form : t.surface_form;
    if (!japaneseRe.test(word) || SKIP_WORDS.has(word) || seen.has(word)) continue;
    if (kanaOnlyRe.test(word) && word.length < 2) continue;
    seen.add(word);
    out.push({
      word,
      reading: t.reading && word === t.surface_form ? toHiragana(t.reading) : readingOf(tokenizer, word),
      pos,
    });
  }
  return out;
}

/** Unique vocabulary words in order of first appearance, in dictionary form. */
export async function extractWords(text: string): Promise<ExtractedWord[]> {
  return extract(await getTokenizer(), text);
}

export interface DeckWord {
  japanese: string;
  reading: string | null;
}

/**
 * Words in `text` that aren't already in the deck, matching across forms:
 * - deck cards saved in a non-dictionary form (食べた, 勉強する) are normalized first;
 *   compounds that tokenize into several words (行き方) are only matched as-is, so
 *   they never hide a word the user doesn't actually have.
 * - kana vs kanji spellings (おいしい ↔ 美味しい) match by reading, but only when one
 *   side is kana-only — two different kanji words sharing a reading (橋/箸) don't.
 */
export async function findNewWords(text: string, deck: DeckWord[]): Promise<ExtractedWord[]> {
  const tokenizer = await getTokenizer();
  const forms = new Set<string>();
  const deckReadings = new Set<string>();   // readings of every deck card
  const kanaDeckWords = new Set<string>();  // deck cards written only in kana

  for (const d of deck) {
    const japanese = d.japanese.trim();
    forms.add(japanese);
    const normalized = extract(tokenizer, japanese);
    if (normalized.length === 1) forms.add(normalized[0].word);
    if (d.reading) deckReadings.add(toHiragana(d.reading.trim()));
    if (kanaOnlyRe.test(japanese)) kanaDeckWords.add(toHiragana(japanese));
  }

  return extract(tokenizer, text).filter((w) => {
    if (forms.has(w.word)) return false;
    if (kanaOnlyRe.test(w.word) && deckReadings.has(toHiragana(w.word))) return false;
    if (w.reading && kanaDeckWords.has(w.reading)) return false;
    return true;
  });
}
