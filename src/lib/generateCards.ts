import { GoogleGenerativeAI } from "@google/generative-ai";
import { stripParens, normalizeEnglish, normalizePartOfSpeech } from "@/lib/textNormalize";
import { SITUATION_TAGS, type ImportMode } from "@/lib/cardMetadata";

// Shared by /api/generate (the normal add pipeline) and /api/related-words (which
// enriches whichever of its suggestions aren't already in master_cards) — same
// Gemini call, same output shape, so both end up with real, deck-ready card data
// instead of related-words faking a lighter shape that still needed a second
// /api/generate round trip once the user actually tapped "add".
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface GeneratedCard {
  japanese: string;
  reading: string;
  english: string;
  alternatives?: string[];
  card_type?: "vocabulary" | "phrase";
  situation_tags?: string[];
  usage_note?: string;
  partOfSpeech: string;
  jlpt_level: string | null;
  exampleSentence: { jp: string; en: string };
  te_form: string | null;
  transitivity: "transitive" | "intransitive" | null;
  verb_type: "godan" | "ichidan" | "irregular" | null;
  adjective_type: "i" | "na" | null;
  suru_meaning: string | null;
}

const prompt = (words: string[]) => `Task: Process the following input and produce flashcard data.

Input: [${words.join(", ")}]

Step 1 — Detect input type for each item:
- If the item is a SINGLE WORD or SHORT PHRASE (a term to look up): process it directly.
- If the item is a SENTENCE, LYRICS, STORY, or PARAGRAPH (contains multiple words forming natural text): first extract all meaningful vocabulary from it — nouns, verbs, i-adjectives, na-adjectives, adverbs. Skip particles (は、が、を、に、で、と、の、も、へ、から、まで、より), conjunctions, and filler words. Then process each extracted word individually.

Step 2 — For every word (whether given directly or extracted from text):
1. If Japanese (Kanji/Kana): the "japanese" field must be the plain DICTIONARY FORM (辞書形), never the form as it appeared in the text.
   - Verb/i-adjective conjugations (て-form, た-form, ます-form, negative, passive, potential, causative, etc.) → normalize to dictionary form, e.g. "食べた"→"食べる", "飲みます"→"飲む", "美味しかった"→"美しい".
   - Na-adjectives with copula (だった, でした, じゃない, etc.) → strip copula and return bare stem, e.g. "静かだった"→"静か".
   - Nouns don't conjugate — return as-is.
   - Deduplicate: if the same dictionary form appears multiple times, output it only once.
2. If English: provide the most common Kanji (dictionary form), reading, and example.
3. Identify the Part of Speech.
4. Classify JLPT level: N5 (easiest) → N1 (hardest). If unsure, pick the closest level.

Rules for the "partOfSpeech" field:
- Must be EXACTLY ONE of these lowercase tags, nothing else: noun, verb, adjective, adverb, particle, pronoun, conjunction, number, phrase.
- "phrase" is only for multi-word idioms, set expressions, or greetings that don't fit a single grammatical category.
- If a word can act as both a noun and a suru-verb, tag it "noun". If a word can act as both a noun and a na-adjective, tag it "adjective".
- No qualifiers, no romaji/Japanese characters, no explanations.
- Good: "noun", "verb", "adjective"
- Bad: "godan verb, transitive", "名詞", "noun (suru-verb)", "na-adjective (adjectival noun)"

Rules for the "english" field:
- Plain, concise translation only. No parentheses, no brackets, no qualifiers, no "to " prefix for verbs.
- If the word has multiple common meanings, give AT MOST 3, each a single word or short 2-3 word phrase, separated by " / " — never a comma-separated list, never connector words like "or"/"and".
- Good: "eat", "challenge", "mistake", "beautiful", "panic / scare", "companion / escort"
- Bad: "(to) eat", "eat (food)", "challenge (suru verb)", "mistake (error)", "panic, scare, consternation, or economic crisis", "companion; attendant; escort; accompaniment; offering"

Rules for the "exampleSentence" field:
- REQUIRED for every item — never omit it or leave "jp"/"en" empty, even for particles, pronouns, or words that feel too simple to need one.
- "jp": ONE natural, appropriately-leveled Japanese sentence that actually contains the word (its dictionary form or a natural inflection of it), not just the word in isolation. No furigana or parenthetical readings embedded in the sentence text.
- "en": a natural English translation of that exact sentence — not a restatement of the word's dictionary definition.
- Keep both short (roughly 5-15 words) and don't lean on grammar harder than the word's own JLPT level.

Rules for the verb/adjective grammar fields (te_form, transitivity, verb_type, adjective_type, suru_meaning):
- These apply to verbs, adjectives, AND any noun capable of taking する to become a verb
  (e.g. 勉強, 結婚, 料理) — note that per the partOfSpeech rule above, such a word is
  still tagged "noun" and its "japanese" field stays the bare noun (勉強, never 勉強する);
  only these fields describe its する-usage. For every other word, set all five to null.
- "verb_type": EXACTLY ONE of "godan", "ichidan", "irregular". する itself, 来る, and any
  suru-capable noun (勉強, 結婚, etc.) are all "irregular". null for non-verbs/non-suru-nouns.
- "transitivity": EXACTLY ONE of "transitive", "intransitive", whichever the word (or its
  する-usage, for a suru-capable noun) actually is. If it genuinely has both senses, pick
  its more common usage. null otherwise.
- "te_form": the て-form AS IF する were conjugated onto it — 食べる→食べて, 飲む→飲んで,
  来る→来て, 勉強 (suru-capable noun)→勉強して. null otherwise.
- "adjective_type": for an adjective only — EXACTLY ONE of "i", "na" (い-adjective vs な-adjective — some words ending in い are actually na-adjectives, e.g. きれい, きらい, ゆうめい; don't be fooled by the spelling). null otherwise.
- "suru_meaning": ONLY for a suru-capable noun whose する-usage means something genuinely
  different from the noun's own "english" field above — e.g. 急行 ("english": "express
  train") → "suru_meaning": "to rush / proceed directly" (its する-usage is a different
  concept, not just a form change). Keep it SHORT — a few words or one short phrase, at
  most 2 near-synonyms separated by " / "; never a long list of synonyms. If the する-usage
  means essentially the same thing as the noun (e.g. 勉強 "study" → 勉強する "to study"), set this to null — it would be
  redundant with "english". null for everything else too.

Output ONLY raw JSON as an ARRAY of objects:
[
  {
    "japanese": "...",
    "reading": "...",
    "english": "...",
    "partOfSpeech": "noun",
    "jlpt_level": "N5",
    "alternatives": [],
    "exampleSentence": { "jp": "...", "en": "..." },
    "te_form": null,
    "transitivity": null,
    "verb_type": null,
    "adjective_type": null,
    "suru_meaning": null
  }
]`;

