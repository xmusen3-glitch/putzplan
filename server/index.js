// Familien-Putzplan V2: ein Dienst für App-Dateien, Anfragen, Fotos und den Live-Kanal.
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { match, sessionOf, collect, Fail, STREAM, VERSION } from './core.js';
import { row, photoFile, inviteCode } from './db.js';
import { seedIfEmpty } from './seed.js';
import { startJobs } from './push.js';
import './api.js';

const PORT = +process.env.PORT || 8080;
// Hauptadresse ohne www: wer www.… öffnet, wird umgeleitet (sonst gäbe es zwei getrennte Anmeldungen)
const HOME = process.env.APP_URL ? new URL(process.env.APP_URL) : null;
const DIST = join(import.meta.dirname, '..', 'dist');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(self)',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > 3_000_000) { reject(new Fail(413, 'Zu groß')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Fail(400, 'Kein gültiges JSON')); } });
    req.on('error', reject);
  });
}

async function api(req, res, path, url) {
  const r = match(req.method, path);
  if (!r) throw new Fail(404, 'Unbekannte Adresse');
  if (req.method !== 'GET') { // keine Anfragen von fremden Seiten
    const origin = req.headers.origin, hosts = [req.headers.host, req.headers['x-forwarded-host']];
    if (req.headers['sec-fetch-site'] === 'cross-site' || (origin && !hosts.includes(new URL(origin).host))) throw new Fail(403, 'Fremde Herkunft');
    if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new Fail(415, 'Nur JSON');
  }
  const sess = sessionOf(req);
  const me = sess?.member_id ? row('members', sess.member_id) : null;
  if (r.level !== 'open' && !sess) throw new Fail(401, 'Dieses Gerät ist noch nicht beigetreten');
  if ((r.level === 'member' || r.level === 'admin') && !me?.active) throw new Fail(401, 'Nicht angemeldet');
  if (r.level === 'admin' && me.role !== 'admin') throw new Fail(403, 'Das dürfen nur Admins');
  const body = req.method === 'GET' ? {} : await readJson(req);
  const { result, changes } = collect(() => r.fn({ req, res, p: r.p, body, sess, me, url }));
  if (result === STREAM) return;
  json(res, 200, { ok: true, ...(result || {}), changes });
}

function photo(req, res, path) {
  if (!sessionOf(req)?.member_id) throw new Fail(401, 'Nicht angemeldet');
  const m = /^\/photos\/([a-z0-9-]{8,80})(\.t)?\.jpg$/.exec(path);
  const f = m && photoFile(m[1], !!m[2]);
  if (!f || !existsSync(f)) throw new Fail(404, 'Foto nicht gefunden');
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
  createReadStream(f).pipe(res);
}

function file(req, res, path) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new Fail(405, 'Nicht erlaubt');
  let f = normalize(join(DIST, path));
  if (!f.startsWith(DIST)) throw new Fail(403, 'Nicht erlaubt');
  if (!existsSync(f) || statSync(f).isDirectory()) {
    if (extname(path)) throw new Fail(404, 'Nicht gefunden');
    f = join(DIST, 'index.html'); // alle anderen Adressen führen in die App
  }
  if (!existsSync(f)) throw new Fail(503, 'Die App ist noch nicht gebaut (npm run build)');
  const html = f.endsWith('.html');
  res.writeHead(200, {
    'Content-Type': TYPES[extname(f)] || 'application/octet-stream',
    'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...(html ? SECURITY : { 'X-Content-Type-Options': 'nosniff' }),
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(f).pipe(res);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), path = decodeURIComponent(url.pathname);
    if (path === '/healthz') return json(res, 200, { ok: true, version: VERSION });
    if (HOME && (req.headers['x-forwarded-host'] || req.headers.host) === 'www.' + HOME.host) { res.writeHead(301, { Location: HOME.origin + req.url }); return res.end(); }
    if (path.startsWith('/api/')) return await api(req, res, path, url);
    if (path.startsWith('/photos/')) return photo(req, res, path);
    return file(req, res, path);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    if (res.headersSent) return res.end();
    json(res, status, { error: status === 500 ? 'Da ist etwas schiefgelaufen' : e.message });
  }
}).listen(PORT, () => {
  const fresh = seedIfEmpty();
  startJobs();
  console.log(`Putzplan läuft auf Port ${PORT}`);
  if (fresh) console.log(`Neue Installation. Einladungslink: <Adresse der App>/#join=${inviteCode()}`);
});
