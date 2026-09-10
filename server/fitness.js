// The fitness model.
//
// Two layers, deliberately separated:
//
//   PRIMITIVES  — arithmetic on the training log. Daily and rolling load,
//                 intensity distribution, efficiency factor, aerobic
//                 decoupling, per-sport volume. These are just measurements;
//                 they are either right or they are a bug.
//
//   SCORES      — endurance, speed, and goal confidence. These are opinions
//                 expressed as numbers. Every one is scored RELATIVE TO THE
//                 ATHLETE'S OWN HISTORY, because absolute scoring needs
//                 population data this app does not have. They are v0: the
//                 inputs are returned alongside the score so the formula can
//                 be argued with and replaced without touching the plumbing.
//
// Nothing here predicts injury. The literature on acute:chronic load ratios is
// genuinely contested, so the ratio is reported as a descriptive number with
// its own history for context, never as a risk verdict.
import { ENDURANCE_SPORTS, sessionLoad, sessionVolume, sportKey } from '../public/lib/sports.js';
import { isoWeek, mondayOf, parseYmd, weekAdd, weekDates, ymd } from '../public/lib/dates.js';
import { getActivities, getFeedback, getPlan, getWeeks } from './db.js';

const DAY = 86400000;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const pct = (x) => Math.round(clamp01(x) * 100);

/** Heart-rate anchors observed in this athlete's own data. */
export function hrAnchors(activities) {
  let max = 0;
  let minAvg = Infinity;
  for (const a of activities) {
    if (a.hrMax) max = Math.max(max, a.hrMax);
    if (a.hrAvg) minAvg = Math.min(minAvg, a.hrAvg);
  }
  return {
    maxHr: max || 190,
    // Resting heart rate is not in Strava activity data; the easiest observed
    // average is a usable floor for scaling intensity.
    restHr: Number.isFinite(minAvg) ? Math.max(40, Math.round(minAvg - 25)) : 50,
    observed: Boolean(max),
  };
}

/** Metres per minute per beat: higher is a more efficient aerobic engine. */
/** Below this many aerobic minutes in 28 days, a quality share is noise. */
export const MIN_TRUSTED_MINUTES = 240;

export function efficiencyFactor(session) {
  if (sportKey(session.sport) !== 'run') return null;
  if (!session.hrAvg || !session.miles || !session.movingMin) return null;
  const metresPerMin = (session.miles * 1609.344) / session.movingMin;
  return metresPerMin / session.hrAvg;
}

/**
 * The shortest run worth reading drift from.
 *
 * Decoupling is a statement about whether the aerobic system holds up over
 * time, so it needs enough time to hold up over. Six splits was too low a bar:
 * a 6-mile run at 15.4% says almost nothing, because normal early-run drift
 * and a single hilly mile move the number more than aerobic fitness does. The
 * classic protocol is an hour of steady work; 50 minutes lets an ordinary long
 * run in without letting a tempo pretend to be one.
 */
export const DECOUPLING_FLOOR_MIN = 50;

/**
 * Pace-to-heart-rate drift across a run: second half versus first half of
 * speed-per-beat. Above roughly 5% on a steady effort is the classic sign that
 * the aerobic base is not yet supporting the duration.
 *
 * Returns null unless the run is long enough and steady enough to mean it. A
 * workout drifts hugely by design, and reporting that as decoupling would read
 * as a fitness problem when it is just the session doing its job.
 */
export function decoupling(session, { floorMin = DECOUPLING_FLOOR_MIN } = {}) {
  if ((session.movingMin || 0) < floorMin) return null;
  if (session.race || session.runType === 'workout') return null;
  const splits = (session.splits || []).filter((s) => s.paceSecPerMi && s.hrAvg);
  if (splits.length < 6) return null;
  const half = Math.floor(splits.length / 2);
  const ratio = (list) => mean(list.map((s) => (1 / s.paceSecPerMi) / s.hrAvg));
  const first = ratio(splits.slice(0, half));
  const second = ratio(splits.slice(half, half * 2));
  if (!first || !second) return null;
  return ((first - second) / first) * 100;
}

/** Share of a session spent above easy, from heart rate or the plan's label. */
function qualityShare(session, feedback, { maxHr, restHr }) {
  const minutes = session.movingMin || 0;
  if (!minutes) return { minutes: 0, quality: 0 };
  let frac = 0;
  if (session.hrAvg && maxHr > restHr) {
    const hrr = (session.hrAvg - restHr) / (maxHr - restHr);
    // Below ~0.65 of heart-rate reserve is aerobic base; above it counts.
    frac = clamp01((hrr - 0.65) / 0.25);
  } else if (feedback?.rpe) {
    frac = clamp01((feedback.rpe - 5) / 3);
  } else if (session.runType === 'workout' || session.race) {
    frac = 0.6;
  }
  return { minutes, quality: minutes * frac };
}

