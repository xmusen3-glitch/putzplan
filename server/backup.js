// Schreibt eine in sich stimmige Kopie der Datenbank, auch im laufenden Betrieb, und prüft sie.
// Aufruf: node server/backup.js [Zieldatei]   (gedacht für scripts/backup.sh)
import { DatabaseSync } from 'node:sqlite';
import { rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DATA = process.env.DATA_DIR || join(process.cwd(), 'data');
const target = process.argv[2] || join(DATA, '.sicherung.db');
rmSync(target, { force: true });

const db = new DatabaseSync(join(DATA, 'putzplan.db'));
db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
db.close();

const copy = new DatabaseSync(target, { readOnly: true });
const check = copy.prepare('pragma integrity_check').get().integrity_check;
const n = t => copy.prepare(`select count(*) as n from ${t}`).get().n;
const summary = `${n('members')} Personen, ${n('tasks')} Aufgaben, ${n('entries')} Einträge, ${n('reactions')} Reaktionen`;
copy.close();
if (check !== 'ok') { console.error('Die Kopie der Datenbank ist beschädigt:', check); process.exit(1); }
console.log(`Datenbank gesichert (${Math.round(statSync(target).size / 1024)} KB): ${summary}`);
