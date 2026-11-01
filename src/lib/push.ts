"use client";
import { authedFetch } from "@/lib/authedFetch";

// Web Push requires the VAPID application server key as a raw Uint8Array, but it's
// distributed/stored as a URL-safe base64 string.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

export async function getPushSubscriptionState(): Promise<"subscribed" | "unsubscribed" | "unsupported"> {
  if (!isPushSupported()) return "unsupported";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "unsubscribed";
  } catch {
    return "unsupported";
  }
}

// Requests Notification permission (must be called from a user gesture — a click
// handler — not on page load) and, once granted, subscribes this browser/device and
// saves the subscription server-side so /api/push/notify can reach it.
export async function subscribeToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) return { success: false, error: "Not supported on this device/browser" };

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { success: false, error: "Push isn't configured yet" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { success: false, error: "Permission denied" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = sub.toJSON();
  const res = await authedFetch("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!res.ok) return { success: false, error: "Failed to save subscription" };
  return { success: true };
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await authedFetch("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) });
}

// Fire-and-forget — failure here should never block the UI's own success state, so
// callers don't await these. Both go through the one consolidated /api/push/notify
// route (see its comment) rather than a separate endpoint per notification type.
async function sendPushNotification(body: Record<string, string>): Promise<void> {
  try {
    await authedFetch("/api/push/notify", {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort
  }
}

// Called right after a friend request is actually sent (not on an auto-accepted
// mutual match, which is a different outcome — see notifyFriendAccepted).
export function notifyFriendRequest(targetUserId: string): void {
  sendPushNotification({ type: "friend_request", target_user_id: targetUserId });
}

// Called when someone accepts a request that was sent to them — notifies the
// original sender.
export function notifyFriendAccepted(targetUserId: string): void {
  sendPushNotification({ type: "friend_accepted", target_user_id: targetUserId });
}

// Called after update_streak succeeds on hitting the daily goal — tells all friends
// (the server upgrades it to a milestone message on 7/30/100… days).
export function notifyFriendsGoalMet(): void {
  sendPushNotification({ type: "friend_goal" });
}

// Called after log_quiz_daily succeeds — the server checks the quiz was really just
// logged before telling friends.
export function notifyFriendsQuizDone(quiz: "reading" | "listening" | "grammar"): void {
  sendPushNotification({ type: "friend_quiz", quiz });
}
