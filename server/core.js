// Kleiner Router, Sitzungen (Cookie), PIN-Prüfung und der Live-Kanal (Server-Sent Events).
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { q, row, out } from './db.js';

export class Fail extends Error { constructor(status, msg) { super(msg); this.status = status; } }
export const now = () => new Date().toISOString();
const sha = s => createHash('sha256').update(s).digest('hex');

// ---------- Router ----------
const routes = [];
/** level: 'open' (jeder), 'device' (Gerät ist dem Haushalt beigetreten), 'member' (angemeldet), 'admin' */
export const on = (method, path, level, fn) => routes.push({ method, level, fn, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$') });
export const match = (method, path) => { for (const r of routes) { if (r.method !== method) continue; const m = r.re.exec(path); if (m) return { ...r, p: m.groups || {} }; } return null; };

// ---------- Sitzungen ----------
const COOKIE = 'pp_s';
export function sessionOf(req) {
  const m = new RegExp(`(?:^|; )${COOKIE}=([\\w-]+)`).exec(req.headers.cookie || '');
  if (!m) return null;
  const s = row('sessions', sha(m[1]));
  if (!s) return null;
  if (!s.last_seen || Date.now() - new Date(s.last_seen) > 3600e3) q.run('update sessions set last_seen = ? where id = ?', now(), s.id);
  return s;
}
export function startSession(req, res) {
  const token = randomBytes(32).toString('base64url');
  q.run('insert into sessions (id, created_at, last_seen) values (?, ?, ?)', sha(token), now(), now());
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${400 * 86400}${secure ? '; Secure' : ''}`);
  return row('sessions', sha(token));
}
export function endSession(sess, res) {
  if (sess) q.run('delete from sessions where id = ?', sess.id);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// ---------- PIN ----------
export function hashPin(pin) {
  const salt = randomBytes(16);
  return `s1$${salt.toString('hex')}$${scryptSync(String(pin), salt, 32).toString('hex')}`;
}
/** Prüft die PIN. Hashes aus V1 (SHA-256 über "id:pin") werden noch akzeptiert und danach ersetzt. */
export function checkPin(member, pin) {
  const h = member.pin_hash || '';
  if (h.startsWith('s1$')) {
    const [, salt, hash] = h.split('$');
    const a = Buffer.from(hash, 'hex'), b = scryptSync(String(pin), Buffer.from(salt, 'hex'), 32);
    return { ok: a.length === b.length && timingSafeEqual(a, b), old: false };
  }
  const a = Buffer.from(h, 'hex'), b = Buffer.from(sha(`${member.id}:${pin}`), 'hex');
  return { ok: a.length === b.length && timingSafeEqual(a, b), old: true };
}
// Fehlversuche: 5 pro Gerät und Person, dann 5 Minuten Pause. Zusätzlich 30 pro Person und Stunde.
const fails = new Map();
const bucket = (key, windowMs) => { const b = fails.get(key); if (b && b.until > Date.now()) return b; const n = { n: 0, until: Date.now() + windowMs }; fails.set(key, n); return n; };
export function pinGuard(sess, memberId) {
  const a = bucket(`${sess.id}|${memberId}`, 5 * 60e3), b = bucket(`*|${memberId}`, 60 * 60e3);
  if (a.n >= 5 || b.n >= 30) throw new Fail(429, `Zu viele Fehlversuche. Bitte in ${Math.ceil((Math.min(a.n >= 5 ? a.until : Infinity, b.n >= 30 ? b.until : Infinity) - Date.now()) / 60e3)} Min nochmal.`);
  return { miss() { a.n++; b.n++; }, hit() { fails.delete(`${sess.id}|${memberId}`); } };
}
setInterval(() => { for (const [k, v] of fails) if (v.until < Date.now()) fails.delete(k); }, 10 * 60e3).unref();

// ---------- Live-Kanal ----------
const clients = new Set();
let collector = null;
/** Während einer Anfrage sammeln wir alle Änderungen, damit die Antwort sie gleich mitliefert. */
export const collect = fn => { collector = []; try { const result = fn(); return { result, changes: collector }; } finally { collector = null; } };
function send(change, adminOnly) {
  collector?.push(change);
  const line = `data: ${JSON.stringify(change)}\n\n`;
  for (const c of clients) if (!adminOnly || c.admin) c.res.write(line);
}
/** Geänderte Zeile an alle offenen Geräte schicken. */
export const emit = (table, r, { adminOnly = false } = {}) => send({ t: table, row: out(table, r) }, adminOnly);
export const emitDel = (table, id) => send({ t: table, del: id }, false);
export const emitSettings = s => send({ t: 'settings', row: s }, false);
export const emitSay = r => send({ t: 'say', row: r }, false);
/** Rückgabewert eines Handlers, der die Antwort selbst offen hält (Live-Kanal). */
export const STREAM = Symbol('stream');
export function openStream(req, res, me) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  const c = { res, admin: me.role === 'admin', member: me.id };
  clients.add(c);
  req.on('close', () => clients.delete(c));
}
/** Verbindungen einer Person schließen (z. B. nach Rollenwechsel), die App verbindet sich neu. */
export const dropStreams = memberId => { for (const c of clients) if (c.member === memberId) c.res.end(); };
setInterval(() => { for (const c of clients) c.res.write(': ping\n\n'); }, 25e3).unref();
