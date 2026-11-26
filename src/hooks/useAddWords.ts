"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { useAppAlert } from "@/context/AlertContext";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { translations } from "@/lib/languages";
import { skipDeckDuplicates } from "@/lib/duplicates";
import { normalizeSituationTags, type ImportMode, type ImportPreviewCard } from "@/lib/cardMetadata";

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
  card_type?: "vocabulary" | "phrase";
  situation_tags?: string[];
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
  // Whether DAILY_LIMIT actually truncated this batch — admin/premium accounts
  // bypass or never approach it, so this must reflect the real check below, not
  // a guess from the resulting word count (a big legitimate batch, or one mostly
  // "already in deck", looks identical to a truncated one by count alone).
  const [limitApplied, setLimitApplied] = useState(false);

  // "Related Words" — shown only after a deliberate single-word add (not a batch),
  // below the summary. Fetched separately from the add itself so a slow/failed AI
  // call never blocks the add from completing. relatedWordsAttempted distinguishes
  // "this add wasn't a single-word one, section stays hidden" from "it was, and
  // this is what came back (possibly nothing)" — without it, a quota-exhausted or
  // failed fetch looks identical to the section never having run at all.
  const [relatedWords, setRelatedWords] = useState<RelatedWord[]>([]);
  const [relatedWordsLoading, setRelatedWordsLoading] = useState(false);
  const [relatedWordsAttempted, setRelatedWordsAttempted] = useState(false);
  const fetchRelatedWords = async (card: { japanese: string; reading: string; english: string }) => {
    setRelatedWordsAttempted(true);
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

    // A card already in the deck must NEVER get its user_scores row re-upserted with
    // a blank scores_json — that wipes real progress back to zero, making a card
    // studied many times look brand new again ("I already know this" button and
    // all). Only genuinely new-to-this-deck cards get a fresh blank row; deck_cards
    // itself is still safely re-upserted for all of them (idempotent membership).
    // Review history can still exist when a card was previously removed from a
    // deck. Never overwrite an existing user_scores row during re-import.
    const { data: previousScores, error: previousScoreError } = await supabase
      .from("user_scores").select("card_id").eq("user_id", userId).in("card_id", cardIds);
    if (previousScoreError) throw previousScoreError;
    const scoredIds = new Set((previousScores ?? []).map(row => row.card_id));
    const newIds = cardIds.filter(id => !scoredIds.has(id));

    const [deckRes, scoreRes] = await Promise.all([
      supabase.from("deck_cards").upsert(
        cardIds.map((id) => ({ deck_id: deckId, card_id: id })),
        { onConflict: "deck_id,card_id" },
      ),
      newIds.length > 0
        ? supabase.from("user_scores").upsert(
            newIds.map((id) => ({
              user_id: userId,
              card_id: id,
              scores_json: {
                jp_to_en: { pass: 0, fail: 0, total: 0, percent: 0 },
                en_to_jp: { pass: 0, fail: 0, total: 0, percent: 0 },
              },
            })),
            { onConflict: "user_id,card_id" },
          )
        : Promise.resolve({ error: null }),
    ]);
    if (deckRes.error) throw deckRes.error;
    if (scoreRes.error) throw scoreRes.error;
  };

  // A related-word suggestion already has a real master_cards row (enriched and
  // upserted server-side by /api/related-words) — adding it is just a link, no AI
  // call, unlike processWords' own path which would re-check master_cards and
  // potentially call /api/generate again. Appends to the existing summary and
  // drops it from the suggestions list — it does NOT fetch a new round of related
  // words for it, so suggestions only ever come from the one word the user
  // deliberately single-added, not an unbounded chain from tapping through them.
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
      setAddedWordsSummary((prev) => [...prev.filter((c) => c.id !== summaryEntry.id), summaryEntry]);
      setRelatedWords((prev) => prev.filter((r) => r.id !== w.id));
      onAdded?.();
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
  const processWords = async (inputList: string[], options?: { cardType?: ImportMode }): Promise<Set<string>> => {
    const cardType = options?.cardType ?? "vocabulary";
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
    if (cardType === "phrase" || cardType === "auto") {
      wordsToProcess = inputList.map(item => item.trim()).filter(Boolean);
    } else if (inputList.length === 1 && inputList[0].trim().length > 0) {
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
    setRelatedWordsAttempted(false);
    setLimitApplied(false);

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
          setLimitApplied(true);
          showAlert(t.partial_limit_msg);
        }
      }
    } catch (limitErr) {
      console.error("Limit check failed, proceeding anyway:", limitErr);
    }

    let allProcessedCards: any[] = [];
    const preLinkedIds = new Set<string>();
    // Existing library entries are reused as-is, including their type, tags and scores.
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
            body: JSON.stringify({ words: wordsForAI, cardType }),
          });

          if (!res.ok) throw new Error(res.status === 429 ? "AI Limit Reached" : "AI Error");

          const items = await res.json();
          const itemsArray = Array.isArray(items) ? items : [items];

          // Deduplicate AI output by exact Japanese text, not by partial words
          const seen = new Set<string>();
          const deduplicatedItems = itemsArray
            .map((item: any) => ({
              japanese: String(item.japanese).trim(),
              reading: String(item.reading || "").replace(/[a-zA-Z\s]/g, ""),
              english: String(item.english || "").trim(),
              alternatives: Array.isArray(item.alternatives) ? item.alternatives.filter((v: unknown): v is string => typeof v === "string") : [],
              partOfSpeech: String(item.partOfSpeech || "noun").trim().toLowerCase(),
              jlpt_level: item.jlpt_level ?? null,
              exampleSentence: {
                ...(item.exampleSentence && typeof item.exampleSentence === "object" ? item.exampleSentence : { jp: "", en: "" }),
                ...(typeof item.usage_note === "string" ? { note: item.usage_note.trim().slice(0, 300) } : {}),
              },
              te_form: item.te_form ?? null,
              transitivity: item.transitivity ?? null,
              verb_type: item.verb_type ?? null,
              adjective_type: item.adjective_type ?? null,
              suru_meaning: item.suru_meaning ?? null,
              creator_id: userId,
              card_type: cardType === "auto"
                ? (item.card_type === "phrase" ? "phrase" : "vocabulary")
                : cardType,
              situation_tags: normalizeSituationTags(Array.isArray(item.situation_tags) ? item.situation_tags : []),
            }))
            .filter((item: any) => {
              if (!item.japanese || seen.has(item.japanese)) return false;
              seen.add(item.japanese);
              return true;
            });

          // Check again for exact Japanese duplicates after AI generation.
          // Catches cards that were missed by the first check (e.g. whole-text paste input).
          const generatedJapanese = deduplicatedItems.map((i) => i.japanese);
          const { data: alreadyInMaster } = await supabase
            .from("master_cards")
            .select("*")
            .in("japanese", generatedJapanese);

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
              .upsert(trulyNewItems, { onConflict: "japanese", ignoreDuplicates: true })
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
        // itself finishing. Matched by the normalized word rather than requiring
        // finalSummary.length === 1, since the AI can still return more than one card
        // for what the user typed as a single item (e.g. it read as a short phrase) —
        // that shouldn't silently suppress the suggestions.
        if (uniqueInputWords.length === 1 && cardType === "vocabulary") {
          const singleWordCard = finalSummary.find((c) => c.japanese === uniqueInputWords[0]) ?? finalSummary[0];
          fetchRelatedWords(singleWordCard);
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

  // A preview never writes to the database until the user confirms. Exact matches
  // are linked to the deck without overwriting master metadata or user progress.
  const savePreviewCards = async (previewRows: ImportPreviewCard[]): Promise<Set<string>> => {
    if (!userId || !deckId) throw new Error("Sign in and initialize your deck first.");
    const choices = previewRows.filter(row => row.selected && !row.alreadyInDeck);
    const unique = [...new Map(choices.map(row => [row.japanese.trim(), row])).values()];
    if (!unique.length) return new Set<string>();
    if (unique.length > 100) throw new Error("Import at most 100 entries at once.");
    if (unique.some(row => !row.japanese.trim() || !row.english.trim()))
      throw new Error("Every selected card needs Japanese text and an English meaning.");

    if (!isAdmin) {
      // Preserve the existing 100-cards-per-day rule used by the normal importer.
      const { data: quota, error: quotaError } = await supabase
        .from("admin_user_performance_master").select("cards_added_today")
        .eq("id", userId).single();
      if (quotaError) throw quotaError;
      const remaining = Math.max(0, DAILY_LIMIT - (quota?.cards_added_today ?? 0));
      if (unique.length > remaining) throw new Error(
        remaining === 0 ? "Daily card limit reached." :
        "You can add " + remaining + " more cards today. Uncheck some entries to continue."
      );
    }

    setLoading(true);
    setUploadBusy(true);
    try {
      const japanese = unique.map(row => row.japanese.trim());
      const { data: firstExisting, error: lookupError } = await supabase
        .from("master_cards").select("*").in("japanese", japanese);
      if (lookupError) throw lookupError;
      const existingJapanese = new Set((firstExisting ?? []).map(row => row.japanese));
      const newItems = unique.filter(row => !existingJapanese.has(row.japanese.trim())).map(row => ({
        japanese: row.japanese.trim(),
        reading: row.reading.trim(),
        english: row.english.trim(),
        creator_id: userId,
        card_type: row.card_type,
        situation_tags: normalizeSituationTags(row.situation_tags),
        partOfSpeech: row.card_type === "phrase" ? "phrase" : row.partOfSpeech,
        jlpt_level: row.jlpt_level,
        alternatives: row.alternatives,
        exampleSentence: {
          jp: row.exampleSentence.jp.trim(),
          en: row.exampleSentence.en.trim(),
          note: row.usage_note.trim(),
        },
      }));
      if (newItems.length) {
        // ignoreDuplicates prevents a concurrent import from overwriting a shared
        // dictionary entry. Re-fetch below to link the winning row.
        const { error: insertError } = await supabase.from("master_cards")
          .upsert(newItems, { onConflict: "japanese", ignoreDuplicates: true });
        if (insertError) throw insertError;
      }
      const { data: savedCards, error: savedError } = await supabase
        .from("master_cards").select("*").in("japanese", japanese);
      if (savedError) throw savedError;
      const byJapanese = new Map((savedCards ?? []).map(card => [card.japanese, card]));
      if (japanese.some(j => !byJapanese.has(j)))
        throw new Error("Some cards could not be found after saving.");

      const ids = [...new Set((savedCards ?? []).map(c => c.id))];
      const linkedBefore = await alreadyLinked(ids);
      await performLinking(ids);
      const summary = (savedCards ?? []).map(card =>
        skippedFor.get(card.id) ?? { ...card, alreadyInDeck: linkedBefore.has(card.id) }
      );
      setAddedWordsSummary(summary);
      setRelatedWords([]);
      setRelatedWordsAttempted(false);
      setShowSummary(true);
      onAdded?.();
      return new Set(choices.map(row => row.input));
    } finally {
      setLoading(false);
      setUploadBusy(false);
    }
  };

  const deleteFromSummary = async (id: string) => {
    if (!deckId || !userId) return;
    // Removing a freshly imported deck link must not erase prior review history.
    const { error: linkErr } = await supabase
      .from("deck_cards").delete().eq("card_id", id).eq("deck_id", deckId);

    if (linkErr) {
      showAlert(`Could not remove: ${linkErr.message}`);
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
    savePreviewCards,
    deleteFromSummary,
    relatedWords,
    relatedWordsLoading,
    relatedWordsAttempted,
    addRelatedWord,
    limitApplied,
  };
}
