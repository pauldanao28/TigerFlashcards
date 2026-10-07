"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { authedFetch } from "@/lib/authedFetch";
import { useAppAlert } from "@/context/AlertContext";
import { useUploadGuard } from "@/context/UploadGuardContext";
import { translations } from "@/lib/languages";

const t = translations.en;
const DAILY_LIMIT = 50;

export interface AddedWordSummary {
  id: string;
  japanese: string;
  reading: string;
  english: string;
  partOfSpeech?: string;
  alreadyInDeck: boolean;
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

  const performLinking = async (cardIds: string[]) => {
    if (cardIds.length === 0 || !deckId || !userId) return;
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
      const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });
      const segments = segmenter.segment(rawInput);
      wordsToProcess = Array.from(segments)
        .map((s) => s.segment.trim())
        .filter((w) => {
          const isJapanese = /[぀-ヿ一-龯]/.test(w);
          const isNotBlocked = !blocklist.includes(w);
          const isMeaningful = w.length > 1 || /[一-龯]/.test(w);
          return isJapanese && isNotBlocked && isMeaningful;
        });
    }

    const uniqueInputWords = [...new Set(wordsToProcess)];
    if (uniqueInputWords.length === 0) return succeededWords;

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
          showAlert(
            t.limit_reached_msg
              .replace("{{current}}", currentToday.toString())
              .replace("{{limit}}", DAILY_LIMIT.toString()),
          );
          return succeededWords;
        }

        if (currentToday + uniqueInputWords.length > DAILY_LIMIT) {
          const allowedCount = DAILY_LIMIT - currentToday;
          wordsToActuallyProcess = uniqueInputWords.slice(0, allowedCount);
          showAlert(t.partial_limit_msg.replace("{{count}}", allowedCount.toString()));
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
        const finalSummary = Array.from(
          new Map(allProcessedCards.map((c) => [c.japanese, c])).values(),
        ).map((c) => ({ ...c, alreadyInDeck: preLinkedIds.has(c.id) }));
        setAddedWordsSummary(finalSummary);
        setShowSummary(true);
        onAdded?.();
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
  };
}
