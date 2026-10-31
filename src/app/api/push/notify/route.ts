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

// One consolidated send path for every push notification type in the app, instead of
// a near-duplicate route per type — add a new case here as new notification types come
// up (e.g. a future cron-triggered "streak at risk" would also call this, passing
// whatever target/type it needs). Called directly from the client at the moment an
// action happens (not via a Supabase Database Webhook, which would need manual
// dashboard configuration this can't do).
//
// Message text for every type is built server-side from data this route looks up
// itself (the caller's own profile) — never taken from the request body — so it can't
// be used to push arbitrary text to a stranger.
type NotifyType = "friend_request" | "friend_accepted";

async function buildMessage(type: NotifyType, callerName: string): Promise<{ title: string; body: string }> {
  switch (type) {
    case "friend_request":
      return { title: "New friend request", body: `${callerName} wants to be friends` };
    case "friend_accepted":
      return { title: "Friend request accepted", body: `${callerName} accepted your friend request!` };
  }
}

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  if (!vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  }

  const { type, target_user_id } = await req.json();
  if (type !== "friend_request" && type !== "friend_accepted") {
    return NextResponse.json({ error: "Unknown notification type" }, { status: 400 });
  }
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

  const { title, body } = await buildMessage(type as NotifyType, callerName);
  const payload = JSON.stringify({ title, body, url: "/" });

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
