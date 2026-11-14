// Alle Anfragen der App. Jede Regel (wer darf was, wie viele Punkte) wird hier geprüft, nicht im Handy.
import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { q, row, out, insert, patch, save, remove, settings, getMeta, setMeta, inviteCode, newCode, savePhoto, delPhoto, logicState, since40, lastBackup } from './db.js';
import { on, Fail, now, emit, emitDel, emitSettings, emitSay, hashPin, checkPin, pinGuard, startSession, endSession, openStream, dropStreams, STREAM, VERSION } from './core.js';
import { notify, publicKey } from './push.js';
import * as L from '../shared/logic.js';

// ---------- Helfer ----------
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const int = (v, min, max, dflt) => { const n = Math.round(+v); return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : dflt; };
const num = (v, min, max, dflt) => { const n = +v; return Number.isFinite(n) && v !== null && v !== '' ? Math.min(max, Math.max(min, n)) : dflt; };
const isId = v => typeof v === 'string' && /^[a-z0-9-]{1,64}$/i.test(v);
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const firstEmoji = v => [...new Intl.Segmenter().segment(str(v, 16))].map(x => x.segment).find(x => x.trim()) || '';
const need = (table, id, msg = 'Nicht gefunden') => { const r = row(table, id); if (!r) throw new Fail(404, msg); return r; };
const member = id => need('members', id, 'Person nicht gefunden');
const entry = id => out('entries', need('entries', id, 'Eintrag nicht gefunden'));
const nameOf = id => row('members', id)?.name || 'Jemand';
const admins = () => q.all("select id from members where role = 'admin' and active = 1").map(m => m.id);
const emitEntry = id => emit('entries', row('entries', id));
const dayText = d => `${L.DAYS[L.isoDay(d)]}, ${d.getDate()}.${d.getMonth() + 1}.`;
function addLog(me, text, undo) {
  const r = q.run('insert into log (at, member_id, text, undo) values (?, ?, ?, ?)', now(), me.id, text, undo ? JSON.stringify(undo) : null);
  emit('log', row('log', Number(r.lastInsertRowid)), { adminOnly: true });
}
const picker = () => q.all('select id, name, emoji, pin_hash from members where active = 1 order by sort, name').map(m => ({ id: m.id, name: m.name, emoji: m.emoji, has_pin: !!m.pin_hash }));

// ---------- Beitreten und Anmelden ----------
on('GET', '/api/session', 'open', ({ sess, me }) => ({ joined: !!sess, me: me?.active ? me.id : null, members: sess ? picker() : [] }));
/**
 * Übergangstür nach dem Umstieg von V1: Geräte, die noch die alte App kennen, weisen sich mit deren
 * Familien-Geheimcode aus und müssen den neuen Einladungslink nicht eigens bekommen. Hier liegt nur eine
 * Prüfsumme davon, und die Tür hat ein Ablaufdatum (server/v1-door.js). Die PIN braucht es danach trotzdem.
 */
