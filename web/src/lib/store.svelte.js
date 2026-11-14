// Zustand der App: einmal laden, danach nur noch einzelne Änderungen über den Live-Kanal einspielen.
import * as L from '../../../shared/logic.js';

class Store {
  phase = $state('boot'); // boot | join | who | app
  joinError = $state('');
  picker = $state.raw([]); // Personen für den Anmeldeschirm
  meId = $state(null);
  members = $state.raw([]);
  tasks = $state.raw([]);
  entries = $state.raw([]);
  reactions = $state.raw([]);
  log = $state.raw([]);
  older = $state.raw([]); // nachgeladene Einträge, die älter sind als der geladene Zeitraum (nur für die Foto-Ansicht)
  olderMore = $state(false);
  settings = $state.raw({ ...L.DEFAULT_SETTINGS });
  pushKey = null;
  tab = $state('heute');
  now = $state(Date.now());
  online = $state(true);
  say = $state.raw(null); // letzte Durchsage
  version = $state(''); // Stand des Servers beim Laden dieser Seite
  update = $state(false); // der Server läuft inzwischen mit einem neueren Stand
}
export const S = new Store();

const byId = $derived(new Map(S.members.map(m => [m.id, m])));
const me = $derived(byId.get(S.meId) || null);
const reactionsBy = $derived.by(() => { const m = new Map(); for (const r of S.reactions) (m.get(r.entry_id) || m.set(r.entry_id, []).get(r.entry_id)).push(r); return m; });
const calc = $derived.by(() => {
  const st = { members: S.members, tasks: S.tasks, entries: S.entries, settings: S.settings };
  const d = new Date(S.now), ix = L.buildIndex(st), wk = L.weekPoints(st, d), mo = L.monthPoints(st, d), per = {};
  for (const m of S.members) {
    per[m.id] = {
      today: L.dayPoints(ix, m.id, d), goal: L.dayGoal(m, d, st.settings), week: wk.pts[m.id] || 0, cnt: wk.cnt[m.id] || 0,
      warn: wk.warn[m.id] || 0, bonus: wk.bonus[m.id] || 0, month: mo.pts[m.id] || 0, streak: L.streak(ix, m, st, d), bank: L.bank(ix, m, st, d),
    };
  }
  return { st, d, ix, per, today: L.dKey(d) };
});
/** Abgeleitete Werte. Als Getter, damit Komponenten immer den aktuellen Stand lesen. */
export const G = {
  get me() { return me; },
  get admin() { return me?.role === 'admin'; },
  get kid() { return me?.role === 'kind'; },
  get calc() { return calc; },
  get active() { return S.members.filter(m => m.active); },
  /** Erledigte Aufgaben, die noch niemand geprüft hat (älteste zuerst). */
  get queue() { return S.entries.filter(e => e.status === 'done' && !e.review && !L.ADMIN_KINDS.has(e.task_id)).sort((a, b) => (a.after_at || '').localeCompare(b.after_at || '')); },
  get proposals() { return S.tasks.filter(t => t.proposed_by); },
  /** Personen, die auf dem Anmeldeschirm „PIN vergessen“ gedrückt haben. */
  get pinHelp() { return S.members.filter(m => m.pin_help && m.active); },
  /** Gemeinsame Aufgaben, die heute dran oder liegengeblieben sind. */
  get shared() { const d = calc.d; return S.tasks.filter(t => t.active && !t.per_person && L.activeOn(t, d) && (L.dueOn(t, d) || L.overdueInPeriod(t, d))); },
  get late() { const { d, ix } = calc; return G.shared.filter(t => L.overdueInPeriod(t, d) && !L.entryFor(ix, t, d, null)); },
};
export const mem = id => byId.get(id);
export const mName = id => byId.get(id)?.name || 'Jemand';
export const mEmoji = id => byId.get(id)?.emoji || '🙂';
export const reactionsOf = id => reactionsBy.get(id) || [];
export const taskOf = id => (id === 'wasch' ? L.WASCH : S.tasks.find(t => t.id === id));

// ---------- Anfragen ----------
export async function api(method, path, body) {
  let r;
  try { r = await fetch('/api' + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }); }
  catch { throw new Error('Keine Verbindung. Versuch es gleich nochmal.'); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && S.phase === 'app') boot();
    throw Object.assign(new Error(data.error || 'Hat nicht geklappt'), { status: r.status });
  }
  for (const c of data.changes || []) apply(c);
  return data;
}
export const post = (path, body) => api('POST', path, body);
export const put = (path, body) => api('PUT', path, body);
export const del = path => api('DELETE', path);

