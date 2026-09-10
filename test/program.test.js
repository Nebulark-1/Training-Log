// Strength progression is deterministic on purpose: no model decides whether
// the bar goes up. These are the rules that decide it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProgram, normalizeSets, suggestLoad } from '../server/program.js';

const set = (reps, lb, rpe = null) => ({ reps, lb, rpe });
const record = (sets, rpe = null) => ({ date: '2026-09-08', sets, rpe });

const trapBar = { exId: 'trap-bar-deadlift', reps: '5', pattern: 'hinge' };
const splitSquat = { exId: 'split-squat', reps: '8', pattern: 'single-leg', unilateral: true };

test('all sets at target and not maximal means the weight goes up', () => {
  const s = suggestLoad(trapBar, [record([set(5, 185), set(5, 185), set(5, 185)], 8)]);
  assert.equal(s.basis, 'progress');
  assert.equal(s.loadLb, 195, 'a bilateral hinge steps 10 lb');
  assert.equal(s.from, 185);
});

test('a missed rep on any set holds the weight', () => {
  const s = suggestLoad(trapBar, [record([set(5, 185), set(5, 185), set(4, 185)], 8)]);
  assert.equal(s.basis, 'hold');
  assert.equal(s.loadLb, 185);
});

test('a maximal grind holds the weight even when every rep was hit', () => {
  const s = suggestLoad({ exId: 'calf-raise', reps: '10', pattern: 'calf' },
    [record([set(10, 200), set(10, 200), set(10, 200)], 9)]);
  assert.equal(s.basis, 'hold', 'RPE 9 is not a green light');
  assert.equal(s.loadLb, 200);
});

test('a single-leg movement steps by less than a bilateral one', () => {
  const uni = suggestLoad(splitSquat, [record([set(8, 60), set(8, 60)], 7)]);
  const bi = suggestLoad(trapBar, [record([set(5, 185), set(5, 185)], 7)]);
  assert.equal(uni.loadLb - 60, 5);
  assert.equal(bi.loadLb - 185, 10);
});

test('an isometric is never given a weight', () => {
  // Telling someone to "pick a weight" for a Spanish squat is telling them to
  // do the movement wrong.
  const s = suggestLoad({ exId: 'spanish-squat', reps: '45 sec', pattern: 'rehab' },
    [record([set(0, 0)], 7)]);
  assert.equal(s.basis, 'bodyweight');
  assert.equal(s.loadLb, 0);
});

test('a movement with no history asks for a working weight rather than guessing', () => {
  const s = suggestLoad(trapBar, []);
  assert.equal(s.basis, 'calibrate');
  assert.match(s.note, /history/i);
});

test('a loadable movement logged without load reads as bodyweight', () => {
  const s = suggestLoad(trapBar, [record([set(8, 0), set(8, 0)], 6)]);
  assert.equal(s.basis, 'bodyweight');
});

test('the top set drives the next load, not the last set', () => {
  const s = suggestLoad(trapBar, [record([set(5, 185), set(5, 195), set(5, 185)], 7)]);
  assert.equal(s.from, 195);
});

test('a rep target with units still parses', () => {
  const s = suggestLoad({ exId: 'farmers-carry', reps: '40 m', pattern: 'carry' },
    [record([set(40, 70), set(40, 70)], 7)]);
  assert.equal(s.basis, 'progress', 'reps parsed out of "40 m"');
});

test('missing RPE is treated as permission, not as a grind', () => {
  const s = suggestLoad(trapBar, [record([set(5, 185), set(5, 185)], null)]);
  assert.equal(s.basis, 'progress');
});

// --- set shapes ------------------------------------------------------------

test('normalizeSets keeps a per-set grid as it is', () => {
  const sets = normalizeSets({ sets: [set(5, 185, 8), set(5, 185, 8)] });
  assert.equal(sets.length, 2);
  assert.deepEqual(sets[0], { reps: 5, lb: 185, rpe: 8 });
});

test('normalizeSets expands the old single-row shape', () => {
  // Entries logged before the per-set grid stored one row plus a count.
  const sets = normalizeSets({ sets: 3, reps: 5, lb: 185 });
  assert.equal(sets.length, 3);
  assert.deepEqual(sets[0], { reps: 5, lb: 185, rpe: null });
});

test('normalizeSets drops empty rows so they cannot look like failed sets', () => {
  const sets = normalizeSets({ sets: [set(5, 185), set(0, 0), set(5, 185)] });
  assert.equal(sets.length, 2);
});

test('normalizeSets refuses to invent sets from nothing', () => {
  assert.deepEqual(normalizeSets({ sets: 3 }), []);
  assert.deepEqual(normalizeSets({}), []);
});

test('normalizeSets caps an absurd set count', () => {
  assert.equal(normalizeSets({ sets: 500, reps: 5, lb: 100 }).length, 12);
});

// --- the shipped program ---------------------------------------------------

test('the default program covers every required pattern', () => {
  const p = defaultProgram('2026-01-01');
  const patterns = new Set(p.sessions.flatMap((s) => s.movements.map((m) => m.pattern)));
  for (const required of ['hinge', 'single-leg', 'calf', 'core']) {
    assert.ok(patterns.has(required), `the default program is missing a ${required} movement`);
  }
});

test('every movement in the default program carries an exId', () => {
  // A movement without one keys differently from what gets logged against it,
  // and progression then finds no history for it.
  for (const s of defaultProgram('2026-01-01').sessions) {
    for (const m of s.movements) {
      assert.ok(m.exId, `${s.id}/${m.name} has no exId`);
    }
  }
});
