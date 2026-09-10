// The case for and against a goal, assembled from the log.
//
// This module states facts and never reaches a verdict. The verdict is the
// coach's job, because the question — "assuming it goes well from here, will
// this happen?" — needs judgement that arithmetic does not have. A backtest
// showed the old numeric confidence was doing nothing a look at last month's
// volume would not: low volume rises, high volume falls, and a score built
// out of current volume just restates it.
//
// So the point of everything here is to surface what volume alone cannot see.
// Whether the ramp is one this athlete has ever actually held. Whether the
// plan is being executed or quietly abandoned. Whether the bar is still moving
// or every lift has stalled. Whether the same tissue keeps flaring. Whether
// effort at a given pace is drifting up. Those are the things that decide
// whether a goal arrives, and none of them are in the mileage.
//
// `assembleEvidence` is pure and takes plain data, so it can be tested without
// a database; `goalEvidence` is the wrapper that goes and gets that data.
import { getFeedback } from './db.js';
import { liftHistory } from './program.js';
import { buildSeries, decoupling, efficiencyFactor, rolling, weeklyVolumes } from './fitness.js';
import { describeSite, troublePoints } from '../public/lib/body.js';
import { sportInfo, sportKey } from '../public/lib/sports.js';
import { isoWeek, parseYmd, ymd } from '../public/lib/dates.js';

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (n, d = 1) => Math.round((Number(n) || 0) * 10 ** d) / 10 ** d;
const last = (xs, n) => xs.slice(Math.max(0, xs.length - n));

/**
 * How much history is behind all of this.
 *
 * The athlete asked for a score that gets stronger with more history, and the
 * honest way to do that is to say out loud how much there is. Six weeks of log
 * cannot support a confident answer about a goal a year out, and the coach
 * should be told that rather than left to infer it.
 */
export function historyDepth({ weeksLogged, weeksWithVolume, firstDate, lastDate }) {
  const grade = weeksWithVolume >= 40 ? 'strong'
    : weeksWithVolume >= 16 ? 'moderate'
      : weeksWithVolume >= 6 ? 'thin' : 'minimal';
  return {
    weeksLogged,
    weeksWithVolume,
    firstDate,
    lastDate,
    grade,
    note: {
      strong: 'Nearly a year of training to reason from. Trends here are real.',
      moderate: 'Several months of history. Enough for a trend, not enough to be sure of a ceiling.',
      thin: 'Only a few weeks logged. Treat every trend as provisional.',
      minimal: 'Almost no history. Any assessment is mostly about the plan, not the athlete.',
    }[grade],
  };
}

/** Has this athlete ever actually held the ramp the goal now requires? */
export function rampEvidence(weekly, sport, { target, weeksLeft }) {
  const values = weekly.map((w) => w.actual[sport] || 0);
  const active = values.filter((v) => v > 0);
  const recent = mean(last(values, 4).filter((v) => v > 0)) || 0;
  const peak = active.length ? Math.max(...active) : 0;

  // The best four-week average ever reached, which is the real ceiling — a
  // single big week is not a volume this athlete has held.
  let bestBlock = 0;
  for (let i = 3; i < values.length; i++) {
    bestBlock = Math.max(bestBlock, mean(values.slice(i - 3, i + 1)));
  }

  // The fastest sustained climb in the log: the largest rise in four-week
  // average across any eight-week stretch, per week.
  let bestRamp = 0;
  for (let i = 11; i < values.length; i++) {
    const before = mean(values.slice(i - 11, i - 7));
    const after = mean(values.slice(i - 3, i + 1));
    if (before > 0) bestRamp = Math.max(bestRamp, (after - before) / 8);
  }

  const gap = Math.max(0, target - recent);
  const requiredPerWeek = weeksLeft ? gap / Math.max(1, weeksLeft) : null;

  return {
    current4wkAvg: round(recent),
    target,
    gap: round(gap),
    weeksLeft,
    requiredRampPerWeek: requiredPerWeek == null ? null : round(requiredPerWeek, 2),
    fastestRampEverHeld: round(bestRamp, 2),
    bestFourWeekAverage: round(bestBlock),
    singleBestWeek: round(peak),
    everReachedTarget: peak >= target,
    everHeldTarget: bestBlock >= target * 0.95,
    rampFeasibilityRatio: requiredPerWeek && bestRamp
      ? round(bestRamp / requiredPerWeek, 2)
      : null,
  };
}

