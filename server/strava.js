// Strava: per-user OAuth, token refresh, and activity sync.
//
// Activities are normalized to imperial units once, here, so the client and the
// coach both read the same shapes: miles, sec/mile, feet, and per-mile splits.
import express from 'express';
import { config, decrypt, encrypt } from './config.js';
import {
  deleteConnection, getConnection, getSyncState, latestActivityDate, saveActivities, saveActivity, saveConnection, saveOauthState, saveSyncState, takeOauthState,
} from './db.js';
import { requireUser } from './auth.js';

const AUTHORIZE = 'https://www.strava.com/oauth/authorize';
const TOKEN = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';
const SCOPE = 'read,activity:read_all,profile:read_all';

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.280839895;
const METERS_PER_100YD = 91.44;
const KG_PER_LB = 0.45359237;

const SPORT_MAP = {
  Run: 'run', TrailRun: 'run', VirtualRun: 'run',
  Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike',
  EBikeRide: 'bike', Handcycle: 'bike', Velomobile: 'bike',
  Swim: 'swim',
  WeightTraining: 'lift', Crossfit: 'lift',
  Workout: 'strength', HighIntensityIntervalTraining: 'strength',
  Yoga: 'mobility', Pilates: 'mobility',
  Walk: 'walk', Hike: 'hike',
  Elliptical: 'cross', StairStepper: 'cross', Rowing: 'cross', VirtualRow: 'cross',
  NordicSki: 'cross', BackcountrySki: 'cross', AlpineSki: 'cross', Snowshoe: 'cross',
  IceSkate: 'cross', InlineSkate: 'cross', Kayaking: 'cross', Canoeing: 'cross',
  StandUpPaddling: 'cross', Surfing: 'cross', RockClimbing: 'cross', Soccer: 'cross',
  Golf: 'cross', Badminton: 'cross', Tennis: 'cross', Pickleball: 'cross',
  Squash: 'cross', Racquetball: 'cross', TableTennis: 'cross', Skateboard: 'cross',
  Wheelchair: 'cross', Sail: 'cross', Windsurf: 'cross', Kitesurf: 'cross', Snowboard: 'cross',
};
const DETAIL_SPORTS = new Set(['run', 'bike', 'swim', 'lift', 'strength']);
const RUN_TYPES = { 0: 'easy', 1: 'race', 2: 'long', 3: 'workout' };

const round = (x, n = 2) => (x == null || !isFinite(x) ? null : Number(Number(x).toFixed(n)));
const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null));

/** Seconds per mile, or null when the leg is too short to mean anything. */
function paceFrom(meters, seconds) {
  if (!meters || meters < 80 || !seconds) return null;
  return round(seconds / (meters / METERS_PER_MILE), 1);
}

