// Familien-Putzplan – Vorher/Nachher-Fotos, faire Verteilung, Punkte.
// Zwei Speicher: "demo" (nur dieses Handy) und "cloud" (Supabase, ganze Familie).

function loadScript(src) {
  return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Konnte ' + src + ' nicht laden')); document.head.append(s); });
}

// ---------- kleine Helfer ----------
const $ = (s, el = document) => el.querySelector(s);
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = n => String(n).padStart(2, '0');
const dKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const isoDay = d => ((d.getDay() + 6) % 7) + 1; // Mo=1 … So=7
function weekKey(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${pad(w)}`;
}
function hash(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
async function sha(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const DAYS = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const FREQ = { daily: 'täglich', weekdays: 'Mo–Fr (5x/Woche)', weekly: '1x pro Woche', monthly: '1x im Monat', weekend: 'am Wochenende' };
const ROOM_ICON = { 'Garten': '🌳', 'Auffahrt': '🚗', 'Garage': '🔧', 'Durchgang drinnen': '🚶', 'Durchgang draußen': '🌿', 'Eingang': '🚪', 'Flur & Treppe': '🪜', 'Wohnzimmer': '🛋️', 'Esszimmer': '🍽️', 'Küche': '🍳', 'Gästebad': '🚽', 'Wäsche': '🧺', 'Ganzes Haus': '🏠', 'Eigenes Zimmer': '🛏️', 'Extra': '✨' };
const roomIcon = r => (S?.settings?.rooms || {})[r] || ROOM_ICON[r] || '🧽';
const allRooms = () => [...new Set([...Object.keys(ROOM_ICON).filter(r => r !== 'Extra' && r !== 'Wäsche'), ...Object.keys(S.settings.rooms || {}), ...S.tasks.map(x => x.room)])];
const fmtTime = iso => { const d = new Date(iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}. ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ptsFor = min => Math.max(1, Math.round((min || 5) / 5));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}
const b64e = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

// ---------- Startdaten ----------
const SEED_TASKS = [
  // id, Titel, Raum, Häufigkeit, Tag, Minuten, leicht (auch für die Kleinen), pro Person
  ['eing-aufr', 'Eingang aufräumen', 'Eingang', 'daily', 0, 5, true],
  ['eing-schuhe', 'Schuhe & Jacken ordentlich hinstellen / aufhängen', 'Eingang', 'daily', 0, 3, true],
  ['eing-ranzen', 'Alle Schulranzen ins Zimmer mitnehmen', 'Eingang', 'weekdays', 0, 2, true],
  ['eing-boden', 'Eingang saugen & wischen', 'Eingang', 'weekdays', 0, 10, false],
  ['flur-saugen', 'Flur oben saugen', 'Flur & Treppe', 'weekdays', 0, 8, false],
  ['flur-wischen', 'Treppe & Flur oben wischen', 'Flur & Treppe', 'weekdays', 0, 12, false],
  ['waschflur', 'Waschflur saugen & wischen', 'Flur & Treppe', 'weekly', 3, 10, false],
  ['wz-decken', 'Couchdecken ordentlich hinlegen & Kissen richten', 'Wohnzimmer', 'daily', 0, 3, true],
  ['wz-couch', 'Couch absaugen', 'Wohnzimmer', 'weekdays', 0, 5, false],
  ['wz-tisch', 'Couchtisch aufräumen, wischen & Deko richten', 'Wohnzimmer', 'daily', 0, 5, true],
  ['wz-kommode', 'Kommode oben aufräumen, wischen & Deko richten', 'Wohnzimmer', 'weekdays', 0, 5, true],
  ['wz-tv', 'Fernseher-Kommode / Schrank Staub wischen & Sachen ordnen', 'Wohnzimmer', 'weekly', 2, 10, true],
  ['wz-unter-couch', 'Unter der Couch putzen', 'Wohnzimmer', 'weekly', 4, 15, false],
  ['ez-tisch', 'Esstisch aufräumen & wischen', 'Esszimmer', 'daily', 0, 5, true],
  ['ez-stuehle', 'Stühle & Deko ordentlich hinstellen', 'Esszimmer', 'daily', 0, 2, true],
  ['ez-stuehle-sauber', 'Stühle absaugen / sauber machen', 'Esszimmer', 'weekly', 5, 10, false],
  ['boden-saugen', 'Boden Ess- & Wohnzimmer saugen', 'Esszimmer', 'weekdays', 0, 15, false],
  ['boden-wischen', 'Boden Ess- & Wohnzimmer wischen', 'Esszimmer', 'weekdays', 0, 15, false],
  ['k-sm-aus', 'Spülmaschine ausräumen', 'Küche', 'daily', 0, 8, false],
  ['k-sm-ein', 'Spülmaschine einräumen, Tab rein & anmachen', 'Küche', 'daily', 0, 8, false],
  ['k-flaechen', 'Küchentisch & Arbeitsflächen aufräumen & wischen', 'Küche', 'daily', 0, 10, false],
  ['k-muell-sort', 'Müll sortieren (Bio, Plastik, Restmüll)', 'Küche', 'daily', 0, 5, true],
  ['k-muell-raus', 'Müll rausbringen', 'Küche', 'daily', 0, 5, true],
  ['k-boden', 'Küchenboden saugen & wischen', 'Küche', 'weekdays', 0, 12, false],
  ['k-kuehl', 'Kühlschränke sortieren & auswischen', 'Küche', 'weekly', 6, 20, false],
  ['gb-becken', 'Waschbecken putzen', 'Gästebad', 'weekdays', 0, 5, false],
  ['gb-wc', 'Toilette putzen', 'Gästebad', 'weekdays', 0, 7, false],
  ['gb-eimer', 'Mülleimer leeren & neuen Beutel rein', 'Gästebad', 'weekdays', 0, 2, true],
  ['gb-auff', 'Klopapier & Handtücher auffüllen, Seife & Deko richten', 'Gästebad', 'daily', 0, 3, true],
  ['gb-fliesen', 'Fliesen & Boden wischen', 'Gästebad', 'weekdays', 0, 8, false],
  ['gb-dusche', 'Dusche putzen & Abfluss reinigen', 'Gästebad', 'weekly', 6, 15, false],
  ['spinnweben', 'Spinnweben im ganzen Haus wegmachen', 'Ganzes Haus', 'monthly', 7, 20, false],
  ['fenster', 'Fenster putzen – such dir EINEN Raum aus 🪟', 'Ganzes Haus', 'monthly', 1, 20, false, true],
  ['zimmer', 'Eigenes Zimmer aufräumen', 'Eigenes Zimmer', 'weekend', 0, 30, true, true],
].map(([id, title, room, freq, day, minutes, leicht, per_person]) => ({ id, title, room, freq, day, minutes, leicht: !!leicht, per_person: !!per_person, active: true }));

const SEED_MEMBERS = [
  ['Dorina', '👑', true, false, 1, 1, 1],
  ['Mia', '🌸', false, false, 1, 1, 2],
  ['Felix', '💪', false, false, 0.25, 1.6, 6],
  ['Iris', '🍳', false, false, 1, 1, 3],
  ['Lily', '🦄', false, true, 0.6, 0.6, 4],
  ['Alex', '🦖', false, true, 0.6, 0.6, 5],
].map(([name, emoji, is_admin, klein, w_weekday, w_weekend, waschtag], i) => ({ id: uid(), name, emoji, is_admin, klein, w_weekday, w_weekend, waschtag, active: true, pin_hash: null, sort: i }));

const DEFAULT_SETTINGS = { min_minutes: 2, koch_regel: true, foto_tage: 21, tagesziel: 6 };
const DEFAULT_RAIN = '🎉✨⭐🧽💪🌈';

// Virtuelle Aufgaben (nicht in der Aufgabenliste editierbar)
const WASCH = { id: 'wasch', title: 'Waschtag: Wäschekorb runterbringen 🧺 (und abends Saubere wieder mitnehmen!)', room: 'Wäsche', freq: 'daily', minutes: 5, leicht: true, per_person: true, active: true, virtual: true };

// ---------- Speicher: Demo (lokal) ----------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('putzplan-demo', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const DemoStore = {
  name: 'demo',
  async init() {},
  _t(t) { return LS.get('pp_demo_' + t, []); },
  _s(t, v) { LS.set('pp_demo_' + t, v); },
  async load() {
    return { members: this._t('members'), tasks: this._t('tasks'), completions: this._t('completions'), settings: LS.get('pp_demo_settings', null) };
  },
  async upsert(table, row) {
    const all = this._t(table); const i = all.findIndex(x => x.id === row.id);
    if (i >= 0) all[i] = { ...all[i], ...row }; else all.push(row);
    this._s(table, all);
  },
  async upsertMany(table, rows) { for (const r of rows) await this.upsert(table, r); },
  async patch(table, id, p) { return this.upsert(table, { id, ...p }); },
  async remove(table, id) { this._s(table, this._t(table).filter(x => x.id !== id)); },
  async insertCompletion(row) {
    const all = this._t('completions');
    if (row.task_id !== 'adhoc' && all.some(c => c.task_id === row.task_id && c.period === row.period && c.slot === row.slot && c.status !== 'rejected')) throw { code: 'conflict' };
    all.push(row); this._s('completions', all);
  },
  async saveSettings(s) { LS.set('pp_demo_settings', s); },
  async putPhoto(id, data) { const db = await idb(); return new Promise((res, rej) => { const tx = db.transaction('photos', 'readwrite'); tx.objectStore('photos').put(data, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
  async getPhoto(id) { const db = await idb(); return new Promise(res => { const r = db.transaction('photos').objectStore('photos').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); },
  async delPhoto(id) { const db = await idb(); db.transaction('photos', 'readwrite').objectStore('photos').delete(id); },
};

// ---------- Speicher: Supabase (ganze Familie) ----------
const CloudStore = {
  name: 'cloud', sb: null,
  async init(conf) {
    await loadScript('vendor/supabase.js');
    const { createClient } = window.supabase;
    this.sb = createClient(conf.u, conf.k, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-familie': conf.f } } });
  },
  _e(r) { if (r.error) { console.error(r.error); throw r.error; } return r.data; },
  async load() {
    const since = new Date(Date.now() - 40 * 864e5).toISOString();
    const [m, t, c, s] = await Promise.all([
      this.sb.from('members').select('*'),
      this.sb.from('tasks').select('*'),
      this.sb.from('completions').select('*').gte('created_at', since).order('created_at', { ascending: false }).limit(3000),
      this.sb.from('settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    return { members: this._e(m), tasks: this._e(t), completions: this._e(c), settings: this._e(s)?.data || null };
  },
  async upsert(table, row) { this._e(await this.sb.from(table).upsert(row)); },
  async upsertMany(table, rows) { this._e(await this.sb.from(table).upsert(rows)); },
  async patch(table, id, p) { this._e(await this.sb.from(table).update(p).eq('id', id)); },
  async remove(table, id) { this._e(await this.sb.from(table).delete().eq('id', id)); },
  async insertCompletion(row) {
    const r = await this.sb.from('completions').insert(row);
    if (r.error) { if (r.error.code === '23505') throw { code: 'conflict' }; throw r.error; }
  },
  async saveSettings(s) { this._e(await this.sb.from('settings').upsert({ id: 1, data: s })); },
  async putPhoto(id, data) { this._e(await this.sb.from('photos').insert({ id, data })); },
  async getPhoto(id) { const r = await this.sb.from('photos').select('data').eq('id', id).maybeSingle(); return r.data?.data || null; },
  async delPhoto(id) { await this.sb.from('photos').delete().eq('id', id); },
};

// ---------- Zustand ----------
const S = {
  conf: LS.get('pp_conf', null), // {mode:'demo'} | {mode:'cloud',u,k,f}
  me: LS.get('pp_me', null),
  store: null, members: [], tasks: [], completions: [], settings: { ...DEFAULT_SETTINGS },
  tab: 'heute', loaded: false,
};
const meM = () => S.members.find(m => m.id === S.me);
const member = id => S.members.find(m => m.id === id);
const mName = id => member(id)?.name || 'Jemand';
const taskById = id => (id === 'wasch' ? WASCH : S.tasks.find(t => t.id === id));
const weight = (m, d) => +(isoDay(d) >= 6 ? m.w_weekend : m.w_weekday) || 0;

async function reload() {
  const data = await S.store.load();
  S.members = (data.members || []).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.name.localeCompare(b.name));
  S.tasks = data.tasks || [];
  S.completions = data.completions || [];
  S.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  S.loaded = true;
}

// ---------- Planungslogik ----------
function periodOf(t, d) {
  if (t.id === 'adhoc') return dKey(d);
  switch (t.freq) { case 'weekly': case 'weekend': return weekKey(d); case 'monthly': return mKey(d); default: return dKey(d); }
}
function activeOn(t, d) {
  const wd = isoDay(d);
  if (t.freq === 'weekdays') return wd <= 5;
  if (t.freq === 'weekend') return wd >= 6;
  return true;
}
function dueOn(t, d) {
  const wd = isoDay(d);
  switch (t.freq) {
    case 'daily': return true;
    case 'weekdays': return wd <= 5;
    case 'weekend': return wd >= 6;
    case 'weekly': return wd === (+t.day || 1);
    case 'monthly': return d.getDate() === Math.min(+t.day || 1, 28);
  }
  return false;
}
function overdueInPeriod(t, d) {
  if (t.freq === 'weekly') return isoDay(d) > (+t.day || 1);
  if (t.freq === 'monthly') return d.getDate() > Math.min(+t.day || 1, 28);
  return false;
}
const slotOf = (t, memberId) => (t.per_person ? memberId : '');
function compFor(t, d, memberId) {
  const p = periodOf(t, d), slot = slotOf(t, memberId);
  return S.completions.find(c => c.task_id === t.id && c.period === p && (c.slot || '') === slot && c.status !== 'rejected');
}
function personalTasksFor(m, d) {
  const out = [];
  for (const t of S.tasks) {
    if (!t.active || !t.per_person || !activeOn(t, d)) continue;
    if (m.klein && !t.leicht) continue;
    out.push(t);
  }
  if (+m.waschtag === isoDay(d)) out.unshift(WASCH);
  return out;
}
const helpersOf = c => { try { const a = JSON.parse(c.helpers || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const involved = (c, id) => c.member_id === id || helpersOf(c).includes(id);
// Punkte einer Aufgabe werden fair geteilt (aufgerundet)
function shares(c) {
  const ids = [c.member_id, ...helpersOf(c).filter(x => x !== c.member_id)];
  const p = +c.points || 0;
  if (ids.length === 1 || p < 0) return { [c.member_id]: p };
  const each = Math.ceil(p / ids.length);
  return Object.fromEntries(ids.map(i => [i, each]));
}
function weekPoints(d = new Date()) {
  const wk = weekKey(d), pts = {}, cnt = {}, warn = {}, bonus = {};
  for (const m of S.members) { pts[m.id] = 0; cnt[m.id] = 0; warn[m.id] = 0; bonus[m.id] = 0; }
  for (const c of S.completions) {
    if (c.status !== 'done' || !c.after_at) continue;
    if (weekKey(new Date(c.after_at)) !== wk) continue;
    const bag = c.task_id === 'warn' ? warn : c.task_id === 'bonus' ? bonus : cnt;
    for (const [id, p] of Object.entries(shares(c))) { pts[id] = (pts[id] || 0) + p; bag[id] = (bag[id] || 0) + 1; }
  }
  return { pts, cnt, warn, bonus };
}

// ---------- Kamera (nur live, keine Galerie) ----------
function openCamera(label, kind) {
  return new Promise(async (resolve) => {
    let stream = null, facing = 'environment';
    const video = h('video', { autoplay: true, playsinline: true, muted: true });
    video.muted = true; video.setAttribute('playsinline', '');
    const ov = h('div', { class: 'overlay' },
      h('div', { class: 'cap' }, h('span', { class: 'tag' + (kind === 'after' ? ' after' : '') }, kind === 'after' ? 'NACHHER-Foto' : 'VORHER-Foto'), h('br'), label));
    const stage = h('div', { style: 'flex:1;display:flex;min-height:0' }, video);
    const ctl = h('div', { class: 'ctl' });
    ov.append(stage, ctl);
    document.body.append(ov);
    const close = (val) => { stream?.getTracks().forEach(t => t.stop()); ov.remove(); resolve(val); };
    async function start() {
      stream?.getTracks().forEach(t => t.stop());
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        video.srcObject = stream; await video.play().catch(() => {});
      } catch (e) {
        stage.replaceChildren(h('div', { style: 'color:#fff;padding:24px;text-align:center;margin:auto' },
          h('div', { class: 'big-emoji' }, '📷🙈'),
          h('p', {}, 'Ich komme nicht an die Kamera.'),
          h('p', { class: 'small' }, 'Bitte erlaube den Kamera-Zugriff für diese App (in den Browser- bzw. Handy-Einstellungen) und versuch es nochmal. Fotos aus der Galerie gehen absichtlich nicht 😉')));
        ctl.replaceChildren(h('button', { class: 'btn sec', onclick: () => close(null) }, 'Zurück'));
      }
    }
    function live() {
      stage.replaceChildren(video);
      ctl.replaceChildren(
        h('button', { class: 'btn sec', onclick: () => close(null) }, 'Abbrechen'),
        h('button', { class: 'shutter', 'aria-label': 'Foto machen', onclick: snap }),
        h('button', { class: 'btn sec', onclick: () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); } }, '🔄'));
    }
    function snap() {
      if (!video.videoWidth) return toast('Kamera lädt noch… 😅');
      const max = 900, sc = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * sc), hh = Math.round(video.videoHeight * sc);
      const cv = h('canvas', { width: w, height: hh }); const g = cv.getContext('2d');
      g.drawImage(video, 0, 0, w, hh);
      const stamp = `${meM()?.name || ''} · ${kind === 'after' ? 'NACHHER' : 'VORHER'} · ${fmtTime(new Date().toISOString())}`;
      const fs = Math.max(14, Math.round(w / 32));
      g.font = `bold ${fs}px system-ui,sans-serif`;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, hh - fs * 1.8, w, fs * 1.8);
      g.fillStyle = '#fff'; g.fillText(stamp, fs * 0.6, hh - fs * 0.6);
      const data = cv.toDataURL('image/jpeg', 0.62);
      stage.replaceChildren(h('img', { class: 'prev', src: data }));
      ctl.replaceChildren(
        h('button', { class: 'btn sec', onclick: live }, '↩️ Nochmal'),
        h('button', { class: 'btn ok', onclick: () => close(data) }, '✅ Passt'));
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      stage.replaceChildren(h('p', { style: 'color:#fff;padding:24px;margin:auto;text-align:center' }, 'Dieses Handy/Browser kann keine Kamera in Apps öffnen 😕 Bitte die App im normalen Browser (Chrome/Safari) öffnen.'));
      ctl.replaceChildren(h('button', { class: 'btn sec', onclick: () => close(null) }, 'Zurück'));
      return;
    }
    live(); start();
  });
}

// ---------- Aktionen ----------
function teamPicker(title) {
  return new Promise(resolve => {
    const me = meM(), picked = new Set();
    const chips = h('div', { class: 'grid', style: 'grid-template-columns:repeat(3,1fr)' });
    const draw = () => chips.replaceChildren(...S.members.filter(m => m.active && m.id !== me.id).map(m => h('button', { class: 'who', style: `padding:10px 4px;${picked.has(m.id) ? 'border-color:var(--brand);background:var(--soft)' : ''}`, onclick: () => { picked.has(m.id) ? picked.delete(m.id) : picked.add(m.id); draw(); } }, h('span', { class: 'e', style: 'font-size:30px' }, m.emoji), m.name, picked.has(m.id) ? ' ✓' : '')));
    draw();
    let done = false;
    const s = sheet(h('div', { class: 'big-emoji' }, '🤝'), h('h2', { style: 'justify-content:center;text-align:center' }, title),
      h('p', { class: 'center muted small' }, 'Machst du das alleine oder mit jemandem zusammen? (Die Punkte werden fair geteilt)'), chips,
      h('div', { class: 'actions' }, h('button', { class: 'btn big', onclick: () => { done = true; s.remove(); resolve([...picked]); } }, '📸 Los – Vorher-Foto')));
    new MutationObserver((_, o) => { if (!s.isConnected) { o.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
  });
}
async function joinTask(c) {
  const hs = helpersOf(c); if (hs.includes(S.me) || c.member_id === S.me) return;
  try { await S.store.patch('completions', c.id, { helpers: JSON.stringify([...hs, S.me]) }); rain('🤝💪✨'); toast(`Du hilfst ${mName(c.member_id)} mit! 🤝`); }
  catch (e) { toast('Hat nicht geklappt: ' + (e.message || e)); }
  await refresh();
}
async function startTask(t, d) {
  const m = meM();
  const team = await teamPicker(t.title);
  if (team === null) return;
  const img = await openCamera(t.title, 'before');
  if (!img) return;
  const id = uid(), photo = id + '-v';
  try {
    await S.store.putPhoto(photo, img);
    await S.store.insertCompletion({
      id, task_id: t.id, title: t.title, member_id: m.id, period: periodOf(t, d), slot: slotOf(t, m.id),
      status: 'started', before_photo: photo, before_at: new Date().toISOString(), created_at: new Date().toISOString(),
      ...(team.length ? { helpers: JSON.stringify(team) } : {}),
    });
    toast(team.length ? `Vorher-Foto ist drin 📸 Los geht's im Team mit ${team.map(mName).join(' & ')}! 🤝` : 'Vorher-Foto ist drin 📸 Jetzt loslegen! 💪');
  } catch (e) {
    S.store.delPhoto(photo).catch(() => {});
    if (e?.code === 'conflict') toast('Oha, da war jemand schneller 😅');
    else toast('Hat nicht geklappt: ' + (e.message || e));
  }
  await refresh();
}
async function finishTask(c) {
  const m = meM();
  if (c.member_id !== m.id) return toast('Nur wer das Vorher-Foto gemacht hat, darf abhaken 😉');
  const minMs = (+S.settings.min_minutes || 0) * 60000;
  const waited = Date.now() - new Date(c.before_at).getTime();
  if (waited < minMs) return toast(`So schnell? 😄 Noch ${Math.ceil((minMs - waited) / 60000)} Min. – erst putzen, dann Foto!`);
  const img = await openCamera(c.title, 'after');
  if (!img) return;
  const photo = c.id + '-n';
  const t = taskById(c.task_id);
  try {
    await S.store.putPhoto(photo, img);
    await S.store.patch('completions', c.id, { status: 'done', after_photo: photo, after_at: new Date().toISOString(), points: c.task_id === 'adhoc' ? (+c.points || 2) : ptsFor(t?.minutes) });
    rain(m.rain || DEFAULT_RAIN);
    toast(['Mega! ✨', 'Stark gemacht! 💪', 'Sauber! 🧼', 'Du rockst! 🎸', 'Haken dran! ✅'][Math.floor(Math.random() * 5)] + ` +${c.task_id === 'adhoc' ? (+c.points || 2) : ptsFor(t?.minutes)} Punkte`);
  } catch (e) { toast('Hat nicht geklappt: ' + (e.message || e)); }
  await refresh();
}
async function cancelTask(c) {
  if (!confirm('Abbrechen? Das Vorher-Foto wird gelöscht.')) return;
  await S.store.patch('completions', c.id, { status: 'rejected', note: 'abgebrochen' });
  S.store.delPhoto(c.before_photo).catch(() => {});
  await refresh();
}
async function addAdhoc(title, forId, points) {
  const now = new Date();
  await S.store.insertCompletion({ id: uid(), task_id: 'adhoc', title, member_id: forId, period: dKey(now), slot: forId, status: 'todo', points, created_at: now.toISOString(), created_by: S.me });
  await refresh();
}
async function startAdhoc(c) {
  if (c.member_id !== S.me) return toast('Das ist nicht deine Aufgabe 😉');
  const img = await openCamera(c.title, 'before');
  if (!img) return;
  const photo = c.id + '-v';
  try {
    await S.store.putPhoto(photo, img);
    await S.store.patch('completions', c.id, { status: 'started', before_photo: photo, before_at: new Date().toISOString() });
  } catch (e) { toast('Hat nicht geklappt: ' + (e.message || e)); }
  await refresh();
}