function v1Door(secret) {
  const door = getMeta('v1_door');
  if (!door || typeof secret !== 'string' || !secret || door.until < now()) return false;
  const a = Buffer.from(createHash('sha256').update(secret).digest('hex')), b = Buffer.from(String(door.hash));
  return a.length === b.length && timingSafeEqual(a, b);
}
on('POST', '/api/join', 'open', ({ req, res, body, sess }) => {
  const old = v1Door(body.v1);
  if (!old && str(body.code, 64) !== inviteCode()) throw new Fail(403, body.v1 ? 'Der automatische Umzug geht nicht mehr. Bitte den neuen Einladungslink öffnen.' : 'Der Einladungslink ist nicht (mehr) gültig');
  if (!sess) startSession(req, res);
  // Wer über die alte App kommt, bekommt den neuen Einladungscode mit (für „Zum Home-Bildschirm“ auf dem iPhone)
  return { joined: true, members: picker(), ...(old ? { code: inviteCode() } : {}) };
});
on('POST', '/api/login', 'device', ({ body, sess }) => {
  const m = member(body.member_id), pin = str(body.pin, 12);
  if (!m.active) throw new Fail(403, 'Diese Person ist gerade pausiert');
  if (!/^\d{4}$/.test(pin)) throw new Fail(400, 'Die PIN hat 4 Ziffern');
  const guard = pinGuard(sess, m.id);
  if (!m.pin_hash) {
    patch('members', m.id, { pin_hash: hashPin(pin) });
    emit('members', row('members', m.id));
  } else {
    const c = checkPin(m, pin);
    if (!c.ok) { guard.miss(); throw new Fail(401, 'Falsche PIN'); }
    if (c.old) patch('members', m.id, { pin_hash: hashPin(pin) });
    if (m.pin_help) { patch('members', m.id, { pin_help: null }); emit('members', row('members', m.id)); } // PIN ist wieder eingefallen
  }
  guard.hit();
  q.run('update sessions set member_id = ? where id = ?', m.id, sess.id);
  return { me: m.id };
});
/** „PIN vergessen“ auf dem Anmeldeschirm: sagt den Admins Bescheid. Zurücksetzen können nur sie. */
const helpAsked = new Map();
on('POST', '/api/pin-help', 'device', ({ body }) => {
  const m = member(body.member_id);
  if (!m.active || !m.pin_hash) throw new Fail(400, 'Hier gibt es nichts zurückzusetzen');
  if (Date.now() - (helpAsked.get(m.id) || 0) < 10 * 60e3) return; // nicht öfter als alle 10 Minuten Bescheid geben
  helpAsked.set(m.id, Date.now());
  patch('members', m.id, { pin_help: now() });
  notify(admins().filter(a => a !== m.id), 'PIN vergessen', `${m.name} braucht eine neue PIN. In der Übersicht zurücksetzen.`);
  emit('members', row('members', m.id));
});
on('POST', '/api/logout', 'device', ({ sess }) => { q.run('update sessions set member_id = null where id = ?', sess.id); });
on('POST', '/api/leave', 'device', ({ sess, res }) => { endSession(sess, res); });

// ---------- Zustand und Live-Kanal ----------
on('GET', '/api/state', 'member', ({ me }) => {
  const st = logicState(), ids = new Set(st.entries.map(e => e.id));
  return {
    me: me.id, ...st,
    reactions: q.all('select * from reactions where created_at >= ?', since40()).filter(r => ids.has(r.entry_id)),
    log: me.role === 'admin' ? q.all('select * from log order by id desc limit 150').map(r => out('log', r)) : [],
    push_key: publicKey,
    version: VERSION,
    backup: me.role === 'admin' ? lastBackup() : undefined,
    older: !!q.get("select 1 as x from entries where created_at < ? and status = 'done' limit 1", since40()),
  };
});
/** Ältere Fotos nachladen: alles, was vor dem geladenen Zeitraum (oder vor „before“) erledigt wurde. */
on('GET', '/api/history', 'member', ({ url }) => {
  const before = url.searchParams.get('before'), cut = since40();
  const entries = q.all(`select * from entries where created_at < ? and status = 'done' and task_id not in ('bonus', 'warn', 'frei', 'redeem') order by created_at desc limit 31`, before && before < cut ? before : cut).map(r => out('entries', r));
  const page = entries.slice(0, 30);
  const reactions = page.length ? q.all(`select * from reactions where entry_id in (${page.map(() => '?').join(',')})`, ...page.map(e => e.id)) : [];
  return { entries: page, reactions, more: entries.length > 30 };
});
on('GET', '/api/events', 'member', ({ req, res, me }) => { openStream(req, res, me); return STREAM; });

