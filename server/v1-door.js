// Übergangstür für Geräte, die noch die alte App (V1) kennen: Sie kommen über die alte Adresse von selbst
// in die neue Familie und landen bei ihrem Namen (die PIN brauchen sie trotzdem).
//   Öffnen:    FAMILIE=<Familien-Geheimcode aus V1> node server/v1-door.js [Tage, sonst 30]
//   Schließen: node server/v1-door.js zu
// Gespeichert wird nur eine Prüfsumme des alten Codes. Ein neuer Einladungslink in der App schließt die Tür auch.
import { createHash } from 'node:crypto';
import { getMeta, setMeta } from './db.js';

const arg = process.argv[2];
if (arg === 'zu') {
  setMeta('v1_door', null);
  console.log('Übergangstür geschlossen.');
} else if (!process.env.FAMILIE) {
  const d = getMeta('v1_door');
  console.log(d && d.until > new Date().toISOString() ? `Übergangstür ist offen bis ${d.until.slice(0, 10)}.` : 'Übergangstür ist zu. Zum Öffnen FAMILIE setzen.');
} else {
  const until = new Date(Date.now() + (+arg || 30) * 864e5).toISOString();
  setMeta('v1_door', { hash: createHash('sha256').update(process.env.FAMILIE).digest('hex'), until });
  console.log(`Übergangstür offen bis ${until.slice(0, 10)}.`);
}
