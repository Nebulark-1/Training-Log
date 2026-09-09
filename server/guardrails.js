// Guardrails: the training rules, enforced in code.
//
// The coaching prompt states these rules too, but a prompt is a request. For
// anything that could get someone hurt — a volume spike, a load increase on
// top of pain — the check belongs here, where a violation can actually stop a
// plan from being stored.
//
// Severity is the whole design:
//   block  the plan is refused; the caller must fix it or override explicitly
//   warn   the plan is stored with the violation attached and surfaced
import { ENDURANCE_SPORTS, sportInfo, sportKey } from '../public/lib/sports.js';
import { PATTERNS } from '../public/lib/movements.js';

const HARD = new Set(['tempo', 'intervals', 'threshold', 'race', 'hills', 'vo2', 'speed', 'fartlek']);

const violation = (code, severity, message, detail = {}) => ({ code, severity, message, detail });

/** Per-sport volume in a planned week, in that sport's own units. */
export function plannedVolumes(weekDoc) {
  const out = {};
  for (const day of weekDoc.days || []) {
    for (const s of day.sessions || []) {
      const key = sportKey(s.sport);
      const info = sportInfo(s.sport);
      const add = info.metric === 'sessions'
        ? 1
        : info.metric === 'duration'
          ? (s.minutes || 0)
          : key === 'swim' ? (s.yards || s.miles || 0) : (s.miles || 0);
      out[key] = (out[key] || 0) + add;
    }
  }
  return out;
}

/**
 * Check a planned week against the athlete's recent history.
 *
 * @param plan        the normalized week document about to be stored
 * @param history     { volumesByWeek: {weekKey: {sport: volume}}, weekKeys: [oldest..newest] }
 * @param context     { settings, recentPain: [{date, pain, site}], priorWeeks: [weekDoc] }
 */
