"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { useAddWords, type AddedWordSummary } from "@/hooks/useAddWords";
import type { WordStatus } from "@/components/TappableText";
import { kanjiRe, splitTappable, stripFurigana } from "@/lib/japaneseText";
import { deckStatusFromScores, type ScoresJson } from "@/hooks/useWordLookup";
import type { ExtractedWord } from "@/lib/japaneseTokenizer";

// "Kanji words only" filter for the "Not in your deck" list — hides words with no kanji
// at all (ちょっと, ラーメン); kanji words keep their okurigana (食べる). A per-viewer
// preference, so browser storage is fine (every access guarded — it can be unavailable).
const KANJI_ONLY_KEY = "flashkado-newwords-kanji-only";
function loadKanjiOnly(): boolean {
  try { return localStorage.getItem(KANJI_ONLY_KEY) === "1"; } catch { return false; }
}

/**
 * Everything a "read real Japanese and mine words from it" screen needs (the Reader,
 * the Watch view):
 * - deck status per tapped word, for the violet (new) / rose (weak) / emerald (easy) highlights
 * - the "Not in your deck" list — the server tokenizes the text into dictionary forms
 *   (食べた → 食べる, no AI) and drops what's already in the deck; AI only runs when the
 *   user batch-adds the ones they picked
 * - adding words straight into the deck (useAddWords)
 */
