// First-run seeding: gives a new account a starting goal, strength program,
// macrocycle and week, so the app opens with something real in it.
//
// The templates in seed/ carry fixed week keys and dates; they are re-based
// onto whatever week the account is created in, so the seed stays usable. Lift
// sessions are resolved from the strength program rather than the template, so
// there is only ever one source of truth for what the movements are.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import {
  getPlan, getSettings, getWeek, listGoals, saveGoal, savePlan, saveSettings, saveWeek,
} from './db.js';
import { DEFAULT_SETTINGS } from './coach.js';
import { ensureProgram, liftHistory, prescribeSession } from './program.js';
import { isStrength } from '../public/lib/sports.js';
import { DOW, thisWeek, weekAdd, weekDates } from '../public/lib/dates.js';

function readSeed(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.seedDir, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Seed anything this user is missing. Safe to call on every request. */
export function seedUser(userId) {
  const week = thisWeek();

  if (!getSettings(userId)) {
    const profile = readSeed('profile.json');
    const { source, updatedAt, ...rest } = profile || {};
    saveSettings(userId, {
      ...DEFAULT_SETTINGS,
      ...rest,
      source: 'seed',
      updatedAt: new Date().toISOString(),
    });
  }

  // A structured primary goal, so the confidence number has something to aim at.
  if (!listGoals(userId).length) {
    const settings = { ...DEFAULT_SETTINGS, ...(getSettings(userId) || {}) };
    saveGoal(userId, {
      id: 'primary',
      sport: 'run',
      metric: 'weeklyDistance',
      target: Number(settings.targetMpw) || 75,
      unit: 'mi',
      byDate: settings.targetDate || '',
      primary: true,
      label: `${Number(settings.targetMpw) || 75} run miles a week, sustained`,
      note: 'Seeded from the original goal. Edit or replace it in Goals.',
      source: 'seed',
    });
  }

  const program = ensureProgram(userId);

  if (!getPlan(userId)) {
    const plan = readSeed('plan.json');
    if (plan?.weekTargets?.length) {
      savePlan(userId, {
        ...plan,
        weekTargets: plan.weekTargets.map((t, i) => ({ ...t, week: weekAdd(week, i) })),
        source: 'seed',
        generatedAt: new Date().toISOString(),
      });
    }
  }

  const existing = getWeek(userId, week);
  // Refresh a still-seeded week when the template has gained something it
  // lacks. Only ever touches a week the coach has not written.
  const staleSeed = existing?.source === 'seed' && !hasResolvedStrength(existing);

  if (!existing || staleSeed) {
    const template = readSeed('week-2026-W37.json');
    if (template?.days?.length === 7) {
      const dates = weekDates(week);
      const history = liftHistory(userId);
      saveWeek(userId, week, {
        ...template,
        week,
        days: template.days.map((d, i) => ({
          ...d,
          dow: DOW[i],
          date: dates[i],
          sessions: (d.sessions || []).map((s) => {
            if (!isStrength(s.sport)) return s;
            const resolved = prescribeSession(program, s.programSession || 'A', history);
            return resolved
              ? { ...s, programSession: resolved.programSession, exercises: resolved.exercises }
              : s;
          }),
        })),
        source: 'seed',
        generatedAt: new Date().toISOString(),
      });
    }
  }
}

/** Does this week's strength work carry resolved exercises? */
function hasResolvedStrength(weekDoc) {
  const strength = (weekDoc.days || [])
    .flatMap((d) => d.sessions || [])
    .filter((s) => isStrength(s.sport));
  return strength.length > 0 && strength.every((s) => s.exercises?.length);
}
