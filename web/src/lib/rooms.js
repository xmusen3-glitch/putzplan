// Icon und Farbe je Raum. Eigene Räume bekommen ein Icon aus ROOM_ICONS (in den Regeln wählbar).
const KNOWN = {
  'Küche': ['cooking-pot', '#e8950c'], 'Wohnzimmer': ['sofa', '#7c5cff'], 'Esszimmer': ['utensils', '#e5589a'], 'Gästebad': ['bath', '#2e9fe6'],
  'Eingang': ['door-open', '#23a86d'], 'Flur & Treppe': ['footprints', '#14a3a3'], 'Waschflur': ['washing-machine', '#3b82c4'], 'Wäsche': ['shirt', '#2e9fe6'],
  'Ganzes Haus': ['house', '#8a63d2'], 'Eigenes Zimmer': ['bed', '#d9668c'], 'Garten': ['trees', '#5aa832'], 'Auffahrt': ['car', '#6f7a8a'],
  'Garage': ['warehouse', '#9a7448'], 'Durchgang drinnen': ['door-closed', '#b0803a'], 'Durchgang draußen': ['fence', '#4f9a5c'], 'Extra': ['sparkles', '#7c5cff'],
};
export const ROOM_ICONS = ['house', 'sofa', 'cooking-pot', 'utensils', 'bath', 'bed', 'door-open', 'door-closed', 'washing-machine', 'shirt', 'trees', 'flower-2', 'car', 'warehouse', 'fence', 'archive', 'book-open', 'monitor', 'dumbbell', 'dog', 'baby', 'sun', 'footprints', 'sparkles'];
const COLORS = ['#7c5cff', '#2e9fe6', '#23a86d', '#e8950c', '#e5589a', '#14a3a3', '#9a7448'];
const hash = s => { let x = 0; for (const c of s) x = (x * 31 + c.codePointAt(0)) >>> 0; return x; };

export function roomOf(name, settings) {
  const custom = settings?.rooms?.[name], known = KNOWN[name];
  return { icon: ROOM_ICONS.includes(custom) ? custom : known?.[0] || 'house', color: known?.[1] || COLORS[hash(name || '') % COLORS.length] };
}
export const allRooms = (tasks, settings) => [...new Set([...Object.keys(KNOWN).filter(r => r !== 'Extra' && r !== 'Wäsche'), ...Object.keys(settings?.rooms || {}), ...tasks.map(t => t.room)])];
