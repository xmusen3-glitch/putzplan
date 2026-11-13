// Push-Benachrichtigungen und der stündliche Wecker (Waschtag, Tagesziel).
import * as webpush from 'web-push';
import { q, getMeta, setMeta, logicState } from './db.js';
import { isoDay, isAway, dayGoal, dayPoints, buildIndex } from '../shared/logic.js';

let keys = getMeta('vapid');
if (!keys) { keys = webpush.generateVAPIDKeys(); setMeta('vapid', keys); }
webpush.setVapidDetails(process.env.PUSH_CONTACT || 'mailto:putzplan@example.com', keys.publicKey, keys.privateKey);
export const publicKey = keys.publicKey;

/** Schickt eine Benachrichtigung an eine oder mehrere Personen. Wartet nicht auf den Versand. */
export function notify(to, title, body) {
  const ids = [...new Set([].concat(to).filter(Boolean))];
  if (!ids.length) return;
  const subs = q.all(`select * from push_subs where member_id in (${ids.map(() => '?').join(',')})`, ...ids);
  for (const s of subs) {
    webpush.sendNotification(JSON.parse(s.sub), JSON.stringify({ title, body }), { TTL: 6 * 3600 }).catch(e => {
      if (e?.statusCode === 404 || e?.statusCode === 410) q.run('delete from push_subs where id = ?', s.id);
      else console.error('Push fehlgeschlagen:', e?.statusCode, e?.message);
    });
  }
}

function hourly(d) {
  const st = logicState(), h = d.getHours(), wd = isoDay(d), tomorrow = wd % 7 + 1;
  const active = st.members.filter(m => m.active && !isAway(m, d));
  if (h === 7) for (const m of active) if (+m.waschtag === wd) notify(m.id, 'Heute ist dein Waschtag!', 'Wäschekorb runterbringen nicht vergessen.');
  if (h === 19) for (const m of active) if (+m.waschtag === tomorrow) notify(m.id, 'Morgen ist Waschtag', 'Denk an deinen Wäschekorb!');
  if (h === 17 && st.settings.erinnerung) {
    const ix = buildIndex(st);
    for (const m of active) {
      const goal = dayGoal(m, d, st.settings), p = dayPoints(ix, m.id, d);
      if (goal > 0 && p < goal) notify(m.id, p === 0 ? 'Noch nichts gemacht heute?' : 'Fast geschafft!', `Noch ${goal - p} Punkte bis zu deinem Tagesziel. Such dir was aus!`);
    }
  }
}

export function startJobs() {
  let last = new Date().getHours(); // die laufende Stunde nicht nachholen, sonst kämen Erinnerungen nach einem Neustart doppelt
  setInterval(() => {
    const d = new Date();
    if (d.getHours() === last) return;
    last = d.getHours();
    try { hourly(d); } catch (e) { console.error('Wecker:', e); }
  }, 60e3).unref();
}