/**
 * Is the plan being executed, or quietly abandoned?
 *
 * A goal fails long before the deadline, and it usually fails here: the weeks
 * keep getting planned and keep not happening. Volume alone cannot see this,
 * because a week can hit its mileage with none of the sessions that mattered.
 */
export function adherenceEvidence(weekly, sport, { currentWeek = null } = {}) {
  // A week still being trained has not fallen short of anything. Comparing a
  // Wednesday against a whole week's plan invents a shortfall every time.
  const withTarget = weekly
    .filter((w) => w.week !== currentWeek)
    .filter((w) => w.target && (w.target[sport] || 0) > 0);
  const rows = withTarget.map((w) => ({
    week: w.week,
    planned: round(w.target[sport] || 0),
    actual: round(w.actual[sport] || 0),
    hitPct: Math.round(((w.actual[sport] || 0) / (w.target[sport] || 1)) * 100),
  }));
  const recent = last(rows, 8);
  const shortfalls = recent.filter((r) => r.hitPct < 85);
  return {
    weeksPlanned: rows.length,
    excludedInProgress: currentWeek,
    recent,
    medianHitPct: recent.length
      ? [...recent].sort((a, b) => a.hitPct - b.hitPct)[Math.floor(recent.length / 2)].hitPct
      : null,
    weeksUnder85pct: shortfalls.length,
    consecutiveShortfalls: recent.reduce((run, r) => (r.hitPct < 85 ? run + 1 : 0), 0),
  };
}

/** Which way the chronic load is pointing, over three horizons. */
export function trajectoryEvidence(roll) {
  const at = (back) => roll[roll.length - 1 - back]?.chronic28 ?? null;
  const now = at(0);
  const trend = (back) => {
    const then = at(back);
    return then && now ? round(((now / then) - 1) * 100, 1) : null;
  };
  return {
    chronic28: round(now),
    acute7: round(roll[roll.length - 1]?.acute7),
    ratio: round(roll[roll.length - 1]?.ratio, 2),
    changePct28d: trend(28),
    changePct56d: trend(56),
    changePct84d: trend(84),
  };
}

/**
 * Is the strength work still progressing?
 *
 * Repeated holds are the earliest honest signal that recovery is not keeping
 * up — the bar stops moving weeks before the running falls apart. RPE creeping
 * up at an unchanged load says the same thing louder.
 */
export function strengthEvidence(history, { blocks = 4 } = {}) {
  const movements = [];
  const tooNew = [];
  for (const [exId, records] of history) {
    const byDate = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const loaded = byDate.filter((r) => r.best?.lb > 0);
    if (!loaded.length) continue;
    // One session is a starting point, not a trend. Say the load anyway:
    // "nothing logged" and "logged once, at 185" are different facts, and
    // reporting the first when the second is true reads as no strength work.
    if (loaded.length < 2) {
      tooNew.push({
        exId,
        name: records[0].name,
        sessions: loaded.length,
        currentLb: loaded[loaded.length - 1].best.lb,
        rpe: loaded[loaded.length - 1].rpe ?? null,
      });
      continue;
    }
    const recent = last(loaded, blocks + 1);

    let progressed = 0;
    let held = 0;
    let regressed = 0;
    for (let i = 1; i < recent.length; i++) {
      const change = recent[i].best.lb - recent[i - 1].best.lb;
      if (change > 0) progressed += 1;
      else if (change < 0) regressed += 1;
      else held += 1;
    }
    const rpes = recent.map((r) => r.rpe).filter((x) => x != null);
    movements.push({
      exId,
      name: records[0].name,
      sessions: loaded.length,
      currentLb: recent[recent.length - 1].best.lb,
      changeLbOverBlocks: recent[recent.length - 1].best.lb - recent[0].best.lb,
      progressed,
      held,
      regressed,
      rpeFirst: rpes[0] ?? null,
      rpeLast: rpes[rpes.length - 1] ?? null,
      rpeRising: rpes.length >= 2 && rpes[rpes.length - 1] > rpes[0],
    });
  }
  movements.sort((a, b) => b.sessions - a.sessions);
  tooNew.sort((a, b) => b.currentLb - a.currentLb);
  const stalled = movements.filter((m) => m.progressed === 0 && m.held + m.regressed >= 2);
  return {
    movements: movements.slice(0, 10),
    tracked: movements.length,
    loggedOnce: tooNew.slice(0, 10),
    anyLoggedAtAll: movements.length + tooNew.length > 0,
    stalled: stalled.map((m) => m.name),
    anyRegressing: movements.some((m) => m.regressed >= 2),
    rpeRisingOn: movements.filter((m) => m.rpeRising).map((m) => m.name),
  };
}

