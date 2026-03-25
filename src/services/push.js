import { sb, VAPID_PUBLIC_KEY } from '../supabase.js';
import { state } from '../state.js';

let pushSubscription = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    pushSubscription = await reg.pushManager.getSubscription();
    return pushSubscription;
  } catch (e) {
    console.error('[push init]', e);
    return null;
  }
}

export function isPushActive() {
  return !!pushSubscription;
}

export async function subscribePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Permission denied');

  const reg = await navigator.serviceWorker.ready;
  pushSubscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });

  const key = pushSubscription.getKey('p256dh');
  const auth = pushSubscription.getKey('auth');
  await sb.from('hub_push_subscriptions').upsert({
    user_id: state.currentUser.id,
    endpoint: pushSubscription.endpoint,
    p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
    auth: btoa(String.fromCharCode(...new Uint8Array(auth))),
  }, { onConflict: 'endpoint' });

  return pushSubscription;
}

export async function unsubscribePush() {
  if (!pushSubscription) return;
  const endpoint = pushSubscription.endpoint;
  await pushSubscription.unsubscribe();
  await sb.from('hub_push_subscriptions').delete().eq('endpoint', endpoint);
  pushSubscription = null;
}