// ---------- Aufgaben erledigen ----------
on('POST', '/api/entries/start', 'member', ({ body, me }) => {
  const d = new Date(), iso = d.toISOString();
  const helpers = [...new Set((Array.isArray(body.helpers) ? body.helpers : []).filter(h => isId(h) && h !== me.id && row('members', h)?.active))];
  let id;
  if (body.entry_id) { // zugewiesene oder Extra-Aufgabe
    const e = entry(body.entry_id);
    id = e.id;
    if (e.member_id !== me.id) throw new Fail(403, 'Das ist nicht deine Aufgabe');
    if (e.status !== 'todo') throw new Fail(409, 'Die Aufgabe läuft schon');
    patch('entries', id, { status: 'started', before_photo: savePhoto(id + '-v', body.photo, body.thumb), before_at: iso, helpers });
  } else {
    const t = body.task_id === 'wasch' ? L.WASCH : out('tasks', need('tasks', body.task_id, 'Aufgabe nicht gefunden'));
    if (!t.active || !L.activeOn(t, d)) throw new Fail(400, 'Diese Aufgabe ist heute nicht dran');
    if (t.virtual && +me.waschtag !== L.isoDay(d)) throw new Fail(400, 'Heute ist nicht dein Waschtag');
    const period = L.periodOf(t, d), slot = L.slotOf(t, me.id);
    if (q.get("select id from entries where task_id = ? and period = ? and slot = ? and status <> 'rejected'", t.id, period, slot)) throw new Fail(409, 'Oha, da war jemand schneller');
    id = randomUUID();
    savePhoto(id + '-v', body.photo, body.thumb);
    try {
      insert('entries', { id, task_id: t.id, title: t.title, member_id: me.id, period, slot, status: 'started', before_photo: id + '-v', before_at: iso, created_at: iso, created_by: me.id, helpers, points: 0 });
    } catch (e) {
      delPhoto(id + '-v');
      if (/UNIQUE/i.test(e.message)) throw new Fail(409, 'Oha, da war jemand schneller');
      throw e;
    }
  }
  const e = row('entries', id);
  if (helpers.length) notify(helpers, 'Teamwork!', `${me.name} hat dich dazugeholt: ${e.title}`);
  emit('entries', e);
});
on('POST', '/api/entries/:id/finish', 'member', ({ p, body, me }) => {
  const e = entry(p.id);
  if (e.member_id !== me.id) throw new Fail(403, 'Nur wer das Vorher-Foto gemacht hat, darf abhaken');
  if (e.status !== 'started') throw new Fail(409, 'Diese Aufgabe läuft nicht');
  const wait = (+settings().min_minutes || 0) * 60e3 - (Date.now() - new Date(e.before_at));
  if (wait > 0) throw new Fail(400, `So schnell? Noch ${Math.ceil(wait / 60e3)} Min. Erst putzen, dann Foto!`);
  const t = e.task_id === 'wasch' ? L.WASCH : row('tasks', e.task_id);
  const points = e.task_id === 'adhoc' ? (+e.points || 2) : t ? L.ptsOf(t) : 1;
  patch('entries', e.id, { status: 'done', after_photo: savePhoto(e.id + '-n', body.photo, body.thumb), after_at: now(), points, review: null, review_note: null });
  emitEntry(e.id);
  return { points };
});
on('POST', '/api/entries/:id/redo', 'member', ({ p, body, me }) => {
  const e = entry(p.id);
  if (!L.involved(e, me.id)) throw new Fail(403, 'Das ist nicht deine Aufgabe');
  if (e.status !== 'done' || e.review !== 'nach') throw new Fail(409, 'Hier ist nichts nachzubessern');
  const name = savePhoto(`${e.id}-n${Date.now().toString(36)}`, body.photo, body.thumb);
  delPhoto(e.after_photo);
  patch('entries', e.id, { after_photo: name, review: null, review_note: null });
  notify(admins().filter(a => a !== me.id), 'Nachgebessert', `${me.name}: ${e.title}`);
  emitEntry(e.id);
});
on('POST', '/api/entries/:id/cancel', 'member', ({ p, me }) => {
  const e = entry(p.id);
  if (e.member_id !== me.id && me.role !== 'admin') throw new Fail(403, 'Das ist nicht deine Aufgabe');
  if (e.status !== 'started') throw new Fail(409, 'Diese Aufgabe läuft nicht');
  // Zugewiesenes bleibt auf der Liste, alles andere wird wieder frei
  if (e.task_id === 'adhoc') patch('entries', e.id, { status: 'todo', before_photo: null, before_at: null, helpers: [] });
  else patch('entries', e.id, { status: 'rejected', note: 'abgebrochen', before_photo: null });
  delPhoto(e.before_photo);
  emitEntry(e.id);
});
on('POST', '/api/entries/:id/join', 'member', ({ p, me }) => {
  const e = entry(p.id);
  if (e.status !== 'started') throw new Fail(409, 'Die Aufgabe läuft nicht mehr');
  if (L.involved(e, me.id)) return;
  patch('entries', e.id, { helpers: [...e.helpers, me.id] });
  notify(e.member_id, 'Hilfe ist da!', `${me.name} hilft dir bei: ${e.title}`);
  emitEntry(e.id);
});
on('POST', '/api/entries/adhoc', 'member', ({ body, me }) => {
  const kind = body.kind, iso = now(), id = randomUUID();
  let who = me.id, points = 2, title = str(body.title, 120);
  if (kind === 'koch') {
    if (!settings().koch_regel) throw new Fail(400, 'Die Koch-Regel ist ausgeschaltet');
    who = member(body.member_id).id; points = 3; title = 'Gekocht? Töpfe, Pfannen & Herd sauber machen und wegräumen';
  } else if (kind === 'assign') {
    if (me.role !== 'admin') throw new Fail(403, 'Nur Admins können Aufgaben zuweisen');
    who = member(body.member_id).id; points = int(body.points, 1, 30, 3);
  } else if (kind !== 'extra') throw new Fail(400, 'Unbekannte Art');
  if (!title) throw new Fail(400, 'Was ist zu tun?');
  insert('entries', { id, task_id: 'adhoc', title, member_id: who, period: L.dKey(new Date()), slot: who, status: 'todo', points, created_at: iso, created_by: me.id, helpers: [] });
  if (who !== me.id) notify(who, 'Neue Aufgabe für dich', title);
  if (kind === 'assign') addLog(me, `hat ${nameOf(who)} „${title}“ zugewiesen`, [{ t: 'entries', id, del: true, only: { status: 'todo' } }]);
  emitEntry(id);
});
on('DELETE', '/api/entries/:id', 'member', ({ p, me }) => {
  const e = entry(p.id);
  if (e.status !== 'todo') throw new Fail(409, 'Lässt sich nicht mehr löschen');
  if (me.role !== 'admin' && e.created_by !== me.id) throw new Fail(403, 'Das hat dir jemand anders eingetragen');
  remove('entries', e.id);
  emitDel('entries', e.id);
});

