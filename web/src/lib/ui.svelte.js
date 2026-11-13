// Dialoge (Sheets), Kurzmeldungen und der Emoji-Regen.
class UI {
  sheets = $state.raw([]);
  toast = $state.raw(null);
  rain = $state.raw(null);
}
export const ui = new UI();

let n = 0, toastTimer, rainTimer;
/** Öffnet einen Dialog und liefert, womit er geschlossen wurde (ohne Auswahl: undefined). */
export function open(comp, props = {}, full = false) {
  return new Promise(resolve => {
    const s = { id: ++n, comp, props, full, close: v => { if (!ui.sheets.includes(s)) return; ui.sheets = ui.sheets.filter(x => x !== s); resolve(v); } };
    ui.sheets = [...ui.sheets, s];
  });
}
export function toast(msg, ms = 2800) {
  clearTimeout(toastTimer);
  ui.toast = { id: ++n, msg };
  toastTimer = setTimeout(() => { ui.toast = null; }, ms);
}
/** Fängt Fehler einer Aktion ab und zeigt sie als Kurzmeldung. Liefert true, wenn alles geklappt hat. */
export async function tryDo(fn) {
  try { await fn(); return true; } catch (e) { toast(e.message || 'Hat nicht geklappt', 4000); return false; }
}
export const graphemes = s => [...new Intl.Segmenter().segment(s || '')].map(x => x.segment).filter(x => x.trim());
export function rain(str) {
  const list = graphemes(str);
  if (!list.length) return;
  clearTimeout(rainTimer);
  ui.rain = { id: ++n, drops: Array.from({ length: 40 }, (_, i) => ({ e: list[i % list.length], left: Math.random() * 100, size: 22 + Math.random() * 26, dur: 1.8 + Math.random() * 1.8, delay: Math.random() * 0.9 })) };
  rainTimer = setTimeout(() => { ui.rain = null; }, 5000);
}
