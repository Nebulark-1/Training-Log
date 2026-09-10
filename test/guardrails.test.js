// Guardrails decide whether a week is allowed to happen, so their edges are
// worth pinning down. Every case here is one the coach can actually produce.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkProgramChange, checkWeekPlan, hasBlocking, newViolations, plannedVolumes,
  PROGRAM_LIMITS, violationKey,
} from '../server/guardrails.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A week plan from a list of per-day session arrays. */
const week = (days, extra = {}) => ({
  days: DOW.map((dow, i) => ({ dow, sessions: days[i] || [] })),
  ...extra,
});
const run = (miles, intensity = 'easy') => ({ sport: 'run', miles, intensity });

const codes = (v) => v.map((x) => x.code).sort();
const find = (v, code) => v.find((x) => x.code === code);

test('plannedVolumes counts each sport in its own unit', () => {
  const v = plannedVolumes(week([[run(6)], [run(4)], [], [{ sport: 'bike', minutes: 50 }], [], [run(10)], []]));
  assert.equal(v.run, 20, 'run is counted in miles');
  assert.equal(v.bike, 50, 'bike is counted in minutes, not miles');
});

test('plannedVolumes omits a sport with no volume rather than writing a zero', () => {
  // A seeded swim has minutes but no yardage. `swim: 0` would read as a real
  // measurement of nothing and drag every comparison made against it.
  const v = plannedVolumes(week([[{ sport: 'swim', minutes: 40 }]]));
  assert.equal('swim' in v, false, 'swim with no distance should be absent, not zero');
});

test('a modest step up is allowed', () => {
  const v = checkWeekPlan(week([[run(6)], [run(5)], [], [run(6)], [], [run(11)], []]),
    { previous: { run: 26 }, baseline: { run: 26 } });
  assert.equal(find(v, 'volume-jump'), undefined);
});

test('a step over the ceiling warns; far over it is refused', () => {
  // The run ceiling is the lesser of +10% and +5 mi, and a block needs 1.5x
  // that. Off 26 mi the ceiling is 28.6, so 39 warns and 46 is refused.
  const over = checkWeekPlan(week([[run(10)], [run(10)], [], [run(10)], [], [run(9)], []]),
    { previous: { run: 26 }, baseline: { run: 26 } });
  assert.equal(find(over, 'volume-jump')?.severity, 'warn');
  assert.equal(hasBlocking(over), false);

  const wayOver = checkWeekPlan(week([[run(12)], [run(12)], [], [run(12)], [], [run(10)], []]),
    { previous: { run: 26 }, baseline: { run: 26 } });
  assert.equal(find(wayOver, 'volume-jump')?.severity, 'block');
  assert.equal(hasBlocking(wayOver), true);
});

test('coming back from a deload is measured against the best of recent weeks', () => {
  // 36, deload to 28, back to 38. Against last week alone that reads as a
  // spike, and every fourth week would be refused.
  const plan = week([[run(8)], [run(6)], [], [run(8)], [], [run(16)], []]);
  const againstLastWeek = checkWeekPlan(plan, { previous: { run: 28 }, baseline: { run: 28 } });
  const againstBaseline = checkWeekPlan(plan, { previous: { run: 28 }, baseline: { run: 36 } });
  assert.ok(find(againstLastWeek, 'volume-jump'), 'the deload week alone should look like a spike');
  assert.equal(find(againstBaseline, 'volume-jump'), undefined, 'the 3-week baseline should absorb it');
});

test('three hard running days are refused; two are not', () => {
  const three = checkWeekPlan(
    week([[run(6, 'threshold')], [], [run(6, 'intervals')], [], [run(6, 'tempo')], [], []]),
    { previous: {}, baseline: {} },
  );
  assert.equal(find(three, 'too-many-hard-days')?.severity, 'block');

  const two = checkWeekPlan(
    week([[run(6, 'threshold')], [], [], [run(6, 'intervals')], [], [], []]),
    { previous: {}, baseline: {} },
  );
  assert.equal(find(two, 'too-many-hard-days'), undefined);
});