/**
 * The whole derived picture. One pass over the log, everything downstream
 * reads from this.
 */
export function buildSeries(userId, { days = 400, asOf = null } = {}) {
  // `asOf` rewinds the whole picture to a past date, using only what was known
  // then. Everything downstream reads from this, so passing it here is enough
  // to make the scores answer "what would this have said at the time".
  const end = asOf ? parseYmd(asOf) : new Date();
  const from = ymd(new Date(end.getTime() - days * DAY));
  const cutoff = ymd(end);
  const activities = getActivities(userId, from, 1200).filter((a) => a.date <= cutoff);
  const feedback = new Map(getFeedback(userId, from)
    .filter((f) => f.date <= cutoff)
    .map((f) => [f.sessionId, f]));
  const anchors = hrAnchors(activities);

  const daily = new Map();
  const touch = (date) => {
    if (!daily.has(date)) {
      daily.set(date, { date, load: 0, minutes: 0, quality: 0, sessions: 0, volumes: {}, pain: null });
    }
    return daily.get(date);
  };

  for (const a of activities) {
    const day = touch(a.date);
    const fb = feedback.get(a.id) || null;
    day.load += sessionLoad(a, { feedback: fb, ...anchors });
    day.sessions += 1;
    const q = qualityShare(a, fb, anchors);
    day.minutes += q.minutes;
    day.quality += q.quality;
    const key = sportKey(a.sport);
    day.volumes[key] = (day.volumes[key] || 0) + sessionVolume(a);
    if (fb?.pain != null) day.pain = Math.max(day.pain ?? 0, fb.pain);
  }

  // A continuous daily series, zeros included — rest days are data.
  const series = [];
  const start = parseYmd(from);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = ymd(d);
    series.push(daily.get(date) || { date, load: 0, minutes: 0, quality: 0, sessions: 0, volumes: {}, pain: null });
  }

  return { series, activities, feedback, anchors };
}

/** Rolling windows over the daily series. */
export function rolling(series) {
  const load = series.map((d) => d.load);
  const win = (i, n) => load.slice(Math.max(0, i - n + 1), i + 1);
  return series.map((d, i) => {
    const w7 = win(i, 7);
    const w28 = win(i, 28);
    const acute = mean(w7);
    const chronic = mean(w28);
    const monotony = sd(w7) > 0 ? mean(w7) / sd(w7) : 0;
    return {
      date: d.date,
      load: d.load,
      acute7: acute,
      chronic28: chronic,
      ratio: chronic > 0 ? acute / chronic : 0,
      monotony,
      strain: mean(w7) * 7 * monotony,
    };
  });
}

/** Per-sport volume for each of the last N ISO weeks, plus planned targets. */
export function weeklyVolumes(userId, { weeks = 26, asOf = null } = {}) {
  const end = asOf ? parseYmd(asOf) : new Date();
  const current = isoWeek(end);
  const oldest = weekAdd(current, -weeks);
  const cutoff = ymd(end);
  const activities = getActivities(userId, ymd(mondayOf(oldest)), 1200)
    .filter((a) => a.date <= cutoff);
  const plan = getPlan(userId);
  const weekDocs = new Map(getWeeks(userId, oldest).map((w) => [w.week, w]));

  const out = [];
  for (let i = weeks; i >= 0; i--) {
    const key = weekAdd(current, -i);
    const dates = new Set(weekDates(key));
    const actual = {};
    let sessions = 0;
    for (const a of activities) {
      if (!dates.has(a.date)) continue;
      const sport = sportKey(a.sport);
      actual[sport] = (actual[sport] || 0) + sessionVolume(a);
      sessions += 1;
    }
    const doc = weekDocs.get(key);
    const target = doc?.volumes
      || (doc?.targets?.runMiles != null ? { run: doc.targets.runMiles } : null)
      || legacyTarget(plan, key);
    out.push({ week: key, actual, sessions, target, deload: Boolean(doc?.deload) });
  }
  return out;
}

function legacyTarget(plan, weekKey) {
  const t = plan?.weekTargets?.find((x) => x.week === weekKey);
  if (!t) return null;
  return t.volumes || (t.runMiles != null ? { run: t.runMiles } : null);
}

