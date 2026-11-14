// Die gemeinsamen Regeln (shared/logic.js): Kalender, Fälligkeit, Punkte, Serie, Konto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../shared/logic.js';

const day = (y, m, d) => new Date(y, m - 1, d, 12);
const at = d => d.toISOString();

test('Kalender: Wochentag, Kalenderwoche, Monat', () => {
  assert.equal(L.isoDay(day(2026, 11, 13)), 5); // Freitag
  assert.equal(L.isoDay(day(2026, 11, 15)), 7); // Sonntag
  assert.equal(L.weekKey(day(2026, 11, 13)), '2026-W46');
  assert.equal(L.weekKey(day(2026, 1, 1)), '2026-W01');
  assert.equal(L.weekKey(day(2027, 1, 1)), '2026-W53'); // gehört noch zur letzten Woche des alten Jahres
  assert.equal(L.mKey(day(2026, 3, 9)), '2026-03');
  assert.equal(L.dKey(L.noon(day(2026, 3, 1), 1)), '2026-02-28');
});

test('Fälligkeit: täglich, werktags, Wochenende, wöchentlich, monatlich', () => {
  const fr = day(2026, 11, 13), sa = day(2026, 11, 14), mi = day(2026, 11, 11);
  assert.ok(L.dueOn({ freq: 'daily' }, sa));
  assert.ok(L.dueOn({ freq: 'weekdays' }, fr) && !L.dueOn({ freq: 'weekdays' }, sa));
  assert.ok(L.activeOn({ freq: 'weekend' }, sa) && !L.activeOn({ freq: 'weekend' }, fr));
  const weekly = { id: 'w', freq: 'weekly', day: 3 }; // Mittwoch
  assert.ok(L.dueOn(weekly, mi) && !L.dueOn(weekly, fr));
  assert.ok(L.overdueInPeriod(weekly, fr) && !L.overdueInPeriod(weekly, mi));
  assert.equal(L.lateLabel(weekly), 'seit Mittwoch');
  assert.equal(L.periodOf(weekly, fr), '2026-W46');
  assert.equal(L.periodOf({ id: 'm', freq: 'monthly' }, fr), '2026-11');
  assert.equal(L.periodOf({ id: 'd', freq: 'daily' }, fr), '2026-11-13');
  assert.ok(L.dueOn({ freq: 'monthly', day: 31 }, day(2026, 2, 28))); // Tage über 28 zählen als der 28.
  assert.equal(L.slotOf({ per_person: true }, 'mia'), 'mia');
  assert.equal(L.slotOf({ per_person: false }, 'mia'), '');
});

test('Punkte: eigene Punkte gehen vor, im Team wird aufgerundet geteilt', () => {
  assert.equal(L.ptsOf({ points: 4, minutes: 30 }), 4);
  assert.equal(L.ptsOf({ points: null, minutes: 12 }), 2);
  assert.deepEqual(L.shares({ member_id: 'a', helpers: ['b'], points: 5 }), { a: 3, b: 3 });
  assert.deepEqual(L.shares({ member_id: 'a', helpers: [], points: 5 }), { a: 5 });
  assert.deepEqual(L.shares({ member_id: 'a', helpers: ['b'], points: -3 }), { a: -3 }); // Abzüge werden nicht geteilt
});

test('Tagesziel, Serie und Punktekonto', () => {
  const today = day(2026, 11, 13);
  const mia = { id: 'mia', role: 'mitglied', active: true, w_weekday: 1, w_weekend: 1 };
  const done = (id, back, points, task = 'x') => ({ id, task_id: task, member_id: 'mia', helpers: [], status: 'done', points, after_at: at(L.noon(today, back)), period: L.dKey(L.noon(today, back)), slot: '' });
  const st = { members: [mia], tasks: [], settings: { ...L.DEFAULT_SETTINGS, tagesziel: 10 }, entries: [done('e1', 0, 10), done('e2', 1, 14), done('e3', 2, 3), done('r1', 0, 3, 'redeem'), done('b1', 0, 5, 'bonus')] };
  const ix = L.buildIndex(st);
  assert.equal(L.dayGoal(mia, today, st.settings), 10);
  assert.equal(L.dayPoints(ix, 'mia', today), 13); // 10 + 3 eingelöst, die Belohnung zählt nicht zum Tagesziel
  assert.equal(L.streak(ix, mia, st, today), 2); // heute und gestern, vorgestern nicht
  assert.equal(L.bank(ix, mia, st, today), 1); // gestern 4 über dem Ziel, 3 eingelöst
  assert.equal(L.weekPoints(st, today).pts.mia, 10 + 14 + 3 + 5); // Eingelöstes zählt nicht in die Woche
  assert.equal(L.dayState(st, ix, mia, L.noon(today, 2), today), 'teil');
  assert.equal(L.dayState(st, ix, mia, L.noon(today, 3), today), 'miss');
  assert.equal(L.dayState(st, ix, mia, L.noon(today, -1), today), 'future');
});

test('Abwesenheit: kein Tagesziel, die Serie bleibt', () => {
  const today = day(2026, 11, 13);
  const m = { id: 'm', role: 'mitglied', active: true, w_weekday: 1, w_weekend: 1, away_from: '2026-11-11', away_to: '2026-11-12' };
  const e = (id, back) => ({ id, task_id: 'x', member_id: 'm', helpers: [], status: 'done', points: 10, after_at: at(L.noon(today, back)), period: '', slot: '' });
  const st = { members: [m], tasks: [], settings: { ...L.DEFAULT_SETTINGS }, entries: [e('a', 0), e('b', 3)] };
  assert.equal(L.dayGoal(m, L.noon(today, 1), st.settings), 0);
  assert.equal(L.streak(L.buildIndex(st), m, st, today), 2); // heute + vor drei Tagen, die zwei Tage dazwischen zählen nicht
});

test('Regel „Punkte erst nach dem Prüfen“', () => {
  const e = { task_id: 'x', status: 'done', after_at: at(day(2026, 11, 13)), review: null };
  assert.ok(L.counts(e, { review_first: false }));
  assert.ok(!L.counts(e, { review_first: true }));
  assert.ok(L.counts({ ...e, review: 'ok' }, { review_first: true }));
  assert.ok(L.counts({ ...e, task_id: 'bonus' }, { review_first: true })); // Belohnungen brauchen keine Prüfung
});

test('Wochensieger: wer in der Vorwoche vorne lag', () => {
  const today = day(2026, 11, 13);
  const members = [{ id: 'a', active: true, name: 'A' }, { id: 'b', active: true, name: 'B' }];
  const e = (id, who, points) => ({ id, task_id: 'x', member_id: who, helpers: [], status: 'done', points, after_at: at(L.noon(today, 7)) });
  const st = { members, tasks: [], settings: { ...L.DEFAULT_SETTINGS }, entries: [e('1', 'a', 5), e('2', 'b', 9)] };
  assert.deepEqual(L.royals(st, today).map(r => r.m.id), ['b']);
});
