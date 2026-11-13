// Startdaten für eine ganz neue Installation (ohne Umzug aus V1): eine Admin-Person und die Standard-Aufgaben.
import { randomUUID } from 'node:crypto';
import { q, insert, setMeta, inviteCode } from './db.js';
import { DEFAULT_SETTINGS } from '../shared/logic.js';

// id, Titel, Raum, Häufigkeit, Tag, Minuten, Punkte, leicht, pro Person
const TASKS = [
  ['eing-aufr', 'Eingang aufräumen', 'Eingang', 'daily', 0, 5, 2, 1],
  ['eing-schuhe', 'Schuhe & Jacken ordentlich hinstellen / aufhängen', 'Eingang', 'daily', 0, 3, 1, 1],
  ['eing-boden', 'Eingang saugen & wischen', 'Eingang', 'weekdays', 0, 10, 3, 0],
  ['flur-saugen', 'Flur saugen', 'Flur & Treppe', 'weekdays', 0, 8, 3, 0],
  ['flur-wischen', 'Treppe & Flur wischen', 'Flur & Treppe', 'weekdays', 0, 12, 4, 0],
  ['wz-decken', 'Couchdecken ordentlich hinlegen & Kissen richten', 'Wohnzimmer', 'daily', 0, 3, 1, 1],
  ['wz-tisch', 'Couchtisch aufräumen & wischen', 'Wohnzimmer', 'daily', 0, 5, 2, 1],
  ['wz-couch', 'Couch absaugen', 'Wohnzimmer', 'weekdays', 0, 5, 2, 0],
  ['ez-tisch', 'Esstisch aufräumen & wischen', 'Esszimmer', 'daily', 0, 5, 2, 1],
  ['boden-saugen', 'Boden Ess- & Wohnzimmer saugen', 'Esszimmer', 'weekdays', 0, 15, 4, 0],
  ['boden-wischen', 'Boden Ess- & Wohnzimmer wischen', 'Esszimmer', 'weekdays', 0, 15, 4, 0],
  ['k-sm-aus', 'Spülmaschine ausräumen', 'Küche', 'daily', 0, 8, 3, 0],
  ['k-sm-ein', 'Spülmaschine einräumen & anmachen', 'Küche', 'daily', 0, 8, 3, 0],
  ['k-flaechen', 'Arbeitsflächen aufräumen & wischen', 'Küche', 'daily', 0, 10, 3, 0],
  ['k-muell-raus', 'Müll rausbringen', 'Küche', 'daily', 0, 5, 3, 1],
  ['k-boden', 'Küchenboden saugen & wischen', 'Küche', 'weekdays', 0, 12, 4, 0],
  ['k-kuehl', 'Kühlschrank sortieren & auswischen', 'Küche', 'weekly', 6, 20, 5, 0],
  ['gb-becken', 'Waschbecken putzen', 'Gästebad', 'weekdays', 0, 5, 2, 0],
  ['gb-wc', 'Toilette putzen', 'Gästebad', 'weekdays', 0, 7, 4, 0],
  ['gb-dusche', 'Dusche putzen & Abfluss reinigen', 'Gästebad', 'weekly', 6, 15, 5, 0],
  ['fenster', 'Fenster putzen (ein Raum)', 'Ganzes Haus', 'monthly', 1, 20, 5, 0, 1],
  ['zimmer', 'Eigenes Zimmer aufräumen', 'Eigenes Zimmer', 'weekend', 0, 30, 5, 1, 1],
];

export function seedIfEmpty() {
  if (q.get('select id from members limit 1')) return false;
  insert('members', { id: randomUUID(), name: 'Admin', emoji: '👑', role: 'admin', active: true, sort: 0 });
  for (const [id, title, room, freq, day, minutes, points, leicht, per_person] of TASKS) insert('tasks', { id, title, room, freq, day, minutes, points, leicht: !!leicht, per_person: !!per_person, active: true });
  setMeta('settings', DEFAULT_SETTINGS);
  inviteCode();
  return true;
}
