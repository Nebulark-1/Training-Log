// The evidence behind a goal assessment.
//
// This layer decides what the coach gets to see, so a wrong or missing signal
// here becomes a wrong judgement with no way to notice. Every case below is a
// statement that would change the answer if it came out backwards.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adherenceEvidence, assembleEvidence, evidenceText, historyDepth, rampEvidence,
  strengthEvidence, symptomEvidence, trajectoryEvidence,
} from '../server/evidence.js';

const weeksOf = (values, targets = []) => values.map((v, i) => ({
  week: `2026-W${String(i + 1).padStart(2, '0')}`,
  actual: { run: v },
  target: targets[i] != null ? { run: targets[i] } : null,
  sessions: v > 0 ? 4 : 0,
  deload: false,
}));

// --- how much history is behind the answer --------------------------------

test('history depth is graded, so a thin log cannot masquerade as a strong one', () => {
  assert.equal(historyDepth({ weeksWithVolume: 52, weeksLogged: 52 }).grade, 'strong');
  assert.equal(historyDepth({ weeksWithVolume: 20, weeksLogged: 30 }).grade, 'moderate');
  assert.equal(historyDepth({ weeksWithVolume: 8, weeksLogged: 30 }).grade, 'thin');
  assert.equal(historyDepth({ weeksWithVolume: 2, weeksLogged: 30 }).grade, 'minimal');
});

test('the grade comes with a sentence saying what it means for the answer', () => {
  assert.match(historyDepth({ weeksWithVolume: 2, weeksLogged: 4 }).note, /almost no history/i);
});

// --- the ramp -------------------------------------------------------------

test('the ramp ever held is measured over blocks, not from one big week', () => {
  // A single 60-mile week off a 20-mile base is not a volume anyone held.
  const weekly = weeksOf([20, 20, 20, 60, 20, 20, 20, 20]);
  const r = rampEvidence(weekly, 'run', { target: 60, weeksLeft: 20 });
  assert.equal(r.singleBestWeek, 60);
  assert.ok(r.bestFourWeekAverage < 40, 'a spike must not read as a sustained block');
  assert.equal(r.everReachedTarget, true);
  assert.equal(r.everHeldTarget, false, 'reaching once is not holding');
});

test('a target genuinely held is recorded as held', () => {
  const weekly = weeksOf([40, 42, 41, 43, 42, 41]);
  const r = rampEvidence(weekly, 'run', { target: 40, weeksLeft: 10 });
  assert.equal(r.everHeldTarget, true);
});

test('the required ramp is compared against the fastest one ever sustained', () => {
  const weekly = weeksOf([10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32]);
  const r = rampEvidence(weekly, 'run', { target: 50, weeksLeft: 20 });
  assert.ok(r.fastestRampEverHeld > 1, 'this athlete has climbed roughly 2 mi a week');
  assert.ok(r.requiredRampPerWeek > 0);
  assert.ok(r.rampFeasibilityRatio > 1, 'the required ramp is slower than one already held');
});

