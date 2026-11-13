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

// crypto.randomUUID() isn't available on every browser this app runs on (missing
// before iOS 15.4's WebKit, for one) — a thrown ReferenceError here would propagate
// out of upsertScoreOrQueue uncaught, since it happens inside that function's own
// catch block, breaking the rest of handleScore's post-grade UI updates. Doesn't
// need to be a real UUID, just unique enough to identify one queue entry.
function makeId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// A bare fetch() has no built-in timeout — on a degraded connection (an onboard
// wifi captive portal that never actively refuses the connection, just never
// responds) the real upsert below could hang far longer than a user will wait
// mid-review before this falls back to queuing it instead.
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("offline queue: request timed out")), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
const REQUEST_TIMEOUT_MS = 6000;

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
  next.push({ id: makeId(), payload });
  writeScoreQueue(userId, next);
  return next.length;
}

/**
 * Tries the real upsert; on ANY failure (offline, a flaky connection, a request
 * that hangs, even a transient server error) it queues the write instead of
 * losing it — callers should treat this as "handled either way," since the
 * caller's own optimistic local state update (setCards) is what the user
 * actually sees change.
 */
export async function upsertScoreOrQueue(
  userId: string,
  payload: QueuedScoreUpsert["payload"],
): Promise<{ queued: boolean; pendingCount: number }> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { queued: true, pendingCount: enqueue(userId, payload) };
  }
  try {
    const { error } = await withTimeout(
      supabase.from("user_scores").upsert(payload, { onConflict: "user_id,card_id" }),
      REQUEST_TIMEOUT_MS,
    );
    if (error) {
      return { queued: true, pendingCount: enqueue(userId, payload) };
    }
    // This write just succeeded, which proves we're genuinely online right now —
    // a good moment to catch up on anything still stuck from an earlier transient
    // failure that never triggered an 'online' or visibility event (the connection
    // never fully dropped, one request just happened to fail). NOT awaited —
    // reconnecting after a long offline session could mean draining a whole
    // flight's worth of backlog, and this one card's own grade shouldn't have to
    // wait on all of that; the pendingCount below can be a card-grade or two stale
    // until the next render-triggering event, which is a cosmetic gap, not a
    // correctness one (nothing here is lost either way).
    flushScoreQueue(userId).catch(() => {});
    return { queued: false, pendingCount: readScoreQueue(userId).length };
  } catch {
    return { queued: true, pendingCount: enqueue(userId, payload) };
  }
}

/**
 * Drains the queue, syncing what it can without letting one bad entry block
 * everything behind it. Two different failure shapes are handled differently:
 * - The request throws (timeout, offline, a dropped connection) — connectivity
 *   itself is the problem, so stop entirely; every other entry would fail the
 *   same way right now anyway.
 * - The server responds with an error — connectivity is fine, this one payload
 *   was rejected, so skip it (leave it queued, in case something about the data
 *   changes and it starts succeeding later) and keep going.
 * Only ever removes entries it personally just confirmed synced, re-reading the
 * queue right before that final write — a card graded WHILE this flush was still
 * running enqueues independently via the same read-modify-write pattern, and
 * writing back a stale snapshot taken at the start would silently erase it.
 */
export async function flushScoreQueue(userId: string): Promise<{ flushed: number; remaining: number }> {
  const queue = readScoreQueue(userId);
  const flushedIds = new Set<string>();
  for (const entry of queue) {
    try {
      const { error } = await withTimeout(
        supabase.from("user_scores").upsert(entry.payload, { onConflict: "user_id,card_id" }),
        REQUEST_TIMEOUT_MS,
      );
      if (error) {
        console.error(`Offline queue: server rejected card ${entry.payload.card_id}, leaving it queued:`, error.message);
        continue;
      }
      flushedIds.add(entry.id);
    } catch {
      break;
    }
  }
  if (flushedIds.size > 0) {
    const latest = readScoreQueue(userId);
    writeScoreQueue(userId, latest.filter((e) => !flushedIds.has(e.id)));
  }
  return { flushed: flushedIds.size, remaining: readScoreQueue(userId).length };
}
