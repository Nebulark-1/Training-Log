// The fitness model is opinion expressed as arithmetic, so what matters is
// that the opinions are the ones we meant to hold. Two of these are
// regressions for scores that said the opposite of the truth.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECOUPLING_FLOOR_MIN, MIN_TRUSTED_MINUTES, decoupling, efficiencyFactor,
  enduranceScore, predictRaceTime, rolling, speedScore,
} from '../server/fitness.js';

const DAY = 86400000;

/** A daily series ending today: `plan(i)` gives the day i days from the start. */
function series(days, plan) {
  const start = Date.now() - (days - 1) * DAY;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(start + i * DAY);
    return {
      date: d.toISOString().slice(0, 10),
      load: 0, minutes: 0, quality: 0, sessions: 0, volumes: {}, pain: null,
      ...plan(i, days),
    };
  });
}

/** Runs every other day at `min` minutes, of which `qFrac` is above base. */
const training = (min, qFrac) => (i) => (i % 2 === 0
  ? { minutes: min, quality: min * qFrac, load: min, sessions: 1, volumes: { run: min / 9 } }
  : {});

// --- speed must not reward a collapse -------------------------------------

test('a collapsed month does not score faster than a full one', () => {
  // The bug: quality share is a ratio, and one hard half-hour in an otherwise
  // empty month is a share of 1.0. That scored a perfect mark on the heaviest
  // input, so being injured made the athlete look fast.
  const healthy = series(200, training(60, 0.12));
  const collapsed = [
    ...series(200, training(60, 0.12)).slice(0, 172),
    ...series(28, (i) => (i === 14 ? { minutes: 30, quality: 30, load: 30, sessions: 1 } : {})),
  ];

  const a = speedScore(healthy, []);
  const b = speedScore(collapsed, []);
  assert.ok(a.score > b.score,
    `a full month (${a.score}) should score above a collapsed one (${b.score})`);
});

test('the quality share is trusted in proportion to the volume behind it', () => {
  const healthy = speedScore(series(200, training(60, 0.12)), []);
  const collapsed = speedScore([
    ...series(200, training(60, 0.12)).slice(0, 172),
    ...series(28, (i) => (i === 14 ? { minutes: 30, quality: 30, load: 30, sessions: 1 } : {})),
  ], []);

  assert.ok(healthy.inputs.volumeTrust > 0.8, 'a normal month should be trusted');
  assert.ok(collapsed.inputs.volumeTrust < 0.2, 'a near-empty month should not be');
  assert.equal(collapsed.inputs.qualityShareRaw, 1, 'the raw share really is 1.0');
  assert.ok(collapsed.inputs.qualityShareScore < 0.6,
    'but it should be shrunk almost all the way to neutral');
});

test('an untrusted month is shrunk toward neutral, not toward zero', () => {
  // A quiet month is unknown, not slow. Pushing it to zero would be just as
  // wrong as the inflation it replaced.
  const barelyAny = speedScore(
    series(200, (i) => (i === 190 ? { minutes: 20, quality: 0, load: 20, sessions: 1 } : {})),
    [],
  );
  assert.ok(barelyAny.score >= 35 && barelyAny.score <= 65,
    `expected something near neutral, got ${barelyAny.score}`);
});

test('all else equal, more quality still scores higher', () => {
  const easy = speedScore(series(200, training(60, 0.02)), []);
  const mixed = speedScore(series(200, training(60, 0.12)), []);
  assert.ok(mixed.score > easy.score, 'the score still has to respond to actual intensity');
});

test('the trust floor is a real number of minutes', () => {
  assert.ok(MIN_TRUSTED_MINUTES >= 120, 'a floor below two hours a month would not be a floor');
});

// --- decoupling needs a run long enough to mean something -----------------

/** A run that drifts by roughly `driftPct` between halves. */
function drifting(minutes, splitCount, driftPct, extra = {}) {
  const splits = Array.from({ length: splitCount }, (_, i) => ({
    mi: i + 1,
    paceSecPerMi: 480 * (i < splitCount / 2 ? 1 : 1 + driftPct / 100),
    hrAvg: 150,
  }));
  return { sport: 'run', movingMin: minutes, miles: splitCount, splits, ...extra };
}

test('a short run is not read for drift at all', () => {
  // A 6-mile run flagged at 15.4% was noise: early-run drift and one hilly
  // mile move the number more than aerobic fitness does.
  assert.equal(decoupling(drifting(45, 6, 15)), null);
  assert.ok(DECOUPLING_FLOOR_MIN >= 45, 'the floor should be most of an hour');
});

test('a long steady run is read', () => {
  const pct = decoupling(drifting(75, 10, 8));
  assert.ok(typeof pct === 'number', 'a 75-minute steady run should produce a number');
  assert.ok(pct > 0, 'and it drifted, so the number should be positive');
});

test('a workout is not decoupling, it is a workout', () => {
  assert.equal(decoupling(drifting(75, 10, 20, { runType: 'workout' })), null);
  assert.equal(decoupling(drifting(75, 10, 20, { race: true })), null);
});

test('a long run with too few splits is still refused', () => {
  assert.equal(decoupling(drifting(90, 4, 8)), null);
});

test('a steady run that holds pace shows little drift', () => {
  const pct = decoupling(drifting(75, 10, 0));
  assert.ok(Math.abs(pct) < 1, `expected near zero, got ${pct}`);
});

// --- the simpler measures --------------------------------------------------

test('efficiency factor rises when the same heart rate carries more speed', () => {
  const slow = efficiencyFactor({ sport: 'run', miles: 6, movingMin: 54, hrAvg: 150 });
  const fast = efficiencyFactor({ sport: 'run', miles: 6, movingMin: 48, hrAvg: 150 });
  assert.ok(fast > slow);
});

test('efficiency factor needs all three of its inputs', () => {
  assert.equal(efficiencyFactor({ sport: 'run', miles: 6, movingMin: 54 }), null);
  assert.equal(efficiencyFactor({ sport: 'bike', miles: 6, movingMin: 54, hrAvg: 150 }), null);
});

test('endurance tracks the load actually being carried', () => {
  const building = enduranceScore(rolling(series(200, training(60, 0.1))), series(200, training(60, 0.1)));
  const detrained = series(200, (i) => (i < 150 ? training(60, 0.1)(i) : {}));
  const after = enduranceScore(rolling(detrained), detrained);
  assert.ok(building.score > after.score, 'stopping should cost endurance');
});

test('endurance is measured against this athlete, not an absolute', () => {
  const s = series(200, training(60, 0.1));
  const e = enduranceScore(rolling(s), s);
  assert.match(e.basis, /your own/);
  assert.ok(e.inputs.peakChronic28 > 0);
});

test('a race prediction needs an effort to predict from', () => {
  assert.equal(predictRaceTime([], 26.2), null);
  assert.equal(predictRaceTime([{ sport: 'run', miles: 6, movingMin: 45 }], 0), null);
});

test('a longer race is predicted slower per mile than a shorter one', () => {
  const acts = [{ sport: 'run', date: '2026-09-01', miles: 6.2, movingMin: 40, source: 'strava' }];
  const tenK = predictRaceTime(acts, 6.2);
  const marathon = predictRaceTime(acts, 26.2);
  if (tenK && marathon) {
    assert.ok(marathon / 26.2 > tenK / 6.2, 'Riegel has to slow down over distance');
  }
});