export function checkWeekPlan(plan, history, context = {}) {
  const out = [];
  const volumes = plannedVolumes(plan);
  const prev = history.previous || {};
  // The baseline is the best of the last few weeks, not simply the last one.
  // Otherwise the ordinary deload-then-resume pattern — 36, deload to 28, back
  // to 38 — reads as a 36% spike, and every fourth week would be refused.
  const baseline = history.baseline || prev;

  // --- volume progression, per sport, in that sport's own units -----------
  for (const sport of ENDURANCE_SPORTS) {
    const planned = volumes[sport] || 0;
    const last = baseline[sport] || 0;
    if (!planned || !last) continue;
    const info = sportInfo(sport);
    const allowedPct = info.step.pctPerWeek / 100;
    const allowedAbs = info.step.absPerWeek;
    const ceiling = Math.min(last * (1 + allowedPct), last + allowedAbs);
    if (planned > ceiling) {
      const over = ((planned / last - 1) * 100).toFixed(0);
      const severity = planned > ceiling * 1.5 ? 'block' : 'warn';
      out.push(violation(
        'volume-jump',
        severity,
        `${info.label} volume jumps ${over}% (${round(last)} → ${round(planned)} ${info.unit}). `
        + `The step ceiling is ${round(ceiling)} ${info.unit}.`,
        { sport, last, planned, ceiling },
      ));
    }
  }

  // --- deload cadence ----------------------------------------------------
  const buildStreak = context.buildStreak ?? 0;
  if (buildStreak >= 3 && !plan.deload) {
    out.push(violation(
      'deload-overdue',
      'warn',
      `This is build week ${buildStreak + 1} in a row with no deload. Every fourth week should drop 20-25%.`,
      { buildStreak },
    ));
  }
  if (plan.deload) {
    for (const sport of ENDURANCE_SPORTS) {
      const planned = volumes[sport] || 0;
      const last = prev[sport] || 0;
      if (last && planned > last * 0.9) {
        out.push(violation(
          'deload-not-a-deload',
          'warn',
          `Marked as a deload, but ${sportInfo(sport).label} volume is only ${((1 - planned / last) * 100).toFixed(0)}% down.`,
          { sport, last, planned },
        ));
        break;
      }
    }
  }

  // --- hard days ---------------------------------------------------------
  const hardDays = [];
  (plan.days || []).forEach((day, i) => {
    const hard = (day.sessions || []).some(
      (s) => sportKey(s.sport) === 'run' && HARD.has(String(s.intensity || '').toLowerCase()),
    );
    if (hard) hardDays.push(i);
  });
  if (hardDays.length > 2) {
    out.push(violation('too-many-hard-days', 'block',
      `${hardDays.length} hard running days planned. The limit is two.`, { hardDays }));
  }
  for (let i = 1; i < hardDays.length; i++) {
    if (hardDays[i] - hardDays[i - 1] === 1) {
      out.push(violation('hard-days-adjacent', 'warn',
        'Two hard running days back to back. They need a day between them.', { hardDays }));
      break;
    }
  }

  // --- long run share of the week ---------------------------------------
  const runs = (plan.days || []).flatMap((d) => d.sessions || []).filter((s) => sportKey(s.sport) === 'run');
  const weekMiles = runs.reduce((n, s) => n + (s.miles || 0), 0);
  const longest = runs.reduce((n, s) => Math.max(n, s.miles || 0), 0);
  if (weekMiles > 12 && longest > weekMiles * 0.35) {
    out.push(violation('long-run-share', 'warn',
      `The long run is ${((longest / weekMiles) * 100).toFixed(0)}% of the week's mileage `
      + `(${round(longest)} of ${round(weekMiles)} mi). Above about a third, it stops being a long run and becomes the week.`,
      { longest, weekMiles }));
  }

  // --- pain overrides everything -----------------------------------------
  const pain = (context.recentPain || []).filter((p) => (p.pain ?? 0) >= 3);
  if (pain.length) {
    const worst = pain.reduce((a, b) => ((b.pain ?? 0) > (a.pain ?? 0) ? b : a));
    const increases = ENDURANCE_SPORTS.filter((s) => (volumes[s] || 0) > (prev[s] || 0) * 1.02);
    if (increases.length) {
      out.push(violation(
        'increase-on-pain',
        worst.pain >= 4 ? 'block' : 'warn',
        `Pain of ${worst.pain}/10${worst.site ? ` (${worst.site})` : ''} was logged on ${worst.date}, `
        + `but ${increases.map((s) => sportInfo(s).label.toLowerCase()).join(' and ')} volume goes up. `
        + 'Symptoms above 3/10 mean holding volume, not adding.',
        { pain: worst, increases },
      ));
    }
  }

  // --- declared rest days ------------------------------------------------
  for (const restDay of context.restDays || []) {
    const idx = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(String(restDay).slice(0, 3).toLowerCase());
    if (idx < 0) continue;
    const day = (plan.days || [])[idx];
    const runsThatDay = (day?.sessions || []).some((s) => sportKey(s.sport) === 'run');
    if (runsThatDay) {
      out.push(violation('rest-day-used', 'warn',
        `${day.dow} is declared a running rest day but has a run planned.`, { day: day.dow }));
    }
  }

  return out;
}

/**
 * Check a proposed change to the strength program.
 *
 * The point is choosiness. Tendons adapt over months, so a program that
 * rotates its movement list never loads anything long enough to help. Caps
 * here are deliberately tight, and removing a core movement needs a reason.
 */
export const PROGRAM_LIMITS = {
  maxAddsPerReview: 2,
  maxRemovalsPerReview: 1,
  maxMovementsPerSession: 6,
  maxLoadJumpPct: 15,
  blockLoadJumpPct: 30,
  minWeeksBeforeCoreRemoval: 6,
};

