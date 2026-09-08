// Login: Google OAuth when configured, a local single-user login otherwise.
import express from 'express';
import { config } from './config.js';
import {
  createSession, createUser, destroySession, findUserByGoogleSub, findUserById,
  saveOauthState, takeOauthState, touchUser, userForSession,
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
    if (user) {
      touchUser(user.id, { email: claims.email, name: claims.name, picture: claims.picture });
      user = findUserById(user.id);
    } else {
      user = createUser({
        googleSub: claims.sub, email: claims.email || null,
        name: claims.name || null, picture: claims.picture || null,
      });
    }
    const session = createSession(user.id);
    res.cookie(COOKIE, session.id, cookieOptions());
    res.redirect('/');
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
  if (!user) user = createUser({ googleSub: 'local:dev', name: 'Local athlete', email: null });
  const session = createSession(user.id);
  res.cookie(COOKIE, session.id, cookieOptions());
  res.json({ ok: true, user: { id: user.id, name: user.name } });
});

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionId);
  res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
