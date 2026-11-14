// Gibt den aktuellen Einladungslink aus. Aufruf: npm run einladung  (im Container: docker exec putzplan node server/invite.js)
// Auf dem Server kommt die Adresse aus APP_URL, lokal ist es der Entwicklungs-Server.
import { inviteCode } from './db.js';

const base = process.argv[2] || process.env.APP_URL || 'http://localhost:5173';
console.log(`${base.replace(/\/$/, '')}/#join=${inviteCode()}`);
