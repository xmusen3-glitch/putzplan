// Einmaliger Umzug der Daten aus V1 (Supabase) nach V2. Liest in Supabase nur, ändert dort nichts.
// Aufruf:  SB_URL=… SB_KEY=… FAMILIE=… npm run umzug
// Kann beliebig oft laufen: vorhandene Zeilen werden überschrieben, Fotos nur einmal geholt.
import { existsSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { q, row, save, setMeta, settings, photoFile, inviteCode } from './db.js';
import { DEFAULT_SETTINGS } from '../shared/logic.js';

const { SB_URL, SB_KEY, FAMILIE } = process.env;
if (!SB_URL || !SB_KEY || !FAMILIE) { console.error('Bitte SB_URL, SB_KEY und FAMILIE setzen.'); process.exit(1); }
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'x-familie': FAMILIE };
async function get(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
/** Holt alle Zeilen in Blöcken, damit keine Obergrenze greift. */
async function all(table, select = '*', order = 'id') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const part = await get(`${table}?select=${select}&order=${order}&offset=${from}&limit=1000`);
    out.push(...part);
    if (part.length < 1000) return out;
  }
}

// Punkte aus V1 für Aufgaben, bei denen keine eigenen gesetzt waren
const OLD_PTS = { 'eing-aufr': 2, 'eing-schuhe': 1, 'eing-ranzen': 1, 'eing-boden': 3, 'flur-saugen': 3, 'flur-wischen': 4, 'waschflur': 3, 'wz-decken': 1, 'wz-couch': 2, 'wz-tisch': 2, 'wz-kommode': 2, 'wz-tv': 3, 'wz-unter-couch': 4, 'ez-tisch': 2, 'ez-stuehle': 1, 'ez-stuehle-sauber': 3, 'boden-saugen': 4, 'boden-wischen': 4, 'k-sm-aus': 3, 'k-sm-ein': 3, 'k-flaechen': 3, 'k-muell-sort': 3, 'k-muell-raus': 3, 'k-boden': 4, 'k-kuehl': 5, 'gb-becken': 2, 'gb-wc': 4, 'gb-eimer': 2, 'gb-auff': 1, 'gb-fliesen': 3, 'gb-dusche': 5, 'spinnweben': 4, 'fenster': 5, 'zimmer': 5, 'garten-rasen': 6, 'garten-laub': 4, 'garten-unkraut': 5, 'auffahrt-fegen': 3, 'garage-ordnen': 5, 'durch-drin': 3, 'durch-draussen': 2 };

/** Vorschaubild: längste Seite höchstens 480 Pixel. */
function thumb(buf, max = 480) {
  const src = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true });
  const sc = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * sc)), h = Math.max(1, Math.round(src.height * sc));
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / sc), y1 = Math.max(y0 + 1, Math.min(src.height, Math.floor((y + 1) / sc)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / sc), x1 = Math.max(x0 + 1, Math.min(src.width, Math.floor((x + 1) / sc)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * src.width + xx) * 4; r += src.data[i]; g += src.data[i + 1]; b += src.data[i + 2]; n++; }
      const o = (y * w + x) * 4;
      data[o] = r / n; data[o + 1] = g / n; data[o + 2] = b / n; data[o + 3] = 255;
    }
  }
  return jpeg.encode({ data, width: w, height: h }, 72).data;
}
async function fetchPhoto(id) {
  if (!id || !/^[a-z0-9-]{8,80}$/.test(id)) return null;
  if (existsSync(photoFile(id)) && existsSync(photoFile(id, true))) return id;
  const [p] = await get(`photos?select=data&id=eq.${id}`);
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(p?.data || '');
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  writeFileSync(photoFile(id), buf);
  try { writeFileSync(photoFile(id, true), thumb(buf)); } catch { writeFileSync(photoFile(id, true), buf); }
  return id;
}

const [members, tasks, comps, reactions, sets] = await Promise.all([all('members'), all('tasks'), all('completions'), all('reactions'), get('settings?select=data&id=eq.1')]);
const old = sets[0]?.data || {};

for (const m of members) {
  save('members', {
    id: m.id, name: m.name, emoji: m.emoji || '🙂', role: m.is_admin ? 'admin' : m.klein ? 'kind' : 'mitglied',
    w_weekday: m.w_weekday ?? 1, w_weekend: m.w_weekend ?? 1, waschtag: m.waschtag ?? null, active: m.active !== false,
    pin_hash: m.pin_hash ?? null, sort: m.sort ?? 0, rain: m.rain ?? null, titel: (old.titel || {})[m.id] || null,
  });
}
for (const t of tasks) {
  save('tasks', {
    id: t.id, title: t.title, room: t.room || 'Extra', freq: t.freq || 'daily', day: t.day ?? 0, minutes: t.minutes ?? 5,
    points: t.points ?? OLD_PTS[t.id] ?? Math.max(1, Math.round((t.minutes || 5) / 5)), leicht: !!t.leicht, per_person: !!t.per_person,
    active: t.active !== false, proposed_by: t.proposed_by ?? null,
  });
}

let photos = 0, missing = 0;
for (const [i, c] of comps.entries()) {
  const before = await fetchPhoto(c.before_photo), after = await fetchPhoto(c.after_photo);
  photos += (before ? 1 : 0) + (after ? 1 : 0);
  missing += (c.before_photo && !before ? 1 : 0) + (c.after_photo && !after ? 1 : 0);
  let helpers = [];
  try { const h = JSON.parse(c.helpers || '[]'); if (Array.isArray(h)) helpers = h; } catch {}
  const royal = c.task_id === 'frei' && /^Königlicher freier Tag/.test(c.title || '');
  const known = row('entries', c.id);
  save('entries', {
    id: c.id, task_id: c.task_id, title: royal ? 'Königlicher freier Tag' : c.title, member_id: c.member_id, period: c.period, slot: c.slot || '',
    status: c.status, before_photo: before, before_at: c.before_at ?? null, after_photo: after, after_at: c.after_at ?? null, points: c.points ?? 0,
    note: royal ? 'royal' : c.note ?? null, helpers, created_by: c.created_by ?? null, created_at: c.created_at,
    // Was aus V1 kommt, gilt als schon gesehen. Ein in V2 bereits gesetztes Urteil bleibt.
    review: known?.review ?? (c.status === 'done' ? 'ok' : null),
  });
  if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${comps.length} Einträge …`);
}
const ids = new Set(comps.map(c => c.id));
for (const r of reactions) if (ids.has(r.completion_id)) save('reactions', { id: r.id, entry_id: r.completion_id, member_id: r.member_id, emoji: r.emoji ?? null, text: r.text ?? null, created_at: r.created_at });

setMeta('settings', { ...DEFAULT_SETTINGS, ...settings(), min_minutes: old.min_minutes ?? 2, koch_regel: old.koch_regel !== false, foto_tage: old.foto_tage ?? 21, tagesziel: old.tagesziel ?? 10 });

console.log(`Umzug fertig: ${members.length} Personen, ${tasks.length} Aufgaben, ${comps.length} Einträge, ${reactions.length} Reaktionen, ${photos} Fotos${missing ? ` (${missing} Fotos gab es in V1 nicht mehr)` : ''}.`);
console.log(`In der Datenbank: ${q.get('select count(*) as n from entries').n} Einträge, ${q.get('select count(*) as n from reactions').n} Reaktionen.`);
console.log(`Einladungslink: <Adresse der App>/#join=${inviteCode()}`);
