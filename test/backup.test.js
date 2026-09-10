// A backup that cannot be opened is not a backup. These check that a snapshot
// is a real, readable database with the rows in it, including the ones still
// sitting in the write-ahead log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from '../server/migrations.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-bak-'));
test.after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* leave it to the OS */ }
});

/** A ledger with a handful of activities, in WAL mode like the real one. */
function seeded(name, rows = 5) {
  const file = path.join(tmp, name);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db, { backup: () => null });
  db.exec("INSERT INTO users (id, created_at) VALUES ('u1', '2026-01-01')");
  for (let i = 0; i < rows; i++) {
    db.prepare('INSERT INTO activities (user_id, id, date, doc, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('u1', `a${i}`, '2026-09-01', JSON.stringify({ id: `a${i}`, miles: i }), '2026-09-01');
  }
  return { db, file };
}

test('a snapshot is a readable database holding every row', () => {
  const { db } = seeded('src.db', 7);
  const out = path.join(tmp, 'snap.db');
  db.exec(`VACUUM INTO '${out}'`);
  db.close();

  const copy = new DatabaseSync(out, { readOnly: true });
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM activities').get().n, 7);
  copy.close();
});

test('a snapshot includes rows still in the write-ahead log', () => {
  // This is why it is VACUUM INTO and not a file copy: in WAL mode the newest
  // writes live in the -wal file, and copying the bare .db silently loses them.
  const { db, file } = seeded('wal.db', 4);
  db.prepare('INSERT INTO activities (user_id, id, date, doc, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('u1', 'newest', '2026-09-09', '{}', '2026-09-09');

  const out = path.join(tmp, 'wal-snap.db');
  db.exec(`VACUUM INTO '${out}'`);

  const bareCopy = path.join(tmp, 'wal-bare.db');
  fs.copyFileSync(file, bareCopy);
  db.close();

  const snap = new DatabaseSync(out, { readOnly: true });
  assert.equal(snap.prepare("SELECT COUNT(*) AS n FROM activities WHERE id = 'newest'").get().n, 1,
    'VACUUM INTO must carry the write-ahead log');
  snap.close();

  // And the trap itself, demonstrated: the bare file is missing the row, or is
  // not even a usable database, because everything written so far is still in
  // the -wal beside it.
  let bareHas = null;
  try {
    const bare = new DatabaseSync(bareCopy, { readOnly: true });
    bareHas = bare.prepare("SELECT COUNT(*) AS n FROM activities WHERE id = 'newest'").get().n;
    bare.close();
  } catch (err) {
    bareHas = `unusable: ${err.message}`;
  }
  assert.notEqual(bareHas, 1, `a bare file copy should not be a complete backup, got ${bareHas}`);
});

test('a snapshot carries the schema version forward', () => {
  const { db } = seeded('ver.db', 1);
  const out = path.join(tmp, 'ver-snap.db');
  db.exec(`VACUUM INTO '${out}'`);
  const before = db.prepare('PRAGMA user_version').get().user_version;
  db.close();

  const copy = new DatabaseSync(out, { readOnly: true });
  assert.equal(copy.prepare('PRAGMA user_version').get().user_version, before,
    'a restored backup has to know which schema it is');
  copy.close();
});

test('the module keeps a bounded number of each kind', async () => {
  const { KEEP } = await import('../server/backup.js');
  for (const [tag, n] of Object.entries(KEEP)) {
    assert.ok(Number.isInteger(n) && n > 0, `${tag} keeps a nonsense number`);
  }
  assert.ok(KEEP['pre-migration'] >= KEEP.daily,
    'the snapshot taken before a schema change is the one worth keeping longest');
});
