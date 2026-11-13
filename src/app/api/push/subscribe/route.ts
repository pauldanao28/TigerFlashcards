import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthedUser } from "@/lib/apiAuth";

// Service-role client, same pattern as rateLimit.ts — writes need to bypass RLS
// since this route authenticates the caller via JWT, not via a session-bound client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      // Live table's actual unique constraint is on (user_id, endpoint), not
      // endpoint alone — matches push_subscriptions_user_id_endpoint_key.
      { onConflict: "user_id,endpoint" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getAuthedUser(req);
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { endpoint } = await req.json();
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });

  await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
