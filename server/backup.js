// Snapshots of the database.
//
// The ledger is the only copy of the training history, and every score and
// prediction is derived from it. `VACUUM INTO` is the right tool: it takes a
// consistent copy of a live WAL database in one statement, which a file copy
// does not — copying the bare .db silently leaves behind whatever is still in
// the -wal file.
//
// Snapshots are tagged. `daily` rotates on its own; `pre-migration` is taken
// before the schema changes and is kept longer, because that is the moment
// something can go wrong in a way that is hard to undo.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Beside the database being backed up, not beside the default one. Point
// DB_PATH at a copy to try something out and the snapshots follow it there,
// instead of quietly piling up next to the real ledger.
export const BACKUP_DIR = path.join(path.dirname(path.resolve(config.dbPath)), 'backups');

/** How many of each tag to keep. */
export const KEEP = { daily: 7, 'pre-migration': 10, manual: 5 };

const stamp = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-').replace('Z', '');

const parseName = (file) => {
  const m = /^ledger-(.+)-(\d{4}-\d{2}-\d{2}T[\d-]+)\.db$/.exec(file);
  return m ? { file, tag: m[1], at: m[2].replace(/-/g, (c, i) => (i > 12 ? ':' : c)) } : null;
};

/** Existing snapshots, newest first. */
export function listBackups(tag = null) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .map(parseName)
    .filter((b) => b && (!tag || b.tag === tag))
    .map((b) => {
      const full = path.join(BACKUP_DIR, b.file);
      return { ...b, path: full, bytes: fs.statSync(full).size, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function prune(tag) {
  const keep = KEEP[tag] ?? 5;
  for (const old of listBackups(tag).slice(keep)) {
    try { fs.unlinkSync(old.path); } catch { /* a snapshot we cannot remove is not worth failing over */ }
  }
}

/**
 * Take a snapshot. Returns { path, bytes } or null when one was skipped.
 *
 * A failed snapshot must never stop the server from starting: losing today's
 * backup is bad, refusing to run at all is worse.
 */
export function snapshot(db, { tag = 'manual' } = {}) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `ledger-${tag}-${stamp()}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    prune(tag);
    return { path: file, bytes: fs.statSync(file).size };
  } catch (err) {
    return { error: err.message };
  }
}

/** A snapshot at most once a day, called on startup. */
export function dailySnapshot(db) {
  const newest = listBackups('daily')[0];
  if (newest && Date.now() - newest.mtime < 20 * 3600 * 1000) return null;
  return snapshot(db, { tag: 'daily' });
}