const phrasePrompt = (phrases: string[]) => `Create one Japanese conversational flashcard for EACH item, in the same order. Each item is an entire expression, NOT vocabulary to extract.

Items (JSON): ${JSON.stringify(phrases)}

Critical requirements:
- Keep every Japanese input EXACTLY as entered (including contractions, particles and punctuation) as the "japanese" field. Do NOT normalize into dictionary form, segment or shorten phrases.
- If an input is English, give ONE natural everyday Japanese translation as "japanese".
- "reading" is full kana reading for the complete expression.
- "english" is one natural short English translation of the whole expression, not a word-by-word gloss.
- "partOfSpeech" must be "phrase"; "jlpt_level" may be null when a single level is not appropriate.
- "alternatives" may list other natural English translations.
- "exampleSentence" contains a short natural contextual exchange in "jp" and its natural "en" translation.
- Set te_form, transitivity, verb_type, adjective_type and suru_meaning to null.
Return ONLY a JSON array with exactly ${phrases.length} objects and these fields:
[{ "japanese":"...", "reading":"...", "english":"...", "partOfSpeech":"phrase", "jlpt_level":null, "alternatives":[], "exampleSentence":{"jp":"...", "en":"..."}, "te_form":null, "transitivity":null, "verb_type":null, "adjective_type":null, "suru_meaning":null }]`;


const previewPrompt = (inputs: string[], mode: ImportMode) => `Produce EXACTLY one Japanese flashcard per input, in the same order. These are independent entries, not paragraphs:
${JSON.stringify(inputs)}
Mode: ${mode}. If auto, classify each as vocabulary (single lexical item) or phrase (full utterance, idiom, reaction, set expression, greeting); if vocabulary, every item is vocabulary; if phrase, every item is a complete phrase.
For Japanese phrases preserve the input string EXACTLY including particles, colloquial inflection and punctuation, never deconjugate or segment them. For Japanese vocabulary return canonical dictionary forms where appropriate. English inputs need a natural Japanese equivalent.
Give accurate full kana reading, a natural English meaning, up to 3 alternative natural translations, a concise usage_note about formality/tone/context, and a brief natural exampleSentence (jp,en).
Give 1-3 situation_tags drawn ONLY from: ${JSON.stringify(SITUATION_TAGS)}.
For phrases set partOfSpeech=phrase; for vocabulary classify its actual part of speech (noun,verb,adjective,adverb,particle,pronoun,conjunction,number,phrase).
JLPT can be null for phrases. For phrases set all grammar metadata null.
Return ONLY valid JSON array of exactly ${inputs.length} cards in the same order, using:
[{"japanese":"...", "reading":"...", "english":"...", "card_type":"phrase", "situation_tags":["Friends"], "usage_note":"...", "alternatives":[], "partOfSpeech":"phrase", "jlpt_level":null, "exampleSentence":{"jp":"...","en":"..."}, "te_form":null, "transitivity":null, "verb_type":null, "adjective_type":null, "suru_meaning":null}]`;