/**
 * What has hurt, how often, and whether it is the same thing coming back.
 *
 * A recurring site is a different problem from a new ache, and it is the one
 * that ends goals. Weeks lost matters more than a pain rating.
 */
export function symptomEvidence(feedback, { weeks = 26 } = {}) {
  const painful = feedback.filter((f) => (f.pain ?? 0) > 0);
  const significant = painful.filter((f) => (f.pain ?? 0) >= 3);
  const rows = troublePoints(painful);
  const recurring = rows.filter((r) => r.count >= 3);

  const weeksAffected = new Set(significant.map((f) => isoWeek(parseYmd(f.date))));
  const recent = significant.filter((f) => f.date >= ymd(new Date(Date.now() - 42 * 86400000)));

  return {
    entriesWithPain: painful.length,
    entriesAtOrAbove3: significant.length,
    worst: painful.reduce((n, f) => Math.max(n, f.pain || 0), 0),
    weeksWithSignificantPain: weeksAffected.size,
    inLast6Weeks: recent.length,
    distinctSites: rows.length,
    recurringSites: recurring.map((r) => ({
      site: r.label, times: r.count, worst: r.worst, first: r.first, last: r.last,
    })),
    mostRecent: painful.length
      ? { date: painful[0].date, pain: painful[0].pain, site: describeSite(painful[0].site) || painful[0].painSite || '' }
      : null,
  };
}

/**
 * Is the same work costing more than it did?
 *
 * Efficiency factor drifting down, or decoupling creeping up on long runs, is
 * fatigue showing up in the data before the athlete reports it.
 */
export function fatigueEvidence(activities, feedback) {
  const fb = new Map(feedback.map((f) => [f.sessionId, f]));
  const runs = activities
    .filter((a) => sportKey(a.sport) === 'run')
    .sort((a, b) => a.date.localeCompare(b.date));

  const efs = runs.map((a) => ({ date: a.date, ef: efficiencyFactor(a) })).filter((x) => x.ef);
  const half = Math.floor(efs.length / 2);
  const efEarly = mean(efs.slice(0, half).map((x) => x.ef));
  const efLate = mean(efs.slice(half).map((x) => x.ef));

  const drift = runs
    .map((a) => ({ date: a.date, miles: round(a.miles), pct: decoupling(a) }))
    .filter((x) => x.pct != null);

  const rpes = runs
    .map((a) => ({ date: a.date, rpe: fb.get(a.id)?.rpe, feel: fb.get(a.id)?.feel }))
    .filter((x) => x.rpe != null);
  const rpeEarly = mean(last(rpes.slice(0, Math.floor(rpes.length / 2)), 10).map((x) => x.rpe));
  const rpeLate = mean(last(rpes, 10).map((x) => x.rpe));
  const feels = rpes.map((x) => x.feel).filter((x) => x != null);

  return {
    efficiencySamples: efs.length,
    efficiencyChangePct: efEarly ? round(((efLate / efEarly) - 1) * 100, 1) : null,
    longRunDrift: last(drift, 6).map((d) => ({ date: d.date, miles: d.miles, pct: round(d.pct, 1) })),
    rpeSamples: rpes.length,
    rpeRecentAvg: rpes.length ? round(rpeLate, 1) : null,
    rpeEarlierAvg: rpes.length >= 4 ? round(rpeEarly, 1) : null,
    rpeRising: rpes.length >= 6 && rpeLate > rpeEarly + 0.5,
    feelRecentAvg: feels.length ? round(mean(last(feels, 10)), 1) : null,
  };
}