// ---------- Ansichten ----------
function render() {
  const app = $('#app');
  app.replaceChildren(); delete app.dataset.pin;
  document.querySelector('nav.tabs')?.remove();
  if (!S.conf) return app.append(viewWelcome());
  if (!S.loaded) return app.append(h('p', { class: 'center muted', style: 'margin-top:40vh' }, 'Lädt… 🧽'));
  if (!meM()) return app.append(viewWho());
  const me = meM();
  const views = { heute: viewToday, punkte: viewPoints, verlauf: viewHistory, mehr: viewMore };
  app.append(h('header', { class: 'top' },
    h('h1', {}, { heute: 'Heute 🧹', punkte: 'Punkte 🏆', verlauf: 'Wer hat was gemacht 👀', mehr: 'Mehr ⚙️' }[S.tab]),
    h('span', { class: 'pill' }, me.emoji, ' ', me.name),
    S.conf.mode === 'demo' ? h('span', { class: 'pill', title: 'Nur auf diesem Handy' }, 'Demo') : null));
  app.append(views[S.tab]());
  const tab = (k, e, l) => h('button', { class: S.tab === k ? 'on' : '', onclick: () => { S.tab = k; render(); scrollTo(0, 0); } }, h('b', {}, e), l);
  document.body.append(h('nav', { class: 'tabs' }, tab('heute', '🧹', 'Heute'), tab('punkte', '🏆', 'Punkte'), tab('verlauf', '📸', 'Verlauf'), tab('mehr', '⚙️', 'Mehr')));
}