/** Eine einzelne Änderung einspielen (aus der eigenen Antwort oder vom Live-Kanal). Doppelt schadet nicht. */
export function apply(c) {
  if (c.t === 'settings') return void (S.settings = { ...L.DEFAULT_SETTINGS, ...c.row });
  if (c.t === 'say') return void (S.say = { ...c.row, at: Date.now() });
  const list = S[c.t];
  if (!Array.isArray(list)) return;
  if (c.del != null) return void (S[c.t] = list.filter(x => x.id !== c.del));
  if (c.t === 'entries' && S.older.some(x => x.id === c.row.id)) return void (S.older = S.older.map(x => (x.id === c.row.id ? c.row : x)));
  const i = list.findIndex(x => x.id === c.row.id);
  let next = i < 0 ? (c.t === 'log' || c.t === 'entries' ? [c.row, ...list] : [...list, c.row]) : list.map((x, j) => (j === i ? c.row : x));
  if (c.t === 'members') next = next.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  S[c.t] = next;
}

// ---------- Start, Anmeldung, Live-Kanal ----------
let es = null, hiddenAt = 0;
async function loadState() {
  const st = await api('GET', '/state');
  const old = new Set(S.older.map(e => e.id)); // Reaktionen zu nachgeladenen alten Fotos behalten
  S.meId = st.me; S.members = st.members; S.tasks = st.tasks; S.entries = st.entries; S.log = st.log;
  S.reactions = [...st.reactions, ...S.reactions.filter(r => old.has(r.entry_id))];
  S.settings = { ...L.DEFAULT_SETTINGS, ...st.settings }; S.pushKey = st.push_key;
  if (!S.older.length) S.olderMore = !!st.older;
  // Nach einem Update läuft im Handy noch der alte Stand der App: Hinweis zum Neuladen zeigen
  if (!S.version) S.version = st.version || '';
  else if (st.version && st.version !== S.version) S.update = true;
}
/** Die nächste Seite älterer Fotos holen. */
export async function loadOlder() {
  const before = S.older.at(-1)?.created_at;
  const r = await api('GET', '/history' + (before ? '?before=' + encodeURIComponent(before) : ''));
  const have = new Set(S.older.map(e => e.id)), haveR = new Set(S.reactions.map(x => x.id));
  S.older = [...S.older, ...r.entries.filter(e => !have.has(e.id))];
  S.reactions = [...S.reactions, ...r.reactions.filter(x => !haveR.has(x.id))];
  S.olderMore = r.more;
}
function connect() {
  es?.close();
  let first = true;
  es = new EventSource('/api/events');
  es.onopen = () => { S.online = true; if (!first) loadState().catch(() => {}); first = false; };
  es.onmessage = e => apply(JSON.parse(e.data));
  es.onerror = () => { S.online = false; if (es.readyState === 2) setTimeout(() => S.phase === 'app' && boot(), 4000); };
}
export async function boot() {
  es?.close(); es = null;
  const code = /join=([\w-]+)/.exec(location.hash)?.[1];
  let s;
  try {
    s = await api('GET', '/session');
    if (!s.joined && code) s = await api('POST', '/join', { code }).catch(e => { S.joinError = e.message; return s; });
  } catch (e) { S.joinError = e.message; return void (S.phase = 'join'); }
  if (!s.joined) return void (S.phase = 'join');
  S.picker = s.members;
  if (!s.me) return void (S.phase = 'who');
  await enter();
}
export async function join(link) {
  const code = /join=([\w-]+)/.exec(link)?.[1] || link.trim();
  const s = await api('POST', '/join', { code });
  history.replaceState(null, '', '/#join=' + code); // bleibt in der Adresse, damit "Zum Home-Bildschirm" ihn mitnimmt
  S.picker = s.members; S.joinError = ''; S.phase = 'who';
}
export async function login(member_id, pin) { await api('POST', '/login', { member_id, pin }); await enter(); }
async function enter() { await loadState(); S.tab = me?.role === 'admin' ? 'uebersicht' : 'heute'; S.phase = 'app'; connect(); }
export async function switchPerson() { await post('/logout'); await boot(); }
export async function leave() { await post('/leave'); history.replaceState(null, '', '/'); await boot(); }

setInterval(() => { S.now = Date.now(); }, 30e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return void (hiddenAt = Date.now());
  S.now = Date.now();
  if (S.phase !== 'app') return;
  // Handys kappen die Verbindung im Hintergrund gern stillschweigend: nach einer Pause einmal frisch laden
  if (!es || es.readyState === 2) connect();
  if (Date.now() - hiddenAt > 20e3) loadState().catch(() => {});
});
