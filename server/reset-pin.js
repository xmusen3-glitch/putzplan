// Notfall: PIN einer Person direkt am Server zurücksetzen, z. B. wenn die einzige Admin-Person ihre PIN vergessen hat.
// Aufruf: npm run pin -- Dorina   (im Container: docker exec putzplan node server/reset-pin.js Dorina)
// Danach legt die Person beim nächsten Öffnen der App eine neue PIN fest.
import { q } from './db.js';

const name = process.argv.slice(2).join(' ').trim();
const all = q.all('select id, name, role, pin_hash from members order by sort, name');
const hits = all.filter(m => m.name.toLowerCase() === name.toLowerCase());
if (!name || hits.length !== 1) {
  console.error(name ? `Keine eindeutige Person mit dem Namen „${name}“.` : 'Bitte einen Namen angeben.');
  console.error('Vorhanden: ' + all.map(m => `${m.name} (${m.role}${m.pin_hash ? '' : ', ohne PIN'})`).join(', '));
  process.exit(1);
}
q.run('update members set pin_hash = null, pin_help = null where id = ?', hits[0].id);
q.run('update sessions set member_id = null where member_id = ?', hits[0].id);
q.run('insert into log (at, member_id, text) values (?, ?, ?)', new Date().toISOString(), hits[0].id, 'PIN wurde direkt am Server zurückgesetzt');
console.log(`PIN von ${hits[0].name} zurückgesetzt. Beim nächsten Öffnen der App wird eine neue festgelegt.`);