function taskCard(t, d, opts = {}) {
  const me = meM();
  const c = opts.comp !== undefined ? opts.comp : compFor(t, d, me.id);
  const isAdhoc = t.id === 'adhoc';
  const ownerId = opts.owner;
  const meta = [];
  if (!isAdhoc) meta.push(`${roomIcon(t.room)} ${t.room}`, `~${t.minutes} Min`, `+${ptsFor(t.minutes)} P`);
  else meta.push(`+${c?.points || 2} P`);
  if (ownerId && ownerId !== me.id && !c) meta.push(`für ${mName(ownerId)}`);
  if (c && helpersOf(c).length) meta.push(`🤝 ${[c.member_id, ...helpersOf(c)].map(i => member(i)?.emoji || '').join('')} im Team`);
  const card = h('div', { class: 'card task-card' });
  const done = c?.status === 'done';
  card.append(h('div', { class: 'task' + (done ? ' done' : '') },
    h('div', { class: 'ico' }, done ? '✅' : (isAdhoc ? '✨' : roomIcon(t.room))),
    h('div', { class: 'body' }, h('div', { class: 'title' }, isAdhoc ? c.title : t.title), h('div', { class: 'meta' }, meta.join(' · ')))));
  const act = h('div', { class: 'actions' });
  if (!c || (isAdhoc && c.status === 'todo')) {
    if (isAdhoc) act.append(h('button', { class: 'btn', onclick: () => startAdhoc(c) }, '📸 Start: Vorher-Foto'));
    else act.append(h('button', { class: 'btn' + (ownerId && ownerId !== me.id ? ' sec' : ''), onclick: () => startTask(t, d) }, ownerId && ownerId !== me.id ? '🙋 Übernehmen' : '📸 Start: Vorher-Foto'));
  } else if (c.status === 'started') {
    if (c.member_id === me.id) {
      const mins = Math.floor((Date.now() - new Date(c.before_at)) / 60000);
      act.append(h('button', { class: 'btn ok', onclick: () => finishTask(c) }, '📸 Fertig: Nachher-Foto'),
        h('button', { class: 'btn ghost', onclick: () => cancelTask(c) }, 'Abbrechen'),
        h('span', { class: 'small muted', style: 'align-self:center' }, `läuft seit ${mins} Min`));
    } else {
      act.append(h('span', { class: 'small muted', style: 'align-self:center' }, `⏳ ${mName(c.member_id)} ist dran (macht die Fotos)`));
      if (!helpersOf(c).includes(me.id)) act.append(h('button', { class: 'btn sec', onclick: () => joinTask(c) }, '🤝 Mithelfen'));
    }
  } else if (done) {
    act.append(h('span', { class: 'small muted' }, `Erledigt von ${mName(c.member_id)} · ${fmtTime(c.after_at)}`));
  }
  if (act.childNodes.length) card.append(act);
  return card;
}

function dayPoints(memberId, d = new Date()) {
  const k = dKey(d);
  return S.completions.filter(c => involved(c, memberId) && c.status === 'done' && c.after_at && dKey(new Date(c.after_at)) === k && c.task_id !== 'bonus' && c.task_id !== 'warn')
    .reduce((s, c) => s + (shares(c)[memberId] || 0), 0);
}
const dayGoal = (m, d) => Math.round(weight(m, d) * (+S.settings.tagesziel || 6));