test('hard days back to back are a warning, not a refusal', () => {
  const v = checkWeekPlan(week([[run(6, 'threshold')], [run(6, 'intervals')], [], [], [], [], []]),
    { previous: {}, baseline: {} });
  assert.equal(find(v, 'hard-days-adjacent')?.severity, 'warn');
});

test('pain at or above 4/10 blocks any increase', () => {
  const plan = week([[run(7)], [run(6)], [], [run(7)], [], [run(10)], []]);
  const v = checkWeekPlan(plan, { previous: { run: 28 }, baseline: { run: 28 } },
    { recentPain: [{ pain: 5, date: '2026-09-08', site: 'Right shin' }] });
  const hit = find(v, 'increase-on-pain');
  assert.ok(hit, 'expected the pain rule to fire');
  assert.equal(hit.severity, 'block');
  assert.match(hit.message, /Right shin/, 'the message should name where it hurt');
});

test('pain of 3/10 warns but does not block', () => {
  const plan = week([[run(7)], [run(6)], [], [run(7)], [], [run(10)], []]);
  const v = checkWeekPlan(plan, { previous: { run: 28 }, baseline: { run: 28 } },
    { recentPain: [{ pain: 3, date: '2026-09-08' }] });
  assert.equal(find(v, 'increase-on-pain')?.severity, 'warn');
});

test('holding volume while in pain is allowed', () => {
  const plan = week([[run(7)], [run(7)], [], [run(7)], [], [run(7)], []]);
  const v = checkWeekPlan(plan, { previous: { run: 28 }, baseline: { run: 28 } },
    { recentPain: [{ pain: 6, date: '2026-09-08' }] });
  assert.equal(find(v, 'increase-on-pain'), undefined);
});

test('a long run over a third of the week is flagged', () => {
  const v = checkWeekPlan(week([[run(4)], [], [run(4)], [], [], [run(12)], []]),
    { previous: {}, baseline: {} });
  assert.equal(find(v, 'long-run-share')?.severity, 'warn');
});

test('a declared rest day with a run on it is flagged by name', () => {
  const v = checkWeekPlan(week([[], [], [], [], [run(5)], [], []]),
    { previous: {}, baseline: {} }, { restDays: ['friday'] });
  assert.match(find(v, 'rest-day-used').message, /Fri/);
});

test('a fourth straight build week without a deload is flagged', () => {
  const v = checkWeekPlan(week([[run(5)]]), { previous: {}, baseline: {} }, { buildStreak: 3 });
  assert.ok(find(v, 'deload-overdue'));
});

test('a deload that does not drop volume is called out', () => {
  const v = checkWeekPlan(week([[run(9)], [run(9)], [], [run(9)], [], [], []], { deload: true }),
    { previous: { run: 28 }, baseline: { run: 28 } });
  assert.ok(find(v, 'deload-not-a-deload'));
});

// --- edits report the effect of the edit, not the state of the week --------

test('newViolations reports only what an edit introduced', () => {
  const before = [{ code: 'volume-jump', severity: 'block', detail: { sport: 'run' } }];
  const after = [
    { code: 'volume-jump', severity: 'block', detail: { sport: 'run' } },
    { code: 'hard-days-adjacent', severity: 'warn', detail: {} },
  ];
  assert.deepEqual(codes(newViolations(before, after)), ['hard-days-adjacent']);
});

test('an edit can only ever warn, because the edit is already saved', () => {
  const fresh = newViolations([], [{ code: 'too-many-hard-days', severity: 'block', detail: {} }]);
  assert.equal(fresh[0].severity, 'warn');
  assert.equal(hasBlocking(fresh), false);
});

test('rearranging a week that was already over the ceiling reports nothing new', () => {
  const over = [{ code: 'volume-jump', severity: 'block', detail: { sport: 'run' } }];
  assert.deepEqual(newViolations(over, over), []);
});

