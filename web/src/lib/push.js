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
/**
 * Beim Öffnen der App. Hat das Gerät die Erlaubnis schon, meldet es sich still wieder an (auch nach einem
 * Personenwechsel: die Benachrichtigungen gehören dann der neuen Person). Sonst sagt die Antwort, welcher
 * Hinweis gezeigt werden soll: 'frage' (einschalten), 'gesperrt' (im Gerät verboten), 'ios' (erst auf den
 * Home-Bildschirm) oder nichts.
 */
export function pushAsk() {
  if (pushSupported() && Notification.permission === 'granted' && localStorage.getItem('pp_push')) { subscribe().catch(() => {}); return null; }
  const wait = localStorage.getItem('pp_push_ask');
  if (wait === 'nie' || +wait > Date.now()) return null;
  if (!pushSupported()) return isIOS && !isStandalone() ? 'ios' : null;
  return Notification.permission === 'denied' ? 'gesperrt' : 'frage';
}
/** „Später“ fragt am nächsten Tag wieder, „nicht mehr fragen“ gilt für dieses Gerät. */
export const pushLater = never => localStorage.setItem('pp_push_ask', never ? 'nie' : String(Date.now() + 20 * 3600e3));
