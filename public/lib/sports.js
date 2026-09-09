// Sport adapters, shared by the server and the browser.
//
// The core of the app is sport-agnostic: it tracks load, volume, phases and
// compliance. Metrics are not agnostic — running wants miles and pace, cycling
// wants time and power, swimming wants yards per hundred — so every
// sport-specific fact lives here and nowhere else.

export const SPORTS = {
  run: {
    label: 'Run',
    // The quantity a running goal is usually expressed in.
    metric: 'distance',
    unit: 'mi',
    unitLong: 'miles',
    // How a week's worth is summed and shown.
    weekUnit: 'mi',
    color: 'var(--run)',
    endurance: true,
    // Weight in the combined load model: minutes of running cost more than
    // minutes of cycling at the same heart rate, because of impact.
    loadFactor: 1.0,
    step: { pctPerWeek: 10, absPerWeek: 5 },
  },
  bike: {
    label: 'Bike',
    metric: 'duration',
    unit: 'min',
    unitLong: 'minutes',
    weekUnit: 'h',
    color: 'var(--bike)',
    endurance: true,
    loadFactor: 0.55,
    step: { pctPerWeek: 15, absPerWeek: 120 },
  },
  swim: {
    label: 'Swim',
    metric: 'distance',
    unit: 'yd',
    unitLong: 'yards',
    weekUnit: 'yd',
    color: 'var(--swim)',
    endurance: true,
    loadFactor: 0.6,
    step: { pctPerWeek: 15, absPerWeek: 2000 },
  },
  lift: {
    label: 'Lift',
    metric: 'sessions',
    unit: 'sessions',
    unitLong: 'sessions',
    weekUnit: 'x',
    color: 'var(--lift)',
    endurance: false,
    loadFactor: 0.4,
    step: { pctPerWeek: 100, absPerWeek: 1 },
  },
  strength: { alias: 'lift' },
  mobility: {
    label: 'Mobility',
    metric: 'sessions',
    unit: 'sessions',
    unitLong: 'sessions',
    weekUnit: 'x',
    color: 'var(--lift)',
    endurance: false,
    loadFactor: 0.15,
    step: { pctPerWeek: 100, absPerWeek: 2 },
  },
  walk: { label: 'Walk', metric: 'distance', unit: 'mi', weekUnit: 'mi', color: 'var(--faint)', endurance: true, loadFactor: 0.3, step: { pctPerWeek: 20, absPerWeek: 10 } },
  hike: { label: 'Hike', metric: 'duration', unit: 'min', weekUnit: 'h', color: 'var(--faint)', endurance: true, loadFactor: 0.5, step: { pctPerWeek: 20, absPerWeek: 120 } },
  cross: { label: 'Cross', metric: 'duration', unit: 'min', weekUnit: 'h', color: 'var(--faint)', endurance: true, loadFactor: 0.5, step: { pctPerWeek: 20, absPerWeek: 120 } },
  other: { label: 'Other', metric: 'duration', unit: 'min', weekUnit: 'h', color: 'var(--faint)', endurance: false, loadFactor: 0.3, step: { pctPerWeek: 20, absPerWeek: 120 } },
};

/** Resolve a sport key through aliases. */
export function sportKey(sport) {
  const key = String(sport || 'other').toLowerCase();
  const entry = SPORTS[key];
  if (!entry) return 'other';
  return entry.alias || key;
}

export function sportInfo(sport) {
  return SPORTS[sportKey(sport)];
}

export const ENDURANCE_SPORTS = Object.keys(SPORTS)
  .filter((k) => !SPORTS[k].alias && SPORTS[k].endurance);

export const STRENGTH_SPORTS = ['lift', 'strength', 'mobility'];
export const isStrength = (sport) => STRENGTH_SPORTS.includes(String(sport || '').toLowerCase());

/**
 * How much of a sport one session represents, in that sport's own metric.
 * Distance sports report distance; time sports report minutes; strength
 * reports one session.
 */
export function sessionVolume(session) {
  const key = sportKey(session.sport);
  const info = SPORTS[key];
  if (!info || info.metric === 'sessions') return 1;
  if (info.metric === 'duration') return session.movingMin || 0;
  if (key === 'swim') return session.yards || 0;
  return session.miles || 0;
}

/**
 * A single comparable load number for a session, so total load across sports
 * can be reasoned about. Minutes scaled by the sport's impact factor and by
 * intensity when heart rate or RPE is known.
 *
 * This is deliberately simple and unit-free: it exists to compare weeks with
 * each other, not to match anyone else's training-load product.
 */
export function sessionLoad(session, { feedback = null, restHr = 50, maxHr = 190 } = {}) {
  const info = sportInfo(session);
  const minutes = session.movingMin || session.elapsedMin || 0;
  if (!minutes) return 0;

  let intensity = 1;
  if (session.hrAvg && maxHr > restHr) {
    // Fraction of heart-rate reserve, re-centred so an easy aerobic session
    // sits near 1 and hard work climbs from there.
    const hrr = (session.hrAvg - restHr) / (maxHr - restHr);
    intensity = Math.max(0.5, Math.min(2.2, 0.55 + hrr * 1.15));
  } else if (feedback?.rpe) {
    intensity = Math.max(0.5, Math.min(2.2, 0.45 + (feedback.rpe / 10) * 1.4));
  }
  return minutes * (info.loadFactor ?? 0.5) * intensity;
}

/** Format a volume in a sport's own units, compactly. */
export function formatVolume(sport, value, { long = false } = {}) {
  const key = sportKey(sport);
  const info = SPORTS[key];
  if (!info) return String(Math.round(value || 0));
  const v = value || 0;
  if (info.metric === 'sessions') return `${Math.round(v)}${long ? ' sessions' : '×'}`;
  if (info.metric === 'duration') {
    if (v >= 60) {
      const h = Math.floor(v / 60);
      const m = Math.round(v % 60);
      return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
    }
    return `${Math.round(v)}m`;
  }
  if (key === 'swim') return `${Math.round(v).toLocaleString('en-US')}${long ? ' yd' : ' yd'}`;
  return `${(Math.round(v * 10) / 10).toFixed(1)}${long ? ' mi' : ' mi'}`;
}

/** The metric a goal for this sport is most naturally expressed in. */
export function goalMetricsFor(sport) {
  const key = sportKey(sport);
  const info = SPORTS[key];
  const out = [];
  if (info.metric === 'distance') {
    out.push({ id: 'weeklyDistance', label: `Weekly ${info.unitLong || info.unit}`, unit: info.unit });
    out.push({ id: 'raceTime', label: 'Race time', unit: 'time' });
    out.push({ id: 'longestSession', label: `Longest single ${info.unitLong || info.unit}`, unit: info.unit });
  }
  if (info.metric === 'duration') {
    out.push({ id: 'weeklyDuration', label: 'Weekly hours', unit: 'h' });
    out.push({ id: 'longestSession', label: 'Longest session', unit: 'min' });
  }
  out.push({ id: 'weeklySessions', label: 'Sessions per week', unit: 'sessions' });
  return out;
}
