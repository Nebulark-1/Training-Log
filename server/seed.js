// First-run seeding: gives a new account a starting goal, macrocycle and week
// so the app opens with something real in it instead of an empty shell.
//
// The templates in seed/ carry fixed week keys and dates; they are re-based
// onto whatever week the account is created in, so the seed stays usable.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { getPlan, getSettings, getWeek, savePlan, saveSettings, saveWeek } from './db.js';
import { DEFAULT_SETTINGS } from './coach.js';
import { DOW, thisWeek, weekAdd, weekDates } from '../public/lib/dates.js';

function readSeed(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(config.seedDir, name), 'utf8'));
  } catch {
    return null;
  }
}

/** Seed anything this user is missing. Safe to call on every sign-in. */
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

  if (!getWeek(userId, week)) {
    const template = readSeed('week-2026-W37.json');
    if (template?.days?.length === 7) {
      const dates = weekDates(week);
      saveWeek(userId, week, {
        ...template,
        week,
        days: template.days.map((d, i) => ({ ...d, dow: DOW[i], date: dates[i] })),
        source: 'seed',
        generatedAt: new Date().toISOString(),
      });
    }
  }
}
