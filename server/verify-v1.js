// Abgleich nach dem Umzug: Ist wirklich alles aus V1 (Supabase) in V2 angekommen, und stimmt es überein?
// Ändert nichts, weder hier noch dort. Vergleicht jede Zeile und jedes Foto Byte für Byte (über Prüfsummen).
// Aufruf:  SB_URL=… SB_KEY=… FAMILIE=… node server/verify-v1.js [--export /data/v1-export.json.gz]
//   --export: schreibt zusätzlich alle Rohdaten aus V1 unverändert in eine Datei (fürs Archiv).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { q, row, out, photoFile } from './db.js';
import { get, all, photoBytes, roleOf, isRoyal, helpersOf } from './v1.js';

const sha = b => createHash('sha256').update(b).digest('hex');
const [members, tasks, comps, reactions, sets, v1Photos] = await Promise.all([all('members'), all('tasks'), all('completions'), all('reactions'), get('settings?select=*'), all('photos', 'id,created_at')]);
const problems = [];
const diff = (what, id, field, a, b) => { if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) problems.push(`${what} ${id}: ${field} ist in V1 ${JSON.stringify(a)}, in V2 ${JSON.stringify(b)}`); };
const exists = (what, table, id, label) => { const r = row(table, id); if (!r) problems.push(`${what} fehlt in V2: ${label} (${id})`); return r && out(table, r); };

for (const m of members) {
  const r = exists('Person', 'members', m.id, m.name);
  if (!r) continue;
  for (const [f, v] of [['name', m.name], ['emoji', m.emoji], ['role', roleOf(m)], ['waschtag', m.waschtag], ['w_weekday', m.w_weekday], ['w_weekend', m.w_weekend], ['active', m.active !== false], ['rain', m.rain]]) diff('Person', m.name, f, v, r[f]);
  if (!!m.pin_hash !== r.has_pin) problems.push(`Person ${m.name}: PIN ${m.pin_hash ? 'fehlt in V2' : 'gibt es nur in V2'}`);
}
for (const t of tasks) {
  const r = exists('Aufgabe', 'tasks', t.id, t.title);
  if (!r) continue;
  for (const f of ['title', 'room', 'freq', 'minutes', 'proposed_by']) diff('Aufgabe', t.title, f, t[f], r[f]);
  for (const f of ['leicht', 'per_person']) diff('Aufgabe', t.title, f, !!t[f], r[f]);
  diff('Aufgabe', t.title, 'active', t.active !== false, r.active);
  diff('Aufgabe', t.title, 'day', t.day ?? 0, r.day);
  if (t.points != null) diff('Aufgabe', t.title, 'points', t.points, r.points);
}

let photosOk = 0, photosGone = 0, bytes = 0;
const referenced = new Set();
for (const c of comps) {
  const r = exists('Eintrag', 'entries', c.id, `${c.title} vom ${String(c.created_at).slice(0, 10)}`);
  for (const key of ['before_photo', 'after_photo']) {
    if (!c[key]) continue;
    referenced.add(c[key]);
    const v1 = await photoBytes(c[key]);
    if (!v1) { photosGone++; continue; } // gab es schon in V1 nicht mehr
    const f = photoFile(c[key]);
    if (!existsSync(f)) problems.push(`Foto fehlt in V2: ${c[key]} (${c.title})`);
    else if (sha(readFileSync(f)) !== sha(v1)) problems.push(`Foto weicht ab: ${c[key]} (${c.title})`);
    else if (!existsSync(photoFile(c[key], true))) problems.push(`Vorschaubild fehlt: ${c[key]}`);
    else { photosOk++; bytes += v1.length; }
    if (r && r[key] !== c[key]) problems.push(`Eintrag ${c.id}: ${key} ist in V2 nicht verknüpft`);
  }
  if (!r) continue;
  for (const f of ['task_id', 'member_id', 'period', 'status', 'before_at', 'after_at', 'created_by', 'created_at']) diff('Eintrag', c.id, f, c[f], r[f]);
  diff('Eintrag', c.id, 'slot', c.slot || '', r.slot);
  diff('Eintrag', c.id, 'points', c.points ?? 0, r.points);
  diff('Eintrag', c.id, 'helpers', helpersOf(c), r.helpers);
  diff('Eintrag', c.id, 'title', isRoyal(c) ? 'Königlicher freier Tag' : c.title, r.title);
  diff('Eintrag', c.id, 'note', isRoyal(c) ? 'royal' : c.note, r.note);
}
const ids = new Set(comps.map(c => c.id));
let loose = 0;
for (const x of reactions) {
  if (!ids.has(x.completion_id)) { loose++; continue; } // hängt an einem Eintrag, den es in V1 nicht mehr gibt
  const r = exists('Reaktion', 'reactions', x.id, x.emoji || x.text);
  if (!r) continue;
  diff('Reaktion', x.id, 'entry_id', x.completion_id, r.entry_id);
  for (const f of ['member_id', 'emoji', 'text', 'created_at']) diff('Reaktion', x.id, f, x[f], r[f]);
}
const orphans = v1Photos.filter(p => !referenced.has(p.id));

// Was es nur in V2 gibt (dort neu angelegt, das ist kein Fehler)
const only = (table, list) => q.all(`select id from ${table}`).filter(r => !list.some(x => x.id === r.id)).length;
const v2only = { Personen: only('members', members), Aufgaben: only('tasks', tasks), Einträge: only('entries', comps), Reaktionen: only('reactions', reactions) };

console.log(`V1: ${members.length} Personen, ${tasks.length} Aufgaben, ${comps.length} Einträge, ${reactions.length} Reaktionen, ${v1Photos.length} Fotos.`);
console.log(`Fotos: ${photosOk} stimmen Byte für Byte überein (${(bytes / 1048576).toFixed(1)} MB)${photosGone ? `, ${photosGone} gab es schon in V1 nicht mehr` : ''}${orphans.length ? `, ${orphans.length} in V1 gehören zu keinem Eintrag` : ''}.`);
if (loose) console.log(`${loose} Reaktionen in V1 hängen an gelöschten Einträgen und wurden nicht übernommen.`);
console.log(`Nur in V2 vorhanden: ${Object.entries(v2only).map(([k, n]) => `${n} ${k}`).join(', ')}.`);

const exp = process.argv.indexOf('--export');
if (exp > 0) {
  const file = process.argv[exp + 1];
  const raw = { exportiert: new Date().toISOString(), quelle: 'V1 (Supabase), unverändert', members, tasks, completions: comps, reactions, settings: sets, photos: v1Photos };
  writeFileSync(file, gzipSync(JSON.stringify(raw)));
  console.log(`Rohdaten aus V1 gespeichert: ${file}`);
}

if (problems.length) {
  console.log(`\n${problems.length} Abweichungen:`);
  for (const p of problems.slice(0, 40)) console.log('  - ' + p);
  process.exit(1);
}
console.log('\nAlles aus V1 ist in V2 vorhanden und stimmt überein.');
