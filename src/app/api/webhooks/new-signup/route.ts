import { NextResponse } from "next/server";

const NOTIFY_EMAIL = "pauldanao28@gmail.com";

// Fires from a Supabase Database Webhook on auth.users INSERT (configured in the
// Supabase Dashboard, not via migration — this route just receives and reacts).
// Verified via a shared secret header set on the webhook config, since this is
// otherwise an unauthenticated public endpoint.
export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.SIGNUP_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const email = payload?.record?.email ?? "unknown";
  const createdAt = payload?.record?.created_at ?? new Date().toISOString();

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not configured — skipping signup email");
    return NextResponse.json({ ok: false, error: "Email not configured" }, { status: 500 });
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "FlashKado <onboarding@resend.dev>",
      to: NOTIFY_EMAIL,
      subject: `New signup: ${email}`,
      text: `New user signed up.\n\nEmail: ${email}\nCreated at: ${createdAt}`,
    }),
  });

  if (!res.ok) {
    console.error("Resend send failed:", await res.text());
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
