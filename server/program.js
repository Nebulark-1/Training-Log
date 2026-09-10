// The strength program: a small, stable set of movements that persists across
// weeks, plus the machinery for changing it deliberately.
//
// Two separate mechanisms, on purpose:
//   - Load progression is DETERMINISTIC. If you hit your sets at target reps
//     and it did not feel maximal, the weight goes up next time. No model
//     needed, and it works whether or not Claude is configured.
//   - Movement changes go through a REVIEW, capped by guardrails. Adding and
//     dropping exercises is where strength programs go wrong, so that decision
//     is rare, explicit, and has to carry a reason.
import {
  bestSet, e1rm, findMovement, guessPattern, movementId,
} from '../public/lib/movements.js';
import { checkProgramChange, hasBlocking } from './guardrails.js';
import { getActivities, getLiftProgram, saveLiftProgram } from './db.js';

/** Load increment for a movement, in pounds. */
function increment(pattern, unilateral) {
  if (unilateral) return 5;
  if (pattern === 'hinge' || pattern === 'squat') return 10;
  if (pattern === 'carry') return 10;
  return 5;
}

const roundTo = (lb, step = 5) => Math.round(lb / step) * step;

/**
 * The starting program: rehab-led, tendon-first, covering the patterns a
 * runner needs. Loads are deliberately unset — the first session of each lift
 * is a calibration set, and progression takes over from what gets logged.
 */
export function defaultProgram(today = new Date().toISOString()) {
  const mv = (id, sets, reps, note, role = 'core') => {
    const cat = findMovement(id);
    return {
      exId: id,
      name: cat?.name || id,
      pattern: cat?.pattern || guessPattern(id),
      unilateral: Boolean(cat?.unilateral),
      role,
      sets,
      reps: reps || cat?.defaultReps || '8',
      loadLb: 0,
      note,
      addedAt: today,
      addedReason: 'Starting program',
    };
  };

  return {
    version: 1,
    philosophy:
      'Three sessions a week, the same handful of movements, loaded a little more over time. '
      + 'The hinge and the single-leg work are the point; everything else supports them. '
      + 'Tendons adapt over months, so movements stay long enough to matter.',
    sessions: [
      {
        id: 'A',
        name: 'Tendon prep + posterior chain',
        focus: 'Tendon load first, then load the hinge',
        dayHint: 'Tue',
        movements: [
          mv('spanish-squat', 3, '45 sec', 'Isometric, knees at about 60 degrees. Band tension, no added weight.'),
          mv('trap-bar-deadlift', 3, '5', 'The priority lift of the week. Stop at 5 even when 8 are there.'),
          mv('romanian-deadlift', 3, '8', 'Lighter than the trap bar. Stop the set when the back rounds.'),
          mv('standing-calf-raise', 3, '12', 'Three seconds down. The calf takes the running load first.'),
          mv('copenhagen-plank', 2, '20 sec each', 'Adductors. Bend the bottom knee to shorten the lever.'),
        ],
      },
      {
        id: 'B',
        name: 'Single-leg + trunk',
        focus: 'Control first, load second',
        dayHint: 'Thu',
        movements: [
          mv('step-down', 3, '8 each', 'Slow and controlled, knee tracking over the middle toes.'),
          mv('split-squat', 3, '8 each', 'Dumbbells. Add load once eight is easy on both sides.'),
          mv('single-leg-calf-raise', 3, '10 each', 'Bodyweight to start.'),
          mv('side-plank', 2, '30 sec each', 'Hips stacked, no sag.'),
          mv('dead-bug', 2, '10 each', 'Ribs down, lower back flat.'),
        ],
      },
      {
        id: 'C',
        name: 'Heavy hinge + upper',
        focus: 'The heaviest work of the week',
        dayHint: 'Fri',
        movements: [
          mv('trap-bar-deadlift', 4, '4', 'Heavier than session A for one fewer rep. Stop if bar speed drops.'),
          mv('hip-thrust', 3, '8', 'Glute drive, ribs down, no arch at the top.'),
          mv('chin-up', 3, '5', 'Add weight or use a band. Log whichever you did.'),
          mv('overhead-press', 3, '6', 'Strict, no leg drive.'),
          mv('pallof-press', 2, '10 each', 'Resist the twist rather than producing one.'),
        ],
      },
    ],
    retired: [],
    changeLog: [{ at: today, by: 'seed', summary: 'Starting program created', reason: 'First run' }],
    updatedAt: today,
    updatedBy: 'seed',
  };
}

