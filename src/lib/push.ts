import { supabase } from './supabase';

export async function isPushSupported(): Promise<boolean> {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!(await isPushSupported())) return false;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export async function subscribeToPush(userId: string): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    });

    const json = sub.toJSON();
    const keys = json.keys as { p256dh: string; auth: string };

    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: json.endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'user_id,endpoint' }
    );

    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(userId: string): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sub.unsubscribe();
  await supabase.from('push_subscriptions').delete()
    .eq('user_id', userId)
    .eq('endpoint', sub.endpoint);
}