// ---------- Punktekonto und freier Tag der Wochensieger ----------
on('POST', '/api/redeem', 'member', ({ me }) => {
  const st = logicState(), ix = L.buildIndex(st), d = L.noon(), m = out('members', me);
  const amount = Math.min(L.bank(ix, m, st, d), L.dayGoal(m, d, st.settings) - L.dayPoints(ix, m.id, d));
  if (amount <= 0) throw new Fail(400, 'Gerade gibt es nichts einzulösen');
  const id = randomUUID(), iso = now();
  insert('entries', { id, task_id: 'redeem', title: 'Punkte vom Konto eingelöst', member_id: m.id, period: L.dKey(d), slot: id, status: 'done', points: amount, after_at: iso, created_at: iso, created_by: m.id, helpers: [] });
  emitEntry(id);
  return { amount };
});
on('POST', '/api/royal', 'member', ({ body, me }) => {
  const st = logicState(), today = L.noon(), m = out('members', me);
  if (!isDate(body.day)) throw new Fail(400, 'Welcher Tag?');
  const d = L.fromKey(body.day);
  if (L.weekKey(d) !== L.weekKey(today) || L.dKey(d) < L.dKey(today)) throw new Fail(400, 'Der Tag muss in dieser Woche liegen');
  if (!L.royals(st, today).some(r => r.m.id === m.id)) throw new Fail(403, 'Das dürfen nur die Wochensieger');
  if (L.royalDayTaken(st, m, today)) throw new Fail(409, 'Dein freier Tag ist schon vergeben');
  const id = randomUUID();
  insert('entries', { id, task_id: 'frei', title: 'Königlicher freier Tag', note: 'royal', member_id: m.id, period: L.dKey(d), slot: id, status: 'done', points: L.dayGoal(m, d, st.settings) || 1, after_at: d.toISOString(), created_at: now(), created_by: m.id, helpers: [] });
  emitEntry(id);
});