/** Every movement in the program, flattened, keyed by id. */
export function movementIndex(program) {
  const map = new Map();
  for (const session of program?.sessions || []) {
    for (const m of session.movements || []) {
      map.set(m.exId, { ...m, sessionId: session.id, sessionName: session.name });
    }
  }
  return map;
}

/**
 * Everything logged per movement, newest first, from the activity history.
 * Sets are the modern shape; a legacy single {sets, reps, lb} row is read as
 * one set so old logs still count.
 */
export function liftHistory(userId, { since = '2000-01-01', limit = 400 } = {}) {
  const acts = getActivities(userId, since, limit)
    .filter((a) => a.lifts?.length);
  const byMovement = new Map();
  for (const act of acts) {
    for (const entry of act.lifts) {
      const id = entry.exId || movementId(entry.ex);
      const sets = normalizeSets(entry);
      if (!sets.length) continue;
      const best = bestSet(sets);
      const record = {
        date: act.date,
        sessionId: act.id,
        name: entry.ex,
        sets,
        best,
        tonnage: sets.reduce((n, s) => n + (Number(s.lb) || 0) * (Number(s.reps) || 0), 0),
        rpe: sets.map((s) => s.rpe).filter(Boolean).pop() ?? null,
      };
      if (!byMovement.has(id)) byMovement.set(id, []);
      byMovement.get(id).push(record);
    }
  }
  for (const list of byMovement.values()) list.sort((a, b) => b.date.localeCompare(a.date));
  return byMovement;
}

/** Accept either per-set logging or the older one-row-per-exercise shape. */
export function normalizeSets(entry) {
  if (Array.isArray(entry.sets) && entry.sets.length && typeof entry.sets[0] === 'object') {
    return entry.sets
      .map((s) => ({
        reps: Number(s.reps) || 0,
        lb: Number(s.lb) || 0,
        rpe: Number(s.rpe) || null,
      }))
      .filter((s) => s.reps || s.lb);
  }
  const count = Number(entry.sets) || 0;
  const reps = Number(entry.reps) || 0;
  const lb = Number(entry.lb) || 0;
  if (!count || (!reps && !lb)) return [];
  return Array.from({ length: Math.min(count, 12) }, () => ({ reps, lb, rpe: null }));
}

/**
 * The load to prescribe next for a movement.
 *
 * Deterministic: all target reps completed and it did not feel maximal means
 * the weight goes up by one increment; missed reps means hold; a hard grind
 * means hold. Never guesses a starting weight — an unlogged movement stays a
 * calibration set.
 */
export function suggestLoad(movement, records = []) {
  const target = parseInt(String(movement.reps || '').replace(/[^0-9]/g, ''), 10) || null;
  const last = records[0];
  // Isometrics, planks and band work are not loaded; saying "pick a weight"
  // for a Spanish squat would be telling the athlete to do the wrong thing.
  const catalog = findMovement(movement.exId);
  if (catalog && catalog.loadable === false) {
    return { loadLb: 0, basis: 'bodyweight', note: 'Bodyweight or band. Progress by time or reps, not load.' };
  }
  if (!last) {
    return { loadLb: movement.loadLb || 0, basis: 'calibrate', note: 'No logged history yet — establish a working weight.' };
  }
  const loaded = last.sets.filter((s) => s.lb > 0);
  if (!loaded.length) {
    return { loadLb: 0, basis: 'bodyweight', note: 'Logged without external load.' };
  }
  const topLb = Math.max(...loaded.map((s) => s.lb));
  const hitAll = target ? loaded.every((s) => s.reps >= target) : true;
  const felt = last.rpe;
  const inc = increment(movement.pattern, movement.unilateral);

  if (hitAll && (felt == null || felt <= 8)) {
    return {
      loadLb: roundTo(topLb + inc),
      basis: 'progress',
      note: `Up ${inc} lb from ${topLb}: every set hit ${target ?? 'target'} reps${felt ? ` at RPE ${felt}` : ''}.`,
      from: topLb,
    };
  }
  if (!hitAll) {
    return {
      loadLb: roundTo(topLb),
      basis: 'hold',
      note: `Holding ${topLb} lb until every set reaches ${target ?? 'target'} reps.`,
      from: topLb,
    };
  }
  return {
    loadLb: roundTo(topLb),
    basis: 'hold',
    note: `Holding ${topLb} lb — last session went at RPE ${felt}.`,
    from: topLb,
  };
}

/**
 * Turn a program session into a week's prescription, with loads resolved from
 * logged history. This is what the weekly plan embeds.
 */
