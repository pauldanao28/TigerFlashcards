import { supabase } from "@/lib/supabase";

// Same localStorage cache key AddWordsSheet's own Queue tab reads on mount (before
// reconciling with the DB) — writing it here too means a word queued from elsewhere
// (e.g. Translate) shows up there immediately, with no network round trip needed.
const pendingWordsKey = (userId: string) => `flashkado-word-list-${userId}`;

/**
 * Merges `words` into the user's pending_words queue (profiles.pending_words) —
 * the same list AddWordsSheet's Queue tab holds. Callers that want a "stage for
 * review, don't add to the deck yet" flow (rather than Reader/Watch's straight-
 * to-deck useAddWords.processWords) use this instead.
 */
export async function queuePendingWords(userId: string, words: string[]): Promise<void> {
  const toAdd = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
  if (!toAdd.length) return;
  const { data } = await supabase.from("profiles").select("pending_words").eq("id", userId).single();
  const current: string[] = data?.pending_words ?? [];
  const merged = [...new Set([...current, ...toAdd])];
  const { error } = await supabase.from("profiles").update({ pending_words: merged }).eq("id", userId);
  if (error) throw error;
  try {
    localStorage.setItem(pendingWordsKey(userId), JSON.stringify(merged));
  } catch {
    // ignore — quota exceeded, private browsing, storage disabled, etc.
  }
}
