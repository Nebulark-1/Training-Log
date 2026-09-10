// Migrations run against real databases, including ones that predate
// versioning. A migration that half-applies is worse than one that refuses,
// so the rollback behaviour is the part worth proving.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LATEST, MIGRATIONS, migrate, schemaVersion } from '../server/migrations.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-mig-'));
let n = 0;
const fresh = () => new DatabaseSync(path.join(tmp, `t${++n}.db`));
const noBackup = () => null;

// Windows will not unlink a file a still-open handle is holding, and a test
// that fails mid-way leaves one behind. Cleanup is not what is under test.
test.after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* leave it to the OS */ }
});

test('an empty database is brought to the latest version', () => {
  const db = fresh();
  const r = migrate(db, { backup: noBackup });
  assert.equal(r.from, 0);
  assert.equal(r.to, LATEST);
  assert.equal(schemaVersion(db), LATEST);
  db.close();
});

test('migrating twice is a no-op', () => {
  const db = fresh();
  migrate(db, { backup: noBackup });
  const again = migrate(db, { backup: noBackup });
  assert.deepEqual(again.applied, []);
  assert.equal(again.to, LATEST);
  db.close();
});

test('every table the app writes to exists afterwards', () => {
  const db = fresh();
  migrate(db, { backup: noBackup });
  const tables = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).all().map((r) => r.name));
  for (const t of ['users', 'auth_sessions', 'oauth_states', 'connections', 'settings',
    'plans', 'weeks', 'activities', 'feedback', 'digests', 'sync_state',
    'lift_program', 'goals', 'coach_runs']) {
    assert.ok(tables.has(t), `missing table ${t}`);
  }
  db.close();
});

test('a ledger that predates versioning adopts version 1 and keeps its rows', () => {
  // This is the real case: the schema was created before user_version was
  // ever set, so the tables are already there and the counter says zero.
  const file = path.join(tmp, 'legacy.db');
  const first = new DatabaseSync(file);
  migrate(first, { backup: noBackup });
  first.exec("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01')");
  first.exec("INSERT INTO activities (user_id, id, date, doc, updated_at) "
    + "VALUES ('u1', 'a1', '2026-09-01', '{}', '2026-09-01')");
  first.exec('PRAGMA user_version = 0'); // pretend versioning never happened
  first.close();

  const db = new DatabaseSync(file);
  const r = migrate(db, { backup: noBackup });
  assert.equal(r.from, 0);
  assert.equal(r.to, LATEST);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM activities').get().n, 1,
    'the existing rows must survive');
  db.close();
});

test('a database with rows is snapshotted before the schema is touched', () => {
  const file = path.join(tmp, 'withdata.db');
  const first = new DatabaseSync(file);
  migrate(first, { backup: noBackup });
  first.exec("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01')");
  first.exec("INSERT INTO activities (user_id, id, date, doc, updated_at) "
    + "VALUES ('u1', 'a1', '2026-09-01', '{}', '2026-09-01')");
  first.exec('PRAGMA user_version = 0');
  first.close();

  const db = new DatabaseSync(file);
  let asked = null;
  migrate(db, { backup: (_db, opts) => { asked = opts; return { path: 'x', bytes: 1 }; } });
  assert.equal(asked?.tag, 'pre-migration', 'a snapshot should be taken first');
  db.close();
});

test('a brand new database is not snapshotted, because there is nothing to lose', () => {
  const db = fresh();
  let asked = false;
  migrate(db, { backup: () => { asked = true; return null; } });
  assert.equal(asked, false);
  db.close();
});

// --- failure behaviour -----------------------------------------------------

test('a failing step rolls back and leaves the version where it was', () => {
  const db = fresh();
  migrate(db, { backup: noBackup });
  const before = schemaVersion(db);

  const bad = {
    version: LATEST + 1,
    name: 'deliberately broken',
    up: (d) => {
      d.exec('CREATE TABLE half_applied (id TEXT)');
      d.exec('THIS IS NOT SQL');
    },
  };
  MIGRATIONS.push(bad);
  try {
    assert.throws(() => migrate(db, { backup: noBackup }), /deliberately broken/);
    assert.equal(schemaVersion(db), before, 'the version must not move');
    const left = db.prepare(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'half_applied'",
    ).get().n;
    assert.equal(left, 0, 'the half-finished table must be rolled back');
  } finally {
    MIGRATIONS.pop();
    db.close();
  }
});

test('an earlier step that succeeded is kept when a later one fails', () => {
  const db = fresh();
  migrate(db, { backup: noBackup });
  const good = { version: LATEST + 1, name: 'good', up: (d) => d.exec('CREATE TABLE kept (id TEXT)') };
  const bad = { version: LATEST + 2, name: 'bad', up: () => { throw new Error('nope'); } };
  MIGRATIONS.push(good, bad);
  try {
    assert.throws(() => migrate(db, { backup: noBackup }));
    assert.equal(schemaVersion(db), LATEST + 1, 'should stop on the last version that fully applied');
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'kept'").get().n, 1);
  } finally {
    MIGRATIONS.pop();
    MIGRATIONS.pop();
    db.close();
  }
});

// --- the list itself -------------------------------------------------------

test('migration versions are unique and consecutive from 1', () => {
  const versions = MIGRATIONS.map((m) => m.version).sort((a, b) => a - b);
  assert.deepEqual(versions, versions.map((_, i) => i + 1),
    'versions must run 1, 2, 3 with no gaps or repeats');
});

test('every migration has a name and an up function', () => {
  for (const m of MIGRATIONS) {
    assert.equal(typeof m.name, 'string');
    assert.ok(m.name.length, `migration ${m.version} has no name`);
    assert.equal(typeof m.up, 'function');
  }
});