/** The whole case, from data already in hand. Pure: no database. */
export function assembleEvidence({
  goal, weekly, roll, series, activities, feedback, lifts, asOf = null,
}) {
  const sport = sportKey(goal?.sport || 'run');
  const info = sportInfo(sport);
  const today = asOf ? parseYmd(asOf) : new Date();
  const weeksLeft = goal?.byDate
    ? Math.max(0, Math.round((parseYmd(goal.byDate) - today) / (7 * 86400000)))
    : null;

  const weeksWithVolume = weekly.filter((w) => Object.values(w.actual).some((v) => v > 0)).length;
  const dates = activities.map((a) => a.date).sort();

  return {
    goal: {
      label: goal?.label || goal?.metric || 'no goal set',
      metric: goal?.metric || null,
      sport,
      unit: info.unit,
      target: Number(goal?.target) || null,
      byDate: goal?.byDate || null,
      weeksLeft,
    },
    history: historyDepth({
      weeksLogged: weekly.length,
      weeksWithVolume,
      firstDate: dates[0] || null,
      lastDate: dates[dates.length - 1] || null,
    }),
    ramp: rampEvidence(weekly, sport, { target: Number(goal?.target) || 0, weeksLeft }),
    adherence: adherenceEvidence(weekly, sport, { currentWeek: isoWeek(today) }),
    trajectory: trajectoryEvidence(roll),
    strength: strengthEvidence(lifts),
    symptoms: symptomEvidence(feedback),
    fatigue: fatigueEvidence(activities, feedback),
    weeklyVolumes: last(weekly, 16).map((w) => ({
      week: w.week,
      actual: round(w.actual[sport] || 0),
      target: w.target ? round(w.target[sport] || 0) : null,
      deload: w.deload,
    })),
  };
}

/** The same, going to the database for the inputs. */
export function goalEvidence(userId, goal, { asOf = null } = {}) {
  const { series, activities } = buildSeries(userId, { asOf });
  const cutoff = asOf || ymd(new Date());
  return assembleEvidence({
    goal,
    weekly: weeklyVolumes(userId, { weeks: 52, asOf }),
    roll: rolling(series),
    series,
    activities,
    feedback: getFeedback(userId, '2000-01-01').filter((f) => f.date <= cutoff),
    lifts: liftHistory(userId, { since: '2000-01-01' }),
    asOf,
  });
}