export function normalize(a, detail = null) {
  const raw = a.sport_type || a.type || 'Workout';
  const sport = SPORT_MAP[raw] || 'other';
  const meters = Number(a.distance || 0);
  const moving = Number(a.moving_time || 0);
  const startLocal = String(a.start_date_local || '').replace('Z', '');

  const s = {
    id: `s${a.id}`,
    source: 'strava',
    stravaId: a.id,
    sport,
    sportRaw: raw,
    name: String(a.name || '').trim().slice(0, 160),
    date: startLocal.slice(0, 10),
    startLocal,
    miles: meters ? round(meters / METERS_PER_MILE, 3) : 0,
    movingMin: round(moving / 60, 1),
    elapsedMin: round(Number(a.elapsed_time || 0) / 60, 1),
    elevFt: round(Number(a.total_elevation_gain || 0) * FEET_PER_METER, 0),
    hrAvg: round(a.average_heartrate, 1),
    hrMax: round(a.max_heartrate, 0),
    cadence: round(a.average_cadence, 1),
    sufferScore: a.suffer_score ?? null,
    trainer: Boolean(a.trainer),
    commute: Boolean(a.commute),
    race: a.workout_type === 1,
    hasHr: Boolean(a.has_heartrate),
  };

  if (sport === 'run' || sport === 'walk' || sport === 'hike') {
    s.paceSecPerMi = paceFrom(meters, moving);
    s.runType = RUN_TYPES[a.workout_type] ?? null;
  }
  if (sport === 'bike') {
    s.speedMph = moving ? round((meters / METERS_PER_MILE) / (moving / 3600), 2) : null;
    s.avgWatts = round(a.average_watts, 0);
    s.normWatts = round(a.weighted_average_watts, 0);
    s.deviceWatts = Boolean(a.device_watts);
  }
  if (sport === 'swim') {
    s.yards = round(meters / 0.9144, 0);
    s.per100yd = meters && moving ? round(moving / (meters / METERS_PER_100YD), 1) : null;
  }

  if (detail) {
    s.calories = round(detail.calories, 0);
    const desc = String(detail.description || '').trim();
    if (desc) s.description = desc.slice(0, 1200);
    if (detail.device_name) s.device = detail.device_name;
    if (detail.gear?.name) s.gear = detail.gear.name;

    const splits = (detail.splits_standard || []).slice(0, 40).map((sp) => clean({
      mi: sp.split,
      miles: round((sp.distance || 0) / METERS_PER_MILE, 2),
      paceSecPerMi: paceFrom(sp.distance, sp.moving_time),
      hrAvg: round(sp.average_heartrate, 0),
      elevFt: round((sp.elevation_difference || 0) * FEET_PER_METER, 0),
    }));
    if (splits.length) s.splits = splits;

    const laps = (detail.laps || []).slice(0, 40).map((lp) => clean({
      n: lp.lap_index,
      name: String(lp.name || '').trim().slice(0, 40) || null,
      miles: round((lp.distance || 0) / METERS_PER_MILE, 2),
      minutes: round((lp.moving_time || 0) / 60, 1),
      paceSecPerMi: paceFrom(lp.distance, lp.moving_time),
      hrAvg: round(lp.average_heartrate, 0),
      hrMax: round(lp.max_heartrate, 0),
      elevFt: round((lp.total_elevation_gain || 0) * FEET_PER_METER, 0),
      avgWatts: round(lp.average_watts, 0),
    }));
    if (laps.length > 1) s.laps = laps;

    if (detail.best_efforts?.length) {
      s.bestEfforts = detail.best_efforts.slice(0, 8)
        .filter((b) => b.name)
        .map((b) => ({ name: b.name, sec: b.moving_time }));
    }
  }

  return clean(s);
}