async function tryGenerate(modelName: string, words: string[], cardType: ImportMode = "vocabulary", preview = false): Promise<string> {
  const model = genAI.getGenerativeModel({ model: modelName });
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(preview ? previewPrompt(words, cardType) : cardType === "phrase" ? phrasePrompt(words) : prompt(words));
      return result.response.text();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const retryable = msg.includes("503") || msg.includes("429") || msg.includes("overloaded");
      if (!retryable || attempt === 2) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

// Throws on total failure (both models) or invalid JSON — callers decide how to
// surface that (an error response, or just dropping the words in a best-effort path).
export async function generateCards(words: string[], options?: {cardType?: ImportMode; preview?: boolean}): Promise<GeneratedCard[]> {
  const cardType = options?.cardType ?? "vocabulary";
  let text: string;
  try {
    text = await tryGenerate("gemini-2.5-flash-lite", words, cardType, options?.preview);
  } catch {
    text = await tryGenerate("gemini-2.5-flash", words, cardType, options?.preview);
  }

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const cleanJson = jsonMatch ? jsonMatch[0] : text;

  const parsedData: Record<string, unknown>[] = JSON.parse(cleanJson);
  if (!Array.isArray(parsedData) || (options?.preview && parsedData.length !== words.length)) {
    throw new Error("Gemini did not return one card per input; please retry.");
  }
  const asEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
  return parsedData.map((item: Record<string, unknown>, index: number) => {
    const detectedType = item.card_type === "phrase" ? "phrase" : "vocabulary";
    const type = cardType === "auto" ? detectedType : cardType;
    const sourceInput = words[index] ?? "";
    const example = item.exampleSentence && typeof item.exampleSentence === "object"
      ? item.exampleSentence as Record<string, unknown> : {};
    const tagCandidates = Array.isArray(item.situation_tags) ? item.situation_tags : [];
    const tags = tagCandidates.map(tag => typeof tag === "string" ? SITUATION_TAGS.find(preferred => preferred.toLowerCase() === tag.trim().toLowerCase()) : undefined).filter((tag): tag is typeof SITUATION_TAGS[number] => !!tag);
    return {
    ...item,
    japanese: type === "phrase" && /[\u3040-\u30ff\u3400-\u9fff]/u.test(sourceInput) ? sourceInput.trim() : String(item.japanese ?? "").trim(),
    card_type: type,
    situation_tags: tags,
    usage_note: typeof item.usage_note === "string" ? item.usage_note.trim().slice(0, 300) : "",
    english: typeof item.english === "string" ? (type === "phrase" ? item.english.trim() : normalizeEnglish(item.english)) : "",
    reading: typeof item.reading === "string" ? stripParens(item.reading) : "",
    partOfSpeech: type === "phrase" ? "phrase" : typeof item.partOfSpeech === "string" ? normalizePartOfSpeech(item.partOfSpeech) : "noun",
    jlpt_level: asEnum(item.jlpt_level, ["N5","N4","N3","N2","N1"] as const),
    alternatives: Array.isArray(item.alternatives) ? item.alternatives.filter((v): v is string => typeof v === "string") : [],
    exampleSentence: { jp: String(example.jp ?? ""), en: String(example.en ?? "") },
    te_form: typeof item.te_form === "string" && item.te_form.trim() ? item.te_form.trim() : null,
    transitivity: asEnum(item.transitivity, ["transitive", "intransitive"] as const),
    verb_type: asEnum(item.verb_type, ["godan", "ichidan", "irregular"] as const),
    adjective_type: asEnum(item.adjective_type, ["i", "na"] as const),
    suru_meaning: typeof item.suru_meaning === "string" && item.suru_meaning.trim() ? item.suru_meaning.trim() : null,
  };
  });
}
