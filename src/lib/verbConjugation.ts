// Derives verb/adjective grammar metadata from Jisho's `parts_of_speech` tags, and
// deterministically computes the te-form from the resulting verb-type classification
// (rule-based — conjugation is mechanical once you know the verb type, no lookup needed
// for the te-form itself beyond knowing which type a given verb is).

export type VerbType = "godan" | "ichidan" | "irregular";
export type Transitivity = "transitive" | "intransitive";
export type AdjectiveType = "i" | "na";

// Label for a suru-capable noun's する-usage ("急行する:"). Most suru-nouns are stored
// bare (急行), but a few older/mistagged rows already have する baked into "japanese" —
// appending する unconditionally there would show "急行するする:".
export function suruLabel(word: string): string {
  return word.endsWith("する") ? word : `${word}する`;
}

// Jisho has no judgment call like the generate-route prompt does ("only set
// suru_meaning if the する-usage genuinely differs from the noun — null otherwise, it'd
// be redundant") — it just returns whatever definitions the suru-tagged sense has,
// which are often near-synonyms of the noun's own meaning (遅刻 "lateness" vs its
// する-usage "lateness, tardiness, arriving late"). This approximates that same
// judgment procedurally: if most of the suru-usage's words already appear in the
// noun's own English meaning, showing it as a separate line is just redundant clutter.
export function isRedundantSuruMeaning(nounEnglish: string, suruMeaning: string): boolean {
  const words = (s: string) =>
    new Set(s.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 2));
  const nounWords = words(nounEnglish);
  const suruWords = [...words(suruMeaning)];
  if (suruWords.length === 0) return true;
  const overlap = suruWords.filter((w) => nounWords.has(w)).length;
  return overlap / suruWords.length >= 0.6;
}

export function classifyFromTags(tags: string[]): {
  verbType: VerbType | null;
  transitivity: Transitivity | null;
  adjectiveType: AdjectiveType | null;
  // True for a word Jisho tags as able to take する — either it's already a suru verb
  // entry, or (more commonly in this app's data, since a suru-capable word is stored as
  // the bare noun, e.g. 勉強 not 勉強する) a noun tagged "Noun or participle which takes
  // the aux. verb suru". Every "suru"-mentioning tag genuinely means this; no known
  // false positives in Jisho's tag set.
  isSuruCapable: boolean;
} {
  let verbType: VerbType | null = null;
  let transitivity: Transitivity | null = null;
  let adjectiveType: AdjectiveType | null = null;
  let isSuruCapable = false;

  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (t.includes("suru")) {
      isSuruCapable = true;
      if (!verbType) verbType = "irregular";
    }
    if (!verbType) {
      if (t.includes("kuru verb")) verbType = "irregular";
      else if (t.includes("ichidan verb")) verbType = "ichidan";
      else if (t.includes("godan verb")) verbType = "godan";
    }
    if (!transitivity) {
      // "intransitive verb" contains the substring "transitive verb" — check it first.
      if (t.includes("intransitive verb")) transitivity = "intransitive";
      else if (t.includes("transitive verb")) transitivity = "transitive";
    }
    if (!adjectiveType) {
      if (t.includes("i-adjective")) adjectiveType = "i";
      else if (t.includes("na-adjective")) adjectiveType = "na";
    }
  }
  return { verbType, transitivity, adjectiveType, isSuruCapable };
}

const GODAN_TE_ENDING: Record<string, string> = {
  "う": "って", "つ": "って", "る": "って",
  "む": "んで", "ぶ": "んで", "ぬ": "んで",
  "く": "いて", "ぐ": "いで", "す": "して",
};

// `word` is the dictionary form (kanji + okurigana, e.g. 食べる, 飲む, 勉強する, 来る) —
// Japanese verbs always carry their inflecting ending in kana even when written with
// kanji, so operating on the word's own last character(s) is enough; no separate
// reading-based logic needed. `isSuruCapable` covers the bare-noun case (勉強 rather
// than 勉強する — this app stores a suru-capable word without the する, so there's
// nothing to strip; して is appended instead).
export function computeTeForm(word: string, verbType: VerbType, isSuruCapable?: boolean): string | null {
  if (!word) return null;

  // する-compounds (勉強する, 結婚する, bare する) all conjugate the same way regardless
  // of what precedes them — checked before godan/ichidan since する also ends in る,
  // which would otherwise wrongly trigger the godan "-ru ending" rule.
  if (word.endsWith("する")) return word.slice(0, -2) + "して";
  if (isSuruCapable) return word + "して";
  if (word.endsWith("来る")) return word.slice(0, -2) + "来て";
  if (word === "くる") return "きて";

  if (verbType === "ichidan") {
    return word.endsWith("る") ? word.slice(0, -1) + "て" : null;
  }

  if (verbType === "godan") {
    // Famous exception: 行く (and compounds ending in it) → 行って, not the regular
    // く → いて pattern.
    if (word.endsWith("行く")) return word.slice(0, -1) + "って";
    const last = word.slice(-1);
    const ending = GODAN_TE_ENDING[last];
    return ending ? word.slice(0, -1) + ending : null;
  }

  // "irregular" with neither a する/来る/くる match above isn't a verb we know how to
  // conjugate reliably — leave it blank rather than guess.
  return null;
}