// ---------- Reaktionen und Kommentare ----------
on('POST', '/api/reactions', 'member', ({ body, me }) => {
  const e = entry(body.entry_id);
  const id = isId(body.id) && !row('reactions', body.id) ? body.id : randomUUID();
  const others = [e.member_id, ...e.helpers].filter(x => x !== me.id);
  if (body.text != null) {
    const text = str(body.text, 300);
    if (!text) throw new Fail(400, 'Der Kommentar ist leer');
    insert('reactions', { id, entry_id: e.id, member_id: me.id, text, created_at: now() });
    notify(others, `${me.name} schreibt`, `${text} (${e.title})`);
    return void emit('reactions', row('reactions', id));
  }
  if (!L.REACTS.includes(body.emoji)) throw new Fail(400, 'Diese Reaktion gibt es nicht');
  const old = q.get('select id from reactions where entry_id = ? and member_id = ? and emoji = ?', e.id, me.id, body.emoji);
  if (body.on === false) { if (old) { remove('reactions', old.id); emitDel('reactions', old.id); } return; }
  if (old) return;
  insert('reactions', { id, entry_id: e.id, member_id: me.id, emoji: body.emoji, created_at: now() });
  notify(others, `${body.emoji} ${me.name}`, `hat auf dein Foto reagiert: ${e.title}`);
  emit('reactions', row('reactions', id));
});
on('DELETE', '/api/reactions/:id', 'member', ({ p, me }) => {
  const r = need('reactions', p.id);
  if (r.member_id !== me.id && me.role !== 'admin') throw new Fail(403, 'Das ist nicht deins');
  remove('reactions', r.id);
  emitDel('reactions', r.id);
});

// ---------- Eigenes Profil ----------
on('POST', '/api/me', 'member', ({ body, me }) => {
  patch('members', me.id, { emoji: firstEmoji(body.emoji) || me.emoji, rain: str(body.rain, 40) || null });
  emit('members', row('members', me.id));
});

// ---------- Vorschläge und Aufgaben-Verwaltung ----------
const taskFields = b => ({
  title: str(b.title, 120), room: str(b.room, 40) || 'Extra', freq: L.FREQ[b.freq] ? b.freq : 'daily', day: int(b.day, 0, 28, 0),
  minutes: int(b.minutes, 1, 240, 5), points: int(b.points, 1, 30, 1), leicht: !!b.leicht, per_person: !!b.per_person, active: b.active !== false,
});
on('PUT', '/api/tasks/:id', 'member', ({ p, body, me }) => {
  if (!isId(p.id) || L.SPECIAL.has(p.id) || p.id === 'wasch') throw new Fail(400, 'Ungültige Kennung');
  const old = row('tasks', p.id), f = taskFields(body);
  if (!f.title) throw new Fail(400, 'Die Aufgabe braucht einen Namen');
  if (me.role !== 'admin') {
    if (old) throw new Fail(403, 'Nur Admins können Aufgaben ändern');
    insert('tasks', { id: p.id, ...f, active: false, proposed_by: me.id });
    notify(admins(), 'Neuer Vorschlag', `${me.name}: ${f.title}`);
  } else {
    save('tasks', { id: p.id, ...f, proposed_by: old?.proposed_by && !f.active ? old.proposed_by : null });
    addLog(me, `hat die Aufgabe „${f.title}“ ${old ? 'geändert' : 'angelegt'}`);
  }
  emit('tasks', row('tasks', p.id));
});
on('POST', '/api/tasks/:id/active', 'admin', ({ p, body, me }) => {
  const t = need('tasks', p.id), active = !!body.active;
  patch('tasks', t.id, { active, proposed_by: null });
  addLog(me, `hat die Aufgabe „${t.title}“ ${active ? 'eingeschaltet' : 'ausgeschaltet'}`, [{ t: 'tasks', id: t.id, patch: { active: !!t.active, proposed_by: t.proposed_by } }]);
  if (t.proposed_by && active) notify(t.proposed_by, 'Vorschlag angenommen', t.title);
  emit('tasks', row('tasks', t.id));
});
on('DELETE', '/api/tasks/:id', 'admin', ({ p, me }) => {
  const t = need('tasks', p.id);
  remove('tasks', t.id);
  addLog(me, t.proposed_by ? `hat den Vorschlag „${t.title}“ von ${nameOf(t.proposed_by)} abgelehnt` : `hat die Aufgabe „${t.title}“ gelöscht`);
  emitDel('tasks', t.id);
});

