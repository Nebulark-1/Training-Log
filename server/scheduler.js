// Things that happen on their own.
//
// Two jobs. A quiet incremental Strava sync for every connected account,
// nightly, as the safety net under webhooks — they can be missed, and an
// athlete who uploads from a watch after the fact should not have to press
// anything. And on Monday morning, a plan for the week for any account that
// has a goal and a season but no week yet, so the week is there when they
// open the app rather than behind a button.
//
// Both run one account at a time with a pause between, because the Strava
// allowance and the model are shared by everyone on the server. A job that
// fails for one account logs and moves on; it never stops the others.
import { db, getPlan, getWeek, listGoals, getConnection } from './db.js';
import { syncUser, budgetLeft } from './strava.js';
import { planWeek } from './coach.js';
import { thisWeek } from '../public/lib/dates.js';

const HOUR = 3600 * 1000;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (msg) => console.log(`[scheduler] ${new Date().toISOString().slice(11, 16)} ${msg}`);

function connectedUsers() {
  return db.prepare("SELECT user_id FROM connections WHERE provider = 'strava'").all().map((r) => r.user_id);
}

/** Every connected account, incrementally, unless the app is short on allowance. */
export async function nightlySync() {
  const users = connectedUsers();
  if (!users.length) return { synced: 0 };
  let synced = 0;
  let skipped = 0;
  for (const userId of users) {
    if (budgetLeft().daily < 0.2) { skipped += users.length - synced; break; }
    try {
      await syncUser(userId, { detailMax: 8 });
      synced += 1;
    } catch (err) {
      log(`sync ${userId} failed: ${err?.message}`);
    }
    await pause(2000);
  }
  log(`nightly sync: ${synced} synced${skipped ? `, ${skipped} skipped for allowance` : ''}`);
  return { synced, skipped };
}

/** Monday: a week for anyone set up for one who has not got one yet. */
export async function mondayPlans() {
  const week = thisWeek();
  const users = db.prepare('SELECT id FROM users').all().map((r) => r.id);
  let planned = 0;
  for (const userId of users) {
    if (getWeek(userId, week)) continue;
    if (!listGoals(userId).length || !getPlan(userId)) continue;
    if (!getConnection(userId, 'strava')) continue; // nothing to plan from yet
    try {
      const out = await planWeek(userId, week, { chained: true });
      if (out.ok) planned += 1;
      else log(`plan ${userId}: refused by a guardrail`);
    } catch (err) {
      log(`plan ${userId} failed: ${err?.message}`);
    }
    await pause(5000);
  }
  log(`monday plans: ${planned} planned`);
  return { planned };
}

/**
 * Fire at fixed local hours. Checked every ten minutes and keyed by the day,
 * so a restart never runs a job twice and a missed tick catches up on the
 * next check rather than waiting for tomorrow.
 */
const done = new Set();
function due(key, hour, { weekday = null } = {}) {
  const now = new Date();
  if (weekday != null && now.getDay() !== weekday) return false;
  if (now.getHours() < hour) return false;
  const stamp = `${key}:${now.toISOString().slice(0, 10)}`;
  if (done.has(stamp)) return false;
  done.add(stamp);
  return true;
}

export function startScheduler({ syncHour = 4, planHour = 5 } = {}) {
  const tick = async () => {
    try {
      if (due('sync', syncHour)) await nightlySync();
      if (due('plan', planHour, { weekday: 1 })) await mondayPlans();
    } catch (err) {
      log(`tick failed: ${err?.message}`);
    }
  };
  const timer = setInterval(tick, 10 * 60 * 1000);
  timer.unref();
  setTimeout(tick, 30 * 1000).unref();
  return timer;
}

export const scheduledJobs = () => ({ nightlySync: 'daily 04:00', mondayPlans: 'Mondays 05:00', ranToday: [...done] });
export { HOUR };
