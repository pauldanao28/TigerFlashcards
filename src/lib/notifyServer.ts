import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { notificationText, notificationUrl, type NotificationData, type NotificationType } from "@/lib/notificationText";

// Server-only. Every notification goes through deliver(): it records the row in
// `notifications` (the Home bell's history) and pushes it to the recipient's
// subscribed devices. Rows that hit an existing (user_id, dedupe_key) are skipped
// entirely — no duplicate history row and no duplicate push.

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@flashkado.app";
const pushConfigured = !!(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey!, vapidPrivateKey!);
}

export type NotificationRow = {
  user_id: string;
  actor_id: string | null;
  type: NotificationType;
  data: NotificationData;
  dedupe_key: string | null;
};

// Asia/Singapore calendar date — the app's fixed day boundary (see update_streak).
export function sgDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

export async function deliver(rows: NotificationRow[]): Promise<{ recorded: number; pushed: number }> {
  if (rows.length === 0) return { recorded: 0, pushed: 0 };

  const { data: inserted, error } = await supabaseAdmin
    .from("notifications")
    .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
    .select("user_id, actor_id, type, data");
  if (error) {
    console.error("[notify] insert failed:", error.message);
    return { recorded: 0, pushed: 0 };
  }
  if (!inserted || inserted.length === 0 || !pushConfigured) {
    return { recorded: inserted?.length ?? 0, pushed: 0 };
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key")
    .in("user_id", [...new Set(inserted.map((r) => r.user_id))]);

  let pushed = 0;
  await Promise.all(
    inserted.flatMap((row) => {
      const { title, body } = notificationText(row.type, row.data);
      const payload = JSON.stringify({ title, body, url: notificationUrl(row.type, row.actor_id) });
      return (subs ?? [])
        .filter((s) => s.user_id === row.user_id)
        .map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
              payload
            );
            pushed++;
          } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            // 404/410 = the subscription is gone (browser unsubscribed, site data
            // cleared, device reset) — stop trying it instead of erroring every time.
            if (statusCode === 404 || statusCode === 410) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("id", sub.id);
            } else {
              console.error("[push] send failed:", err instanceof Error ? err.message : err);
            }
          }
        });
    })
  );

  return { recorded: inserted.length, pushed };
}

// Everyone with an accepted friendship with userId, in either direction.
export async function acceptedFriendIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("friendships")
    .select("user_id, friend_id")
    .eq("status", "accepted")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  return [...new Set((data ?? []).map((f) => (f.user_id === userId ? f.friend_id : f.user_id)))];
}
