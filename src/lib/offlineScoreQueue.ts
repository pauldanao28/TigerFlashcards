import { supabase } from "@/lib/supabase";

// A pass/fail answer's own user_scores row is the one piece of study data that must
// never be lost offline — it's the entire point of studying, and it's the input the
// "next card" picker weights against. Everything else a graded answer touches in
// StudyView (streaks, badges, daily review/mastery counts, friend notifications) is
// forward-only gamification tied to "today" in a specific timezone — replaying those
// correctly after an unknown-length offline gap (a flight, say) risks double-counting
// or misfiring a streak, so they're deliberately left exactly as they already were:
// fire-and-forget, silently no-op while offline, and simply resume working the next
// time a card is graded after reconnecting. This file only guarantees the scores
// themselves make it to the server eventually, not every side effect of earning them.
export interface QueuedScoreUpsert {
  id: string;
  payload: {
    user_id: string;
    card_id: string;
    scores_json: unknown;
    updated_at: string;
    reflex_time_total_ms?: number;
    reflex_attempts?: number;
  };
}

const queueKey = (userId: string) => `flashkado_offline_score_queue_${userId}`;

export function readScoreQueue(userId: string): QueuedScoreUpsert[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(queueKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeScoreQueue(userId: string, queue: QueuedScoreUpsert[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(queueKey(userId), JSON.stringify(queue));
  } catch { /* storage full or blocked (private mode) — not worth surfacing mid-flight */ }
}

function enqueue(userId: string, payload: QueuedScoreUpsert["payload"]): number {
  const queue = readScoreQueue(userId);
  // A later answer to the SAME card fully supersedes an earlier queued one for it —
  // only the final scores_json needs to reach the server, not every intermediate
  // step, so this collapses by card_id instead of growing unboundedly across a
  // whole offline session.
  const next = queue.filter((q) => q.payload.card_id !== payload.card_id);
  next.push({ id: crypto.randomUUID(), payload });
  writeScoreQueue(userId, next);
  return next.length;
}

/**
 * Tries the real upsert; on ANY failure (offline, a flaky connection, even a
 * transient server error) it queues the write instead of losing it — callers
 * should treat this as "handled either way," since the caller's own optimistic
 * local state update (setCards) is what the user actually sees change.
 */
export async function upsertScoreOrQueue(
  userId: string,
  payload: QueuedScoreUpsert["payload"],
): Promise<{ queued: boolean; pendingCount: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { queued: true, pendingCount: enqueue(userId, payload) };
  }
  try {
    const { error } = await supabase.from("user_scores").upsert(payload, { onConflict: "user_id,card_id" });
    if (error) {
      return { queued: true, pendingCount: enqueue(userId, payload) };
    }
    return { queued: false, pendingCount: readScoreQueue(userId).length };
  } catch {
    return { queued: true, pendingCount: enqueue(userId, payload) };
  }
}

/**
 * Drains the queue in arrival order, stopping at the first failure so nothing
 * already queued gets silently dropped — whatever's left just waits for the next
 * flush (the next 'online' event, or the next time a card is graded).
 */
export async function flushScoreQueue(userId: string): Promise<{ flushed: number; remaining: number }> {
  const queue = readScoreQueue(userId);
  let flushed = 0;
  for (const entry of queue) {
    try {
      const { error } = await supabase.from("user_scores").upsert(entry.payload, { onConflict: "user_id,card_id" });
      if (error) break;
      flushed++;
    } catch {
      break;
    }
  }
  const remainder = queue.slice(flushed);
  if (flushed > 0) writeScoreQueue(userId, remainder);
  return { flushed, remaining: remainder.length };
}