function viewToday() {
  const d = new Date(), me = meM(), wrap = h('div');
  const { pts } = weekPoints(d);
  const personal = personalTasksFor(me, d);
  const adhoc = S.completions.filter(c => c.task_id === 'adhoc' && c.member_id === me.id && (c.status === 'todo' || c.status === 'started' || (c.status === 'done' && c.period === dKey(d))));
  // Alles Gemeinsame, was heute fällig oder liegengeblieben ist
  const shared = S.tasks.filter(t => t.active && !t.per_person && activeOn(t, d) && (dueOn(t, d) || overdueInPeriod(t, d)));
  const mineShared = shared.filter(t => { const c = compFor(t, d, null); return c && involved(c, me.id); });
  const open = shared.filter(t => !compFor(t, d, null) && (!me.klein || t.leicht));
  const goal = dayGoal(me, d), got = dayPoints(me.id, d);

  const greet = isoDay(d) >= 6 ? 'Schönes Wochenende' : ['Guten Morgen', 'Hallo', 'Na'][Math.min(2, Math.floor(d.getHours() / 8))];
  wrap.append(h('div', { class: 'banner' }, `${greet}, ${me.name}! ${me.emoji}`,
    h('div', { style: 'font-weight:500;margin:6px 0' }, goal ? (got >= goal ? `Tagesziel geschafft! 🎉 ${got}/${goal} Punkte` : `Dein Tagesziel: ${got}/${goal} Punkte – such dir unten was aus 👇`) : `Heute hast du frei 😎 (${got} Punkte)`),
    goal ? h('div', { class: 'bar', style: 'background:rgba(255,255,255,.3)' }, h('i', { style: `background:#fff;width:${Math.min(100, Math.round(100 * got / goal))}%` })) : null,
    h('div', { style: 'font-weight:500;font-size:13px;margin-top:6px' }, `Diese Woche: ${pts[me.id] || 0} Punkte ⭐`)));
  if (+me.waschtag === isoDay(d)) wrap.append(h('div', { class: 'banner wash' }, '🧺 Heute ist DEIN Waschtag! Korb runterbringen, sonst musst du selbst schauen wie du klarkommst 😜'));
  if (+me.waschtag === isoDay(new Date(d.getTime() + 864e5))) wrap.append(h('div', { class: 'card small' }, '🧺 Morgen ist dein Waschtag – denk an deinen Wäschekorb!'));

  const myCards = [...personal.filter(t => t.freq !== 'monthly').map(t => taskCard(t, d)),
    ...adhoc.map(c => taskCard({ id: 'adhoc' }, d, { comp: c })),
    ...mineShared.map(t => taskCard(t, d, { comp: compFor(t, d, null) }))];
  myCards.sort((a, b) => (a.querySelector('.task.done') ? 1 : 0) - (b.querySelector('.task.done') ? 1 : 0));
  if (myCards.length) { wrap.append(h('h2', {}, 'Meins heute', h('small', {}, DAYS[isoDay(d)]))); wrap.append(...myCards); }

  wrap.append(h('h2', {}, 'Such dir was aus 🙋', h('small', {}, `${open.length} offen`)));
  if (!open.length) wrap.append(h('p', { class: 'muted' }, 'Alles erledigt! Die Bude glänzt ✨🏆'));
  const rooms = [...new Set(open.map(t => t.room))];
  for (const r of rooms) {
    const ts = open.filter(t => t.room === r).sort((a, b) => (overdueInPeriod(b, d) ? 1 : 0) - (overdueInPeriod(a, d) ? 1 : 0));
    const det = h('details', { class: 'card', open: rooms.length <= 3 ? true : null }, h('summary', {}, `${roomIcon(r)} ${r} `, h('span', { class: 'pill' }, ts.length)));
    for (const t of ts) det.append(h('div', { class: 'list-item' },
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, t.title),
        h('div', { class: 'small muted' }, `~${t.minutes} Min · +${ptsFor(t.minutes)} P`, overdueInPeriod(t, d) ? ' · ⏰ liegengeblieben' : '', t.freq === 'weekly' ? ' · 1x/Woche' : t.freq === 'monthly' ? ' · 1x/Monat' : '')),
      h('button', { class: 'btn', style: 'min-height:40px;padding:8px 12px', onclick: () => startTask(t, d) }, '📸 Mach ich')));
    wrap.append(det);
  }

  const running = S.completions.filter(c => c.status === 'started' && c.member_id !== me.id && !helpersOf(c).includes(me.id) && c.task_id !== 'adhoc');
  if (running.length) {
    wrap.append(h('h2', {}, 'Läuft gerade 🏃', h('small', {}, 'hilf mit, teilt euch die Punkte')));
    for (const c of running) wrap.append(h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { style: 'font-size:24px' }, member(c.member_id)?.emoji || '🙂'),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, c.title), h('div', { class: 'small muted' }, `${mName(c.member_id)}${helpersOf(c).length ? ' + ' + helpersOf(c).map(mName).join(', ') : ''}`)),
      h('button', { class: 'btn sec', onclick: () => joinTask(c) }, '🤝 Mithelfen'))));
  }
  // Wochen-/Monatsaufgaben schon vorzeitig erledigen
  const early = S.tasks.filter(t => t.active && !t.per_person && (t.freq === 'weekly' || t.freq === 'monthly') && !dueOn(t, d) && !overdueInPeriod(t, d) && !compFor(t, d, null) && (!me.klein || t.leicht));
  if (early.length) {
    const det = h('details', { class: 'card' }, h('summary', {}, `⏩ Schon vorziehen? `, h('span', { class: 'pill' }, early.length), h('div', { class: 'small muted', style: 'font-weight:500' }, 'Wochen- & Monatsaufgaben, die erst später dran sind')));
    for (const t of early) det.append(h('div', { class: 'list-item' },
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, `${roomIcon(t.room)} ${t.title}`), h('div', { class: 'small muted' }, `${t.freq === 'weekly' ? 'eigentlich ' + DAYS[t.day || 1] : 'eigentlich ab dem ' + (t.day || 1) + '.'} · +${ptsFor(t.minutes)} P`)),
      h('button', { class: 'btn', style: 'min-height:40px;padding:8px 12px', onclick: () => startTask(t, d) }, '📸 Jetzt')));
    wrap.append(det);
  }

  const monthly = personal.filter(t => t.freq === 'monthly');
  if (monthly.length) { wrap.append(h('h2', {}, 'Diesen Monat', h('small', {}, 'bis Monatsende'))); monthly.forEach(t => wrap.append(taskCard(t, d))); }

  wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, 'Schnell-Knöpfe ⚡'),
    h('div', { class: 'actions' },
      S.settings.koch_regel ? h('button', { class: 'btn sec', onclick: () => kochDialog() }, '🍳 Es wurde gekocht') : null,
      h('button', { class: 'btn sec', onclick: () => extraDialog() }, '✨ Dreck gesehen – mach ich weg'))));

  // Wer hat heute schon was gemacht?
  const doneToday = S.completions.filter(c => c.status === 'done' && c.after_at && dKey(new Date(c.after_at)) === dKey(d) && c.task_id !== 'bonus' && c.task_id !== 'warn');
  wrap.append(h('h2', {}, 'Heute geschafft 💪', h('small', {}, `${doneToday.length} Aufgaben`)));
  const fam = h('div', { class: 'card' });
  for (const m of S.members.filter(m => m.active)) {
    const n = doneToday.filter(c => involved(c, m.id)).length, g = dayGoal(m, d), p = dayPoints(m.id, d);
    fam.append(h('div', { class: 'list-item' }, h('span', { style: 'font-size:22px' }, m.emoji), h('div', { class: 'grow' },
      h('div', { style: 'font-weight:600' }, m.name, ' ', h('span', { class: 'small muted' }, `${n} erledigt · ${p}${g ? '/' + g : ''} P`)),
      g ? h('div', { class: 'bar', style: 'margin-top:4px' }, h('i', { style: `width:${Math.min(100, Math.round(100 * p / g))}%` })) : null),
      h('span', {}, g && p >= g ? '✅' : p === 0 && g ? '🦥' : '')));
  }
  fam.append(h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => { S.tab = 'verlauf'; render(); scrollTo(0, 0); } }, '📸 Alle Fotos ansehen')));
  wrap.append(fam);
  return wrap;
}

function sheet(...content) {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) m.remove(); } }, h('div', { class: 'sheet' }, ...content));
  document.body.append(m);
  return m;
}
function kochDialog() {
  const me = meM();
  const sel = h('select', {}, S.members.filter(m => m.active).map(m => h('option', { value: m.id, selected: m.id === me.id ? true : null }, `${m.emoji} ${m.name}`)));
  const m = sheet(h('div', { class: 'big-emoji' }, '🍳'), h('h2', { style: 'justify-content:center' }, 'Wer kocht, räumt auf!'),
    h('p', { class: 'muted center' }, 'Wer hat gekocht? Diese Person bekommt die Aufgabe „Töpfe, Pfannen & Herd sauber machen“ – mit Vorher-Nachher-Foto natürlich 😇'),
    h('label', { class: 'f' }, 'Gekocht hat:'), sel,
    h('div', { class: 'actions' }, h('button', { class: 'btn big', onclick: async () => { m.remove(); await addAdhoc('Gekocht? Töpfe, Pfannen & Herd sauber machen und wegräumen 🍳', sel.value, 3); toast(sel.value === me.id ? 'Steht auf deiner Liste 👍' : `${mName(sel.value)} hat's jetzt auf der Liste 😏`); } }, 'Aufgabe eintragen')));
}
function extraDialog() {
  const inp = h('input', { type: 'text', placeholder: 'z.B. Fleck an der Küchentür wischen' });
  const m = sheet(h('div', { class: 'big-emoji' }, '✨'), h('h2', { style: 'justify-content:center' }, 'Extra-Aufgabe'),
    h('p', { class: 'muted center' }, 'Irgendwo Dreck gesehen? Mach Vorher- und Nachher-Foto und kassier 2 Extra-Punkte!'),
    inp, h('div', { class: 'actions' }, h('button', { class: 'btn big', onclick: async () => {
      const t = inp.value.trim(); if (!t) return inp.focus();
      m.remove(); await addAdhoc(t, S.me, 2);
    } }, 'Los geht\'s')));
  setTimeout(() => inp.focus(), 50);
}

