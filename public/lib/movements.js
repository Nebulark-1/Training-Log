// The movement catalog, shared by the server and the browser.
//
// Strength for an endurance athlete only works if it is boring: the same few
// movements, loaded a little more over time. Tendons adapt on a scale of
// months, so a program that churns its exercise list never loads anything long
// enough to matter.
//
// So the catalog exists to make the coach choosy. Movements are grouped by
// pattern, every core program must cover the patterns a runner needs, and
// additions are checked against this list before they can enter the program.

export const PATTERNS = {
  hinge: { label: 'Hinge', required: true, note: 'Posterior chain under real load. The single most valuable pattern for a runner.' },
  'single-leg': { label: 'Single leg', required: true, note: 'Running is a single-leg activity. This is where knee control is built.' },
  calf: { label: 'Calf and Achilles', required: true, note: 'Takes the running load first and complains first.' },
  core: { label: 'Trunk', required: true, note: 'Anti-rotation and anti-extension, not sit-ups.' },
  squat: { label: 'Squat', required: false, note: 'Useful, but the hinge and single-leg work matter more.' },
  push: { label: 'Upper push', required: false, note: 'Balance and posture. Cheap to keep.' },
  pull: { label: 'Upper pull', required: false, note: 'Balance and posture. Cheap to keep.' },
  carry: { label: 'Carry', required: false, note: 'Trunk stiffness under load, and it transfers well to late-race posture.' },
  rehab: { label: 'Rehab and isometric', required: false, note: 'Tendon-specific loading. Prescribed in response to symptoms.' },
};

/**
 * Known movements. `unilateral` movements are prescribed per side. `tendon`
 * marks work whose point is connective-tissue load rather than strength, which
 * the coach is told to protect during a rebuild.
 */