// ---------- Admin: prüfen, belohnen, frei geben ----------
on('POST', '/api/entries/:id/review', 'admin', ({ p, body, me }) => {
  const e = entry(p.id), who = nameOf(e.member_id), team = [e.member_id, ...e.helpers].filter(x => x !== me.id);
  if (e.status !== 'done' || L.ADMIN_KINDS.has(e.task_id)) throw new Fail(409, 'Dieser Eintrag lässt sich nicht prüfen');
  const before = { review: e.review, review_note: e.review_note };
  if (body.verdict === 'ok') patch('entries', e.id, { review: 'ok', review_note: null });
  else if (body.verdict === 'nach') {
    const note = str(body.note, 200);
    patch('entries', e.id, { review: 'nach', review_note: note || null });
    notify(team, 'Bitte nachbessern', `${e.title}${note ? ': ' + note : ''}`);
    addLog(me, `hat „${e.title}“ von ${who} zum Nachbessern zurückgegeben${note ? ': ' + note : ''}`, [{ t: 'entries', id: e.id, patch: before }]);
  } else if (body.verdict === 'reject') {
    patch('entries', e.id, { status: 'rejected', note: 'abgelehnt' });
    notify(team, 'Nochmal ran!', `„${e.title}“ wurde abgelehnt. Die Aufgabe ist wieder offen.`);
    addLog(me, `hat „${e.title}“ von ${who} abgelehnt (−${e.points} P)`, [{ t: 'entries', id: e.id, patch: { status: 'done', note: null } }]);
  } else throw new Fail(400, 'Unbekanntes Urteil');
  emitEntry(e.id);
});
on('POST', '/api/entries/review-all', 'admin', () => {
  const ids = q.all(`select id from entries where status = 'done' and review is null and task_id not in ('bonus', 'warn', 'frei', 'redeem')`).map(r => r.id);
  for (const id of ids) { patch('entries', id, { review: 'ok' }); emitEntry(id); }
  return { count: ids.length };
});
on('POST', '/api/entries/reward', 'admin', ({ body, me }) => {
  const kind = body.kind, m = out('members', member(body.member_id)), id = randomUUID(), iso = now(), reason = str(body.reason, 160);
  let points, period = L.dKey(new Date()), after_at = iso, title = reason, text;
  if (kind === 'frei') {
    const d = L.noon(new Date(), -int(body.when, 0, 6, 0));
    points = L.dayGoal(m, d, settings()) || 1; period = L.dKey(d); after_at = d.toISOString(); title = reason || 'Freier Tag';
    notify(m.id, 'Du hast frei!', `${dayText(d)} ${title}`);
    text = `hat ${m.name} am ${dayText(d)} frei gegeben`;
  } else if (kind === 'bonus' || kind === 'warn') {
    if (!reason) throw new Fail(400, 'Bitte einen Grund angeben');
    const n = int(body.points, 1, 50, kind === 'bonus' ? 5 : 3);
    points = kind === 'bonus' ? n : -n;
    notify(m.id, kind === 'bonus' ? 'Belohnung!' : 'Abmahnung', kind === 'bonus' ? `+${n} Punkte: ${reason}` : `${reason} (−${n} Punkte)`);
    text = kind === 'bonus' ? `hat ${m.name} belohnt: +${n} P „${reason}“` : `hat ${m.name} abgemahnt: −${n} P „${reason}“`;
  } else throw new Fail(400, 'Unbekannte Art');
  insert('entries', { id, task_id: kind, title, member_id: m.id, period, slot: id, status: 'done', points, after_at, created_at: iso, created_by: me.id, helpers: [] });
  addLog(me, text, [{ t: 'entries', id, patch: { status: 'rejected' } }]);
  emitEntry(id);
});
on('POST', '/api/entries/:id/revoke', 'admin', ({ p, me }) => {
  const e = entry(p.id);
  if (!['bonus', 'warn', 'frei'].includes(e.task_id) || e.status !== 'done') throw new Fail(409, 'Lässt sich nicht zurücknehmen');
  patch('entries', e.id, { status: 'rejected' });
  addLog(me, `hat „${e.title}“ für ${nameOf(e.member_id)} zurückgenommen`, [{ t: 'entries', id: e.id, patch: { status: 'done' } }]);
  emitEntry(e.id);
});
/** Eine Aufgabe aus dem Plan gezielt einer Person geben. Sie steht dann bei ihr unter „Meins“ und ist für die anderen vergeben. */
on('POST', '/api/tasks/:id/assign', 'admin', ({ p, body, me }) => {
  const t = out('tasks', need('tasks', p.id, 'Aufgabe nicht gefunden')), m = member(body.member_id), d = new Date(), id = randomUUID();
  const period = L.periodOf(t, d), slot = L.slotOf(t, m.id);
  if (q.get("select id from entries where task_id = ? and period = ? and slot = ? and status <> 'rejected'", t.id, period, slot)) throw new Fail(409, 'Die Aufgabe ist schon vergeben oder erledigt');
  insert('entries', { id, task_id: t.id, title: t.title, member_id: m.id, period, slot, status: 'todo', points: 0, created_at: now(), created_by: me.id, helpers: [] });
  if (m.id !== me.id) notify(m.id, 'Neue Aufgabe für dich', t.title);
  addLog(me, `hat ${m.name} „${t.title}“ zugewiesen`, [{ t: 'entries', id, del: true, only: { status: 'todo' } }]);
  emitEntry(id);
});
on('POST', '/api/announce', 'admin', ({ body, me }) => {
  const text = str(body.text, 200);
  if (!text) throw new Fail(400, 'Die Nachricht ist leer');
  notify(q.all('select id from members where active = 1 and id <> ?', me.id).map(m => m.id), `Durchsage von ${me.name}`, text);
  emitSay({ from: me.id, text });
  addLog(me, `hat eine Durchsage geschickt: „${text}“`);
});

