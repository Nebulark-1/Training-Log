// SQLite storage. Every row is scoped to a user_id, so the same schema serves
// one local athlete or many signed-in ones.
//
// Documents are stored as JSON text with the queryable fields (date, sport,
// week) lifted into real columns. That keeps the client's data shapes identical
// to what it renders and leaves room to add indexes as the log grows.
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { config } from './config.js';
import { migrate, schemaVersion } from './migrations.js';
import { costOf, monthStart } from './tiers.js';

export const db = new DatabaseSync(config.dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

export const dbVersion = () => schemaVersion(db);

/**
 * Bring the schema up to date. Call this once, from whatever is starting up.
 *
 * Deliberately not done on import. Importing a module should not migrate and
 * snapshot a database — `npm test` pulls in this file through the fitness and
 * program modules, and with the migration at the top level that alone was
 * enough to alter the real ledger.
 */
let applied = null;
export function initDb(opts = {}) {
  if (!applied) applied = migrate(db, opts);
  return applied;
}

export const nowIso = () => new Date().toISOString();
export const newId = (n = 16) => crypto.randomBytes(n).toString('base64url');

const parse = (row, key = 'doc') => {
  if (!row) return null;
  try { return JSON.parse(row[key]); } catch { return null; }
};

// --- users -----------------------------------------------------------------
export function findUserByGoogleSub(sub) {
  return db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) || null;
}
export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}
export function createUser({ googleSub = null, email = null, name = null, picture = null, tier = 'basic' }) {
  const id = newId(12);
  db.prepare(`INSERT INTO users (id, google_sub, email, name, picture, tier, created_at, last_seen)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, googleSub, email, name, picture, tier, nowIso(), nowIso());
  return findUserById(id);
}
export function setTier(id, tier) {
  db.prepare('UPDATE users SET tier = ? WHERE id = ?').run(tier, id);
}
export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
}
export function touchUser(id, patch = {}) {
  db.prepare(`UPDATE users SET last_seen = ?, email = COALESCE(?, email),
              name = COALESCE(?, name), picture = COALESCE(?, picture) WHERE id = ?`)
    .run(nowIso(), patch.email ?? null, patch.name ?? null, patch.picture ?? null, id);
}

// --- login sessions --------------------------------------------------------
const SESSION_DAYS = 30;
export function createSession(userId) {
  const id = newId(32);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(id, userId, nowIso(), expires);
  return { id, expires };
}
export function userForSession(sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(`SELECT u.* FROM auth_sessions s JOIN users u ON u.id = s.user_id
                          WHERE s.id = ? AND s.expires_at > ?`).get(sessionId, nowIso());
  return row || null;
}
export function destroySession(sessionId) {
  if (sessionId) db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(sessionId);
}
export function pruneExpired() {
  db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(nowIso());
  const cutoff = new Date(Date.now() - 3600000).toISOString();
  db.prepare('DELETE FROM oauth_states WHERE created_at <= ?').run(cutoff);
}

// --- oauth handshake state -------------------------------------------------
export function saveOauthState(provider, userId = null, verifier = null) {
  const state = newId(24);
  db.prepare('INSERT INTO oauth_states (state, provider, user_id, verifier, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(state, provider, userId, verifier, nowIso());
  return state;
}
export function takeOauthState(state, provider) {
  if (!state) return null;
  const row = db.prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?').get(state, provider);
  if (row) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  // Reject handshakes older than 15 minutes.
  if (!row || Date.parse(row.created_at) < Date.now() - 900000) return null;
  return row;
}

// --- provider connections --------------------------------------------------
export function saveConnection(userId, provider, conn) {
  db.prepare(`INSERT INTO connections
      (user_id, provider, access_token, refresh_token, expires_at, scope, external_id, meta, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expires_at = excluded.expires_at,
        scope = COALESCE(excluded.scope, connections.scope),
        external_id = COALESCE(excluded.external_id, connections.external_id),
        meta = COALESCE(excluded.meta, connections.meta),
        updated_at = excluded.updated_at`)
    .run(userId, provider, conn.accessToken ?? null, conn.refreshToken ?? null,
      conn.expiresAt ?? null, conn.scope ?? null, conn.externalId ?? null,
      conn.meta ? JSON.stringify(conn.meta) : null, nowIso());
}
export function getConnection(userId, provider) {
  const row = db.prepare('SELECT * FROM connections WHERE user_id = ? AND provider = ?').get(userId, provider);
  if (!row) return null;
  return { ...row, meta: row.meta ? JSON.parse(row.meta) : null };
}
export function deleteConnection(userId, provider) {
  db.prepare('DELETE FROM connections WHERE user_id = ? AND provider = ?').run(userId, provider);
}

// --- settings --------------------------------------------------------------
export function getSettings(userId) {
  return parse(db.prepare('SELECT doc FROM settings WHERE user_id = ?').get(userId));
}
export function saveSettings(userId, doc) {
  db.prepare(`INSERT INTO settings (user_id, doc, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(doc), nowIso());
}

// --- plan, weeks, digests, sync -------------------------------------------
export function getPlan(userId) {
  return parse(db.prepare('SELECT doc FROM plans WHERE user_id = ?').get(userId));
}
export function savePlan(userId, doc) {
  db.prepare(`INSERT INTO plans (user_id, doc, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(doc), nowIso());
}

export function getWeeks(userId, fromWeek) {
  return db.prepare('SELECT week, doc FROM weeks WHERE user_id = ? AND week >= ? ORDER BY week')
    .all(userId, fromWeek)
    .map((r) => parse(r));
}
export function getWeek(userId, week) {
  return parse(db.prepare('SELECT doc FROM weeks WHERE user_id = ? AND week = ?').get(userId, week));
}
export function saveWeek(userId, week, doc) {
  db.prepare(`INSERT INTO weeks (user_id, week, doc, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, week) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, week, JSON.stringify(doc), nowIso());
}

export function getDigests(userId, limit = 12) {
  return db.prepare('SELECT doc FROM digests WHERE user_id = ? ORDER BY week DESC LIMIT ?')
    .all(userId, limit)
    .map((r) => parse(r));
}
export function saveDigest(userId, week, doc) {
  db.prepare(`INSERT INTO digests (user_id, week, doc, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, week) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, week, JSON.stringify(doc), nowIso());
}
export function getDigest(userId, week) {
  return parse(db.prepare('SELECT doc FROM digests WHERE user_id = ? AND week = ?').get(userId, week));
}

export function getSyncState(userId) {
  return parse(db.prepare('SELECT doc FROM sync_state WHERE user_id = ?').get(userId));
}
export function saveSyncState(userId, doc) {
  db.prepare(`INSERT INTO sync_state (user_id, doc, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(doc), nowIso());
}

// --- activities ------------------------------------------------------------
export function getActivities(userId, fromDate, limit = 600) {
  return db.prepare(`SELECT doc FROM activities WHERE user_id = ? AND date >= ?
                     ORDER BY date DESC, id DESC LIMIT ?`)
    .all(userId, fromDate, limit)
    .map((r) => parse(r));
}
export function getActivity(userId, id) {
  return parse(db.prepare('SELECT doc FROM activities WHERE user_id = ? AND id = ?').get(userId, id));
}
export function saveActivity(userId, act) {
  db.prepare(`INSERT INTO activities (user_id, id, date, sport, source, doc, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, id) DO UPDATE SET date = excluded.date, sport = excluded.sport,
                source = excluded.source, doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, act.id, act.date, act.sport ?? null, act.source ?? null, JSON.stringify(act), nowIso());
}
/** Upsert many activities in one transaction. Returns how many rows changed. */
export function saveActivities(userId, list) {
  if (!list.length) return 0;
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const act of list) { saveActivity(userId, act); n++; }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return n;
}
export function deleteActivity(userId, id) {
  db.prepare('DELETE FROM activities WHERE user_id = ? AND id = ?').run(userId, id);
  db.prepare('DELETE FROM feedback WHERE user_id = ? AND session_id = ?').run(userId, id);
}
export function latestActivityDate(userId) {
  const row = db.prepare('SELECT MAX(date) AS d FROM activities WHERE user_id = ?').get(userId);
  return row?.d || null;
}
export function activityCount(userId) {
  return db.prepare('SELECT COUNT(*) AS n FROM activities WHERE user_id = ?').get(userId)?.n ?? 0;
}

// --- feedback --------------------------------------------------------------
export function getFeedback(userId, fromDate) {
  return db.prepare('SELECT doc FROM feedback WHERE user_id = ? AND date >= ?')
    .all(userId, fromDate)
    .map((r) => parse(r));
}
export function saveFeedback(userId, sessionId, doc) {
  db.prepare(`INSERT INTO feedback (user_id, session_id, date, doc, updated_at) VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(user_id, session_id) DO UPDATE SET date = excluded.date,
                doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, sessionId, doc.date, JSON.stringify(doc), nowIso());
}

// --- strength program ------------------------------------------------------
export function getLiftProgram(userId) {
  return parse(db.prepare('SELECT doc FROM lift_program WHERE user_id = ?').get(userId));
}
export function saveLiftProgram(userId, doc) {
  db.prepare(`INSERT INTO lift_program (user_id, doc, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(doc), nowIso());
}

// --- goals -----------------------------------------------------------------
export function listGoals(userId) {
  return db.prepare('SELECT doc FROM goals WHERE user_id = ? ORDER BY id').all(userId).map((r) => parse(r));
}
export function getGoal(userId, id) {
  return parse(db.prepare('SELECT doc FROM goals WHERE user_id = ? AND id = ?').get(userId, id));
}
export function saveGoal(userId, goal) {
  const id = goal.id || newId(6);
  const doc = { ...goal, id, updatedAt: nowIso() };
  db.prepare(`INSERT INTO goals (user_id, id, doc, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
    .run(userId, id, JSON.stringify(doc), nowIso());
  return doc;
}
export function deleteGoal(userId, id) {
  db.prepare('DELETE FROM goals WHERE user_id = ? AND id = ?').run(userId, id);
}
/** Exactly one goal carries the confidence number. */
export function setPrimaryGoal(userId, id) {
  const goals = listGoals(userId);
  for (const g of goals) {
    const primary = g.id === id;
    if (Boolean(g.primary) !== primary) saveGoal(userId, { ...g, primary });
  }
}

// --- coach audit trail -----------------------------------------------------
export function logCoachRun(userId, kind, { model, usage, ms, ok, error }) {
  // Priced at write time, so a month's spend is a sum. A failed call that
  // returned usage still cost money and is still counted.
  db.prepare(`INSERT INTO coach_runs (id, user_id, kind, model, usage, ms, ok, error, cost, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId(8), userId, kind, model ?? null, usage ? JSON.stringify(usage) : null,
      ms ?? null, ok ? 1 : 0, error ?? null, costOf(model, usage), nowIso());
}

/** Coaching calls started today (UTC), and when the last one started. */
export function runsToday(userId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const row = db.prepare("SELECT COUNT(*) AS n, MAX(created_at) AS last FROM coach_runs WHERE user_id = ? AND created_at >= ?")
    .get(userId, `${day}T00:00:00.000Z`);
  return { today: row?.n || 0, lastRunAt: row?.last || null };
}

/** The account behind a Strava athlete id, for webhook events. */
export function userForStravaAthlete(athleteId) {
  const row = db.prepare("SELECT user_id FROM connections WHERE provider = 'strava' AND external_id = ?")
    .get(String(athleteId));
  return row?.user_id || null;
}

/** What this account's coaching has cost since the first of the month. */
export function monthlySpend(userId, now = new Date()) {
  const row = db.prepare('SELECT COALESCE(SUM(cost), 0) AS spent FROM coach_runs WHERE user_id = ? AND created_at >= ?')
    .get(userId, monthStart(now));
  return Number(row?.spent) || 0;
}

export function exportAll(userId) {
  return {
    exportedAt: nowIso(),
    settings: getSettings(userId),
    plan: getPlan(userId),
    weeks: db.prepare('SELECT doc FROM weeks WHERE user_id = ? ORDER BY week').all(userId).map((r) => parse(r)),
    activities: db.prepare('SELECT doc FROM activities WHERE user_id = ? ORDER BY date DESC').all(userId).map((r) => parse(r)),
    feedback: db.prepare('SELECT doc FROM feedback WHERE user_id = ?').all(userId).map((r) => parse(r)),
    digests: db.prepare('SELECT doc FROM digests WHERE user_id = ? ORDER BY week DESC').all(userId).map((r) => parse(r)),
    liftProgram: getLiftProgram(userId),
    goals: listGoals(userId),
    sync: getSyncState(userId),
  };
}

// --- goal assessments ------------------------------------------------------
// The coach's judgement on a goal, kept rather than replaced. One confidence
// figure says little; the same goal reassessed over months shows drift.
export function saveAssessment(userId, goalId, doc) {
  const id = newId(8);
  const row = { ...doc, id, goalId, createdAt: nowIso() };
  db.prepare(`INSERT INTO goal_assessments
      (id, user_id, goal_id, kind, confidence, doc, as_of, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, userId, goalId, doc.kind || 'checkin',
      Number.isFinite(doc.confidence) ? Math.round(doc.confidence) : null,
      JSON.stringify(row), doc.asOf || nowIso().slice(0, 10), nowIso());
  return row;
}

export function listAssessments(userId, goalId, limit = 24) {
  return db.prepare(`SELECT doc FROM goal_assessments WHERE user_id = ? AND goal_id = ?
                     ORDER BY created_at DESC LIMIT ?`)
    .all(userId, goalId, limit)
    .map((r) => parse(r));
}

export function latestAssessment(userId, goalId) {
  return listAssessments(userId, goalId, 1)[0] || null;
}

/** The newest assessment for every goal, for a dashboard that shows them all. */
export function latestAssessments(userId) {
  const rows = db.prepare(`SELECT goal_id, doc FROM goal_assessments WHERE user_id = ?
                           ORDER BY created_at DESC`).all(userId);
  const out = new Map();
  for (const r of rows) if (!out.has(r.goal_id)) out.set(r.goal_id, parse(r));
  return out;
}
