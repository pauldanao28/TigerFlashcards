"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { WordStatus } from "@/components/TappableText";
import { kanjiRe, splitTappable } from "@/lib/japaneseText";

// Below this accuracy a deck word counts as "weak" — same threshold the stats page uses
// for its Struggling list.
export const WEAK_THRESHOLD = 40;

export interface WordLookup {
  word: string;       // what was tapped
  reading: string;
  editWord: string;   // the word being looked up / added (user-editable)
  jishoLoading: boolean;
  jishoMeanings?: { definition: string; pos: string }[];
  jlpt?: string[];
  isCommon?: boolean;
  compounds?: { word: string; reading: string; meaning: string; jlpt: string[]; is_common: boolean }[];
  deckStatus?: WordStatus;  // undefined while the deck check is in flight
  deckAccuracy?: number;
}

type DirScore = { pass?: number; total?: number; percent?: number };
export type ScoresJson = { jp_to_en?: DirScore; en_to_jp?: DirScore };

/**
 * Deck status of a word the user has: "weak" (hard) = below WEAK_THRESHOLD, "easy" = the
 * stats page's Mastered rule (≥5 passes at ≥70% in either direction), else "known".
 */
export function deckStatusFromScores(s: ScoresJson): { status: WordStatus; accuracy: number } {
  const totalAttempts = (s.jp_to_en?.total || 0) + (s.en_to_jp?.total || 0);
  const accuracy = Math.round(((s.jp_to_en?.percent || 0) + (s.en_to_jp?.percent || 0)) / 2);
  const mastered = [s.jp_to_en, s.en_to_jp].some((d) => (d?.pass || 0) >= 5 && (d?.percent || 0) >= 70);
  const status = totalAttempts > 0 && accuracy < WEAK_THRESHOLD ? "weak" : mastered ? "easy" : "known";
  return { status, accuracy };
}

// A tap can land on a longer phrase than one word (the Sensei chat's furigana phrases like
// 今日も元気に) — look up its first kanji word, okurigana included (same rule as TappableText).
function extractWord(text: string): string {
  return splitTappable(text).find((p) => p.word)?.text ?? text;
}

/**
 * State + data loading for the shared tap-to-lookup sheet (WordLookupSheet): Jisho
 * definition (or compounds, for a single kanji) plus whether the word is in the user's
 * deck and how well they know it. Editing the word re-runs both lookups, debounced.
 */
export function useWordLookup(userId: string | null | undefined) {
  const [lookup, setLookup] = useState<WordLookup | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Results are dropped if the user has since moved on to a different word.
  const patch = (word: string, fields: Partial<WordLookup>) =>
    setLookup((prev) => (prev && prev.editWord === word ? { ...prev, ...fields } : prev));

  const checkDeck = useCallback(async (word: string) => {
    const { data: card } = await supabase.from("master_cards").select("id").eq("japanese", word).maybeSingle();
    const { data: score } = card && userId
      ? await supabase.from("user_scores").select("scores_json").eq("user_id", userId).eq("card_id", card.id).maybeSingle()
      : { data: null };
    if (!score) { patch(word, { deckStatus: "new", deckAccuracy: undefined }); return; }
    const { status, accuracy } = deckStatusFromScores((score.scores_json ?? {}) as ScoresJson);
    patch(word, { deckStatus: status, deckAccuracy: accuracy });
  }, [userId]);

  const fetchJisho = useCallback((word: string, allowCompounds: boolean) => {
    const isSingleKanji = allowCompounds && word.length === 1 && kanjiRe.test(word);
    const url = `/api/jisho?word=${encodeURIComponent(word)}${isSingleKanji ? "&compounds=true" : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) =>
        setLookup((prev) => {
          if (!prev || prev.editWord !== word) return prev;
          if (isSingleKanji) return { ...prev, jishoLoading: false, compounds: d.compounds ?? [] };
          return {
            ...prev,
            jishoLoading: false,
            compounds: undefined,
            reading: prev.reading || (d.found ? d.reading : ""),
            jishoMeanings: d.found ? d.meanings : [],
            jlpt: d.found ? d.jlpt : [],
            isCommon: d.found ? d.is_common : false,
          };
        }),
      )
      .catch(() => patch(word, { jishoLoading: false }));
  }, []);

  /** Open the sheet for a tapped word. `reading` is optional (pass "" if unknown). */
  const openLookup = useCallback((word: string, reading: string, e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    const editWord = extractWord(word);
    setLookup({ word, reading, editWord, jishoLoading: true });
    checkDeck(editWord);
    fetchJisho(editWord, true);
  }, [checkDeck, fetchJisho]);

  /** The user edited the word in the sheet — re-run both lookups once they pause typing. */
  const setEditWord = useCallback((value: string) => {
    setLookup((prev) => (prev ? { ...prev, editWord: value } : prev));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const word = value.trim();
    if (!word || !kanjiRe.test(word)) return;
    debounceRef.current = setTimeout(() => {
      setLookup((prev) => (prev && prev.editWord.trim() === word
        ? { ...prev, editWord: word, reading: "", jishoLoading: true, jishoMeanings: [], jlpt: [], isCommon: false, deckStatus: undefined }
        : prev));
      checkDeck(word);
      fetchJisho(word, false);
    }, 500);
  }, [checkDeck, fetchJisho]);

  const closeLookup = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLookup(null);
  }, []);

  return { lookup, openLookup, setEditWord, closeLookup };
}