function viewPoints() {
  const wrap = h('div'), d = new Date(), me = meM();
  const { pts, cnt, warn, bonus } = weekPoints(d);
  const ms = S.members.filter(m => m.active).sort((a, b) => (pts[b.id] || 0) - (pts[a.id] || 0));
  const max = Math.max(1, ...ms.map(m => pts[m.id] || 0));
  const medal = ['🥇', '🥈', '🥉'];
  wrap.append(h('p', { class: 'muted' }, `Woche ${weekKey(d).split('-W')[1]} · 1 Punkt ≈ 5 Minuten Putzen`));
  if (me.is_admin) wrap.append(h('div', { class: 'actions', style: 'margin-bottom:6px' },
    h('button', { class: 'btn ok', onclick: () => rewardDialog('bonus') }, '⭐ Belohnung geben'),
    h('button', { class: 'btn bad', onclick: () => rewardDialog('warn') }, '⚠️ Abmahnung')));
  ms.forEach((m, i) => wrap.append(h('div', { class: 'card' },
    h('div', { class: 'row' }, h('span', { style: 'font-size:28px' }, (pts[m.id] || 0) > 0 ? (medal[i] || m.emoji) : m.emoji),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, (pts[m.id] || 0) > 0 && medal[i] ? m.emoji + ' ' : '', m.name, i === 0 && (pts[m.id] || 0) > 0 ? ' 👑' : ''),
        h('div', { class: 'small muted' }, `${cnt[m.id] || 0} Aufgaben`, bonus[m.id] ? ` · ⭐ ${bonus[m.id]} Belohnung${bonus[m.id] > 1 ? 'en' : ''}` : '', warn[m.id] ? ` · ⚠️ ${warn[m.id]} Abmahnung${warn[m.id] > 1 ? 'en' : ''}` : '')),
      h('div', { style: 'font-weight:800;font-size:20px' }, pts[m.id] || 0)),
    h('div', { class: 'bar', style: 'margin-top:8px' }, h('i', { style: `width:${Math.max(0, Math.round(100 * (pts[m.id] || 0) / max))}%` })))));
  const total = ms.reduce((s, m) => s + Math.max(0, pts[m.id] || 0), 0);
  if (total > 0) {
    const wsum = ms.reduce((s, m) => s + (+m.w_weekday * 5 + +m.w_weekend * 2), 0) || 1;
    const fair = h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '⚖️ Fair-O-Meter'), h('p', { class: 'small muted' }, 'Hat jeder seinen Teil gemacht? (gemessen an dem, was er laut Plan schaffen kann)'));
    for (const m of ms) {
      const soll = total * (+m.w_weekday * 5 + +m.w_weekend * 2) / wsum;
      const q = soll ? (pts[m.id] || 0) / soll : 0;
      fair.append(h('div', { class: 'row small', style: 'margin:4px 0' }, h('span', { class: 'grow' }, `${m.emoji} ${m.name}`), h('span', {}, q >= 1.1 ? '🔥 macht mehr als genug' : q >= 0.8 ? '👍 passt' : q >= 0.4 ? '😬 da geht noch was' : '🦥 Faultier-Alarm')));
    }
    wrap.append(fair);
  }
  const rw = S.completions.filter(c => (c.task_id === 'bonus' || c.task_id === 'warn') && c.status === 'done').sort((a, b) => b.after_at.localeCompare(a.after_at)).slice(0, 20);
  if (rw.length) {
    wrap.append(h('h2', {}, 'Belohnungen & Abmahnungen'));
    const c2 = h('div', { class: 'card' });
    for (const c of rw) c2.append(h('div', { class: 'list-item' }, h('span', { style: 'font-size:22px' }, c.task_id === 'bonus' ? '⭐' : '⚠️'),
      h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, `${member(c.member_id)?.emoji || ''} ${mName(c.member_id)}: ${c.title}`), h('div', { class: 'small muted' }, `${fmtTime(c.after_at)} · ${c.points > 0 ? '+' : ''}${c.points} P`)),
      me.is_admin ? h('button', { class: 'btn ghost', style: 'min-height:34px;padding:4px 10px', onclick: async () => { if (!confirm('Zurücknehmen?')) return; await S.store.patch('completions', c.id, { status: 'rejected' }); await refresh(); } }, '↩️') : null));
    wrap.append(c2);
  }
  return wrap;
}
function rewardDialog(kind) {
  const isB = kind === 'bonus';
  const sel = h('select', {}, S.members.filter(m => m.active).map(m => h('option', { value: m.id }, `${m.emoji} ${m.name}`)));
  const pts = h('input', { type: 'number', min: 1, max: 50, value: isB ? 5 : 3 });
  const why = h('input', { type: 'text', placeholder: isB ? 'z.B. Ohne Meckern die Küche gerettet 🦸' : 'z.B. Töpfe wieder stehen gelassen 🙄' });
  const s = sheet(h('div', { class: 'big-emoji' }, isB ? '⭐' : '⚠️'), h('h2', { style: 'justify-content:center' }, isB ? 'Belohnung geben' : 'Abmahnung'),
    h('label', { class: 'f' }, 'Für wen?'), sel, h('label', { class: 'f' }, 'Warum?'), why,
    h('label', { class: 'f' }, isB ? 'Wie viele Extra-Punkte?' : 'Wie viele Punkte Abzug?'), pts,
    h('div', { class: 'actions' }, h('button', { class: 'btn big ' + (isB ? 'ok' : 'bad'), onclick: async () => {
      if (!why.value.trim()) return why.focus();
      const now = new Date().toISOString(), p = Math.abs(+pts.value || 1) * (isB ? 1 : -1);
      const id = uid();
      await S.store.insertCompletion({ id, task_id: kind, title: why.value.trim(), member_id: sel.value, period: dKey(new Date()), slot: id, status: 'done', points: p, after_at: now, created_at: now, created_by: S.me });
      s.remove(); rain(isB ? '⭐🌟🏆💖' : '⚠️🙈😤🧽'); toast(isB ? `${mName(sel.value)} bekommt +${p} Punkte ⭐` : `Abmahnung an ${mName(sel.value)} ⚠️ (${p} P)`); await refresh();
    } }, isB ? 'Belohnen ⭐' : 'Abmahnen ⚠️')));
}

function photoImg(id, alt) {
  const img = h('img', { alt: alt || '', loading: 'lazy' });
  if (id) S.store.getPhoto(id).then(src => { if (src) { img.src = src; img.onclick = () => sheet(h('img', { class: 'zoom', src })); } else img.alt = 'Foto gelöscht'; });
  return img;
}
function viewHistory() {
  const me = meM(), wrap = h('div');
  const filter = S.histFilter || 'alle';
  wrap.append(h('select', { onchange: e => { S.histFilter = e.target.value; render(); } },
    h('option', { value: 'alle' }, '👨‍👩‍👧‍👦 Alle'), S.members.map(m => h('option', { value: m.id, selected: filter === m.id ? true : null }, `${m.emoji} ${m.name}`))));
  const list = S.completions.filter(c => (c.status === 'done' || c.status === 'started') && (filter === 'alle' || c.member_id === filter))
    .sort((a, b) => (b.after_at || b.before_at || '').localeCompare(a.after_at || a.before_at || '')).slice(0, 60);
  if (!list.length) wrap.append(h('p', { class: 'muted' }, 'Noch nix erledigt. Zeit, das zu ändern! 😄'));
  for (const c of list) {
    const m = member(c.member_id);
    if (c.task_id === 'bonus' || c.task_id === 'warn') {
      wrap.append(h('div', { class: 'card', style: `border-left:5px solid var(--${c.task_id === 'bonus' ? 'ok' : 'bad'})` }, h('div', { class: 'row' }, h('span', { style: 'font-size:24px' }, c.task_id === 'bonus' ? '⭐' : '⚠️'),
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, `${c.task_id === 'bonus' ? 'Belohnung' : 'Abmahnung'} für ${m?.emoji || ''} ${m?.name || '?'}`),
          h('div', { class: 'small muted' }, `${c.title} · ${fmtTime(c.after_at)} · ${c.points > 0 ? '+' : ''}${c.points} P`)))));
      continue;
    }
    const dur = c.after_at ? Math.round((new Date(c.after_at) - new Date(c.before_at)) / 60000) : null;
    const card = h('div', { class: 'card' },
      h('div', { class: 'row' }, h('span', { style: 'font-size:24px' }, m?.emoji || '🙂'),
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:700' }, c.title || taskById(c.task_id)?.title || 'Aufgabe'),
          h('div', { class: 'small muted' }, `${m?.name || '?'}${helpersOf(c).length ? ' 🤝 ' + helpersOf(c).map(mName).join(', ') : ''} · ${c.status === 'done' ? `fertig ${fmtTime(c.after_at)} · ${dur} Min · +${c.points || 0} P` : 'läuft gerade ⏳'}`))),
      h('div', { class: 'thumbs' },
        h('figure', {}, photoImg(c.before_photo, 'vorher'), h('figcaption', {}, 'VORHER')),
        h('figure', {}, c.after_photo ? photoImg(c.after_photo, 'nachher') : h('img', { alt: '' }), h('figcaption', {}, 'NACHHER'))));
    if (me.is_admin && c.status === 'done') card.append(h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: async () => {
      if (!confirm(`Nicht ordentlich? Aufgabe ablehnen – ${m?.name} verliert die Punkte und die Aufgabe ist wieder offen.`)) return;
      await S.store.patch('completions', c.id, { status: 'rejected', note: 'abgelehnt' });
      toast('Abgelehnt 👎 Die Aufgabe ist wieder offen.'); await refresh();
    } }, '👎 Nicht ordentlich – ablehnen')));
    wrap.append(card);
  }
  return wrap;
}

