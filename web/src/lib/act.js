// Abläufe, die aus mehreren Schritten bestehen: Team wählen, Foto machen, speichern.
import { S, G, post, del, mName } from './store.svelte.js';
import { open, toast, rain, tryDo } from './ui.svelte.js';
import { DEFAULT_RAIN } from '../../../shared/logic.js';
import Team from '../sheets/Team.svelte';
import Camera from '../sheets/Camera.svelte';

const shoot = (label, kind) => open(Camera, { label, kind }, true);
const CHEERS = ['Mega!', 'Stark gemacht!', 'Sauber!', 'Du rockst!', 'Haken dran!'];

/** Aufgabe aus dem Plan starten (task) oder eine zugewiesene/Extra-Aufgabe (entry). */
export async function start({ task, entry }) {
  const title = task?.title || entry.title;
  const team = await open(Team, { title });
  if (!team) return;
  const img = await shoot(title, 'before');
  if (!img) return;
  if (await tryDo(() => post('/entries/start', { ...(task ? { task_id: task.id } : { entry_id: entry.id }), helpers: team, ...img }))) {
    toast(team.length ? `Vorher-Foto ist drin. Los geht's im Team mit ${team.map(mName).join(' & ')}!` : 'Vorher-Foto ist drin. Jetzt loslegen!');
  }
}
export async function finish(e) {
  const wait = (+S.settings.min_minutes || 0) * 60e3 - (Date.now() - new Date(e.before_at));
  if (wait > 0) return toast(`So schnell? Noch ${Math.ceil(wait / 60e3)} Min. Erst putzen, dann Foto!`);
  const img = await shoot(e.title, 'after');
  if (!img) return;
  let res;
  if (await tryDo(async () => { res = await post(`/entries/${e.id}/finish`, img); })) {
    rain(G.me?.rain || DEFAULT_RAIN);
    toast(`${CHEERS[Math.floor(Math.random() * CHEERS.length)]} +${res.points} Punkte`);
  }
}
export async function redo(e) {
  const img = await shoot(e.title, 'after');
  if (img && (await tryDo(() => post(`/entries/${e.id}/redo`, img)))) toast('Neues Nachher-Foto ist drin.');
}
export async function cancel(e) {
  if (confirm('Abbrechen? Das Vorher-Foto wird gelöscht.')) await tryDo(() => post(`/entries/${e.id}/cancel`));
}
export async function join(e) {
  if (await tryDo(() => post(`/entries/${e.id}/join`))) { rain('🤝💪✨'); toast(`Du hilfst ${mName(e.member_id)} mit!`); }
}
export const dropEntry = e => confirm('Diese Aufgabe von der Liste nehmen?') && tryDo(() => del(`/entries/${e.id}`));
export async function redeem() {
  let res;
  if (await tryDo(async () => { res = await post('/redeem'); })) { rain('💰🪙✨😎'); toast(`${res.amount} Punkte eingelöst. Tagesziel geschafft!`); }
}
