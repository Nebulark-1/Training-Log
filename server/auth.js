// Login: Google OAuth when configured, a local single-user login otherwise.
import express from 'express';
import { config } from './config.js';
import {
  createSession, createUser, destroySession, findUserByGoogleSub, findUserById,
  saveOauthState, setTier, takeOauthState, touchUser, userForSession,
} from './db.js';

const COOKIE = 'vl_session';
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl.startsWith('https://'),
    path: '/',
    maxAge: 30 * 86400 * 1000,
  };
}

/** Populates req.user from the session cookie. Never rejects. */
export function attachUser(req, _res, next) {
  const sid = req.cookies?.[COOKIE];
  req.sessionId = sid || null;
  req.user = sid ? userForSession(sid) : null;
  next();
}

/** Gate for API routes. */
export function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'not_signed_in' });
  next();
}

/**
 * The id_token comes straight from Google's token endpoint over TLS, so its
 * payload is trustworthy without a signature check (Google documents this for
 * the authorization-code flow). Audience, issuer and expiry are still checked.
 */
function readIdToken(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed id_token');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (claims.aud !== config.google.clientId) throw new Error('id_token audience mismatch');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) {
    throw new Error('id_token issuer mismatch');
  }
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) throw new Error('id_token expired');
  if (!claims.sub) throw new Error('id_token missing subject');
  return claims;
}

export const authRouter = express.Router();

authRouter.get('/status', (req, res) => {
  res.json({
    signedIn: Boolean(req.user),
    google: config.google.enabled,
    devLogin: config.devLoginAllowed,
    user: req.user ? { id: req.user.id, email: req.user.email, name: req.user.name, picture: req.user.picture } : null,
  });
});

/**
 * Who may have an account, and which plan they land on.
 *
 * Google gives us a verified address. The owner is Expert and never metered;
 * while the door is closed, an allowlist decides who else gets in at all.
 */
function admit(claims) {
  const email = String(claims.email || '').toLowerCase();
  if (!email || claims.email_verified === false) return { ok: false, why: 'unverified' };
  const isOwner = config.accounts.ownerEmail && email === config.accounts.ownerEmail;
  const allowed = config.accounts.allowedEmails;
  if (!isOwner && allowed.length && !allowed.includes(email)) return { ok: false, why: 'closed' };
  return { ok: true, email, tier: isOwner ? 'expert' : 'basic', isOwner };
}

authRouter.get('/google/start', (req, res) => {
  if (!config.google.enabled) return res.status(400).send('Google sign-in is not configured.');
  const state = saveOauthState('google');
  const url = new URL(GOOGLE_AUTH);
  url.search = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.baseUrl}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  }).toString();
  res.redirect(url.toString());
});

authRouter.get('/google/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/?auth=denied');
    if (!takeOauthState(req.query.state, 'google')) return res.redirect('/?auth=badstate');

    const body = new URLSearchParams({
      code: String(req.query.code || ''),
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.baseUrl}/auth/google/callback`,
      grant_type: 'authorization_code',
    });
    const resp = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!resp.ok) throw new Error(`token exchange failed (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const claims = readIdToken((await resp.json()).id_token);

    let user = findUserByGoogleSub(claims.sub);
    const entry = admit(claims);
    if (!user && !entry.ok) return res.redirect(`/?auth=${entry.why}`);

    if (user) {
      touchUser(user.id, { email: claims.email, name: claims.name, picture: claims.picture });
      // The owner is always Expert, even on an account made before that was true.
      if (entry.ok && entry.isOwner && user.tier !== 'expert') setTier(user.id, 'expert');
      user = findUserById(user.id);
    } else {
      user = createUser({
        googleSub: claims.sub, email: entry.email,
        name: claims.name || null, picture: claims.picture || null, tier: entry.tier,
      });
    }
    const session = createSession(user.id);
    res.cookie(COOKIE, session.id, cookieOptions());
    res.redirect(user.created_at === user.last_seen ? '/?welcome=1' : '/');
  } catch (err) {
    console.error('[auth] google callback:', err.message);
    res.redirect('/?auth=failed');
  }
});

// Local login for running without Google credentials. Creates (or reuses) the
// single local account. Disabled in production and off-loopback.
authRouter.post('/dev', (req, res) => {
  if (!config.devLoginAllowed) return res.status(403).json({ error: 'dev_login_disabled' });
  let user = findUserByGoogleSub('local:dev');
  // The local account stands in for the owner when there is no Google sign-in.
  if (!user) user = createUser({ googleSub: 'local:dev', name: 'Local athlete', email: null, tier: 'expert' });
  else if (user.tier !== 'expert') { setTier(user.id, 'expert'); user = findUserById(user.id); }
  const session = createSession(user.id);
  res.cookie(COOKIE, session.id, cookieOptions());
  res.json({ ok: true, user: { id: user.id, name: user.name } });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionId);
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
