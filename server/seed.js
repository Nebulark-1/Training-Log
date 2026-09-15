// First-run seeding: a new account gets a strength program and the default
// settings, and nothing else.
//
// It used to get a goal, a season plan and a planned week too — all lifted
// from the one athlete this was built for. That read fine when there was one
// athlete. A second one would have opened the app to a coach's note about a
// layoff they never had and a plan toward a target they never set. The goal
// is theirs to state, and the plan is built from their own history once
// Strava is connected; the training page walks them through the three steps.
import { getSettings, saveSettings } from './db.js';
import { DEFAULT_SETTINGS } from './coach.js';
import { ensureProgram } from './program.js';

/** Seed anything this user is missing. Safe to call on every request. */
export function seedUser(userId) {
  if (!getSettings(userId)) {
    saveSettings(userId, {
      ...DEFAULT_SETTINGS,
      source: 'seed',
      updatedAt: new Date().toISOString(),
    });
  }
  ensureProgram(userId);
}