// ---------------------------------------------------------------------------
// Scores — v0. Opinions, expressed relative to this athlete's own history.
// ---------------------------------------------------------------------------

/**
 * ENDURANCE — how much aerobic work the body is currently carrying, judged
 * against the most it has carried.
 *
 * Three parts: the size of the current chronic load, how consistently it has
 * been accumulated (spiky training builds less than the same total spread
 * evenly), and the longest single session as a share of the athlete's best.
 */
export function enduranceScore(roll, series) {
  const latest = roll[roll.length - 1];
  if (!latest) return null;
  const chronicHistory = roll.map((r) => r.chronic28).filter((x) => x > 0);
  const peakChronic = chronicHistory.length ? Math.max(...chronicHistory) : 0;
  const relative = peakChronic > 0 ? latest.chronic28 / peakChronic : 0;

  const last28 = series.slice(-28);
  const activeDays = last28.filter((d) => d.load > 0).length;
  const consistency = clamp01(activeDays / 20);

  const longest = Math.max(0, ...last28.map((d) => d.minutes));
  const bestLongest = Math.max(0, ...series.map((d) => d.minutes));
  const durability = bestLongest > 0 ? clamp01(longest / bestLongest) : 0;

  const score = pct(relative * 0.6 + consistency * 0.25 + durability * 0.15);
  return {
    score,
    version: 'v0',
    basis: 'relative to your own peak 28-day load',
    inputs: {
      chronic28: round(latest.chronic28),
      peakChronic28: round(peakChronic),
      relative: round(relative, 3),
      activeDaysIn28: activeDays,
      consistency: round(consistency, 3),
      longestSessionMin: Math.round(longest),
      bestSessionMin: Math.round(bestLongest),
      durability: round(durability, 3),
    },
  };
}

/**
 * SPEED — the quality of the work, independent of how much of it there is.
 *
 * Someone riding six easy hours a day scores high on endurance and low here,
 * which is the point. Built from the share of time spent above aerobic base,
 * whether easy pace at a given heart rate is improving, and whether best
 * efforts are trending faster.
 */
export function speedScore(series, activities) {
  const last28 = series.slice(-28);
  const minutes = last28.reduce((n, d) => n + d.minutes, 0);
  const quality = last28.reduce((n, d) => n + d.quality, 0);
  if (!minutes) return null;
  const share = quality / minutes;
  // 12% of total time above aerobic base is a healthy polarized week; treat
  // that as the top of the scale rather than "more is better".
  const rawShareScore = clamp01(share / 0.12);

  /*
   * A share is a ratio, and a ratio off almost no training is noise. Someone
   * hurt, doing one hard half-hour in a month, was scoring a perfect 1.0 on
   * this term — the single heaviest input — and coming out faster than someone
   * training properly. That is backwards exactly when it matters most.
   *
   * So the share is trusted in proportion to the volume behind it, measured
   * against this athlete's own normal month, and shrunk toward neutral when
   * there is not enough. Neutral, not zero: a quiet month is unknown, not slow.
   */
  const window28 = (i) => series.slice(Math.max(0, i - 27), i + 1)
    .reduce((n, d) => n + d.minutes, 0);
  const peak28 = series.reduce((best, _d, i) => Math.max(best, window28(i)), 0);
  const expected = Math.max(MIN_TRUSTED_MINUTES, peak28 * 0.5);
  const trust = clamp01(minutes / expected);
  const shareScore = 0.5 + (rawShareScore - 0.5) * trust;

  const efRuns = activities
    .filter((a) => sportKey(a.sport) === 'run')
    .map((a) => ({ date: a.date, ef: efficiencyFactor(a) }))
    .filter((x) => x.ef)
    .sort((a, b) => a.date.localeCompare(b.date));
  const efTrend = trendPct(efRuns.map((x) => x.ef));

  const efforts = bestEffortTrend(activities);

  const parts = [
    { w: 0.5, v: shareScore },
    { w: 0.3, v: efTrend == null ? null : clamp01(0.5 + efTrend / 10) },
    { w: 0.2, v: efforts.improvementPct == null ? null : clamp01(0.5 + efforts.improvementPct / 10) },
  ].filter((p) => p.v != null);
  const weight = parts.reduce((n, p) => n + p.w, 0);
  const score = weight ? pct(parts.reduce((n, p) => n + p.w * p.v, 0) / weight) : null;

  return {
    score,
    version: 'v0',
    basis: 'intensity distribution, efficiency trend, best-effort trend',
    inputs: {
      minutesIn28: Math.round(minutes),
      qualityMinutesIn28: Math.round(quality),
      qualityShare: round(share, 3),
      qualityShareRaw: round(rawShareScore, 3),
      qualityShareScore: round(shareScore, 3),
      volumeTrust: round(trust, 3),
      trustedAtMinutes: Math.round(expected),
      efficiencyFactorTrendPct: efTrend == null ? null : round(efTrend, 2),
      efficiencySamples: efRuns.length,
      bestEfforts: efforts,
    },
  };
}