export function useWordMining(userId: string) {
  const [deckId, setDeckId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [blocklist, setBlocklist] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      supabase.from("decks").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle(),
      supabase.from("profiles").select("is_admin, blocked_words").eq("id", userId).maybeSingle(),
    ]).then(([deckRes, profileRes]) => {
      setDeckId(deckRes.data?.id ?? null);
      setIsAdmin(!!profileRes.data?.is_admin);
      setBlocklist(profileRes.data?.blocked_words ?? []);
    });
  }, [userId]);

  const {
    loading: addLoading,
    processWords,
    addedWordsSummary,
    showSummary,
    setShowSummary,
    deleteFromSummary,
  } = useAddWords({
    userId,
    deckId: deckId ?? "",
    isAdmin,
    blocklist,
  });
  const [addedWords, setAddedWords] = useState<Set<string>>(new Set());

  // ── Deck status for highlighting ──
  const [wordStatus, setWordStatus] = useState<Map<string, { status: WordStatus; accuracy?: number }>>(new Map());
  const getWordStatus = (word: string): WordStatus => wordStatus.get(word)?.status ?? "new";

  const markKnown = (words: Iterable<string>) => {
    const list = [...words];
    setAddedWords((prev) => new Set([...prev, ...list]));
    setWordStatus((prev) => {
      const next = new Map(prev);
      list.forEach((w) => next.set(w, { status: "known" }));
      return next;
    });
  };

  // Look up every kanji word in the text against the user's own deck (not just
  // master_cards — a word can exist there without this user ever having added it),
  // so new/weak words can be highlighted instead of treated the same as known ones.
  const loadWordStatus = async (text: string) => {
    // Same word units TappableText renders, so every highlighted word has a status.
    const words = [...new Set(splitTappable(stripFurigana(text)).filter((p) => p.word).map((p) => p.text))];
    if (words.length === 0) { setWordStatus(new Map()); return; }

    // Dictionary form of each unit (難しかった → 難しい) from the server tokenizer — no AI.
    // If it fails, words are matched exactly as written.
    let forms: Record<string, string> = {};
    try {
      const res = await authedFetch("/api/reader/forms", { method: "POST", body: JSON.stringify({ words }) });
      if (res.ok) forms = (await res.json()).forms ?? {};
    } catch { /* exact matching only */ }

    // Status per card text, for both the written form and the dictionary form.
    const statusByJapanese = new Map<string, { status: WordStatus; accuracy?: number }>();
    const candidates = [...new Set(words.flatMap((w) => [w, forms[w] ?? w]))];
    // Chunked so long texts (full video transcripts) don't blow past PostgREST's URL limit.
    for (let i = 0; i < candidates.length; i += 100) {
      const chunk = candidates.slice(i, i + 100);
      const { data: cards } = await supabase.from("master_cards").select("id, japanese").in("japanese", chunk);
      const cardIds = (cards ?? []).map((c) => c.id);
      const { data: scores } = cardIds.length
        ? await supabase.from("user_scores").select("card_id, scores_json").eq("user_id", userId).in("card_id", cardIds)
        : { data: [] as { card_id: string; scores_json: ScoresJson }[] };
      const scoreByCardId = new Map((scores ?? []).map((s) => [s.card_id, s.scores_json as ScoresJson]));

      for (const card of cards ?? []) {
        const s = scoreByCardId.get(card.id);
        if (!s) continue; // in the shared library but not in this user's deck
        statusByJapanese.set(card.japanese, deckStatusFromScores(s));
      }
    }

    const map = new Map<string, { status: WordStatus; accuracy?: number }>();
    for (const word of words) {
      const form = forms[word];
      map.set(word, statusByJapanese.get(word) ?? (form ? statusByJapanese.get(form) : undefined) ?? { status: "new" });
    }
    setWordStatus(map);
  };

  // ── "Not in your deck" list ──
  const [newWords, setNewWords] = useState<ExtractedWord[]>([]);
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set());
  const [newWordsError, setNewWordsError] = useState(false);
  const [newWordsLoading, setNewWordsLoading] = useState(false);

  const [kanjiOnly, setKanjiOnly] = useState(false);
  useEffect(() => { setKanjiOnly(loadKanjiOnly()); }, []);
  const toggleKanjiOnly = () =>
    setKanjiOnly((prev) => {
      try { localStorage.setItem(KANJI_ONLY_KEY, prev ? "0" : "1"); } catch { /* ignore */ }
      return !prev;
    });

  // What the list shows (and what "Select all" / "Add" act on) after the filter.
  const visibleNewWords = kanjiOnly ? newWords.filter((w) => kanjiRe.test(w.word)) : newWords;
  const visibleSelectedCount = visibleNewWords.filter((w) => selectedNew.has(w.word)).length;

  const lastTextRef = useRef("");

  const loadNewWords = async (text: string) => {
    lastTextRef.current = text;
    setNewWordsError(false);
    setNewWordsLoading(true);
    try {
      const res = await authedFetch("/api/reader/words", { method: "POST", body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Already filtered against the deck server-side (across forms: 食べた/食べる, おいしい/美味しい).
      const missing = ((data.words as ExtractedWord[]) ?? []).filter((w) => !blocklist.includes(w.word));
      setNewWords(missing);
      setSelectedNew(new Set(missing.map((w) => w.word)));
    } catch {
      setNewWords([]);
      setNewWordsError(true);
    } finally {
      setNewWordsLoading(false);
    }
  };

  const clearNewWords = () => {
    setNewWords([]);
    setSelectedNew(new Set());
    setNewWordsError(false);
  };

  const toggleNewWord = (word: string) =>
    setSelectedNew((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word); else next.add(word);
      return next;
    });

  const toggleAllNewWords = () =>
    setSelectedNew((prev) => {
      const next = new Set(prev);
      const allOn = visibleSelectedCount === visibleNewWords.length;
      visibleNewWords.forEach((w) => (allOn ? next.delete(w.word) : next.add(w.word)));
      return next;
    });

  const addSelectedNewWords = async () => {
    const words = visibleNewWords.filter((w) => selectedNew.has(w.word)).map((w) => w.word);
    if (words.length === 0) return;
    const added = await processWords(words);
    if (added.size === 0) return;
    setNewWords((prev) => prev.filter((w) => !added.has(w.word)));
    setSelectedNew((prev) => new Set([...prev].filter((w) => !added.has(w))));
    markKnown(added);
  };

  /** Add one word (from the lookup sheet) straight into the deck. */
  const addWord = async (word: string) => {
    await processWords([word]);
    markKnown([word]);
  };

  /** Undo from the "Words added" summary: remove from the deck, un-highlight, and put it back in the list. */
  const removeAdded = async (word: AddedWordSummary) => {
    await deleteFromSummary(word.id);
    setAddedWords((prev) => {
      const next = new Set(prev);
      next.delete(word.japanese);
      return next;
    });
    setWordStatus((prev) => new Map(prev).set(word.japanese, { status: "new" }));
    if (lastTextRef.current) loadNewWords(lastTextRef.current);
  };

  return {
    addedWordsSummary,
    showSummary,
    closeSummary: () => setShowSummary(false),
    removeAdded,
    addLoading,
    addedWords,
    addWord,
    getWordStatus,
    loadWordStatus,
    newWords,
    visibleNewWords,
    visibleSelectedCount,
    kanjiOnly,
    toggleKanjiOnly,
    selectedNew,
    newWordsError,
    newWordsLoading,
    loadNewWords,
    clearNewWords,
    toggleNewWord,
    toggleAllNewWords,
    addSelectedNewWords,
  };
}

export type WordMining = ReturnType<typeof useWordMining>;
