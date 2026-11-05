"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { useAppAlert } from "@/context/AlertContext";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { translations } from "@/lib/languages";
import { skipDeckDuplicates } from "@/lib/duplicates";

const t = translations.en;
const DAILY_LIMIT = 100;

export interface AddedWordSummary {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  partOfSpeech?: string;
  jlpt_level?: "N5" | "N4" | "N3" | "N2" | "N1" | null;
  alreadyInDeck: boolean;
}

export interface RelatedWord {
  id: string; // already a real master_cards row — /api/related-words enriches and
              // upserts it server-side, so adding it is a plain link, no AI call.
  japanese: string;
  reading: string;
  english: string;
  jlpt_level: "N5" | "N4" | "N3" | "N2" | "N1" | null;
}

/**
 * Same add-word pipeline as the stats page's Add Sheet (tokenize input, check
 * the daily AI limit, look up/generate cards, link them into the deck) minus
 * the pending-words queue persistence, which is specific to that page's UI.
 * Deliberately takes only ids, not a pre-loaded card list, so it can run from
 * anywhere (e.g. the Study tab) without first fetching the whole deck.
 */
export function useAddWords({
  userId,
  deckId,
  isAdmin = false,
  blocklist = [],
  onAdded,
}: {
  userId?: string | null;
  deckId?: string | null;
  isAdmin?: boolean;
  blocklist?: string[];
  onAdded?: () => void;
}) {
  const { showAlert } = useAppAlert();
  const { setIsBusy: setUploadBusy } = useUploadGuard();
  const [loading, setLoading] = useState(false);
  const [addedWordsSummary, setAddedWordsSummary] = useState<AddedWordSummary[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  // "Related Words" — shown only after a deliberate single-word add (not a batch),
  // below the summary. Fetched separately from the add itself so a slow/failed AI
  // call never blocks the add from completing.
  const [relatedWords, setRelatedWords] = useState<RelatedWord[]>([]);
  const [relatedWordsLoading, setRelatedWordsLoading] = useState(false);
  const fetchRelatedWords = async (card: { japanese: string; reading: string; english: string }) => {
    setRelatedWordsLoading(true);
    try {
      const res = await authedFetch("/api/related-words", {
        method: "POST",
        body: JSON.stringify({ word: card.japanese, reading: card.reading, english: card.english }),
      });
      if (!res.ok) { setRelatedWords([]); return; }
      const { words } = await res.json();
      setRelatedWords(Array.isArray(words) ? words : []);
    } catch {
      setRelatedWords([]);
    } finally {
      setRelatedWordsLoading(false);
    }
  };

  // Duplicates skipped while linking (みず when 水 is in the deck): removed card id → the
  // deck card it duplicates, shown in the summary as "already in deck" instead.
  const skippedFor = new Map<string, AddedWordSummary>();

  const performLinking = async (rawIds: string[]) => {
    if (rawIds.length === 0 || !deckId || !userId) return;
    const { ids: cardIds, skipped } = await skipDeckDuplicates(deckId, rawIds);
    skipped.forEach((d) => skippedFor.set(d.remove.id, { ...d.keep, alreadyInDeck: true }));
    if (cardIds.length === 0) return;
    const [deckRes, scoreRes] = await Promise.all([
      supabase.from("deck_cards").upsert(
        cardIds.map((id) => ({ deck_id: deckId, card_id: id })),
        { onConflict: "deck_id,card_id" },
      ),
      supabase.from("user_scores").upsert(
        cardIds.map((id) => ({
          user_id: userId,
          card_id: id,
          scores_json: {
            jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
            en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
          },
        })),
        { onConflict: "user_id,card_id" },
      ),
    ]);
    if (deckRes.error) throw deckRes.error;
    if (scoreRes.error) throw scoreRes.error;
  };

  // A related-word suggestion already has a real master_cards row (enriched and
  // upserted server-side by /api/related-words) — adding it is just a link, no AI
  // call, unlike processWords' own path which would re-check master_cards and
  // potentially call /api/generate again. Replaces the summary with this word (and
  // fetches related words for IT), so tapping through suggestions chains instead
  // of stacking — same UX processWords' own single-add path already has.
  const addRelatedWord = async (w: RelatedWord) => {
    if (!deckId || !userId) return;
    try {
      await performLinking([w.id]);
      const summaryEntry: AddedWordSummary = skippedFor.get(w.id) ?? {
        id: w.id,
        japanese: w.japanese,
        reading: w.reading,
        english: w.english,
        jlpt_level: w.jlpt_level,
        alreadyInDeck: false,
      };
      setAddedWordsSummary([summaryEntry]);
      setShowSummary(true);
      onAdded?.();
      fetchRelatedWords(summaryEntry);
    } catch {
      showAlert("Couldn't add that word — try again.");
    }
  };

  // Cards already linked to this deck before this call touches them — queried per-batch of
  // ids right before linking, since there's no local card list to check against here.
  const alreadyLinked = async (cardIds: string[]): Promise<Set<string>> => {
    if (cardIds.length === 0 || !deckId) return new Set();
    const { data } = await supabase
      .from("deck_cards")
      .select("card_id")
      .eq("deck_id", deckId)
      .in("card_id", cardIds);
    return new Set((data ?? []).map((l) => l.card_id));
  };

  // Batch input is one word per line — extracting vocabulary from lyrics/stories is
  // the Reader's job, so lines are never re-segmented here (that chopped 食べる into 食|べる).
  const processWords = async (inputList: string[]): Promise<Set<string>> => {
    const succeededWords = new Set<string>();
    if (!userId || !deckId) {
      showAlert("Please log in and ensure deck is initialized.");
      return succeededWords;
    }

    const rawInput = inputList.join("\n").normalize("NFKC").trim();
    if (!rawInput) return succeededWords;

    let wordsToProcess: string[] = [];
    const isEnglishInput = /^[A-Za-z0-9\s.,!?-]+$/.test(rawInput);

    // Single Add Bypass: if only one item is provided, treat it as a deliberate single add
    // and do NOT chop the kanji/words.
    if (inputList.length === 1 && inputList[0].trim().length > 0) {
      wordsToProcess = [inputList[0].trim()];
    } else if (isEnglishInput) {
      wordsToProcess = inputList.map((w) => w.trim()).filter((w) => w.length > 0);
    } else if (rawInput.includes(",") || rawInput.includes("-")) {
      wordsToProcess = inputList.map((line) => line.split(/[,-]/)[0].trim());
    } else {
      wordsToProcess = inputList
        .map((w) => w.normalize("NFKC").trim())
        .filter((w) => /[぀-ヿ一-龯]/.test(w) && !blocklist.includes(w));
    }

    const uniqueInputWords = [...new Set(wordsToProcess)];
    if (uniqueInputWords.length === 0) return succeededWords;

    // A fresh add always clears stale suggestions from whatever was added before —
    // re-populated below only when this turns out to be a single-word add.
    setRelatedWords([]);

    setLoading(true);
    setUploadBusy(true);

    let wordsToActuallyProcess = uniqueInputWords;

    try {
      if (!isAdmin) {
        const { data: performance } = await supabase
          .from("admin_user_performance_master")
          .select("cards_added_today")
          .eq("id", userId)
          .single();

        const currentToday = performance?.cards_added_today || 0;

        if (currentToday >= DAILY_LIMIT) {
          setLoading(false);
          setUploadBusy(false);
          showAlert(t.limit_reached_msg);
          return succeededWords;
        }

        if (currentToday + uniqueInputWords.length > DAILY_LIMIT) {
          const allowedCount = DAILY_LIMIT - currentToday;
          wordsToActuallyProcess = uniqueInputWords.slice(0, allowedCount);
          showAlert(t.partial_limit_msg);
        }
      }
    } catch (limitErr) {
      console.error("Limit check failed, proceeding anyway:", limitErr);
    }

    let allProcessedCards: any[] = [];
    const preLinkedIds = new Set<string>();

    try {
      const { data: existingCards, error: searchErr } = await supabase
        .from("master_cards")
        .select("*")
        .in("japanese", wordsToActuallyProcess);

      if (searchErr) throw searchErr;

      if (existingCards) {
        allProcessedCards = [...existingCards];
        const foundIds = existingCards.map((c) => c.id);
        if (foundIds.length > 0) {
          (await alreadyLinked(foundIds)).forEach((id) => preLinkedIds.add(id));
          await performLinking(foundIds);
        }
        existingCards.forEach((c) => succeededWords.add(c.japanese));
      }

      const existingMap = new Map(existingCards?.map((c) => [c.japanese, c.id]) || []);
      const wordsForAI = wordsToActuallyProcess.filter((w) => !existingMap.has(w));

      if (wordsForAI.length > 0) {
        try {
          const res = await authedFetch("/api/generate", {
            method: "POST",
            body: JSON.stringify({ words: wordsForAI }),
          });

          if (!res.ok) throw new Error(res.status === 429 ? "AI Limit Reached" : "AI Error");

          const items = await res.json();
          const itemsArray = Array.isArray(items) ? items : [items];

          // Deduplicate Gemini output by dictionary form
          const seen = new Set<string>();
          const deduplicatedItems = itemsArray
            .map((item: any) => ({
              japanese: String(item.japanese).trim(),
              reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""),
              english: String(item.english || "").trim(),
              partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(),
              jlpt_level: item.jlpt_level ?? null,
              exampleSentence: item.exampleSentence || { jp: "", en: "" },
              te_form: item.te_form ?? null,
              transitivity: item.transitivity ?? null,
              verb_type: item.verb_type ?? null,
              adjective_type: item.adjective_type ?? null,
              suru_meaning: item.suru_meaning ?? null,
              creator_id: userId,
            }))
            .filter((item: any) => {
              if (!item.japanese || seen.has(item.japanese)) return false;
              seen.add(item.japanese);
              return true;
            });

          // Second existing-card check against Gemini's normalized dictionary-form words.
          // Catches cards that were missed by the first check (e.g. whole-text paste input).
          const geminiWords = deduplicatedItems.map((i) => i.japanese);
          const { data: alreadyInMaster } = await supabase
            .from("master_cards")
            .select("*")
            .in("japanese", geminiWords);

          const alreadyInMasterMap = new Map((alreadyInMaster ?? []).map((c) => [c.japanese, c]));

          if (alreadyInMaster && alreadyInMaster.length > 0) {
            const ids = alreadyInMaster.map((c) => c.id);
            (await alreadyLinked(ids)).forEach((id) => preLinkedIds.add(id));
            allProcessedCards = [...allProcessedCards, ...alreadyInMaster];
            await performLinking(ids);
            alreadyInMaster.forEach((c) => succeededWords.add(c.japanese));
          }

          // Only upsert words that are truly new to master_cards — these can never already be
          // in the deck, since the row didn't exist until now.
          const trulyNewItems = deduplicatedItems.filter((i) => !alreadyInMasterMap.has(i.japanese));
          if (trulyNewItems.length > 0) {
            const { data: newCards, error: mErr } = await supabase
              .from("master_cards")
              .upsert(trulyNewItems, { onConflict: "japanese" })
              .select("*");

            if (mErr) throw mErr;
            if (newCards) {
              allProcessedCards = [...allProcessedCards, ...newCards];
              await performLinking(newCards.map((c) => c.id));
              newCards.forEach((c) => succeededWords.add(c.japanese));
            }
          }
          wordsForAI.forEach((w) => succeededWords.add(w));
        } catch (aiErr: any) {
          console.error("AI Step Failed:", aiErr.message);
          showAlert(`AI processing failed: ${aiErr.message}`);
        }
      }

      if (allProcessedCards.length > 0) {
        const summaryCards = Array.from(
          new Map(allProcessedCards.map((c) => [c.japanese, c])).values(),
        ).map((c) => skippedFor.get(c.id) ?? { ...c, alreadyInDeck: preLinkedIds.has(c.id) });
        // A skipped duplicate shows as its deck card — which may also be in the list itself.
        const finalSummary = Array.from(new Map(summaryCards.map((c) => [c.id, c])).values());
        setAddedWordsSummary(finalSummary);
        setShowSummary(true);
        onAdded?.();
        // A deliberate single-word add (not a batch) gets "Related Words" suggestions —
        // fired in the background, not awaited, so a slow AI call never delays the add
        // itself finishing.
        if (uniqueInputWords.length === 1 && finalSummary.length === 1) {
          fetchRelatedWords(finalSummary[0]);
        }
      }
    } catch (e: any) {
      console.error("ProcessWords Error:", e);
      showAlert(
        e.message === "AI Limit Reached"
          ? "Daily word-generation limit reached — this keeps the app free for everyone. Come back tomorrow to add more!"
          : `Something went wrong: ${e.message}`,
      );
    } finally {
      setLoading(false);
      setUploadBusy(false);
    }
    return succeededWords;
  };

  const deleteFromSummary = async (id: string) => {
    if (!deckId || !userId) return;
    const [{ error: linkErr }, { error: scoreErr }] = await Promise.all([
      supabase.from("deck_cards").delete().eq("card_id", id).eq("deck_id", deckId),
      supabase.from("user_scores").delete().eq("card_id", id).eq("user_id", userId),
    ]);

    if (linkErr || scoreErr) {
      showAlert(`Could not delete: ${linkErr?.message || scoreErr?.message}`);
      return;
    }

    setAddedWordsSummary((prev) => prev.filter((c) => c.id !== id));
    onAdded?.();
  };

  return {
    loading,
    addedWordsSummary,
    showSummary,
    setShowSummary,
    processWords,
    deleteFromSummary,
    relatedWords,
    relatedWordsLoading,
    addRelatedWord,
  };
}
