// Derives verb/adjective grammar metadata from Jisho's `parts_of_speech` tags, and
// deterministically computes the te-form from the resulting verb-type classification
// (rule-based — conjugation is mechanical once you know the verb type, no lookup needed
// for the te-form itself beyond knowing which type a given verb is).

export type VerbType = "godan" | "ichidan" | "irregular";
export type Transitivity = "transitive" | "intransitive";
export type AdjectiveType = "i" | "na";

export function classifyFromTags(tags: string[]): {
  verbType: VerbType | null;
  transitivity: Transitivity | null;
  adjectiveType: AdjectiveType | null;
} {
  let verbType: VerbType | null = null;
  let transitivity: Transitivity | null = null;
  let adjectiveType: AdjectiveType | null = null;

  for (const raw of tags) {
    const t = raw.toLowerCase();
    if (!verbType) {
      if (t.includes("suru verb") || t.includes("kuru verb")) verbType = "irregular";
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
  return { verbType, transitivity, adjectiveType };
}

const GODAN_TE_ENDING: Record<string, string> = {
  "う": "って", "つ": "って", "る": "って",
  "む": "んで", "ぶ": "んで", "ぬ": "んで",
  "く": "いて", "ぐ": "いで", "す": "して",
};

// `word` is the dictionary form (kanji + okurigana, e.g. 食べる, 飲む, 勉強する, 来る) —
// Japanese verbs always carry their inflecting ending in kana even when written with
// kanji, so operating on the word's own last character(s) is enough; no separate
// reading-based logic needed.
export function computeTeForm(word: string, verbType: VerbType): string | null {
  if (!word) return null;

  // する-compounds (勉強する, 結婚する, bare する) all conjugate the same way regardless
  // of what precedes them — checked before godan/ichidan since する also ends in る,
  // which would otherwise wrongly trigger the godan "-ru ending" rule.
  if (word.endsWith("する")) return word.slice(0, -2) + "して";
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
