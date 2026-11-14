// Der Dienst als Ganzes: startet einen echten Server mit leerer Datenbank in einem Wegwerf-Ordner
// und spielt die wichtigen Abläufe über die Schnittstelle durch. Die Tests bauen aufeinander auf.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import jpeg from 'jpeg-js';

const DATA = mkdtempSync(join(tmpdir(), 'putzplan-test-'));
const PORT = 4700 + Math.floor(Math.random() * 250);
const BASE = `http://127.0.0.1:${PORT}`;
let srv, code, db;

before(async () => {
  srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, APP_URL: 'https://putzplan.test', NODE_ENV: 'test' }, stdio: ['ignore', 'pipe', 'inherit'] });
  code = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error('Server startet nicht: ' + out)), 15000);
    srv.stdout.on('data', d => { out += d; const m = /join=([\w-]+)/.exec(out); if (m) { clearTimeout(timer); resolve(m[1]); } });
    srv.on('exit', c => { clearTimeout(timer); reject(new Error('Server hat sich beendet: ' + c)); });
  });
  db = new DatabaseSync(join(DATA, 'putzplan.db')); // nur für Vorbereitungen, die es über die App nicht gibt
});
after(() => {
  db?.close();
  srv?.kill();
  try { rmSync(DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
});

/** Ein „Gerät“ mit eigenem Cookie. */
function device() {
  let cookie = '';
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...headers }, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, head: r.headers, ...(await r.json().catch(() => ({}))) };
  };
  return {
    get: (p, h) => call('GET', p, null, h), post: (p, b, h) => call('POST', p, b, h), put: (p, b) => call('PUT', p, b), del: p => call('DELETE', p),
    raw: (p, headers = {}, signal) => fetch(BASE + p, { redirect: 'manual', signal, headers: { Cookie: cookie, ...headers } }),
    async enter(member_id, pin) { await this.post('/api/join', { code }); return this.post('/api/login', { member_id, pin }); },
  };
}
const img = n => 'data:image/jpeg;base64,' + jpeg.encode({ data: Buffer.alloc(n * n * 4, 180), width: n, height: n }, 60).data.toString('base64');
const photo = { photo: img(64), thumb: img(16) };
const entryOf = r => r.changes?.find(c => c.t === 'entries')?.row;
const logOf = r => r.changes?.find(c => c.t === 'log')?.row;
const wait = ms => new Promise(r => setTimeout(r, ms));

const admin = device(), mia = device(), lily = device();
const MIA = 'test-mia', LILY = 'test-lily';
let ADMIN, entry; // Kennung der Admin-Person; der Eintrag, an dem mehrere Tests arbeiten

test('ohne Beitritt gibt es keine Daten und keine Fotos', async () => {
  const fremd = device();
  const s = await fremd.get('/api/session');
  assert.equal(s.joined, false);
  assert.deepEqual(s.members, []);
  assert.equal((await fremd.get('/api/state')).status, 401);
  assert.equal((await fremd.raw('/photos/00000000-v.jpg')).status, 401);
});

test('Beitritt nur mit dem richtigen Einladungscode', async () => {
  assert.equal((await admin.post('/api/join', { code: 'falsch' })).status, 403);
  const r = await admin.post('/api/join', { code });
  assert.equal(r.joined, true);
  assert.equal(r.members.length, 1);
  assert.ok(!JSON.stringify(r).includes('pin_hash'));
  ADMIN = r.members[0].id;
});

test('die erste Anmeldung legt die PIN fest, danach prüft sie der Server', async () => {
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '12' })).status, 400);
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '4711' })).me, ADMIN);
  await admin.post('/api/logout');
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '0000' })).status, 401);
  assert.equal((await admin.post('/api/login', { member_id: ADMIN, pin: '4711' })).me, ADMIN);
});

test('nach fünf falschen PINs ist auf dem Gerät Pause', async () => {
  const dieb = device();
  await dieb.post('/api/join', { code });
  for (let i = 0; i < 5; i++) assert.equal((await dieb.post('/api/login', { member_id: ADMIN, pin: '111' + i })).status, 401);
  assert.equal((await dieb.post('/api/login', { member_id: ADMIN, pin: '4711' })).status, 429); // jetzt hilft auch die richtige nicht
});

test('Admin legt die Familie an, alle melden sich an', async () => {
  let r = await admin.put('/api/members/' + MIA, { name: 'Mia', emoji: '🌸', role: 'mitglied' });
  assert.equal(r.changes.find(c => c.t === 'members').row.role, 'mitglied');
  r = await admin.put('/api/members/' + LILY, { name: 'Lily', emoji: '🦊', role: 'kind', w_weekday: 0.6, w_weekend: 0.6 });
  assert.equal(r.changes.find(c => c.t === 'members').row.has_pin, false);
  assert.equal((await mia.enter(MIA, '1111')).me, MIA);
  assert.equal((await lily.enter(LILY, '2222')).me, LILY);
  assert.equal((await mia.put('/api/members/test-neu', { name: 'Eindringling', role: 'admin' })).status, 403);
});