test('an impossible ramp shows as a ratio below one', () => {
  const weekly = weeksOf([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const r = rampEvidence(weekly, 'run', { target: 75, weeksLeft: 8 });
  assert.ok(r.rampFeasibilityRatio == null || r.rampFeasibilityRatio < 1);
  assert.equal(r.everReachedTarget, false);
});

test('no deadline means no required ramp rather than a divide by zero', () => {
  const r = rampEvidence(weeksOf([20, 22, 24, 26]), 'run', { target: 50, weeksLeft: null });
  assert.equal(r.requiredRampPerWeek, null);
});

// --- adherence ------------------------------------------------------------

test('a week still in progress is not counted as a shortfall', () => {
  // Judging Wednesday against a whole week's plan invents a failure every time.
  const weekly = weeksOf([30, 30, 12], [30, 30, 30]);
  const withCurrent = adherenceEvidence(weekly, 'run');
  const excluded = adherenceEvidence(weekly, 'run', { currentWeek: '2026-W03' });
  assert.equal(withCurrent.weeksPlanned, 3);
  assert.equal(excluded.weeksPlanned, 2, 'the in-progress week should be dropped');
  assert.equal(excluded.weeksUnder85pct, 0);
});

test('repeated shortfalls against the plan are counted', () => {
  const weekly = weeksOf([30, 20, 18, 15], [30, 30, 30, 30]);
  const a = adherenceEvidence(weekly, 'run');
  assert.equal(a.weeksUnder85pct, 3);
  assert.equal(a.consecutiveShortfalls, 3, 'a run of missed weeks is the signal that matters');
});

test('weeks with no plan are not counted against adherence', () => {
  const a = adherenceEvidence(weeksOf([30, 20, 18]), 'run');
  assert.equal(a.weeksPlanned, 0);
  assert.equal(a.medianHitPct, null);
});

// --- trajectory -----------------------------------------------------------

test('trajectory reports the direction of chronic load over three horizons', () => {
  const roll = Array.from({ length: 120 }, (_, i) => ({
    date: `d${i}`, chronic28: 10 + i * 0.1, acute7: 12, ratio: 1.1,
  }));
  const t = trajectoryEvidence(roll);
  assert.ok(t.changePct28d > 0 && t.changePct56d > 0 && t.changePct84d > 0);
});

test('a recent collapse shows as a negative change over every horizon', () => {
  // The collapse has to fall inside the window being measured: a drop 90 days
  // ago is already the baseline by the time the 28-day comparison looks back.
  const roll = Array.from({ length: 120 }, (_, i) => ({
    date: `d${i}`, chronic28: i < 110 ? 40 : 10, acute7: 8, ratio: 0.8,
  }));
  const t = trajectoryEvidence(roll);
  assert.equal(t.changePct28d, -75);
  assert.equal(t.changePct56d, -75);
  assert.equal(t.changePct84d, -75);
});

test('a collapse older than the window does not keep reading as recent', () => {
  const roll = Array.from({ length: 120 }, (_, i) => ({
    date: `d${i}`, chronic28: i < 90 ? 40 : 10, acute7: 8, ratio: 0.8,
  }));
  const t = trajectoryEvidence(roll);
  assert.equal(t.changePct28d, 0, 'four weeks ago it was already down');
  assert.equal(t.changePct84d, -75, 'but the twelve-week view still sees it');
});

// --- strength -------------------------------------------------------------

const lift = (date, lb, rpe = null) => ({ date, best: { lb, reps: 5 }, rpe, name: 'Trap bar deadlift' });

test('a movement logged once reports its load rather than reading as no lifting', () => {
  // "Nothing logged" and "logged once, at 185" are different facts, and the
  // first would tell the coach the strength work is not happening at all.
  const history = new Map([['trap-bar', [lift('2026-09-08', 185, 8)]]]);
  const s = strengthEvidence(history);
  assert.equal(s.tracked, 0, 'one session is not a trend');
  assert.equal(s.anyLoggedAtAll, true);
  assert.equal(s.loggedOnce[0].currentLb, 185);
});

test('nothing logged at all is distinguishable from nothing trendable', () => {
  const s = strengthEvidence(new Map());
  assert.equal(s.anyLoggedAtAll, false);
});

test('a stalled movement is named', () => {
  const history = new Map([['trap-bar', [
    lift('2026-08-01', 185), lift('2026-08-08', 185), lift('2026-08-15', 185), lift('2026-08-22', 185),
  ]]]);
  const s = strengthEvidence(history);
  assert.deepEqual(s.stalled, ['Trap bar deadlift']);
});

test('a progressing movement is not called stalled', () => {
  const history = new Map([['trap-bar', [
    lift('2026-08-01', 175), lift('2026-08-08', 185), lift('2026-08-15', 195),
  ]]]);
  assert.deepEqual(strengthEvidence(history).stalled, []);
});

test('RPE climbing at an unchanged load is flagged, because recovery is short', () => {
  const history = new Map([['trap-bar', [
    lift('2026-08-01', 185, 7), lift('2026-08-08', 185, 8), lift('2026-08-15', 185, 9),
  ]]]);
  const s = strengthEvidence(history);
  assert.deepEqual(s.rpeRisingOn, ['Trap bar deadlift']);
});

test('bodyweight movements do not pollute the load trend', () => {
  const history = new Map([['plank', [
    { date: '2026-08-01', best: { lb: 0, reps: 45 }, rpe: 7, name: 'Plank' },
    { date: '2026-08-08', best: { lb: 0, reps: 45 }, rpe: 7, name: 'Plank' },
  ]]]);
  const s = strengthEvidence(history);
  assert.equal(s.tracked, 0);
  assert.equal(s.anyLoggedAtAll, false);
});

// --- symptoms -------------------------------------------------------------

const sore = (date, pain, structure) => ({
  date,
  pain,
  sessionId: date,
  site: {
    view: 'front', zone: 'shin', zoneLabel: 'Shin and lower leg, front', side: 'right',
    structure, structureLabel: structure, structureKind: 'muscle',
  },
});

test('a site that keeps coming back is surfaced separately from a one-off', () => {
  const f = [
    sore('2026-07-01', 4, 'tibialis-anterior'),
    sore('2026-07-20', 5, 'tibialis-anterior'),
    sore('2026-08-10', 3, 'tibialis-anterior'),
    sore('2026-08-20', 3, 'soleus'),
  ];
  const s = symptomEvidence(f);
  assert.equal(s.recurringSites.length, 1, 'only the repeated one counts as recurring');
  assert.equal(s.recurringSites[0].times, 3);
  assert.equal(s.distinctSites, 2);
});

test('weeks affected is counted, not just entries', () => {
  const s = symptomEvidence([sore('2026-07-01', 4), sore('2026-07-02', 4)]);
  assert.equal(s.entriesAtOrAbove3, 2);
  assert.equal(s.weeksWithSignificantPain, 1, 'two days in one week is one week lost');
});

test('pain below 3 is recorded but does not count as significant', () => {
  const s = symptomEvidence([sore('2026-07-01', 2)]);
  assert.equal(s.entriesWithPain, 1);
  assert.equal(s.entriesAtOrAbove3, 0);
  assert.equal(s.worst, 2);
});

test('a clean log says so rather than returning nothing', () => {
  const s = symptomEvidence([]);
  assert.equal(s.entriesWithPain, 0);
  assert.deepEqual(s.recurringSites, []);
});

// --- the whole packet -----------------------------------------------------

const bareInputs = {
  goal: { label: '75 mi a week', metric: 'weeklyDistance', sport: 'run', target: 75, byDate: '2027-09-09' },
  weekly: weeksOf([20, 22, 24, 26], [20, 22, 24, 26]),
  roll: Array.from({ length: 120 }, (_, i) => ({ date: `d${i}`, chronic28: 10, acute7: 10, ratio: 1 })),
  series: [],
  activities: [{ date: '2026-08-01', sport: 'run', miles: 6, movingMin: 50, hrAvg: 150, id: 'a1' }],
  feedback: [],
  lifts: new Map(),
};

test('the packet carries every section the prompt needs', () => {
  const e = assembleEvidence(bareInputs);
  for (const key of ['goal', 'history', 'ramp', 'adherence', 'trajectory', 'strength',
    'symptoms', 'fatigue', 'weeklyVolumes']) {
    assert.ok(e[key], `missing ${key}`);
  }
});

test('the rendered text names the target, the ramp and the history grade', () => {
  const text = evidenceText(assembleEvidence(bareInputs));
  assert.match(text, /75/);
  assert.match(text, /fastest ramp/i);
  assert.match(text, /HISTORY:/);
  assert.match(text, /SYMPTOMS:/);
});

test('the packet holds no verdict of its own', () => {
  // The whole point of the split: this layer states facts, the coach judges.
  const e = assembleEvidence(bareInputs);
  const flat = JSON.stringify(e);
  assert.equal(flat.includes('"confidence"'), false, 'evidence must not carry a score');
  assert.equal(flat.includes('"verdict"'), false);
});

test('a goal with no deadline still produces a packet', () => {
  const e = assembleEvidence({ ...bareInputs, goal: { ...bareInputs.goal, byDate: null } });
  assert.equal(e.goal.weeksLeft, null);
  assert.ok(evidenceText(e).length > 100);
});

test('no goal at all does not throw', () => {
  const e = assembleEvidence({ ...bareInputs, goal: null });
  assert.equal(e.goal.label, 'no goal set');
});
