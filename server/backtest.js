// Does the confidence number mean anything?
//
// The scores have never been checked against what actually happened. This
// rewinds the model week by week, computes what it would have said using only
// the data available at the time, and lines that up against how the following
// weeks actually went. Nothing here changes a score — it only measures them.
//
//   npm run backtest
//   npm run backtest -- --horizon=6 --lead=10
//
// The honest reading of a small sample is "this is weak evidence", so the
// report says how many points it had rather than only the correlation.
import { getActivities, getFeedback, getPlan, listGoals } from './db.js';
import { fitnessSnapshot } from './fitness.js';
import { isoWeek, mondayOf, parseYmd, weekAdd, weekDates, ymd } from '../public/lib/dates.js';
import { sportKey } from '../public/lib/sports.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Spearman rank correlation: does a higher score go with a better outcome?
 *
 * Rank-based on purpose. The scores are ordinal opinions on a 0-100 scale, not
 * measurements, so how far apart two of them are means much less than which
 * one is higher.
 */
export function spearman(pairs) {
  const n = pairs.length;
  if (n < 4) return null;
  const rank = (values) => {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(n);
    for (let i = 0; i < n;) {
      let j = i;
      while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[order[k][1]] = r;
      i = j + 1;
    }
    return out;
  };
  const rx = rank(pairs.map((p) => p[0]));
  const ry = rank(pairs.map((p) => p[1]));
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

/** Volume actually recorded in one ISO week, in the sport's own units. */
function weekVolume(activities, weekKey, sport) {
  const dates = new Set(weekDates(weekKey));
  let total = 0;
  for (const a of activities) {
    if (!dates.has(a.date) || sportKey(a.sport) !== sport) continue;
    total += sport === 'swim' ? (a.yards || 0) : sport === 'bike' ? (a.movingMin || 0) : (a.miles || 0);
  }
  return total;
}

/**
 * One evaluation point: what the model said at the end of `weekKey`, and what
 * the next `horizon` weeks actually did.
 *
 * The outcome is the change in four-week average volume, because that is what
 * a volume goal is asking about — a single good week is not progress.
 */
function evaluate(userId, weekKey, { goals, activities, painDays, horizon, sport }) {
  const asOf = ymd(new Date(mondayOf(weekKey).getTime() + 6 * 86400000));
  const snap = fitnessSnapshot(userId, { goals, asOf });

  const before = mean([0, 1, 2, 3].map((i) => weekVolume(activities, weekAdd(weekKey, -i), sport)));
  const after = mean([0, 1, 2, 3].map((i) => weekVolume(activities, weekAdd(weekKey, horizon - i), sport)));
  if (!before) return null;

  // Did it hurt in the weeks that followed? For an athlete whose goal keeps
  // being interrupted by symptoms, this is the outcome that matters most, and
  // it does not mean-revert the way a volume ratio does.
  let sore = 0;
  for (let i = 1; i <= horizon; i++) {
    const dates = new Set(weekDates(weekAdd(weekKey, i)));
    if (painDays.some((d) => dates.has(d))) sore += 1;
  }

  return {
    week: weekKey,
    asOf,
    endurance: snap.endurance?.score ?? null,
    speed: snap.speed?.score ?? null,
    confidence: snap.confidence?.score ?? null,
    before: Math.round(before * 10) / 10,
    after: Math.round(after * 10) / 10,
    changePct: Math.round(((after / before) - 1) * 1000) / 10,
    changeAbs: Math.round((after - before) * 10) / 10,
    soreWeeks: sore,
  };
}

/**
 * Walk the history and score the model against it.
 *
 * `lead` is how many weeks of data have to exist before a point is worth
 * evaluating — the scores are all relative to the athlete's own past, so the
 * first weeks of a log have nothing to be relative to.
 */
export function backtest(userId, { horizon = 8, lead = 8 } = {}) {
  const goals = listGoals(userId);
  const primary = goals.find((g) => g.primary) || goals[0] || null;
  const sport = sportKey(primary?.sport || 'run');
  const activities = getActivities(userId, '2000-01-01', 5000);
  if (!activities.length) return { error: 'No activities to test against.' };
  const painDays = getFeedback(userId, '2000-01-01')
    .filter((f) => (f.pain ?? 0) >= 3)
    .map((f) => f.date);

  const dates = activities.map((a) => a.date).sort();
  const firstWeek = isoWeek(parseYmd(dates[0]));
  const lastWeek = isoWeek(parseYmd(dates[dates.length - 1]));

  const points = [];
  let week = weekAdd(firstWeek, lead);
  while (week <= weekAdd(lastWeek, -horizon)) {
    const point = evaluate(userId, week, { goals, activities, painDays, horizon, sport });
    if (point) points.push(point);
    week = weekAdd(week, 1);
  }

  const usable = points.filter((p) => p.confidence != null);
  const rho = (key, outcome) => spearman(
    points.filter((p) => p[key] != null).map((p) => [p[key], p[outcome]]),
  );

  /*
   * The baseline is the whole point of the report.
   *
   * Volume that is low goes up and volume that is high comes down, so ANY
   * score that tracks current volume will correlate with what follows, whether
   * or not it knows anything. `before` is that trivial predictor: last month's
   * volume, no model at all. A score only earns its place by beating it.
   */
  const outcomes = ['changePct', 'changeAbs', 'soreWeeks'];
  const correlation = {};
  for (const outcome of outcomes) {
    correlation[outcome] = {
      confidence: rho('confidence', outcome),
      endurance: rho('endurance', outcome),
      speed: rho('speed', outcome),
      baselineVolume: rho('before', outcome),
    };
  }

  return {
    userId,
    goal: primary ? { label: primary.label || primary.metric, sport, target: primary.target } : null,
    sport,
    horizonWeeks: horizon,
    span: { from: points[0]?.week ?? null, to: points[points.length - 1]?.week ?? null },
    points,
    n: points.length,
    withConfidence: usable.length,
    correlation,
  };
}

/** Terciles of a score against the outcome that followed, for the report. */
export function buckets(points, key, labels = ['low', 'middle', 'high']) {
  const have = points.filter((p) => p[key] != null).sort((a, b) => a[key] - b[key]);
  if (have.length < 3) return [];
  const size = Math.floor(have.length / 3);
  const cuts = [have.slice(0, size), have.slice(size, size * 2), have.slice(size * 2)];
  return cuts.map((group, i) => ({
    band: labels[i],
    n: group.length,
    scoreRange: group.length ? `${group[0][key]}-${group[group.length - 1][key]}` : '',
    medianChangePct: group.length
      ? [...group].sort((a, b) => a.changePct - b.changePct)[Math.floor(group.length / 2)].changePct
      : null,
  }));
}

export const hasPlan = (userId) => Boolean(getPlan(userId));