export function checkProgramChange(current, proposed, context = {}) {
  const out = [];
  const before = movementMap(current);
  const after = movementMap(proposed);

  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));

  if (added.length > PROGRAM_LIMITS.maxAddsPerReview) {
    out.push(violation('too-many-additions', 'block',
      `${added.length} movements added at once. At most ${PROGRAM_LIMITS.maxAddsPerReview} per review — `
      + 'a program that churns never loads anything long enough to matter.',
      { added }));
  }

  const removedCore = removed.filter((id) => before.get(id).role === 'core');
  if (removedCore.length > PROGRAM_LIMITS.maxRemovalsPerReview) {
    out.push(violation('too-many-removals', 'block',
      `${removedCore.length} core movements removed at once. At most ${PROGRAM_LIMITS.maxRemovalsPerReview} per review.`,
      { removed: removedCore }));
  }
  for (const id of removedCore) {
    const m = before.get(id);
    const reason = (proposed.retired || []).find((r) => r.exId === id)?.reason;
    if (!reason) {
      out.push(violation('removal-without-reason', 'block',
        `"${m.name}" is a core movement and was dropped with no reason given.`, { exId: id }));
    }
    const weeks = weeksSince(m.addedAt, context.today);
    if (weeks != null && weeks < PROGRAM_LIMITS.minWeeksBeforeCoreRemoval) {
      out.push(violation('removed-too-soon', 'warn',
        `"${m.name}" has only been in the program ${weeks} week${weeks === 1 ? '' : 's'}. `
        + `Tendon adaptation takes longer than that; ${PROGRAM_LIMITS.minWeeksBeforeCoreRemoval} weeks is the minimum before judging it.`,
        { exId: id, weeks }));
    }
  }

  // required patterns must survive the change
  const patterns = new Set([...after.values()].map((m) => m.pattern));
  for (const [key, meta] of Object.entries(PATTERNS)) {
    if (meta.required && !patterns.has(key)) {
      out.push(violation('pattern-missing', 'warn',
        `No ${meta.label.toLowerCase()} movement left in the program. ${meta.note}`, { pattern: key }));
    }
  }

  // per-session size
  for (const session of proposed.sessions || []) {
    if ((session.movements || []).length > PROGRAM_LIMITS.maxMovementsPerSession) {
      out.push(violation('session-too-long', 'warn',
        `"${session.name}" has ${session.movements.length} movements. Above `
        + `${PROGRAM_LIMITS.maxMovementsPerSession} the last ones get skipped.`,
        { session: session.id }));
    }
  }

  // load jumps
  for (const [id, m] of after) {
    const was = before.get(id);
    if (!was?.loadLb || !m.loadLb) continue;
    const jump = ((m.loadLb / was.loadLb) - 1) * 100;
    if (jump > PROGRAM_LIMITS.blockLoadJumpPct) {
      out.push(violation('load-jump', 'block',
        `"${m.name}" jumps ${jump.toFixed(0)}% (${was.loadLb} → ${m.loadLb} lb).`,
        { exId: id, from: was.loadLb, to: m.loadLb }));
    } else if (jump > PROGRAM_LIMITS.maxLoadJumpPct) {
      out.push(violation('load-jump', 'warn',
        `"${m.name}" jumps ${jump.toFixed(0)}% (${was.loadLb} → ${m.loadLb} lb). `
        + `Over ${PROGRAM_LIMITS.maxLoadJumpPct}% in one step is more than the tissue asked for.`,
        { exId: id, from: was.loadLb, to: m.loadLb }));
    }
  }

  return out;
}

/** Do the prescribed exercises in a week match the program? */
export function checkWeekAgainstProgram(plan, program) {
  if (!program?.sessions?.length) return [];
  const known = movementMap(program);
  const out = [];
  const strays = new Set();
  for (const day of plan.days || []) {
    for (const s of day.sessions || []) {
      for (const ex of s.exercises || []) {
        const id = ex.exId || idOf(ex.ex);
        if (!known.has(id)) strays.add(ex.ex);
      }
    }
  }
  if (strays.size) {
    out.push(violation('off-program-exercise', 'warn',
      `${[...strays].join(', ')} ${strays.size === 1 ? 'is' : 'are'} prescribed but not in the core program. `
      + 'Movements should enter through a program review, not a single week.',
      { strays: [...strays] }));
  }
  return out;
}

export const hasBlocking = (violations) => violations.some((v) => v.severity === 'block');

// --- helpers ---------------------------------------------------------------
function movementMap(program) {
  const map = new Map();
  for (const session of program?.sessions || []) {
    for (const m of session.movements || []) {
      map.set(m.exId || idOf(m.name), { ...m, session: session.id });
    }
  }
  return map;
}

function idOf(name) {
  return String(name || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60);
}

function weeksSince(iso, today) {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const now = today ? Date.parse(today) : Date.now();
  return Math.floor((now - then) / (7 * 86400000));
}

const round = (n) => (Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10);