test('Zustand: alles da, aber nie ein PIN-Hash', async () => {
  const st = await admin.get('/api/state');
  assert.equal(st.members.length, 3);
  assert.ok(st.tasks.length >= 20);
  assert.ok(st.members.every(m => m.has_pin === true));
  assert.ok(!JSON.stringify(st).includes('pin_hash'));
  assert.equal(typeof st.push_key, 'string');
  assert.equal(typeof st.version, 'string');
  assert.equal(st.backup, null); // Admins sehen den Stand der Sicherung (hier: noch keine gelaufen)
  assert.ok(!('backup' in (await mia.get('/api/state'))));
});

test('Aufgabe starten und abhaken: doppelt geht nicht, zu schnell geht nicht, Punkte vergibt der Server', async () => {
  let r = await mia.post('/api/entries/start', { task_id: 'k-sm-aus', helpers: [LILY], ...photo });
  entry = entryOf(r);
  assert.equal(entry.status, 'started');
  assert.deepEqual(entry.helpers, [LILY]);
  assert.equal((await lily.post('/api/entries/start', { task_id: 'k-sm-aus', ...photo })).status, 409);
  assert.equal((await lily.post(`/api/entries/${entry.id}/finish`, photo)).status, 403); // nur wer gestartet hat
  assert.equal((await mia.post(`/api/entries/${entry.id}/finish`, photo)).status, 400); // Mindestzeit von 2 Minuten
  await admin.put('/api/settings', { min_minutes: 0 });
  assert.equal((await mia.post(`/api/entries/${entry.id}/finish`, { photo: 'data:image/png;base64,AAAA', thumb: photo.thumb })).status, 400);
  r = await mia.post(`/api/entries/${entry.id}/finish`, { ...photo, points: 99 });
  assert.equal(r.points, 3); // steht an der Aufgabe, nicht im Wunsch des Handys
  entry = entryOf(r);
  assert.equal(entry.status, 'done');
  assert.equal(entry.review, null);
});

test('Fotos: nur mit Anmeldung, dauerhaft im Handy-Cache', async () => {
  const r = await mia.raw(`/photos/${entry.after_photo}.t.jpg`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.match(r.headers.get('cache-control'), /private.*immutable/);
  assert.equal((await device().raw(`/photos/${entry.after_photo}.jpg`)).status, 401);
  assert.equal((await mia.raw('/photos/..%2F..%2Fputzplan.db')).status, 404);
});

test('Reaktionen und Kommentare', async () => {
  const id = crypto.randomUUID();
  let r = await lily.post('/api/reactions', { id, entry_id: entry.id, emoji: '❤️', on: true });
  assert.equal(r.changes[0].row.id, id);
  assert.equal((await lily.post('/api/reactions', { entry_id: entry.id, emoji: '❤️', on: true })).changes.length, 0); // schon gesetzt
  r = await lily.post('/api/reactions', { entry_id: entry.id, emoji: '❤️', on: false });
  assert.equal(r.changes[0].del, id);
  assert.equal((await lily.post('/api/reactions', { entry_id: entry.id, emoji: '💩', on: true })).status, 400);
  r = await lily.post('/api/reactions', { entry_id: entry.id, text: 'Sauber!' });
  const comment = r.changes[0].row;
  assert.equal(comment.text, 'Sauber!');
  assert.equal((await mia.del('/api/reactions/' + comment.id)).status, 403); // fremder Kommentar
  assert.equal((await admin.del('/api/reactions/' + comment.id)).changes[0].del, comment.id);
});

test('Prüfen: nachbessern, ablehnen, zurücknehmen', async () => {
  let r = await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'nach', note: 'Ecke vergessen' });
  assert.equal(entryOf(r).review, 'nach');
  assert.ok(logOf(r));
  r = await mia.post(`/api/entries/${entry.id}/redo`, photo);
  assert.equal(entryOf(r).review, null);
  assert.notEqual(entryOf(r).after_photo, entry.after_photo);
  r = await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'reject' });
  assert.equal(entryOf(r).status, 'rejected');
  const log = logOf(r);
  r = await admin.post(`/api/log/${log.id}/undo`);
  assert.equal(entryOf(r).status, 'done');
  assert.equal(logOf(r).undone, true);
  assert.equal((await admin.post(`/api/log/${log.id}/undo`)).status, 409);
  assert.equal(entryOf(await admin.post(`/api/entries/${entry.id}/review`, { verdict: 'ok' })).review, 'ok');
});

