// Schema migrations.
//
// `CREATE TABLE IF NOT EXISTS` is not a migration: it does nothing at all to a
// table that already exists, so a column added to the schema never reaches a
// database that predates it and the mismatch shows up later as data that reads
// back wrong rather than as an error. Everything here is ordered and recorded
// in `PRAGMA user_version`, so an old ledger is brought forward exactly once.
//
// To add one: append a step with the next version number. Never edit or
// renumber a step that has shipped — someone's database has already run it.
import { snapshot } from './backup.js';

const BASELINE = `
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT UNIQUE,
  email       TEXT,
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL,
  last_seen   TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state       TEXT PRIMARY KEY,
  provider    TEXT NOT NULL,
  user_id     TEXT,
  verifier    TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connections (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    INTEGER,
  scope         TEXT,
  external_id   TEXT,
  meta          TEXT,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (user_id, provider)
);

CREATE TABLE IF NOT EXISTS settings (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc           TEXT NOT NULL,
  anthropic_key TEXT,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weeks (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week)
);

CREATE TABLE IF NOT EXISTS activities (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  date       TEXT NOT NULL,
  sport      TEXT,
  source     TEXT,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS activities_user_date ON activities(user_id, date DESC);

CREATE TABLE IF NOT EXISTS feedback (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  date       TEXT NOT NULL,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, session_id)
);
CREATE INDEX IF NOT EXISTS feedback_user_date ON feedback(user_id, date DESC);

CREATE TABLE IF NOT EXISTS digests (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week       TEXT NOT NULL,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, week)
);

CREATE TABLE IF NOT EXISTS sync_state (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- The strength program: a small stable set of movements, versioned in-doc.
CREATE TABLE IF NOT EXISTS lift_program (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Goals are structured and multiple: a volume goal and a race goal can be
-- live at once, with one marked primary for the confidence number.
CREATE TABLE IF NOT EXISTS goals (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id         TEXT NOT NULL,
  doc        TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS coach_runs (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  model      TEXT,
  usage      TEXT,
  ms         INTEGER,
  ok         INTEGER,
  error      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_runs_user ON coach_runs(user_id, created_at DESC);
`;

export const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline',
    // Written with IF NOT EXISTS so a ledger that predates versioning adopts
    // version 1 without trying to rebuild the tables it already has.
    up: (db) => db.exec(BASELINE),
  },
];

export const LATEST = MIGRATIONS.reduce((n, m) => Math.max(n, m.version), 0);

export const schemaVersion = (db) => db.prepare('PRAGMA user_version').get().user_version;

/** Does this database already hold rows worth backing up before we touch it? */
function hasData(db) {
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'activities'",
  ).get();
  if (!row.n) return false;
  return db.prepare('SELECT COUNT(*) AS n FROM activities').get().n > 0;
}

/**
 * Bring a database up to the latest schema.
 *
 * Each step runs in its own transaction with its version bump, so a failure
 * leaves the database on the last version that fully applied rather than
 * half-way through one. A snapshot is taken first whenever there is both work
 * to do and data to lose.
 */
export function migrate(db, { backup = snapshot, log = null } = {}) {
  const from = schemaVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from).sort((a, b) => a.version - b.version);
  if (!pending.length) return { from, to: from, applied: [], backup: null };

  // Anything with rows in it gets a snapshot first, whatever version it claims
  // to be. A ledger sitting at version 0 is not a new one — it is the oldest
  // one there is, created before versioning existed, and it is carrying the
  // most history of any database this will ever run against.
  let saved = null;
  if (hasData(db)) {
    saved = backup(db, { tag: 'pre-migration' });
    if (saved?.error) log?.(`  backup before migrating failed: ${saved.error}`);
  }

  const applied = [];
  for (const step of pending) {
    db.exec('BEGIN');
    try {
      step.up(db);
      // PRAGMA takes a literal, not a binding, and version is ours not input.
      db.exec(`PRAGMA user_version = ${Number(step.version)}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${step.version} (${step.name}) failed: ${err.message}`, { cause: err });
    }
    applied.push(step);
    log?.(`  schema -> ${step.version} (${step.name})`);
  }
  return { from, to: schemaVersion(db), applied, backup: saved };
}
