// Importing a module must not touch a database.
//
// This is not hypothetical. `npm test` pulls in db.js through the fitness,
// program and backtest modules, and while the migration ran at the top level
// of db.js that alone was enough to migrate the real ledger — the suite
// altered the file it was supposed to be nowhere near.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-side-'));
test.after(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* leave it to the OS */ }
});

/** Import a module in a fresh process pointed at a throwaway database. */
function importInIsolation(specifier, dbFile) {
  execFileSync(process.execPath, [
    '--experimental-sqlite', '--no-warnings',
    '--input-type=module',
    '-e', `await import(${JSON.stringify(specifier)});`,
  ], { cwd: ROOT, env: { ...process.env, DB_PATH: dbFile }, stdio: 'pipe' });
}

const MODULES = [
  '../server/db.js',
  '../server/fitness.js',
  '../server/program.js',
  '../server/backtest.js',
  '../server/coach.js',
];

for (const mod of MODULES) {
  test(`importing ${mod.replace('../', '')} does not migrate anything`, () => {
    const file = path.join(tmp, `${path.basename(mod, '.js')}.db`);
    importInIsolation(new URL(mod, import.meta.url).href, file);

    if (!fs.existsSync(file)) return; // never even opened one, which is better
    const db = new DatabaseSync(file, { readOnly: true });
    const version = db.prepare('PRAGMA user_version').get().user_version;
    db.close();
    assert.equal(version, 0, `importing ${mod} migrated the database it opened`);
  });
}

test('importing a module does not write a backup either', () => {
  const file = path.join(tmp, 'backupcheck.db');
  importInIsolation(new URL('../server/fitness.js', import.meta.url).href, file);
  const dir = path.join(tmp, 'backups');
  const wrote = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  assert.deepEqual(wrote, [], 'a snapshot was taken just by importing');
});
