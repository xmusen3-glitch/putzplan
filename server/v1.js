// Lesender Zugriff auf die alte V1-Datenbank (Supabase). Gebraucht vom Umzug und vom Abgleich.
const { SB_URL, SB_KEY, FAMILIE } = process.env;
if (!SB_URL || !SB_KEY || !FAMILIE) { console.error('Bitte SB_URL, SB_KEY und FAMILIE setzen.'); process.exit(1); }
const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'x-familie': FAMILIE };

export async function get(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
/** Holt alle Zeilen einer Tabelle in Blöcken, damit keine Obergrenze greift. */
export async function all(table, select = '*', order = 'id') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const part = await get(`${table}?select=${select}&order=${order}&offset=${from}&limit=1000`);
    out.push(...part);
    if (part.length < 1000) return out;
  }
}
/** Ein Foto aus V1 als Bytes (oder null, wenn es dort nicht mehr existiert). */
export async function photoBytes(id) {
  const [p] = await get(`photos?select=data&id=eq.${encodeURIComponent(id)}`);
  const m = /^data:image\/jpeg;base64,(.+)$/.exec(p?.data || '');
  return m ? Buffer.from(m[1], 'base64') : null;
}
export const roleOf = m => (m.is_admin ? 'admin' : m.klein ? 'kind' : 'mitglied');
export const isRoyal = c => c.task_id === 'frei' && /^Königlicher freier Tag/.test(c.title || '');
export const helpersOf = c => { try { const h = JSON.parse(c.helpers || '[]'); return Array.isArray(h) ? h : []; } catch { return []; } };
