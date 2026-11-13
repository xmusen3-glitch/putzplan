// SQLite-Datenbank (eine Datei) und Foto-Ablage.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../shared/logic.js';

export const DATA = process.env.DATA_DIR || join(process.cwd(), 'data');
export const PHOTOS = join(DATA, 'photos');
mkdirSync(PHOTOS, { recursive: true });

export const db = new DatabaseSync(join(DATA, 'putzplan.db'));
db.exec(`
  pragma journal_mode = wal;
  pragma busy_timeout = 5000;
  create table if not exists meta (key text primary key, value text);
  create table if not exists members (
    id text primary key, name text not null, emoji text, role text not null default 'mitglied',
    w_weekday real default 1, w_weekend real default 1, waschtag integer, active integer default 1,
    pin_hash text, sort integer default 0, rain text, titel text, away_from text, away_to text);
  create table if not exists tasks (
    id text primary key, title text not null, room text, freq text default 'daily', day integer default 0,
    minutes integer default 5, points integer, leicht integer default 0, per_person integer default 0,
    active integer default 1, proposed_by text);
  create table if not exists entries (
    id text primary key, task_id text, title text, member_id text, period text, slot text default '',
    status text, before_photo text, before_at text, after_photo text, after_at text, points integer default 0,
    note text, helpers text default '[]', created_by text, created_at text, review text, review_note text);
  create unique index if not exists entries_once on entries (task_id, period, slot) where status <> 'rejected' and task_id <> 'adhoc';
  create index if not exists entries_created on entries (created_at);
  create table if not exists reactions (id text primary key, entry_id text, member_id text, emoji text, text text, created_at text);
  create index if not exists reactions_entry on reactions (entry_id);
  create table if not exists push_subs (id text primary key, member_id text, sub text, created_at text);
  create table if not exists sessions (id text primary key, member_id text, created_at text, last_seen text);
  create table if not exists log (id integer primary key autoincrement, at text, member_id text, text text, undo text, undone integer default 0);
`);

const COLS = {
  members: ['id', 'name', 'emoji', 'role', 'w_weekday', 'w_weekend', 'waschtag', 'active', 'pin_hash', 'sort', 'rain', 'titel', 'away_from', 'away_to'],
  tasks: ['id', 'title', 'room', 'freq', 'day', 'minutes', 'points', 'leicht', 'per_person', 'active', 'proposed_by'],
  entries: ['id', 'task_id', 'title', 'member_id', 'period', 'slot', 'status', 'before_photo', 'before_at', 'after_photo', 'after_at', 'points', 'note', 'helpers', 'created_by', 'created_at', 'review', 'review_note'],
  reactions: ['id', 'entry_id', 'member_id', 'emoji', 'text', 'created_at'],
};
const BOOLS = { members: ['active'], tasks: ['leicht', 'per_person', 'active'] };
const val = v => (v === undefined ? null : v === true ? 1 : v === false ? 0 : Array.isArray(v) ? JSON.stringify(v) : v);

export const q = {
  get: (sql, ...p) => db.prepare(sql).get(...p.map(val)),
  all: (sql, ...p) => db.prepare(sql).all(...p.map(val)),
  run: (sql, ...p) => db.prepare(sql).run(...p.map(val)),
};
export const row = (table, id) => q.get(`select * from ${table} where id = ?`, id);
export function insert(table, r) {
  const cols = COLS[table].filter(c => r[c] !== undefined);
  q.run(`insert into ${table} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`, ...cols.map(c => r[c]));
}
export function patch(table, id, p) {
  const cols = COLS[table].filter(c => c !== 'id' && p[c] !== undefined);
  if (cols.length) q.run(`update ${table} set ${cols.map(c => c + ' = ?').join(', ')} where id = ?`, ...cols.map(c => p[c]), id);
}
export const save = (table, r) => (row(table, r.id) ? patch(table, r.id, r) : insert(table, r));
export const remove = (table, id) => q.run(`delete from ${table} where id = ?`, id);

/** Zeile so, wie die App sie bekommt: echte Wahrheitswerte, Helfer als Liste, nie der PIN-Hash. */
export function out(table, r) {
  if (!r) return r;
  const o = { ...r };
  for (const b of BOOLS[table] || []) o[b] = !!o[b];
  if (table === 'entries') { try { o.helpers = JSON.parse(o.helpers || '[]'); } catch { o.helpers = []; } if (!Array.isArray(o.helpers)) o.helpers = []; }
  if (table === 'members') { o.has_pin = !!o.pin_hash; delete o.pin_hash; }
  if (table === 'log') { o.can_undo = !!o.undo && !o.undone; delete o.undo; o.undone = !!o.undone; }
  return o;
}

// ---------- Einstellungen und andere Einzelwerte ----------
export const getMeta = (key, fallback = null) => { const r = q.get('select value from meta where key = ?', key); return r ? JSON.parse(r.value) : fallback; };
export const setMeta = (key, value) => q.run('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', key, JSON.stringify(value));
export const settings = () => ({ ...DEFAULT_SETTINGS, ...getMeta('settings', {}) });
export const newCode = () => randomBytes(12).toString('base64url');
export function inviteCode() {
  let c = getMeta('code');
  if (!c) { c = newCode(); setMeta('code', c); }
  return c;
}

/** Zustand der letzten 40 Tage, so wie ihn die gemeinsamen Regeln (shared/logic.js) erwarten. */
export const since40 = () => new Date(Date.now() - 40 * 864e5).toISOString();
export function logicState() {
  return {
    members: q.all('select * from members order by sort, name').map(r => out('members', r)),
    tasks: q.all('select * from tasks').map(r => out('tasks', r)),
    entries: q.all("select * from entries where created_at >= ? or status in ('todo', 'started') order by created_at desc", since40()).map(r => out('entries', r)),
    settings: settings(),
  };
}

// ---------- Fotos ----------
const SAFE = /^[a-z0-9-]{8,80}$/;
function decode(dataUrl, maxBytes, what) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error(`${what} fehlt oder hat das falsche Format`), { status: 400 });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > maxBytes || buf[0] !== 0xff || buf[1] !== 0xd8) throw Object.assign(new Error(`${what} ist zu groß oder kein JPEG`), { status: 400 });
  return buf;
}
export const photoFile = (name, thumb) => join(PHOTOS, `${name}${thumb ? '.t' : ''}.jpg`);
/** Speichert Foto und Vorschaubild. "name" ist der Dateiname ohne Endung und steht so im Eintrag. */
export function savePhoto(name, photo, thumb) {
  if (!SAFE.test(name)) throw Object.assign(new Error('Ungültiger Fotoname'), { status: 400 });
  const full = decode(photo, 900_000, 'Foto'), small = decode(thumb, 150_000, 'Vorschaubild');
  writeFileSync(photoFile(name), full);
  writeFileSync(photoFile(name, true), small);
  return name;
}
export function delPhoto(name) {
  if (!name || !SAFE.test(name)) return;
  for (const f of [photoFile(name), photoFile(name, true)]) if (existsSync(f)) rmSync(f, { force: true });
}