export function prescribeSession(program, sessionId, history) {
  const session = (program?.sessions || []).find((s) => s.id === sessionId);
  if (!session) return null;
  return {
    programSession: session.id,
    name: session.name,
    focus: session.focus,
    exercises: (session.movements || []).map((m) => {
      const records = history.get(m.exId) || [];
      const suggestion = suggestLoad(m, records);
      return {
        exId: m.exId,
        ex: m.name,
        pattern: m.pattern,
        role: m.role,
        sets: m.sets,
        reps: m.reps,
        loadLb: suggestion.loadLb,
        basis: suggestion.basis,
        note: [m.note, suggestion.basis === 'progress' || suggestion.basis === 'hold' ? suggestion.note : '']
          .filter(Boolean).join(' ')
          .slice(0, 240),
        lastDone: records[0]
          ? { date: records[0].date, top: records[0].best?.lb ?? null, e1rm: records[0].best?.e1rm ?? null }
          : null,
      };
    }),
  };
}

/** Movements the athlete logged that the program does not contain. */
export function offProgramMovements(userId, program, { since = '2000-01-01' } = {}) {
  const known = movementIndex(program);
  const retired = new Set((program?.retired || []).map((r) => r.exId));
  const history = liftHistory(userId, { since });
  const out = [];
  for (const [id, records] of history) {
    if (known.has(id)) continue;
    const best = records.map((r) => r.best).filter(Boolean)
      .sort((a, b) => (b.e1rm || 0) - (a.e1rm || 0))[0] || null;
    out.push({
      exId: id,
      name: records[0].name,
      pattern: guessPattern(records[0].name),
      inCatalog: Boolean(findMovement(id)),
      timesLogged: records.length,
      firstSeen: records[records.length - 1].date,
      lastSeen: records[0].date,
      best,
      previouslyRetired: retired.has(id),
    });
  }
  return out.sort((a, b) => b.timesLogged - a.timesLogged || b.lastSeen.localeCompare(a.lastSeen));
}

/** Read the program, seeding the default on first access. */
export function ensureProgram(userId) {
  let program = getLiftProgram(userId);
  if (!program) {
    program = defaultProgram();
    saveLiftProgram(userId, program);
  }
  return program;
}

/**
 * Store a changed program, after guardrails. Returns the stored document plus
 * the violations; blocking violations mean nothing was written.
 */
export function applyProgramChange(userId, proposed, { by = 'user', reason = '', today } = {}) {
  const current = ensureProgram(userId);
  const violations = checkProgramChange(current, proposed, { today });
  if (hasBlocking(violations)) return { ok: false, violations, program: current };

  const before = movementIndex(current);
  const after = movementIndex(proposed);
  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));
  const summary = [
    added.length ? `added ${added.map((id) => after.get(id).name).join(', ')}` : '',
    removed.length ? `removed ${removed.map((id) => before.get(id).name).join(', ')}` : '',
  ].filter(Boolean).join('; ') || 'loads and rep targets adjusted';

  const doc = {
    ...proposed,
    version: (current.version || 0) + 1,
    retired: dedupeRetired([...(current.retired || []), ...(proposed.retired || [])]),
    changeLog: [
      ...(current.changeLog || []),
      { at: new Date().toISOString(), by, summary, reason: reason || null },
    ].slice(-40),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  saveLiftProgram(userId, doc);
  return { ok: true, violations, program: doc };
}

function dedupeRetired(list) {
  const seen = new Map();
  for (const r of list) if (r?.exId) seen.set(r.exId, r);
  return [...seen.values()].slice(-40);
}

/**
 * Strength progress per movement: estimated one-rep max over time, plus
 * tonnage, for the progress charts.
 */
export function strengthProgress(userId, { since = '2000-01-01' } = {}) {
  const history = liftHistory(userId, { since });
  const out = [];
  for (const [id, records] of history) {
    const points = records
      .filter((r) => r.best?.e1rm)
      .map((r) => ({ date: r.date, e1rm: r.best.e1rm, top: r.best.lb, reps: r.best.reps }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!points.length) continue;
    const first = points[0];
    const latest = points[points.length - 1];
    out.push({
      exId: id,
      name: records[0].name,
      pattern: guessPattern(records[0].name),
      sessions: records.length,
      points,
      first,
      latest,
      changeLb: latest.e1rm - first.e1rm,
      changePct: first.e1rm ? ((latest.e1rm / first.e1rm - 1) * 100) : 0,
      totalTonnage: records.reduce((n, r) => n + r.tonnage, 0),
    });
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}

export { e1rm };