/** Percentage change between the first and last third of a series. */
function trendPct(values) {
  if (values.length < 6) return null;
  const third = Math.max(2, Math.floor(values.length / 3));
  const early = mean(values.slice(0, third));
  const late = mean(values.slice(-third));
  if (!early) return null;
  return ((late / early) - 1) * 100;
}

/** Are Strava's best efforts getting faster at the same distances? */
function bestEffortTrend(activities) {
  const byName = new Map();
  for (const a of activities) {
    for (const be of a.bestEfforts || []) {
      if (!be.name || !be.sec) continue;
      if (!byName.has(be.name)) byName.set(be.name, []);
      byName.get(be.name).push({ date: a.date, sec: be.sec });
    }
  }
  const distances = [];
  let improvement = null;
  const samples = [];
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const half = Math.max(1, Math.floor(list.length / 2));
    const early = Math.min(...list.slice(0, half).map((x) => x.sec));
    const late = Math.min(...list.slice(half).map((x) => x.sec));
    const pctFaster = ((early - late) / early) * 100;
    distances.push(pctFaster);
    samples.push({ name, bestSec: Math.min(...list.map((x) => x.sec)), pctFaster: round(pctFaster, 2), n: list.length });
  }
  if (distances.length) improvement = mean(distances);
  return { improvementPct: improvement == null ? null : round(improvement, 2), samples: samples.slice(0, 6) };
}

/**
 * GOAL CONFIDENCE — the odds of arriving, given the training that exists.
 *
 * Volume goals compare the ramp still required against the ramp this athlete
 * has actually sustained. Performance goals compare a predicted time against
 * the target. Both are penalized by symptom frequency, because the most common
 * reason a plan fails is not fitness.
 *
 * Heuristic, not a validated model. The inputs matter more than the number.
 */
export function goalConfidence(goal, { weekly, roll, series, activities, asOf = null }) {
  if (!goal) return null;
  const today = asOf ? parseYmd(asOf) : new Date();
  const weeksLeft = goal.byDate
    ? Math.max(0, Math.round((parseYmd(goal.byDate) - today) / (7 * DAY)))
    : null;

  const painDays = series.slice(-56).filter((d) => (d.pain ?? 0) >= 3).length;
  const painPenalty = clamp01(painDays / 8) * 0.35;

  if (goal.metric === 'weeklyDistance' || goal.metric === 'weeklyDuration' || goal.metric === 'weeklySessions') {
    const sport = sportKey(goal.sport);
    const recent = weekly.slice(-4).map((w) => w.actual[sport] || 0);
    const current = mean(recent);
    const target = Number(goal.target) || 0;
    if (!target) return null;

    const gap = target - current;
    const achieved = sustainedRamp(weekly, sport);
    const requiredPerWeek = weeksLeft ? gap / Math.max(1, weeksLeft) : null;

    let feasibility;
    if (gap <= 0) {
      feasibility = 0.92; // already there; the question becomes holding it
    } else if (requiredPerWeek == null) {
      // No deadline: reachable if any positive ramp exists.
      feasibility = achieved > 0 ? 0.7 : 0.4;
    } else {
      const headroom = achieved > 0 ? achieved / requiredPerWeek : 0;
      feasibility = clamp01(headroom / 1.5) * 0.9;
    }

    const consistency = clamp01(weekly.slice(-8).filter((w) => (w.actual[sport] || 0) > 0).length / 7);
    const score = pct(Math.max(0, feasibility * (0.75 + consistency * 0.25) - painPenalty));
    return {
      score,
      version: 'v0',
      kind: 'volume',
      label: goalLabel(goal),
      inputs: {
        current4wkAvg: round(current),
        target,
        gap: round(gap),
        weeksLeft,
        requiredPerWeek: requiredPerWeek == null ? null : round(requiredPerWeek, 2),
        sustainedRampPerWeek: round(achieved, 2),
        consistency: round(consistency, 2),
        painDaysIn8wk: painDays,
        painPenalty: round(painPenalty, 2),
      },
    };
  }

  if (goal.metric === 'raceTime') {
    const predicted = predictRaceTime(activities, goal.distanceMi);
    const target = Number(goal.target) || 0;
    if (!predicted || !target) {
      return {
        score: null,
        version: 'v0',
        kind: 'performance',
        label: goalLabel(goal),
        inputs: { predictedSec: predicted, target, note: 'Not enough race-pace efforts to predict from yet.' },
      };
    }
    // Every 1% of predicted time above target costs confidence steeply.
    const shortfallPct = ((predicted - target) / target) * 100;
    const base = clamp01(0.5 - shortfallPct / 12);
    const volumeReady = clamp01(mean(roll.slice(-28).map((r) => r.chronic28)) / Math.max(1, peak(roll)) );
    const score = pct(Math.max(0, base * (0.7 + volumeReady * 0.3) - painPenalty));
    return {
      score,
      version: 'v0',
      kind: 'performance',
      label: goalLabel(goal),
      inputs: {
        predictedSec: Math.round(predicted),
        targetSec: target,
        shortfallPct: round(shortfallPct, 2),
        weeksLeft,
        volumeReadiness: round(volumeReady, 2),
        painDaysIn8wk: painDays,
      },
    };
  }

  return null;
}