// ---------- Admin: Familie, Regeln, Einladung, Protokoll ----------
on('PUT', '/api/members/:id', 'admin', ({ p, body, me }) => {
  if (!isId(p.id)) throw new Fail(400, 'Ungültige Kennung');
  const old = row('members', p.id);
  const f = {
    name: str(body.name, 30), emoji: firstEmoji(body.emoji) || '🙂', role: L.ROLES[body.role] ? body.role : 'mitglied',
    w_weekday: num(body.w_weekday, 0, 3, 1), w_weekend: num(body.w_weekend, 0, 3, 1), waschtag: int(body.waschtag, 1, 7, null),
    active: body.active !== false, titel: ['k', 'q'].includes(body.titel) ? body.titel : null,
    away_from: isDate(body.away_from) && isDate(body.away_to) ? body.away_from : null, away_to: isDate(body.away_from) && isDate(body.away_to) ? body.away_to : null,
  };
  if (!f.name) throw new Fail(400, 'Der Name fehlt');
  if (old?.role === 'admin' && (f.role !== 'admin' || !f.active) && !q.get("select id from members where role = 'admin' and active = 1 and id <> ?", p.id)) throw new Fail(400, 'Mindestens eine Person muss Admin bleiben');
  if (old) patch('members', p.id, f);
  else insert('members', { id: p.id, ...f, sort: (q.get('select max(sort) as m from members').m ?? 0) + 1 });
  if (old && (old.role !== f.role || !f.active)) dropStreams(p.id);
  addLog(me, old ? `hat die Einstellungen von ${f.name} geändert` : `hat ${f.name} hinzugefügt`);
  emit('members', row('members', p.id));
});
on('DELETE', '/api/members/:id', 'admin', ({ p, me }) => {
  const m = member(p.id);
  if (m.id === me.id) throw new Fail(400, 'Dich selbst kannst du nicht entfernen');
  q.run('update sessions set member_id = null where member_id = ?', m.id);
  q.run('delete from push_subs where member_id = ?', m.id);
  remove('members', m.id);
  dropStreams(m.id);
  addLog(me, `hat ${m.name} entfernt`);
  emitDel('members', m.id);
});
on('POST', '/api/members/:id/reset-pin', 'admin', ({ p, me }) => {
  const m = member(p.id);
  patch('members', m.id, { pin_hash: null, pin_help: null });
  if (m.id !== me.id) { q.run('update sessions set member_id = null where member_id = ?', m.id); dropStreams(m.id); }
  addLog(me, `hat die PIN von ${m.name} zurückgesetzt`);
  emit('members', row('members', m.id));
});
on('PUT', '/api/settings', 'admin', ({ body, me }) => {
  const s = settings(), rooms = {};
  for (const [k, v] of Object.entries(body.rooms && typeof body.rooms === 'object' ? body.rooms : s.rooms || {}).slice(0, 60)) rooms[str(k, 40)] = str(v, 30);
  const next = {
    min_minutes: int(body.min_minutes, 0, 60, s.min_minutes), tagesziel: int(body.tagesziel, 1, 50, s.tagesziel),
    koch_regel: body.koch_regel ?? s.koch_regel ? true : false, review_first: body.review_first ?? s.review_first ? true : false, erinnerung: body.erinnerung ?? s.erinnerung ? true : false, rooms,
  };
  setMeta('settings', next);
  addLog(me, 'hat die Regeln geändert');
  emitSettings(next);
});
const doorUntil = () => { const d = getMeta('v1_door'); return d && d.until > now() ? d.until : null; };
on('GET', '/api/invite', 'admin', () => ({ code: inviteCode(), v1_until: doorUntil() }));
on('POST', '/api/invite/renew', 'admin', ({ me }) => {
  const code = newCode();
  setMeta('code', code);
  setMeta('v1_door', null); // ein neuer Link schließt jeden alten Weg herein, auch den über die alte App
  addLog(me, 'hat einen neuen Einladungslink erzeugt (der alte gilt nicht mehr)');
  return { code, v1_until: null };
});
on('POST', '/api/log/:id/undo', 'admin', ({ p }) => {
  const l = need('log', +p.id);
  if (!l.undo || l.undone) throw new Fail(409, 'Lässt sich nicht (mehr) zurücknehmen');
  const ops = JSON.parse(l.undo);
  for (const op of ops) {
    const cur = row(op.t, op.id);
    if (!cur) throw new Fail(409, 'Den Eintrag gibt es nicht mehr');
    for (const [k, v] of Object.entries(op.only || {})) if (cur[k] !== v) throw new Fail(409, 'Schon angefangen, lässt sich nicht mehr zurücknehmen');
  }
  for (const op of ops) {
    if (op.del) { remove(op.t, op.id); emitDel(op.t, op.id); continue; }
    try { patch(op.t, op.id, op.patch); } catch (e) { if (/UNIQUE/i.test(e.message)) throw new Fail(409, 'Die Aufgabe wurde inzwischen neu gemacht'); throw e; }
    emit(op.t, row(op.t, op.id));
  }
  q.run('update log set undone = 1 where id = ?', l.id);
  emit('log', row('log', l.id), { adminOnly: true });
});

// ---------- Push ----------
on('POST', '/api/push/sub', 'member', ({ body, me }) => {
  const sub = body.sub;
  if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Fail(400, 'Ungültige Push-Anmeldung');
  const id = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 32);
  q.run('insert into push_subs (id, member_id, sub, created_at) values (?, ?, ?, ?) on conflict (id) do update set member_id = excluded.member_id, sub = excluded.sub', id, me.id, JSON.stringify(sub), now());
});
on('POST', '/api/push/test', 'member', ({ me }) => { notify(me.id, 'Putzplan', 'Benachrichtigungen funktionieren!'); });