// --- tokens ----------------------------------------------------------------
async function postForm(url, params) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Strava ${resp.status}: ${text.slice(0, 240)}`);
  return JSON.parse(text);
}

/** Valid access token for this user, refreshing when it is close to expiry. */
async function accessToken(userId) {
  const conn = getConnection(userId, 'strava');
  if (!conn) throw Object.assign(new Error('Strava is not connected.'), { code: 'not_connected' });

  if (conn.expires_at && conn.expires_at - 120 > Math.floor(Date.now() / 1000)) {
    return decrypt(conn.access_token);
  }
  const refresh = decrypt(conn.refresh_token);
  if (!refresh) throw Object.assign(new Error('Strava needs reconnecting.'), { code: 'reauth' });

  const payload = await postForm(TOKEN, {
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    refresh_token: refresh,
    grant_type: 'refresh_token',
  });
  saveConnection(userId, 'strava', {
    accessToken: encrypt(payload.access_token),
    refreshToken: encrypt(payload.refresh_token),
    expiresAt: payload.expires_at,
  });
  return payload.access_token;
}

/**
 * Strava's limit is per application, not per athlete: 200 requests a quarter
 * hour and 2,000 a day, shared by every account on this server. Every reply
 * reports where the app stands, and this remembers it so a sync can be
 * declined before it is the one that tips the whole app into a 429.
 */
export const budget = { short: 0, shortLimit: 200, daily: 0, dailyLimit: 2000, at: null };

function readBudget(resp) {
  const usage = resp.headers.get('x-ratelimit-usage');
  const limit = resp.headers.get('x-ratelimit-limit');
  if (usage) {
    const [s, d] = usage.split(',').map(Number);
    if (Number.isFinite(s)) budget.short = s;
    if (Number.isFinite(d)) budget.daily = d;
    budget.at = new Date().toISOString();
  }
  if (limit) {
    const [s, d] = limit.split(',').map(Number);
    if (Number.isFinite(s)) budget.shortLimit = s;
    if (Number.isFinite(d)) budget.dailyLimit = d;
  }
  return usage;
}

/** How much of the app's Strava allowance is left, as fractions. */
export function budgetLeft() {
  // The quarter-hour bucket resets on its own; treat a stale reading as clear.
  const stale = !budget.at || Date.now() - Date.parse(budget.at) > 15 * 60 * 1000;
  return {
    short: stale ? 1 : Math.max(0, 1 - budget.short / budget.shortLimit),
    daily: Math.max(0, 1 - budget.daily / budget.dailyLimit),
    ...budget,
  };
}

async function apiGet(token, pathAndQuery) {
  const resp = await fetch(`${API}${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const usage = readBudget(resp);
  if (resp.status === 401) throw Object.assign(new Error('Strava rejected the token.'), { code: 'reauth' });
  if (resp.status === 429) {
    throw Object.assign(new Error('Strava rate limit reached. Wait 15 minutes and sync again.'), { code: 'rate_limited' });
  }
  if (!resp.ok) throw new Error(`Strava ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
  return { data: await resp.json(), usage };
}

// --- sync ------------------------------------------------------------------
/**
 * Pull activities and upsert them. Incremental by default: starts a week before
 * the newest activity already stored so edited or late-uploaded sessions are
 * picked up, and falls back to `days` on a first sync.
 */
export async function syncUser(userId, { days = 180, detailDays = 28, detailMax = 25, full = false } = {}) {
  const left = budgetLeft();
  // A full sync is the expensive one — up to 30 listing pages plus a detail
  // call per recent session. Refuse it outright when the app is close to its
  // day, and thin the detail fetches when the quarter hour is getting tight,
  // rather than let one athlete's re-sync take the app down for everyone.
  if (full && left.daily < 0.25) {
    throw Object.assign(
      new Error("Strava's daily allowance for this app is nearly used. A full re-sync can wait until tomorrow; a normal sync still works."),
      { code: 'rate_budget', status: 429 },
    );
  }
  if (left.short < 0.4) detailMax = Math.min(detailMax, 5);
  if (left.daily < 0.15) detailMax = 0;

  const token = await accessToken(userId);
  const started = Date.now();

  let since = new Date(Date.now() - days * 86400000);
  if (!full) {
    const newest = latestActivityDate(userId);
    if (newest) {
      const incremental = new Date(`${newest}T00:00:00Z`);
      incremental.setUTCDate(incremental.getUTCDate() - 7);
      if (incremental > since) since = incremental;
    }
  }

  const athleteResp = await apiGet(token, '/athlete');
  const ath = athleteResp.data;
  const athlete = clean({
    id: ath.id,
    name: [ath.firstname, ath.lastname].filter(Boolean).join(' ') || null,
    weightLb: ath.weight ? round(ath.weight / KG_PER_LB, 1) : null,
    ftp: ath.ftp ?? null,
    city: ath.city ?? null,
  });

  const after = Math.floor(since.getTime() / 1000);
  const raw = [];
  let usage = null;
  for (let page = 1; page <= 30; page++) {
    const { data, usage: u } = await apiGet(token, `/athlete/activities?after=${after}&per_page=100&page=${page}`);
    usage = u ?? usage;
    if (!Array.isArray(data) || data.length === 0) break;
    raw.push(...data);
    if (data.length < 100) break;
  }
  raw.sort((a, b) => String(b.start_date_local || '').localeCompare(String(a.start_date_local || '')));

  // Splits and laps cost one API call each, so only recent sessions get them.
  const cutoff = new Date(Date.now() - detailDays * 86400000).toISOString().slice(0, 10);
  const wanted = raw
    .filter((a) => DETAIL_SPORTS.has(SPORT_MAP[a.sport_type || a.type] || 'other'))
    .filter((a) => String(a.start_date_local || '').slice(0, 10) >= cutoff)
    .slice(0, detailMax);

  const details = new Map();
  for (const a of wanted) {
    try {
      const { data, usage: u } = await apiGet(token, `/activities/${a.id}?include_all_efforts=false`);
      details.set(a.id, data);
      usage = u ?? usage;
    } catch (err) {
      if (err.code === 'rate_limited') break; // keep what we have; the summary still syncs
      throw err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const activities = raw.map((a) => normalize(a, details.get(a.id) || null));
  const written = saveActivities(userId, activities);

  const state = {
    lastSync: new Date().toISOString(),
    from: since.toISOString().slice(0, 10),
    fetched: activities.length,
    written,
    withDetail: details.size,
    newest: activities[0]?.date || latestActivityDate(userId),
    rateUsage: usage,
    athlete,
    ms: Date.now() - started,
  };
  saveSyncState(userId, state);
  return state;
}

/**
 * Bring in one activity by id — what a webhook event asks for. One detail
 * call, which carries every summary field too, so it goes straight through
 * the same normalizer as a sync.
 */
export async function syncOne(userId, activityId) {
  const token = await accessToken(userId);
  const { data } = await apiGet(token, `/activities/${activityId}?include_all_efforts=false`);
  const act = normalize(data, data);
  saveActivity(userId, act);
  const state = getSyncState(userId) || {};
  saveSyncState(userId, {
    ...state,
    newest: [state.newest || '', act.date].sort().pop(),
    lastWebhook: new Date().toISOString(),
    webhookEvents: (state.webhookEvents || 0) + 1,
  });
  return act;
}

// --- webhook subscription (one per application) -----------------------------
//
// Strava pushes activity events to a callback the app registers once. From
// then on a new run arrives within seconds and costs one API call, instead
// of every account polling. The verify token is what proves the callback is
// ours during registration.

export const verifyToken = () => config.strava.verifyToken;

export async function subscriptionStatus() {
  const q = new URLSearchParams({ client_id: config.strava.clientId, client_secret: config.strava.clientSecret });
  const resp = await fetch(`${API}/push_subscriptions?${q}`);
  if (!resp.ok) throw new Error(`Strava ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
  return resp.json();
}

export async function subscribe(callbackUrl) {
  return postForm(`${API}/push_subscriptions`, {
    client_id: config.strava.clientId,
    client_secret: config.strava.clientSecret,
    callback_url: callbackUrl,
    verify_token: verifyToken(),
  });
}

export async function unsubscribe(id) {
  const q = new URLSearchParams({ client_id: config.strava.clientId, client_secret: config.strava.clientSecret });
  const resp = await fetch(`${API}/push_subscriptions/${id}?${q}`, { method: 'DELETE' });
  if (!resp.ok && resp.status !== 204) throw new Error(`Strava ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
  return true;
}

// --- routes ----------------------------------------------------------------
export const stravaRouter = express.Router();

stravaRouter.get('/connect', requireUser, (req, res) => {
  if (!config.strava.enabled) return res.status(400).send('Strava is not configured on this server.');
  const state = saveOauthState('strava', req.user.id);
  const url = new URL(AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: config.strava.clientId,
    response_type: 'code',
    redirect_uri: `${config.baseUrl}/auth/strava/callback`,
    approval_prompt: 'auto',
    scope: SCOPE,
    state,
  }).toString();
  res.redirect(url.toString());
});

stravaRouter.get('/callback', async (req, res) => {
  try {
    if (req.query.error) return res.redirect('/?strava=denied');
    const row = takeOauthState(req.query.state, 'strava');
    if (!row || !row.user_id) return res.redirect('/?strava=badstate');
    if (!String(req.query.scope || '').includes('activity:read_all')) {
      return res.redirect('/?strava=scope');
    }

    const payload = await postForm(TOKEN, {
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      code: String(req.query.code || ''),
      grant_type: 'authorization_code',
    });
    saveConnection(row.user_id, 'strava', {
      accessToken: encrypt(payload.access_token),
      refreshToken: encrypt(payload.refresh_token),
      expiresAt: payload.expires_at,
      scope: String(req.query.scope || ''),
      externalId: String(payload.athlete?.id ?? ''),
      meta: {
        athlete: clean({
          id: payload.athlete?.id,
          name: [payload.athlete?.firstname, payload.athlete?.lastname].filter(Boolean).join(' ') || null,
        }),
      },
    });
    res.redirect('/?strava=connected');
  } catch (err) {
    console.error('[strava] callback:', err.message);
    res.redirect('/?strava=failed');
  }
});

stravaRouter.post('/disconnect', requireUser, (req, res) => {
  deleteConnection(req.user.id, 'strava');
  res.json({ ok: true });
});
