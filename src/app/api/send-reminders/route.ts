import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

// Use service role key so we can read all users' subscriptions
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  // Find all push subscriptions where the user hasn't studied today
  // and has an active streak worth protecting (streak >= 1)
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select(`
      endpoint, p256dh, auth,
      profiles!inner (streak_count, last_review_date)
    `)
    .neq('profiles.last_review_date', today)
    .gte('profiles.streak_count', 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = await Promise.allSettled(
    (subs ?? []).map((sub: any) => {
      const streak = sub.profiles?.streak_count ?? 0;
      const payload = JSON.stringify({
        title: streak >= 7 ? `🔥 ${streak}-day streak at risk!` : '📚 Daily reminder',
        body: streak >= 3
          ? `Don't lose your ${streak}-day streak — study now!`
          : 'A few cards a day keeps the forgetting away.',
      });
      return webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return NextResponse.json({ sent, failed });
}