test('Belohnen, frei geben, zuweisen', async () => {
  let r = await admin.post('/api/entries/reward', { kind: 'bonus', member_id: LILY, points: 4, reason: 'Ohne Meckern geholfen' });
  const bonus = entryOf(r);
  assert.equal(bonus.points, 4);
  assert.equal((await admin.post('/api/entries/reward', { kind: 'warn', member_id: LILY, points: 2 })).status, 400); // ohne Grund
  assert.equal(entryOf(await admin.post(`/api/entries/${bonus.id}/revoke`)).status, 'rejected');
  assert.equal(entryOf(await admin.post('/api/entries/reward', { kind: 'frei', member_id: MIA, when: 1 })).task_id, 'frei');

  r = await admin.post('/api/entries/adhoc', { kind: 'assign', member_id: LILY, title: 'Blumen gießen', points: 2 });
  assert.equal(entryOf(r).status, 'todo');
  assert.equal((await mia.del('/api/entries/' + entryOf(r).id)).status, 403);
  assert.equal((await admin.del('/api/entries/' + entryOf(r).id)).changes[0].del, entryOf(r).id);

  r = await admin.post('/api/tasks/k-muell-raus/assign', { member_id: LILY });
  const assigned = entryOf(r);
  assert.equal(assigned.status, 'todo');
  assert.equal((await admin.post('/api/tasks/k-muell-raus/assign', { member_id: MIA })).status, 409);
  assert.equal((await mia.post('/api/entries/start', { task_id: 'k-muell-raus', ...photo })).status, 409); // ist vergeben
  assert.equal((await mia.post('/api/entries/start', { entry_id: assigned.id, ...photo })).status, 403);
  assert.equal(entryOf(await lily.post('/api/entries/start', { entry_id: assigned.id, ...photo })).status, 'started');
  assert.equal((await lily.post(`/api/entries/${assigned.id}/finish`, photo)).points, 3);
});

test('Extra-Aufgaben und Mithelfen', async () => {
  let r = await mia.post('/api/entries/adhoc', { kind: 'extra', title: 'Fleck an der Tür' });
  assert.equal(entryOf(r).points, 2);
  assert.equal((await mia.post('/api/entries/adhoc', { kind: 'assign', member_id: LILY, title: 'x', points: 30 })).status, 403);
  r = await mia.post('/api/entries/start', { entry_id: entryOf(r).id, ...photo });
  const running = entryOf(r);
  assert.deepEqual(entryOf(await lily.post(`/api/entries/${running.id}/join`)).helpers, [LILY]);
  assert.equal(entryOf(await mia.post(`/api/entries/${running.id}/cancel`)).status, 'todo'); // Eigenes bleibt auf der Liste
  assert.equal((await mia.post('/api/redeem')).status, 400); // kein Guthaben
});

test('Aufgaben verwalten: nur Admins, alle anderen schlagen vor', async () => {
  let r = await admin.put('/api/tasks/test-task', { title: 'Keller fegen', room: 'Keller', freq: 'weekly', day: 6, minutes: 20, points: 4 });
  assert.equal(r.changes.find(c => c.t === 'tasks').row.active, true);
  assert.equal((await mia.put('/api/tasks/test-task', { title: 'gehackt' })).status, 403);
  r = await mia.put('/api/tasks/test-idee', { title: 'Blumen gießen', room: 'Wohnzimmer' });
  const idee = r.changes.find(c => c.t === 'tasks').row;
  assert.equal(idee.active, false);
  assert.equal(idee.proposed_by, MIA);
  r = await admin.post('/api/tasks/test-idee/active', { active: true });
  assert.equal(r.changes.find(c => c.t === 'tasks').row.proposed_by, null);
  assert.equal((await mia.del('/api/tasks/test-task')).status, 403);
  assert.ok((await admin.del('/api/tasks/test-task')).changes.some(c => c.del === 'test-task'));
});