function viewMore() {
  const me = meM(), wrap = h('div');
  if (me.is_admin) {
    wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '📲 Familie einladen'),
      h('p', { class: 'small muted' }, 'Schick diesen Link an alle (WhatsApp o.ä.). Wer ihn öffnet, wählt seinen Namen und legt eine PIN fest.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: inviteDialog }, 'Einladungslink & QR-Code'))));
    wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '👨‍👩‍👧‍👦 Familie'),
      ...S.members.map(m => h('div', { class: 'list-item' }, h('span', { style: 'font-size:24px' }, m.emoji),
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, m.name, m.is_admin ? ' (Admin)' : '', m.active ? '' : ' – pausiert'),
          h('div', { class: 'small muted' }, `${m.klein ? 'nur leichte Aufgaben · ' : ''}Waschtag ${m.waschtag ? DAYS[m.waschtag] : '–'} · Mo–Fr ${m.w_weekday}x · WE ${m.w_weekend}x`)),
        h('button', { class: 'btn sec', onclick: () => memberDialog(m) }, 'Ändern'))),
      h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => memberDialog(null) }, '➕ Person hinzufügen'))));
    const rooms = [...new Set(S.tasks.map(t => t.room))];
    const tc = h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, `🧽 Aufgaben (${S.tasks.length})`));
    for (const r of rooms) {
      const det = h('details', {}, h('summary', {}, `${roomIcon(r)} ${r}`));
      for (const t of S.tasks.filter(t => t.room === r)) det.append(h('div', { class: 'list-item' },
        h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' + (t.active ? '' : ';opacity:.5') }, t.title),
          h('div', { class: 'small muted' }, `${FREQ[t.freq]}${t.freq === 'weekly' ? ' (' + DAYS[t.day || 1] + ')' : ''}${t.freq === 'monthly' ? ' (ab dem ' + (t.day || 1) + '.)' : ''} · ${t.minutes} Min${t.leicht ? ' · auch für Kleine' : ''}${t.per_person ? ' · jeder für sich' : ''}`)),
        h('button', { class: 'btn sec', onclick: () => taskDialog(t) }, 'Ändern')));
      tc.append(det);
    }
    tc.append(h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => taskDialog(null) }, '➕ Aufgabe hinzufügen')));
    wrap.append(tc);
    const minIn = h('input', { type: 'number', min: 0, max: 60, value: S.settings.min_minutes });
    const koch = h('input', { type: 'checkbox', checked: S.settings.koch_regel });
    const ziel = h('input', { type: 'number', min: 0, max: 50, value: S.settings.tagesziel });
    wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '📏 Regeln'),
      h('label', { class: 'f' }, 'Mindestzeit zwischen Vorher- und Nachher-Foto (Minuten)'), minIn,
      h('label', { class: 'f' }, 'Tagesziel in Punkten für eine „normale“ Person (Felix & Kleine bekommen weniger je nach Einstellung)'), ziel,
      h('label', { class: 'chk' }, koch, '„Wer kocht, räumt die Töpfe weg“-Knopf anzeigen'),
      h('p', { class: 'small muted' }, `Fotos werden nach ${S.settings.foto_tage} Tagen automatisch gelöscht (spart Speicher), der Eintrag bleibt.`),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
        S.settings = { ...S.settings, min_minutes: Math.max(0, +minIn.value || 0), koch_regel: koch.checked, tagesziel: Math.max(0, +ziel.value || 0) };
        await S.store.saveSettings(S.settings); toast('Gespeichert 👍'); render();
      } }, 'Speichern'))));
  }
  if (me.is_admin) {
    const props = S.tasks.filter(t => t.proposed_by);
    if (props.length) wrap.prepend(h('div', { class: 'card', style: 'border:2px solid var(--warn)' }, h('div', { style: 'font-weight:700' }, `💡 Vorschläge (${props.length})`),
      ...props.map(t => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('div', { style: 'font-weight:600' }, `${roomIcon(t.room)} ${t.title}`), h('div', { class: 'small muted' }, `von ${mName(t.proposed_by)} · ${FREQ[t.freq]} · ${t.minutes} Min`)),
        h('button', { class: 'btn ok', style: 'min-height:38px;padding:6px 10px', onclick: async () => { await S.store.patch('tasks', t.id, { active: true, proposed_by: null }); rain('💡✅🎉'); toast('Angenommen! 🎉'); await refresh(); } }, '✅'),
        h('button', { class: 'btn ghost', style: 'min-height:38px;padding:6px 10px', onclick: () => taskDialog(t) }, '✏️'),
        h('button', { class: 'btn ghost', style: 'min-height:38px;padding:6px 10px', onclick: async () => { if (!confirm('Vorschlag ablehnen?')) return; await S.store.remove('tasks', t.id); await refresh(); } }, '❌')))));
    const missing = OUTDOOR.filter(o => !S.tasks.some(t => t.id === o.id));
    if (missing.length) wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '🌳 Draußen & mehr Bereiche'),
      h('p', { class: 'small muted' }, 'Garten, Auffahrt, Garage, Durchgang drinnen & draußen – mit fertigen Aufgaben (Rasen mähen, fegen, …). Kannst du danach alles anpassen.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: async () => { await S.store.upsertMany('tasks', missing); rain('🌳🌻🚗🔧'); toast(`${missing.length} Aufgaben für draußen dazu! 🌳`); await refresh(); } }, `➕ ${missing.length} Vorlagen hinzufügen`))));
  } else {
    const mine = S.tasks.filter(t => t.proposed_by === me.id);
    wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '💡 Ideen?'),
      h('p', { class: 'small muted' }, 'Fehlt eine Aufgabe oder ein Bereich (z.B. Garten, Garage)? Schlag sie vor!'),
      mine.length ? h('p', { class: 'small' }, `Warten auf OK: ${mine.map(t => t.title).join(', ')} ⏳`) : null,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => taskDialog(null) }, '💡 Aufgabe vorschlagen'))));
  }
  wrap.append(emojiCard(me));
  wrap.append(h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '📱 App aufs Handy'),
    h('p', { class: 'small muted' }, 'iPhone: Teilen-Knopf ⬆️ → „Zum Home-Bildschirm“. Android: Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.')));
  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'actions' },
      h('button', { class: 'btn sec', onclick: () => { LS.del('pp_me'); S.me = null; render(); } }, '🔄 Person wechseln'),
      h('button', { class: 'btn ghost', onclick: () => { if (confirm('App auf diesem Handy zurücksetzen? (Die Familien-Daten bleiben erhalten)')) { LS.del('pp_me'); LS.del('pp_conf'); location.hash = ''; location.reload(); } } }, 'Abmelden'))));
  return wrap;
}

const EMOJI_CHOICES = '😀😎🤩🥳😇🤪🦄🦖🐱🐶🦊🐼🐸🐵🦁🐯🐰🐻🐨🦋🌸🌻🌈⭐🔥💎👑💪🎸⚽🏀🎮🍕🍩🍓🧁🚀🛸🧽🧹✨🎉💖🍀🌊🏆🎯🧸🎀'.match(/\p{Extended_Pictographic}/gu);
const emojis = s => [...new Intl.Segmenter().segment(s || '')].map(x => x.segment).filter(x => x.trim());
function rain(str) {
  const list = emojis(str); if (!list.length) return;
  const box = h('div', { class: 'rain', 'aria-hidden': 'true' });
  for (let i = 0; i < 45; i++) {
    const e = h('span', {}, list[i % list.length]);
    e.style.left = Math.random() * 100 + 'vw';
    e.style.fontSize = 22 + Math.random() * 26 + 'px';
    e.style.animationDuration = 1.8 + Math.random() * 1.8 + 's';
    e.style.animationDelay = Math.random() * 0.9 + 's';
    box.append(e);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 5000);
}
function emojiCard(me) {
  let myEmoji = me.emoji, myRain = me.rain || DEFAULT_RAIN, target = 'emoji';
  const show = h('div', { class: 'row', style: 'margin:8px 0;gap:14px' });
  const draw = () => show.replaceChildren(
    h('button', { class: 'who', style: `flex:1;padding:10px;${target === 'emoji' ? 'border-color:var(--brand)' : ''}`, onclick: () => { target = 'emoji'; draw(); } }, h('span', { class: 'e' }, myEmoji), h('span', { class: 'small' }, 'Mein Emoji')),
    h('button', { class: 'who', style: `flex:2;padding:10px;${target === 'rain' ? 'border-color:var(--brand)' : ''}`, onclick: () => { target = 'rain'; draw(); } }, h('span', { class: 'e', style: 'font-size:26px;line-height:40px' }, myRain), h('span', { class: 'small' }, 'Mein Emoji-Regen (bis 6)')));
  draw();
  const grid = h('div', { style: 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;font-size:26px;text-align:center' },
    EMOJI_CHOICES.map(e => h('button', { style: 'background:none;border:0;padding:4px', onclick: () => {
      if (target === 'emoji') myEmoji = e;
      else { const cur = emojis(myRain); myRain = cur.includes(e) ? cur.filter(x => x !== e).join('') : [...cur, e].slice(-6).join(''); }
      draw();
    } }, e)));
  const own = h('input', { type: 'text', placeholder: 'Oder eigenes Emoji eintippen…' });
  return h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '😎 Meine Emojis'),
    h('p', { class: 'small muted' }, 'Tipp oben, was du ändern willst, dann unten Emojis antippen. Beim Regen: nochmal antippen = raus.'),
    show, grid,
    h('div', { class: 'row', style: 'margin-top:8px' }, own, h('button', { class: 'btn sec', onclick: () => { const e = emojis(own.value); if (!e.length) return; if (target === 'emoji') myEmoji = e[0]; else myRain = [...emojis(myRain), ...e].slice(-6).join(''); own.value = ''; draw(); } }, '➕')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => { await S.store.patch('members', me.id, { emoji: myEmoji, rain: myRain }); rain(myRain); toast('Gespeichert! Sieht super aus 😍'); await refresh(); } }, 'Speichern'),
      h('button', { class: 'btn ghost', onclick: () => rain(myRain) }, '🌧️ Test-Regen')));
}

