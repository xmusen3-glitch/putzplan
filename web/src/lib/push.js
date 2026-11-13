// Push-Benachrichtigungen an- und ummelden.
import { S, post } from './store.svelte.js';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
export const pushOn = () => pushSupported() && Notification.permission === 'granted' && localStorage.getItem('pp_push') === S.meId;

const key = b => { const p = '='.repeat((4 - (b.length % 4)) % 4), raw = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
async function subscribe() {
  const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('Die App ist noch nicht ganz geladen. Bitte einmal neu öffnen.')), 6000))]);
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(S.pushKey) }));
  await post('/push/sub', { sub: sub.toJSON() });
  localStorage.setItem('pp_push', S.meId);
}
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS ? 'Auf dem iPhone geht das nur, wenn die App auf dem Home-Bildschirm liegt.' : 'Dieser Browser kann leider keine Benachrichtigungen.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt (in den Handy-Einstellungen änderbar).');
  await subscribe();
  await post('/push/test');
}
/** Nach einem Personenwechsel auf diesem Gerät: die Benachrichtigungen gehören jetzt der neuen Person. */
export function rebindPush() {
  const was = localStorage.getItem('pp_push');
  if (was && was !== S.meId && pushSupported() && Notification.permission === 'granted') subscribe().catch(() => {});
}