export const CATALOG = [
  // hinge
  { id: 'trap-bar-deadlift', name: 'Trap bar deadlift', pattern: 'hinge', defaultReps: '5', loadable: true },
  { id: 'romanian-deadlift', name: 'Romanian deadlift', pattern: 'hinge', defaultReps: '8', loadable: true },
  { id: 'conventional-deadlift', name: 'Conventional deadlift', pattern: 'hinge', defaultReps: '5', loadable: true },
  { id: 'hip-thrust', name: 'Hip thrust', pattern: 'hinge', defaultReps: '8', loadable: true },
  { id: 'single-leg-rdl', name: 'Single-leg RDL', pattern: 'hinge', defaultReps: '8 each', loadable: true, unilateral: true },
  { id: 'nordic-curl', name: 'Nordic curl', pattern: 'hinge', defaultReps: '5', loadable: false, tendon: true },
  { id: 'kettlebell-swing', name: 'Kettlebell swing', pattern: 'hinge', defaultReps: '12', loadable: true },

  // squat
  { id: 'back-squat', name: 'Back squat', pattern: 'squat', defaultReps: '5', loadable: true },
  { id: 'front-squat', name: 'Front squat', pattern: 'squat', defaultReps: '5', loadable: true },
  { id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', defaultReps: '10', loadable: true },
  { id: 'spanish-squat', name: 'Spanish squat', pattern: 'rehab', defaultReps: '45 sec', loadable: false, tendon: true },

  // single leg
  { id: 'split-squat', name: 'Split squat', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true },
  { id: 'rear-foot-elevated-split-squat', name: 'Rear-foot-elevated split squat', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true },
  { id: 'step-down', name: 'Step-down', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true, tendon: true },
  { id: 'step-up', name: 'Step-up', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true },
  { id: 'lateral-lunge', name: 'Lateral lunge', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true },
  { id: 'reverse-lunge', name: 'Reverse lunge', pattern: 'single-leg', defaultReps: '8 each', loadable: true, unilateral: true },

  // calf
  { id: 'standing-calf-raise', name: 'Standing calf raise', pattern: 'calf', defaultReps: '12', loadable: true, tendon: true },
  { id: 'seated-calf-raise', name: 'Seated calf raise', pattern: 'calf', defaultReps: '15', loadable: true, tendon: true },
  { id: 'single-leg-calf-raise', name: 'Single-leg calf raise', pattern: 'calf', defaultReps: '10 each', loadable: true, unilateral: true, tendon: true },
  { id: 'eccentric-heel-drop', name: 'Eccentric heel drop', pattern: 'calf', defaultReps: '15 each', loadable: true, unilateral: true, tendon: true },

  // trunk
  { id: 'side-plank', name: 'Side plank', pattern: 'core', defaultReps: '30 sec each', loadable: false, unilateral: true },
  { id: 'copenhagen-plank', name: 'Copenhagen plank', pattern: 'core', defaultReps: '20 sec each', loadable: false, unilateral: true, tendon: true },
  { id: 'pallof-press', name: 'Pallof press', pattern: 'core', defaultReps: '10 each', loadable: true, unilateral: true },
  { id: 'dead-bug', name: 'Dead bug', pattern: 'core', defaultReps: '10 each', loadable: false },
  { id: 'plank', name: 'Plank', pattern: 'core', defaultReps: '45 sec', loadable: false },
  { id: 'hanging-knee-raise', name: 'Hanging knee raise', pattern: 'core', defaultReps: '10', loadable: false },

  // upper
  { id: 'overhead-press', name: 'Overhead press', pattern: 'push', defaultReps: '6', loadable: true },
  { id: 'bench-press', name: 'Bench press', pattern: 'push', defaultReps: '6', loadable: true },
  { id: 'push-up', name: 'Push-up', pattern: 'push', defaultReps: '12', loadable: false },
  { id: 'dip', name: 'Dip', pattern: 'push', defaultReps: '8', loadable: true },
  { id: 'chin-up', name: 'Chin-up', pattern: 'pull', defaultReps: '5', loadable: true },
  { id: 'pull-up', name: 'Pull-up', pattern: 'pull', defaultReps: '5', loadable: true },
  { id: 'barbell-row', name: 'Barbell row', pattern: 'pull', defaultReps: '8', loadable: true },
  { id: 'single-arm-row', name: 'Single-arm row', pattern: 'pull', defaultReps: '10 each', loadable: true, unilateral: true },
  { id: 'face-pull', name: 'Face pull', pattern: 'pull', defaultReps: '15', loadable: true },

  // carry
  { id: 'farmers-carry', name: "Farmer's carry", pattern: 'carry', defaultReps: '40 m', loadable: true },
  { id: 'suitcase-carry', name: 'Suitcase carry', pattern: 'carry', defaultReps: '30 m each', loadable: true, unilateral: true },
  { id: 'sled-push', name: 'Sled push', pattern: 'carry', defaultReps: '20 m', loadable: true },

  // rehab / tendon
  { id: 'isometric-wall-sit', name: 'Isometric wall sit', pattern: 'rehab', defaultReps: '45 sec', loadable: false, tendon: true },
  { id: 'terminal-knee-extension', name: 'Terminal knee extension', pattern: 'rehab', defaultReps: '15 each', loadable: true, unilateral: true, tendon: true },
  { id: 'glute-bridge', name: 'Glute bridge', pattern: 'rehab', defaultReps: '12', loadable: true },
  { id: 'clamshell', name: 'Clamshell', pattern: 'rehab', defaultReps: '15 each', loadable: false, unilateral: true },
  { id: 'tibialis-raise', name: 'Tibialis raise', pattern: 'rehab', defaultReps: '20', loadable: false, tendon: true },
];

const BY_ID = new Map(CATALOG.map((m) => [m.id, m]));

/** Stable id for a movement name, whether or not it is in the catalog. */
export function movementId(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function findMovement(nameOrId) {
  if (!nameOrId) return null;
  const id = movementId(nameOrId);
  return BY_ID.get(id) || BY_ID.get(String(nameOrId)) || null;
}

/** Best-guess pattern for something the athlete typed in themselves. */
export function guessPattern(name) {
  const known = findMovement(name);
  if (known) return known.pattern;
  const n = String(name || '').toLowerCase();
  if (/carry|yoke|suitcase|sled/.test(n)) return 'carry';
  if (/deadlift|rdl|hinge|swing|thrust|nordic|hamstring/.test(n)) return 'hinge';
  if (/squat|leg press/.test(n)) return 'squat';
  if (/lunge|step|split|single.?leg|pistol/.test(n)) return 'single-leg';
  if (/calf|heel|achilles|soleus/.test(n)) return 'calf';
  if (/plank|pallof|dead bug|core|ab |hollow|plank/.test(n)) return 'core';
  if (/press|push|dip|bench/.test(n)) return 'push';
  if (/row|pull|chin|lat /.test(n)) return 'pull';
  if (/iso|rehab|band|clamshell|bridge|tib/.test(n)) return 'rehab';
  return 'other';
}

/** Estimated one-rep max, Epley. Only meaningful for loaded reps under ~12. */
export function e1rm(lb, reps) {
  const w = Number(lb) || 0;
  const r = Number(reps) || 0;
  if (!w || !r || r > 15) return null;
  return Math.round(w * (1 + r / 30));
}

/** Total weight moved in a set list. */
export function tonnage(sets) {
  return (sets || []).reduce((n, s) => n + (Number(s.lb) || 0) * (Number(s.reps) || 0), 0);
}

/** The heaviest single set, by estimated one-rep max. */
export function bestSet(sets) {
  let best = null;
  for (const s of sets || []) {
    const est = e1rm(s.lb, s.reps);
    if (est != null && (!best || est > best.e1rm)) best = { ...s, e1rm: est };
  }
  return best;
}
