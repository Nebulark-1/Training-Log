// Configuration, secrets, and token encryption.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
const DATA_DIR = path.join(ROOT, 'data');

// --- .env ------------------------------------------------------------------
// Loaded into process.env without overwriting anything already set, so real
// environment variables always win over the file.
function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val && process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

fs.mkdirSync(DATA_DIR, { recursive: true });

// --- app secret ------------------------------------------------------------
// Encrypts stored OAuth tokens. Generated and persisted on first run so the
// app works with no setup, but it can be pinned with APP_SECRET in .env
// (required if you ever run more than one instance).
function appSecret() {
  if (process.env.APP_SECRET) return Buffer.from(process.env.APP_SECRET, 'utf8');
  const file = path.join(DATA_DIR, '.app-secret');
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'hex');
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return Buffer.from(generated, 'hex');
}

const SECRET = appSecret();
const ENC_KEY = crypto.hkdfSync('sha256', SECRET, Buffer.alloc(0), Buffer.from('token-encryption'), 32);

/** Encrypt a secret for storage at rest. Returns null for empty input. */
export function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENC_KEY), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');
}

/** Decrypt a stored secret. Returns null if absent or tampered with. */
export function decrypt(blob) {
  if (!blob) return null;
  const parts = String(blob).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENC_KEY), Buffer.from(parts[1], 'base64'));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

const port = Number(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';

export const config = {
  port,
  host,
  // Public origin used to build OAuth redirect URIs. Must match what you
  // registered with Google and Strava.
  baseUrl: (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, ''),
  isProd: process.env.NODE_ENV === 'production',
  dataDir: DATA_DIR,
  dbPath: process.env.DB_PATH || path.join(DATA_DIR, 'ledger.db'),
  publicDir: path.join(ROOT, 'public'),
  seedDir: path.join(ROOT, 'seed'),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    get enabled() { return Boolean(this.clientId && this.clientSecret); },
  },

  strava: {
    clientId: process.env.STRAVA_CLIENT_ID || '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET || '',
    get enabled() { return Boolean(this.clientId && this.clientSecret); },
    // Proves a webhook callback is ours. Derived from the app secret unless
    // set, so it is stable across restarts and never sits in the repo.
    get verifyToken() {
      return process.env.STRAVA_VERIFY_TOKEN
        || crypto.createHash('sha256').update(`strava-verify:${Buffer.from(ENC_KEY).toString('hex')}`).digest('hex').slice(0, 32);
    },
  },

  anthropic: {
    // The server pays for every account's coaching; the plan decides the
    // model. When unset the SDK still resolves an `ant auth login` profile.
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    // Server-side refusal fallbacks, on by default for Opus 5.
    fallbacks: process.env.CLAUDE_FALLBACKS !== '0',
  },

  accounts: {
    // The owner's account is Expert and never metered.
    ownerEmail: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
    // While closed: only these addresses may create an account. Empty means open.
    allowedEmails: (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  },

  // Local single-user login, for running without Google credentials. Refused
  // in production or when not bound to a loopback address.
  get devLoginAllowed() {
    return !this.isProd && !this.google.enabled &&
      (host === '127.0.0.1' || host === 'localhost' || host === '::1');
  },
};