function inviteDialog() {
  const c = S.conf;
  const link = c.mode === 'cloud' ? `${location.origin}${location.pathname}#join=${b64e(JSON.stringify({ u: c.u, k: c.k, f: c.f }))}` : null;
  if (!link) return sheet(h('div', { class: 'big-emoji' }, '🧪'), h('p', { class: 'center' }, 'Du bist im Demo-Modus – da läuft alles nur auf diesem Handy. Für die ganze Familie brauchst du die Cloud-Einrichtung (siehe Anleitung).'));
  const qr = h('div', { style: 'background:#fff;padding:12px;border-radius:12px;width:max-content;margin:12px auto' });
  sheet(h('h2', { style: 'justify-content:center' }, 'Familie einladen 📲'),
    h('p', { class: 'center muted small' }, 'QR-Code mit dem Handy scannen – oder Link verschicken. ⚠️ Nur an die Familie geben!'), qr,
    h('div', { class: 'actions' },
      navigator.share ? h('button', { class: 'btn big', onclick: () => navigator.share({ title: 'Unser Putzplan 🧹', text: 'Hier ist unser Familien-Putzplan! Öffnen, Namen antippen, PIN festlegen 😊', url: link }).catch(() => {}) }, '📤 Link teilen') : null,
      h('button', { class: 'btn sec big', onclick: async () => { try { await navigator.clipboard.writeText(link); toast('Link kopiert 📋'); } catch { prompt('Link kopieren:', link); } } }, '📋 Link kopieren')));
  loadScript('vendor/qrcode.js').then(() => { const q = window.qrcode(0, 'L'); q.addData(link); q.make(); qr.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); qr.firstChild.style.cssText = 'width:240px;height:240px;display:block'; }).catch(() => qr.remove());
}

function memberDialog(m) {
  const isNew = !m; m = m ? { ...m } : { id: uid(), name: '', emoji: '🙂', is_admin: false, klein: false, w_weekday: 1, w_weekend: 1, waschtag: null, active: true, pin_hash: null, sort: S.members.length };
  const name = h('input', { type: 'text', value: m.name, placeholder: 'Name' });
  const emoji = h('input', { type: 'text', value: m.emoji, maxlength: 4 });
  const wd = h('select', {}, [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(v => h('option', { value: v, selected: +m.w_weekday === v ? true : null }, wl(v))));
  const we = h('select', {}, [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(v => h('option', { value: v, selected: +m.w_weekend === v ? true : null }, wl(v))));
  function wl(v) { return v === 0 ? 'keine Aufgaben' : v < 0.5 ? 'ganz wenig' : v < 1 ? 'etwas weniger' : v === 1 ? 'normal' : v <= 1.5 ? 'mehr' : 'viel mehr'; }
  const wt = h('select', {}, h('option', { value: '' }, 'kein Waschtag'), [1, 2, 3, 4, 5, 6, 7].map(i => h('option', { value: i, selected: +m.waschtag === i ? true : null }, DAYS[i])));
  const klein = h('input', { type: 'checkbox', checked: m.klein });
  const admin = h('input', { type: 'checkbox', checked: m.is_admin });
  const active = h('input', { type: 'checkbox', checked: m.active });
  const s = sheet(h('h2', {}, isNew ? 'Neue Person' : `${m.emoji} ${m.name} bearbeiten`),
    h('div', { class: 'row' }, h('div', { style: 'width:80px' }, h('label', { class: 'f' }, 'Emoji'), emoji), h('div', { class: 'grow' }, h('label', { class: 'f' }, 'Name'), name)),
    h('label', { class: 'f' }, 'Wie viel Mo–Fr?'), wd,
    h('label', { class: 'f' }, 'Wie viel am Wochenende?'), we,
    h('label', { class: 'f' }, 'Waschtag'), wt,
    h('label', { class: 'chk' }, klein, 'Kind – nur leichte Aufgaben'),
    h('label', { class: 'chk' }, admin, 'Admin (sieht alles, darf ablehnen & ändern)'),
    h('label', { class: 'chk' }, active, 'Macht mit (aus = pausiert, z.B. Urlaub/krank)'),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => {
        if (!name.value.trim()) return name.focus();
        Object.assign(m, { name: name.value.trim(), emoji: emoji.value.trim() || '🙂', w_weekday: +wd.value, w_weekend: +we.value, waschtag: wt.value ? +wt.value : null, klein: klein.checked, is_admin: admin.checked, active: active.checked });
        if (!m.is_admin && m.id === S.me && !S.members.some(x => x.is_admin && x.id !== m.id)) return toast('Mindestens eine Person muss Admin bleiben 😉');
        await S.store.upsert('members', m); s.remove(); toast('Gespeichert 👍'); await refresh();
      } }, 'Speichern'),
      !isNew && m.pin_hash ? h('button', { class: 'btn sec', onclick: async () => { await S.store.patch('members', m.id, { pin_hash: null }); s.remove(); toast(`PIN zurückgesetzt – ${m.name} legt beim nächsten Öffnen eine neue fest`); await refresh(); } }, 'PIN zurücksetzen') : null,
      !isNew && m.id !== S.me ? h('button', { class: 'btn ghost', onclick: async () => { if (!confirm(`${m.name} wirklich entfernen?`)) return; await S.store.remove('members', m.id); s.remove(); await refresh(); } }, 'Entfernen') : null));
}

function taskDialog(t) {
  const admin = !!meM()?.is_admin;
  const isNew = !t; t = t ? { ...t } : { id: uid(), title: '', room: 'Wohnzimmer', freq: 'daily', day: 1, minutes: 5, leicht: false, per_person: false, active: true };
  const title = h('input', { type: 'text', value: t.title, placeholder: 'Was ist zu tun?' });
  const room = h('select', {}, allRooms().map(r => h('option', { value: r, selected: t.room === r ? true : null }, `${roomIcon(r)} ${r}`)), h('option', { value: '__neu' }, '➕ Neuer Bereich…'));
  room.onchange = async () => {
    if (room.value !== '__neu') return;
    const r = await roomDialog(); if (!r) { room.value = t.room; return; }
    room.insertBefore(h('option', { value: r, selected: true }, `${roomIcon(r)} ${r}`), room.lastChild); room.value = r;
  };
  const freq = h('select', {}, Object.entries(FREQ).map(([k, v]) => h('option', { value: k, selected: t.freq === k ? true : null }, v)));
  const dayW = h('select', {}, [1, 2, 3, 4, 5, 6, 7].map(i => h('option', { value: i, selected: +t.day === i ? true : null }, DAYS[i])));
  const dayM = h('input', { type: 'number', min: 1, max: 28, value: t.day || 1 });
  const dayBox = h('div');
  const upd = () => { dayBox.replaceChildren(freq.value === 'weekly' ? [h('label', { class: 'f' }, 'An welchem Tag?'), dayW] : freq.value === 'monthly' ? [h('label', { class: 'f' }, 'Ab welchem Tag im Monat? (1–28)'), dayM] : []); };
  freq.onchange = upd; upd();
  const minutes = h('input', { type: 'number', min: 1, max: 120, value: t.minutes });
  const leicht = h('input', { type: 'checkbox', checked: t.leicht });
  const pp = h('input', { type: 'checkbox', checked: t.per_person });
  const active = h('input', { type: 'checkbox', checked: t.active });
  const s = sheet(h('h2', {}, isNew ? (admin ? 'Neue Aufgabe' : '💡 Aufgabe vorschlagen') : 'Aufgabe bearbeiten'),
    !admin ? h('p', { class: 'small muted' }, 'Dein Vorschlag geht an die Admins. Sobald er angenommen ist, taucht er bei allen auf 😊') : null,
    h('label', { class: 'f' }, 'Aufgabe'), title, h('label', { class: 'f' }, 'Raum'), room,
    h('label', { class: 'f' }, 'Wie oft?'), freq, dayBox,
    h('label', { class: 'f' }, 'Dauer ungefähr (Minuten) – 5 Min = 1 Punkt'), minutes,
    h('label', { class: 'chk' }, leicht, 'Leicht – können auch die Kleinen'),
    h('label', { class: 'chk' }, pp, 'Jeder macht das für sich (z.B. eigenes Zimmer)'),
    admin ? h('label', { class: 'chk' }, active, 'Aktiv') : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: async () => {
        if (!title.value.trim()) return title.focus();
        Object.assign(t, { title: title.value.trim(), room: room.value, freq: freq.value, day: freq.value === 'weekly' ? +dayW.value : freq.value === 'monthly' ? Math.min(28, Math.max(1, +dayM.value || 1)) : 0, minutes: Math.max(1, +minutes.value || 5), leicht: leicht.checked, per_person: pp.checked, active: active.checked });
        if (!admin) { t.active = false; t.proposed_by = S.me; }
        try { await S.store.upsert('tasks', t); } catch (e) { return toast('Hat nicht geklappt: ' + (e.message || e)); }
        s.remove(); toast(admin ? 'Gespeichert 👍' : 'Vorschlag ist raus! 💡 Danke!'); await refresh();
      } }, admin ? 'Speichern' : 'Vorschlagen 💡'),
      !isNew && admin ? h('button', { class: 'btn ghost', onclick: async () => { if (!confirm('Aufgabe löschen?')) return; await S.store.remove('tasks', t.id); s.remove(); await refresh(); } }, 'Löschen') : null));
}