const peak = (roll) => Math.max(1, ...roll.map((r) => r.chronic28));

/** The weekly increase this athlete has actually sustained, in sport units. */
function sustainedRamp(weekly, sport) {
  const values = weekly.map((w) => w.actual[sport] || 0).filter((v) => v > 0);
  if (values.length < 4) return 0;
  const third = Math.max(2, Math.floor(values.length / 3));
  const early = mean(values.slice(0, third));
  const late = mean(values.slice(-third));
  const spanWeeks = Math.max(1, values.length - third);
  return Math.max(0, (late - early) / spanWeeks);
}

/** Riegel projection from the best effort available. */
export function predictRaceTime(activities, distanceMi) {
  if (!distanceMi) return null;
  const KNOWN = { '400m': 0.2485, '1/2 mile': 0.5, '1k': 0.6214, '1 mile': 1, '2 mile': 2, '5k': 3.107, '10k': 6.214, '15k': 9.321, '10 mile': 10, '20k': 12.427, 'Half-Marathon': 13.109, Marathon: 26.219 };
  let best = null;
  for (const a of activities) {
    for (const be of a.bestEfforts || []) {
      const d = KNOWN[be.name];
      if (!d || !be.sec) continue;
      // Prefer the longest reliable effort — extrapolating from a 400 is noise.
      if (!best || d > best.dist) best = { dist: d, sec: be.sec, name: be.name, date: a.date };
    }
  }
  if (!best) return null;
  return best.sec * ((distanceMi / best.dist) ** 1.06);
}

function goalLabel(goal) {
  if (goal.label) return goal.label;
  if (goal.metric === 'raceTime') return `${goal.distanceMi} mi in ${fmtTime(goal.target)}`;
  return `${goal.target} ${goal.unit || ''} ${goal.sport || ''}`.trim();
}

const fmtTime = (sec) => {
  const s = Math.round(sec || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}` : `${m} min`;
};

/** Everything the dashboard and the coach need, in one call. */
export function fitnessSnapshot(userId, { goals = [], asOf = null } = {}) {
  const { series, activities, anchors } = buildSeries(userId, { asOf });
  const roll = rolling(series);
  const weekly = weeklyVolumes(userId, { weeks: 26, asOf });
  const primary = goals.find((g) => g.primary) || goals[0] || null;

  return {
    version: 'v0',
    asOf,
    computedAt: new Date().toISOString(),
    anchors,
    latest: roll[roll.length - 1] || null,
    endurance: enduranceScore(roll, series),
    speed: speedScore(series, activities),
    confidence: goalConfidence(primary, { weekly, roll, series, activities, asOf }),
    weekly,
    daily: series.slice(-120),
    rollingSeries: roll.slice(-120).map((r) => ({
      date: r.date, acute7: round(r.acute7), chronic28: round(r.chronic28), ratio: round(r.ratio, 2),
    })),
    decoupling: activities
      .filter((a) => sportKey(a.sport) === 'run')
      .map((a) => ({ date: a.date, miles: a.miles, pct: decoupling(a) }))
      .filter((x) => x.pct != null)
      .slice(0, 20),
  };
}

function round(n, digits = 1) {
  const f = 10 ** digits;
  return Math.round((Number(n) || 0) * f) / f;
}
