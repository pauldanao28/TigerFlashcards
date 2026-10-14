"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { kanjiRe, getSegmenter, type WordStatus } from "@/components/TappableText";

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

type ScoresJson = { jp_to_en?: { total?: number; percent?: number }; en_to_jp?: { total?: number; percent?: number } };

// A tap can land on a longer segment than the word itself (食べてください, furigana
// phrases) — look up the first kanji-containing word in it.
function extractWord(text: string): string {
  const seg = getSegmenter();
  if (!seg) return text;
  const first = [...seg.segment(text)].find((s) => s.isWordLike && kanjiRe.test(s.segment));
  return first?.segment ?? text;
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
    const s = (score.scores_json ?? {}) as ScoresJson;
    const totalAttempts = (s.jp_to_en?.total || 0) + (s.en_to_jp?.total || 0);
    const accuracy = Math.round(((s.jp_to_en?.percent || 0) + (s.en_to_jp?.percent || 0)) / 2);
    patch(word, { deckStatus: totalAttempts > 0 && accuracy < WEAK_THRESHOLD ? "weak" : "known", deckAccuracy: accuracy });
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