function roomDialog() {
  return new Promise(resolve => {
    const name = h('input', { type: 'text', placeholder: 'z.B. Gartenhaus, Keller, Balkon' });
    const emo = h('input', { type: 'text', value: '🏡', maxlength: 4, style: 'width:80px' });
    let ok = false;
    const s = sheet(h('h2', {}, '➕ Neuer Bereich'),
      h('div', { class: 'row' }, h('div', {}, h('label', { class: 'f' }, 'Emoji'), emo), h('div', { class: 'grow' }, h('label', { class: 'f' }, 'Name'), name)),
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: async () => {
        const n = name.value.trim(); if (!n) return name.focus();
        S.settings = { ...S.settings, rooms: { ...(S.settings.rooms || {}), [n]: emojis(emo.value)[0] || '🏡' } };
        try { await S.store.saveSettings(S.settings); } catch {}
        ok = true; s.remove(); resolve(n);
      } }, 'Hinzufügen')));
    new MutationObserver((_, o) => { if (!s.isConnected) { o.disconnect(); if (!ok) resolve(null); } }).observe(document.body, { childList: true });
    setTimeout(() => name.focus(), 50);
  });
}
const OUTDOOR = [
  ['garten-rasen', 'Rasen mähen', 'Garten', 'weekly', 6, 30],
  ['garten-laub', 'Laub rechen & Gartenmüll weg', 'Garten', 'weekly', 6, 20],
  ['garten-unkraut', 'Unkraut zupfen', 'Garten', 'monthly', 10, 30],
  ['auffahrt-fegen', 'Auffahrt fegen', 'Auffahrt', 'weekly', 6, 15],
  ['garage-ordnen', 'Garage aufräumen & fegen', 'Garage', 'monthly', 14, 30],
  ['durch-drin', 'Durchgang drinnen saugen & wischen', 'Durchgang drinnen', 'weekly', 3, 10],
  ['durch-draussen', 'Durchgang draußen fegen', 'Durchgang draußen', 'weekly', 5, 10],
].map(([id, title, room, freq, day, minutes]) => ({ id, title, room, freq, day, minutes, leicht: false, per_person: false, active: true }));

// ---------- Login ----------
function viewWho() {
  const wrap = h('div');
  wrap.append(h('div', { class: 'big-emoji' }, '🏠🧹'), h('h1', { class: 'center', style: 'margin:0' }, 'Wer bist du?'),
    h('p', { class: 'center muted' }, 'Tipp auf deinen Namen'));
  wrap.append(h('div', { class: 'grid' }, S.members.filter(m => m.active).map(m => h('button', { class: 'who', onclick: () => pinView(m) }, h('span', { class: 'e' }, m.emoji), m.name))));
  if (!S.members.length) wrap.append(h('p', { class: 'center muted' }, 'Noch keine Familie angelegt. Die Admin-Person muss die App zuerst einrichten.'));
  return wrap;
}
function pinView(m) {
  const app = $('#app'); let pin = '', first = null; app.dataset.pin = '1';
  const setNew = !m.pin_hash;
  const msg = h('p', { class: 'center muted' }, setNew ? 'Leg deine geheime 4-stellige PIN fest 🔐' : 'Deine PIN bitte 🔐');
  const dots = h('div', { class: 'pin' });
  const drawDots = () => dots.replaceChildren(...[0, 1, 2, 3].map(i => h('span', { class: i < pin.length ? 'f' : '' })));
  drawDots();
  async function press(k) {
    if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
    drawDots();
    if (pin.length < 4) return;
    const hsh = await sha(m.id + ':' + pin);
    if (setNew) {
      if (!first) { first = pin; pin = ''; msg.textContent = 'Nochmal zur Sicherheit 🙂'; return drawDots(); }
      if (first !== pin) { first = null; pin = ''; msg.textContent = 'Stimmt nicht überein 🙈 Nochmal von vorn:'; return drawDots(); }
      await S.store.patch('members', m.id, { pin_hash: hsh });
      m.pin_hash = hsh;
    } else if (hsh !== m.pin_hash) { pin = ''; msg.textContent = 'Falsche PIN 🙅 Nochmal!'; dots.animate([{ transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'none' }], 250); return drawDots(); }
    S.me = m.id; LS.set('pp_me', m.id); S.tab = 'heute';
    toast(`Hallo ${m.name}! ${m.emoji}`);
    render();
  }
  app.replaceChildren(h('div', { class: 'big-emoji' }, m.emoji), h('h1', { class: 'center', style: 'margin:0' }, m.name), msg, dots,
    h('div', { class: 'pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? h('button', { onclick: () => press(k) }, k) : h('span'))),
    h('div', { class: 'center', style: 'margin-top:16px' }, h('button', { class: 'btn ghost', onclick: render }, '← Zurück')));
}

function viewWelcome() {
  const wrap = h('div');
  if (S.lastErr) wrap.append(h('div', { class: 'card', style: 'border:2px solid var(--bad)' },
    h('div', { style: 'font-weight:700' }, '😕 Verbindung zur Familie hat nicht geklappt'),
    h('p', { class: 'small' }, 'Fehler: ', h('code', {}, S.lastErr.msg)),
    h('p', { class: 'small muted' }, 'Mach bitte einen Screenshot davon für Claude 📸'),
    h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => { const c = S.lastErr.conf; S.lastErr = null; connect(c); } }, '🔄 Nochmal versuchen'))));
  const u = h('input', { type: 'url', placeholder: 'https://xxxx.supabase.co' });
  const k = h('input', { type: 'text', placeholder: 'anon / publishable key' });
  const f = h('input', { type: 'text', placeholder: 'Familien-Geheimcode aus dem SQL-Skript' });
  wrap.append(h('div', { class: 'big-emoji' }, '🏠🧹✨'), h('h1', { class: 'center', style: 'margin:0' }, 'Familien-Putzplan'),
    h('p', { class: 'center muted' }, 'Vorher-Foto, putzen, Nachher-Foto, Haken dran. Keine Ausreden mehr 😎'),
    h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '📲 Du hast einen Einladungslink?'), h('p', { class: 'small muted' }, 'Öffne ihn einfach – oder kopier ihn und füg ihn hier ein:'),
      (() => { const inp = h('input', { type: 'text', placeholder: 'Einladungslink hier einfügen' }); return h('div', {}, inp, h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => {
        const mm = inp.value.match(/join=([\w-]+)/); if (!mm || !applyJoin(mm[1])) return toast('Das ist kein gültiger Einladungslink 🤔');
        history.replaceState(null, '', location.pathname + '#join=' + mm[1]); connect(S.conf);
      } }, 'Los geht\'s 🚀'))); })()),
    h('details', { class: 'card' }, h('summary', {}, '👑 Familie einrichten (nur Admin, einmalig)'),
      h('label', { class: 'f' }, 'Supabase Project URL'), u, h('label', { class: 'f' }, 'Supabase API Key (anon/publishable)'), k, h('label', { class: 'f' }, 'Familien-Geheimcode'), f,
      h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: () => { if (!u.value || !k.value || !f.value) return toast('Bitte alle 3 Felder ausfüllen 🙂'); connect({ mode: 'cloud', u: u.value.trim().replace(/\/$/, ''), k: k.value.trim(), f: f.value.trim() }); } }, 'Verbinden'))),
    h('div', { class: 'card' }, h('div', { style: 'font-weight:700' }, '🧪 Erstmal ausprobieren?'), h('p', { class: 'small muted' }, 'Demo-Modus: läuft nur auf diesem Handy, mit Beispiel-Familie.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn sec', onclick: () => connect({ mode: 'demo' }) }, 'Demo starten'))));
  return wrap;
}

async function connect(conf) {
  try {
    const store = conf.mode === 'cloud' ? CloudStore : DemoStore;
    await store.init(conf);
    S.store = store; S.conf = conf;
    await reload();
    if (!S.members.length) {
      // Ersteinrichtung: Startdaten anlegen
      await store.upsertMany('members', SEED_MEMBERS);
      await store.upsertMany('tasks', SEED_TASKS);
      await store.saveSettings(DEFAULT_SETTINGS);
      await reload();
      toast('Familie & Aufgaben angelegt 🎉 Tipp auf deinen Namen!');
    }
    LS.set('pp_conf', conf);
    render();
    if (meM()?.is_admin) cleanupPhotos();
  } catch (e) {
    console.error(e);
    S.lastErr = { conf, msg: [e?.message, e?.code, e?.details, e?.hint].filter(Boolean).join(' · ') || String(e) };
    S.conf = null; S.loaded = false;
    render();
  }
}
async function refresh() {
  try { await reload(); } catch (e) { toast('Keine Verbindung 📡 – versuch es gleich nochmal'); }
  // Offene Dialoge/Kamera nicht zerstören
  if (!document.querySelector('.overlay, .modal') && !$('#app').dataset.pin) render();
}
async function cleanupPhotos() {
  const cutoff = Date.now() - (+S.settings.foto_tage || 21) * 864e5;
  const old = S.completions.filter(c => (c.before_photo || c.after_photo) && new Date(c.created_at).getTime() < cutoff).slice(0, 40);
  for (const c of old) {
    try {
      if (c.before_photo) await S.store.delPhoto(c.before_photo);
      if (c.after_photo) await S.store.delPhoto(c.after_photo);
      await S.store.patch('completions', c.id, { before_photo: null, after_photo: null });
    } catch {}
  }
}

function applyJoin(code) {
  try {
    const j = JSON.parse(b64d(code));
    if (!j.u || !j.k || !j.f) return false;
    const conf = { mode: 'cloud', u: j.u, k: j.k, f: j.f };
    if (!S.conf || S.conf.f !== conf.f) { LS.del('pp_me'); S.me = null; }
    S.conf = conf; LS.set('pp_conf', conf);
    return true;
  } catch { return false; }
}
// ---------- Start ----------
(async function boot() {
  // Der Link bleibt in der Adresse, damit "Zum Home-Bildschirm" ihn mitnimmt (iPhone-Apps haben eigenen Speicher)
  const m = location.hash.match(/join=([\w-]+)/);
  if (m && !applyJoin(m[1])) toast('Der Einladungslink ist kaputt 😕');
  if (S.conf) await connect(S.conf); else render();
  setInterval(() => { if (S.store && document.visibilityState === 'visible') refresh(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (S.store && document.visibilityState === 'visible') refresh(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