test('violationKey separates the same rule firing for different sports', () => {
  assert.notEqual(
    violationKey({ code: 'volume-jump', detail: { sport: 'run' } }),
    violationKey({ code: 'volume-jump', detail: { sport: 'bike' } }),
  );
});

// --- program changes -------------------------------------------------------

const movement = (exId, extra = {}) => ({
  exId, name: exId, sets: 3, reps: '5', pattern: 'hinge', role: 'core', addedAt: '2026-01-01', ...extra,
});
// Every required pattern is present, so `pattern-missing` stays quiet and the
// rule under test is the only thing that can fire.
const BASE = [
  movement('trap-bar-deadlift', { pattern: 'hinge' }),
  movement('split-squat', { pattern: 'single-leg' }),
  movement('calf-raise', { pattern: 'calf' }),
  movement('deadbug', { pattern: 'core' }),
];
const program = (movements) => ({ sessions: [{ id: 'A', name: 'A', movements }] });

test('a program that keeps every required pattern raises nothing on its own', () => {
  const v = checkProgramChange(program(BASE), program(BASE), { today: '2027-01-01' });
  assert.deepEqual(v, [], `expected a clean check, got ${codes(v).join(', ')}`);
});

test('dropping the last movement of a required pattern is flagged', () => {
  const proposed = {
    ...program(BASE.slice(0, 3)),
    retired: [{ exId: 'deadbug', reason: 'Replaced by loaded carries.' }],
  };
  const v = checkProgramChange(program(BASE), proposed, { today: '2027-01-01' });
  assert.ok(v.some((x) => x.code === 'pattern-missing' && x.detail.pattern === 'core'),
    `expected pattern-missing for core, got ${codes(v).join(', ')}`);
});

test('adding more movements than the cap is refused', () => {
  const proposed = program([
    ...BASE,
    movement('a', { role: 'accessory', pattern: 'push' }),
    movement('b', { role: 'accessory', pattern: 'pull' }),
    movement('c', { role: 'accessory', pattern: 'carry' }),
  ]);
  const v = checkProgramChange(program(BASE), proposed, { today: '2027-01-01' });
  const hit = find(v, 'too-many-additions');
  assert.ok(hit, `expected too-many-additions, got ${codes(v).join(', ')}`);
  assert.equal(hit.severity, 'block');
  assert.ok(PROGRAM_LIMITS.maxAddsPerReview < 3);
});

test('dropping a core movement without a reason is refused', () => {
  const v = checkProgramChange(program(BASE), program(BASE.slice(1)), { today: '2027-01-01' });
  const hit = find(v, 'removal-without-reason');
  assert.ok(hit, `expected removal-without-reason, got ${codes(v).join(', ')}`);
  assert.equal(hit.severity, 'block');
});

test('dropping a core movement with a reason is allowed', () => {
  const proposed = {
    ...program(BASE.slice(1)),
    retired: [{ exId: 'trap-bar-deadlift', reason: 'Aggravates the shin under heavy load.' }],
  };
  const v = checkProgramChange(program(BASE), proposed, { today: '2027-01-01' });
  assert.equal(find(v, 'removal-without-reason'), undefined);
  assert.equal(hasBlocking(v), false, `expected no block, got ${codes(v).join(', ')}`);
});

test('a core movement removed before it has had time to work is a warning', () => {
  const young = [{ ...BASE[0], addedAt: '2026-12-20' }, ...BASE.slice(1)];
  const proposed = {
    ...program(BASE.slice(1)),
    retired: [{ exId: 'trap-bar-deadlift', reason: 'Not enjoying it.' }],
  };
  const v = checkProgramChange(program(young), proposed, { today: '2027-01-01' });
  assert.equal(find(v, 'removed-too-soon')?.severity, 'warn');
  assert.ok(PROGRAM_LIMITS.minWeeksBeforeCoreRemoval >= 4);
});