test('Anfragen von fremden Seiten werden abgelehnt', async () => {
  assert.equal((await admin.post('/api/entries/reward', {}, { Origin: 'https://boese.example' })).status, 403);
  assert.equal((await admin.post('/api/reactions', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const r = await fetch(BASE + '/api/logout', { method: 'POST', body: 'a=b', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 415); // ein einfaches Formular kommt nicht durch
});

test('Fotos bleiben dauerhaft, ältere lassen sich nachladen', async () => {
  let r = await admin.put('/api/settings', { foto_tage: 5 });
  assert.ok(!('foto_tage' in r.changes.find(c => c.t === 'settings').row));
  const old = new Date(Date.now() - 60 * 864e5).toISOString();
  db.prepare("insert into entries (id, task_id, title, member_id, period, slot, status, before_photo, after_photo, before_at, after_at, points, helpers, created_at, review) values ('test-alt', 'adhoc', 'Alter Eintrag', ?, '2026-01-01', 'test-alt', 'done', ?, ?, ?, ?, 2, '[]', ?, 'ok')").run(MIA, entry.before_photo, entry.after_photo, old, old, old);
  const st = await mia.get('/api/state');
  assert.equal(st.older, true);
  assert.ok(!st.entries.some(e => e.id === 'test-alt'));
  r = await mia.get('/api/history');
  assert.ok(r.entries.some(e => e.id === 'test-alt' && e.after_photo));
  assert.equal(r.more, false);
});

test('PIN vergessen: Hilferuf, Zurücksetzen durch Admins, neue PIN', async () => {
  const handy = device();
  await handy.post('/api/join', { code });
  let r = await handy.post('/api/pin-help', { member_id: MIA });
  assert.ok(r.changes.find(c => c.t === 'members').row.pin_help);
  assert.equal((await handy.post('/api/pin-help', { member_id: MIA })).changes.length, 0); // nicht alle paar Sekunden
  assert.equal((await lily.post(`/api/members/${MIA}/reset-pin`)).status, 403);
  r = await admin.post(`/api/members/${MIA}/reset-pin`);
  const row = r.changes.find(c => c.t === 'members').row;
  assert.equal(row.has_pin, false);
  assert.equal(row.pin_help, null);
  assert.equal((await mia.get('/api/state')).status, 401); // alte Anmeldung gilt nicht mehr
  assert.equal((await handy.post('/api/login', { member_id: MIA, pin: '9090' })).me, MIA);
  assert.equal((await mia.post('/api/login', { member_id: MIA, pin: '1111' })).status, 401);
  assert.equal((await mia.post('/api/login', { member_id: MIA, pin: '9090' })).me, MIA);
});

test('Mitglieder und Kinder dürfen keine Admin-Dinge und sehen kein Protokoll', async () => {
  for (const d of [mia, lily]) {
    assert.equal((await d.post('/api/entries/reward', { kind: 'bonus', member_id: MIA, points: 50, reason: 'Schummeln' })).status, 403);
    assert.equal((await d.post(`/api/entries/${entry.id}/review`, { verdict: 'ok' })).status, 403);
    assert.equal((await d.put('/api/settings', { tagesziel: 1 })).status, 403);
    assert.equal((await d.post('/api/announce', { text: 'x' })).status, 403);
    assert.equal((await d.get('/api/invite')).status, 403);
    assert.equal((await d.get('/api/state')).log.length, 0);
  }
  assert.ok((await admin.get('/api/state')).log.length > 5);
  assert.equal((await admin.put('/api/members/' + ADMIN, { name: 'Admin', role: 'mitglied' })).status, 400); // letzte Admin-Person bleibt Admin
});

test('Änderungen kommen sofort über den Live-Kanal, das Protokoll nur zu Admins', async () => {
  const listen = d => {
    const events = [], ac = new AbortController();
    d.raw('/api/events', {}, ac.signal).then(async res => { const dec = new TextDecoder(); for await (const c of res.body) for (const l of dec.decode(c).split('\n')) if (l.startsWith('data: ')) events.push(JSON.parse(l.slice(6))); }).catch(() => {});
    return { events, stop: () => ac.abort() };
  };
  const a = listen(admin), m = listen(mia);
  await wait(300);
  const r = await lily.post('/api/reactions', { entry_id: entry.id, emoji: '🔥', on: true });
  await admin.post('/api/entries/reward', { kind: 'bonus', member_id: MIA, points: 1, reason: 'Live-Test' });
  await wait(400);
  a.stop(); m.stop();
  assert.ok(m.events.some(e => e.t === 'reactions' && e.row?.id === r.changes[0].row.id));
  assert.ok(a.events.some(e => e.t === 'log'));
  assert.ok(!m.events.some(e => e.t === 'log'));
  assert.ok(!JSON.stringify([a.events, m.events]).includes('pin_hash'));
});

test('www leitet auf die Hauptadresse um, die Version ist abfragbar', async () => {
  const r = await fetch(BASE + '/abc?x=1', { redirect: 'manual', headers: { 'X-Forwarded-Host': 'www.putzplan.test' } });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get('location'), 'https://putzplan.test/abc?x=1');
  const h = await (await fetch(BASE + '/healthz')).json();
  assert.equal(h.ok, true);
  assert.equal(typeof h.version, 'string');
});
