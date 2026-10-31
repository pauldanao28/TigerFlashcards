import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { getAuthedUser } from "@/lib/apiAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:support@flashkado.app";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

// Called client-side right after a successful send_friend_request — not via a
// Supabase Database Webhook, to avoid needing manual dashboard configuration for
// this to work. Message content is looked up server-side from the caller's own
// profile (never taken from the request body), so this can't be used to push
// arbitrary text to a stranger — only "<your real name> wants to be friends".
export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  const { target_user_id } = await req.json();
  if (!target_user_id) return NextResponse.json({ error: "Missing target_user_id" }, { status: 400 });

  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const callerName = callerProfile?.full_name || "Someone";

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", target_user_id);

  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 });

  const payload = JSON.stringify({
    title: "New friend request",
    body: `${callerName} wants to be friends`,
    url: "/",
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          payload
        );
        sent++;
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
    })
  );

  return NextResponse.json({ sent });
}