/** A compact, readable rendering for the prompt. */
export function evidenceText(e) {
  const L = [];
  const yes = (b) => (b ? 'yes' : 'no');
  L.push(`GOAL: ${e.goal.label}`);
  if (e.goal.target) L.push(`  target ${e.goal.target} ${e.goal.unit} per week${e.goal.byDate ? ` by ${e.goal.byDate}` : ' (no deadline)'}`);
  if (e.goal.weeksLeft != null) L.push(`  ${e.goal.weeksLeft} weeks left`);

  L.push('', `HISTORY: ${e.history.grade} — ${e.history.weeksWithVolume} weeks with training logged`);
  L.push(`  ${e.history.note}`);
  if (e.history.firstDate) L.push(`  log runs ${e.history.firstDate} to ${e.history.lastDate}`);

  const r = e.ramp;
  L.push('', 'THE RAMP REQUIRED, AGAINST THE ONE EVER ACHIEVED:');
  L.push(`  now ${r.current4wkAvg} ${e.goal.unit}/wk (4-week average), target ${r.target}, gap ${r.gap}`);
  if (r.requiredRampPerWeek != null) L.push(`  needs +${r.requiredRampPerWeek} ${e.goal.unit}/wk sustained`);
  L.push(`  fastest ramp this athlete has ever held: +${r.fastestRampEverHeld} ${e.goal.unit}/wk`);
  if (r.rampFeasibilityRatio != null) L.push(`  ratio of achieved to required: ${r.rampFeasibilityRatio}x`);
  L.push(`  best 4-week average ever: ${r.bestFourWeekAverage}; single best week: ${r.singleBestWeek}`);
  L.push(`  has ever reached the target in a week: ${yes(r.everReachedTarget)}; has ever HELD it: ${yes(r.everHeldTarget)}`);

  const a = e.adherence;
  L.push('', 'IS THE PLAN ACTUALLY BEING EXECUTED:');
  if (a.excludedInProgress) L.push(`  (${a.excludedInProgress} is still in progress and is not counted)`);
  if (!a.weeksPlanned) L.push('  no finished weeks with a plan to compare against yet');
  else {
    L.push(`  ${a.weeksPlanned} weeks planned; median ${a.medianHitPct}% of planned volume hit`);
    L.push(`  weeks under 85% of plan, last 8: ${a.weeksUnder85pct}; consecutive right now: ${a.consecutiveShortfalls}`);
    for (const w of a.recent) L.push(`    ${w.week}  planned ${w.planned}, did ${w.actual} (${w.hitPct}%)`);
  }

  const t = e.trajectory;
  L.push('', 'WHERE THE LOAD IS POINTING:');
  L.push(`  chronic 28-day load ${t.chronic28}, acute 7-day ${t.acute7}, ratio ${t.ratio}`);
  L.push(`  chronic load change: ${t.changePct28d ?? '—'}% over 4 weeks, ${t.changePct56d ?? '—'}% over 8, ${t.changePct84d ?? '—'}% over 12`);

  const s = e.strength;
  L.push('', 'IS THE BAR STILL MOVING:');
  if (!s.anyLoggedAtAll) L.push('  no loaded lifts logged at all');
  else if (!s.tracked) {
    L.push('  lifting has started but no movement has two loaded sessions yet, so there is');
    L.push('  no progression to read. Current loads:');
    for (const m of s.loggedOnce) {
      L.push(`    ${m.name}: ${m.currentLb} lb${m.rpe ? ` at RPE ${m.rpe}` : ''} (1 session)`);
    }
  } else {
    L.push(`  ${s.tracked} movements tracked; stalled: ${s.stalled.length ? s.stalled.join(', ') : 'none'}`);
    if (s.rpeRisingOn.length) L.push(`  RPE rising at unchanged load on: ${s.rpeRisingOn.join(', ')}`);
    for (const m of s.movements.slice(0, 6)) {
      L.push(`    ${m.name}: ${m.currentLb} lb, ${m.progressed} up / ${m.held} held / ${m.regressed} down`
        + `${m.rpeLast ? `, RPE ${m.rpeFirst ?? '?'} -> ${m.rpeLast}` : ''}`);
    }
    for (const m of s.loggedOnce) {
      L.push(`    ${m.name}: ${m.currentLb} lb, only 1 session — no trend yet`);
    }
  }

  const y = e.symptoms;
  L.push('', 'SYMPTOMS:');
  L.push(`  ${y.entriesAtOrAbove3} sessions at 3/10 or above across ${y.weeksWithSignificantPain} weeks; worst ${y.worst}/10`);
  L.push(`  in the last 6 weeks: ${y.inLast6Weeks}`);
  if (y.recurringSites.length) {
    L.push('  recurring sites (3+ times) — these are what end goals:');
    for (const site of y.recurringSites) L.push(`    ${site.site}: ${site.times}x, worst ${site.worst}/10, ${site.first} to ${site.last}`);
  } else L.push('  no site has recurred three times');

  const f = e.fatigue;
  L.push('', 'IS THE SAME WORK COSTING MORE:');
  if (f.efficiencyChangePct != null) L.push(`  efficiency factor ${f.efficiencyChangePct > 0 ? 'up' : 'down'} ${Math.abs(f.efficiencyChangePct)}% over the log (${f.efficiencySamples} runs)`);
  if (f.rpeRecentAvg != null) L.push(`  RPE recent average ${f.rpeRecentAvg}${f.rpeEarlierAvg != null ? ` against ${f.rpeEarlierAvg} earlier` : ''}${f.rpeRising ? ' — rising' : ''}`);
  if (f.feelRecentAvg != null) L.push(`  how the body has felt, recent average ${f.feelRecentAvg}/5`);
  if (f.longRunDrift.length) {
    L.push('  drift on long runs (higher means the aerobic base is not holding the duration):');
    for (const d of f.longRunDrift) L.push(`    ${d.date}  ${d.miles} mi  ${d.pct}%`);
  } else L.push('  no long runs long enough to read drift from');

  L.push('', 'WEEKLY VOLUME, MOST RECENT LAST:');
  for (const w of e.weeklyVolumes) {
    L.push(`  ${w.week}  ${w.actual}${w.target ? ` of ${w.target} planned` : ''}${w.deload ? '  (deload)' : ''}`);
  }
  return L.join('\n');
}
