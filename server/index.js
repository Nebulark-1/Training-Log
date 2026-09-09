// Volume Ledger — local web server.
import express from 'express';
import net from 'node:net';
import path from 'node:path';
import { config, encrypt } from './config.js';
import { attachUser, authRouter, requireUser } from './auth.js';
import { stravaRouter, syncUser } from './strava.js';
import {
  applyWeekEdit, buildMacrocycle, claudeStatus, DEFAULT_SETTINGS, planWeek,
  profileFor, reviewDigest, reviewProgram,
} from './coach.js';
import {
  activityCount, deleteActivity, deleteGoal, exportAll, getActivities, getActivity,
  getConnection, getDigests, getFeedback, getPlan, getSettings, getSyncState, getWeek,
  getWeeks, listGoals, newId, pruneExpired, saveActivity, saveFeedback, saveGoal,
  saveSettings, saveUserKey, saveDigest, setPrimaryGoal,
} from './db.js';
import {
  applyProgramChange, ensureProgram, liftHistory, offProgramMovements,
  prescribeSession, strengthProgress,
} from './program.js';
import { fitnessSnapshot } from './fitness.js';
import { hasBlocking } from './guardrails.js';
import { seedUser } from './seed.js';
import { isStrength, sportKey } from '../public/lib/sports.js';
import { movementId } from '../public/lib/movements.js';
import {
  daysBetween, isoWeek, mondayOf, parseYmd, thisWeek, weekAdd, ymd,
} from '../public/lib/dates.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Minimal cookie parsing — the only cookie is the session id.
app.use((req, _res, next) => {
  req.cookies = {};
  const header = req.headers.cookie;
  if (header) {
    for (const part of header.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 1) continue;
      req.cookies[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  next();
});
app.use(attachUser);

app.use('/auth', authRouter);
app.use('/auth/strava', stravaRouter);

/** The exercises planned for the strength session on this date, if any. */
function prescriptionFor(userId, session) {
  const wkKey = isoWeek(parseYmd(session.date));
  const wk = getWeek(userId, wkKey);
  if (!wk?.days) return [];
  const idx = daysBetween(ymd(mondayOf(wkKey)), session.date);
  const day = wk.days[idx];
  if (!day?.sessions) return [];
  const match = day.sessions.find((s) => isStrength(s.sport) && s.exercises?.length);
  return match?.exercises || [];
}

const api = express.Router();
api.use(requireUser);
// Every authenticated request runs through seeding, so a new account always
// has a goal, program, plan and week in place whichever endpoint it reaches.
api.use((req, _res, next) => {
  seedUser(req.user.id);
  next();
});

/** Everything the shell and most pages need, in one request. */
api.get('/data', (req, res) => {
  const userId = req.user.id;
  const weeksBack = Math.min(52, Math.max(4, Number(req.query.weeks) || 16));
  const week = thisWeek();
  const fromWeek = weekAdd(week, -weeksBack);
  const fromDate = ymd(mondayOf(fromWeek));

  const { settings, goals } = profileFor(userId);
  const strava = getConnection(userId, 'strava');
  const feedback = {};
  for (const f of getFeedback(userId, fromDate)) feedback[f.sessionId] = f;
  const weeks = {};
  for (const w of getWeeks(userId, fromWeek)) weeks[w.week] = w;
  const digests = {};
  for (const d of getDigests(userId, 12)) digests[d.week] = d;

  res.json({
    today: ymd(new Date()),
    week,
    user: { id: req.user.id, name: req.user.name, email: req.user.email, picture: req.user.picture },
    settings,
    goals,
    plan: getPlan(userId),
    weeks,
    sessions: getActivities(userId, fromDate, 700),
    feedback,
    digests,
    program: ensureProgram(userId),
    sync: getSyncState(userId),
    totals: { activities: activityCount(userId) },
    connections: {
      strava: strava
        ? { connected: true, athlete: strava.meta?.athlete || null, scope: strava.scope }
        : { connected: false, configured: config.strava.enabled },
    },
    claude: {
      ...claudeStatus(userId),
      allowUserKeys: config.anthropic.allowUserKeys,
      hasUserKey: Boolean(getSettings(userId)?._hasKey),
    },
  });
});

/** The derived fitness layer. Separate because it costs a full-history pass. */
api.get('/fitness', (req, res) => {
  res.json(fitnessSnapshot(req.user.id, { goals: listGoals(req.user.id) }));
});

// --- settings and goals ----------------------------------------------------
api.put('/settings', (req, res) => {
  const b = req.body || {};
  const current = getSettings(req.user.id) || {};
  delete current._key;
  delete current._hasKey;
  saveSettings(req.user.id, {
    ...current,
    goal: String(b.goal ?? current.goal ?? '').slice(0, 2000),
    targetMpw: Number(b.targetMpw) || null,
    targetDate: String(b.targetDate ?? '').slice(0, 10),
    keep: String(b.keep ?? '').slice(0, 500),
    limits: String(b.limits ?? '').slice(0, 2000),
    restDays: Array.isArray(b.restDays) ? b.restDays.slice(0, 7).map(String) : (current.restDays || []),
    source: 'user',
    updatedAt: new Date().toISOString(),
  });
  res.json({ ok: true });
});

api.get('/goals', (req, res) => res.json({ goals: listGoals(req.user.id) }));

api.put('/goals/:id', (req, res) => {
  const b = req.body || {};
  const metric = String(b.metric || 'weeklyDistance');
  const goal = saveGoal(req.user.id, {
    id: req.params.id === 'new' ? newId(6) : req.params.id,
    sport: sportKey(b.sport || 'run'),
    metric,
    target: Number(b.target) || 0,
    unit: String(b.unit || '').slice(0, 12),
    distanceMi: Number(b.distanceMi) || null,
    byDate: /^\d{4}-\d{2}-\d{2}$/.test(String(b.byDate)) ? b.byDate : '',
    label: String(b.label || '').slice(0, 160),
    note: String(b.note || '').slice(0, 600),
    primary: Boolean(b.primary),
    source: 'user',
  });
  if (goal.primary) setPrimaryGoal(req.user.id, goal.id);
  res.json({ ok: true, goal, goals: listGoals(req.user.id) });
});

api.delete('/goals/:id', (req, res) => {
  deleteGoal(req.user.id, req.params.id);
  res.json({ ok: true, goals: listGoals(req.user.id) });
});

api.post('/goals/:id/primary', (req, res) => {
  setPrimaryGoal(req.user.id, req.params.id);
  res.json({ ok: true, goals: listGoals(req.user.id) });
});

api.put('/claude-key', (req, res) => {
  if (!config.anthropic.allowUserKeys) return res.status(403).json({ error: 'user_keys_disabled' });
  const key = String(req.body?.key || '').trim();
  if (key && !/^sk-ant-/.test(key)) return res.status(400).json({ error: 'that does not look like an Anthropic API key' });
  saveUserKey(req.user.id, key ? encrypt(key) : null);
  res.json({ ok: true, hasUserKey: Boolean(key) });
});

// --- strength program ------------------------------------------------------
api.get('/program', (req, res) => {
  const userId = req.user.id;
  const program = ensureProgram(userId);
  const history = liftHistory(userId);
  res.json({
    program,
    offProgram: offProgramMovements(userId, program),
    progress: strengthProgress(userId),
    prescriptions: (program.sessions || []).map((s) => prescribeSession(program, s.id, history)),
  });
});

api.put('/program', (req, res) => {
  const result = applyProgramChange(req.user.id, req.body?.program || {}, {
    by: 'user',
    reason: String(req.body?.reason || 'edited by hand'),
    today: ymd(new Date()),
  });
  res.status(result.ok ? 200 : 422).json(result);
});

api.get('/strength', (req, res) => {
  res.json({ progress: strengthProgress(req.user.id) });
});

// --- sessions and feedback -------------------------------------------------
api.post('/sessions', (req, res) => {
  const b = req.body || {};
  const sport = sportKey(b.sport || 'run');
  const dist = Number(b.dist) || 0;
  const min = Number(b.minutes) || 0;
  const doc = {
    id: `m${Date.now().toString(36)}${newId(3)}`,
    source: 'manual',
    sport,
    name: String(b.name || '').trim().slice(0, 160) || sport,
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? b.date : ymd(new Date()),
    movingMin: min || null,
    elevFt: Number(b.elevFt) || null,
    hrAvg: Number(b.hrAvg) || null,
  };
  if (sport === 'swim') {
    doc.yards = dist || null;
    if (dist && min) doc.per100yd = (min * 60) / (dist / 100);
  } else if (dist) {
    doc.miles = dist;
    if (min) doc.paceSecPerMi = (min * 60) / dist;
  }
  if (Array.isArray(b.lifts)) doc.lifts = normalizeLifts(b.lifts);
  for (const k of Object.keys(doc)) if (doc[k] == null) delete doc[k];
  saveActivity(req.user.id, doc);
  res.json({ ok: true, session: doc });
});

/** Per-set logging: reps, weight and optional RPE for every set. */
function normalizeLifts(list) {
  return (list || [])
    .filter((l) => l && String(l.ex || '').trim())
    .slice(0, 24)
    .map((l) => {
      const sets = (Array.isArray(l.sets) ? l.sets : [])
        .slice(0, 20)
        .map((s) => ({
          reps: Number(s.reps) || 0,
          lb: Number(s.lb) || 0,
          rpe: Number(s.rpe) > 0 ? Math.min(10, Number(s.rpe)) : null,
        }))
        .filter((s) => s.reps > 0 || s.lb > 0);
      return {
        exId: String(l.exId || movementId(l.ex)).slice(0, 60),
        ex: String(l.ex).trim().slice(0, 80),
        sets,
        note: String(l.note || '').slice(0, 200) || undefined,
      };
    })
    .filter((l) => l.sets.length);
}

api.patch('/sessions/:id', (req, res) => {
  const existing = getActivity(req.user.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const doc = { ...existing };

  if (Array.isArray(req.body?.lifts)) {
    const lifts = normalizeLifts(req.body.lifts);
    if (lifts.length) {
      doc.lifts = lifts;
      // Snapshot what was prescribed, so progression can compare later without
      // re-reading old plans.
      const prescribed = prescriptionFor(req.user.id, existing);
      if (prescribed.length) doc.prescribed = prescribed;
    } else {
      delete doc.lifts;
    }
  }
  if (req.body?.name != null) doc.name = String(req.body.name).slice(0, 160);
  saveActivity(req.user.id, doc);
  res.json({ ok: true, session: doc });
});

api.delete('/sessions/:id', (req, res) => {
  const existing = getActivity(req.user.id, req.params.id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  if (existing.source !== 'manual') return res.status(400).json({ error: 'only manual sessions can be deleted' });
  deleteActivity(req.user.id, req.params.id);
  res.json({ ok: true });
});

api.put('/feedback/:sessionId', (req, res) => {
  const session = getActivity(req.user.id, req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const num = (v, lo, hi) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
  };
  const doc = {
    sessionId: session.id,
    date: session.date,
    sport: session.sport,
    rpe: num(b.rpe, 1, 10),
    feel: num(b.feel, 1, 5),
    pain: num(b.pain, 0, 10),
    painSite: String(b.painSite || '').trim().slice(0, 120) || null,
    notes: String(b.notes || '').trim().slice(0, 4000) || null,
    loggedAt: new Date().toISOString(),
  };
  for (const k of Object.keys(doc)) if (doc[k] == null) delete doc[k];
  saveFeedback(req.user.id, session.id, doc);
  res.json({ ok: true, feedback: doc });
});

api.put('/digests/:week', (req, res) => {
  const week = String(req.params.week);
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ error: 'bad_week' });
  const existing = getDigests(req.user.id, 26).find((d) => d.week === week);
  saveDigest(req.user.id, week, {
    week,
    text: String(req.body?.text || '').slice(0, 20000),
    submittedAt: new Date().toISOString(),
    ...(existing?.review ? { review: existing.review } : {}),
  });
  res.json({ ok: true });
});

/**
 * Rearrange a planned week. The client sends the seven days it wants; the
 * server re-resolves strength prescriptions, recomputes volumes and re-runs the
 * guardrails as advice rather than a veto.
 */
api.patch('/weeks/:week', (req, res) => {
  const week = String(req.params.week);
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ error: 'bad_week' });
  if (!Array.isArray(req.body?.days) || req.body.days.length !== 7) {
    return res.status(400).json({ error: 'days must be an array of seven' });
  }
  try {
    res.json(applyWeekEdit(req.user.id, week, req.body.days, { note: req.body.note }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.code || 'edit_failed', message: err.message });
  }
});

// --- strava ----------------------------------------------------------------
api.post('/strava/sync', async (req, res) => {
  try {
    const state = await syncUser(req.user.id, { full: Boolean(req.body?.full) });
    res.json({ ok: true, sync: state });
  } catch (err) {
    console.error('[sync]', err.message);
    res.status(err.code === 'not_connected' ? 400 : 502)
      .json({ error: err.code || 'sync_failed', message: err.message });
  }
});

// --- coach -----------------------------------------------------------------
function coachError(res, err) {
  console.error('[coach]', err?.status || '', err?.message);
  const status = err?.status === 401 ? 401 : err?.status === 429 ? 429 : 502;
  const code = err?.code || (err?.status === 401 ? 'no_credentials' : err?.status === 429 ? 'rate_limited' : 'coach_failed');
  res.status(status).json({ error: code, message: String(err?.message || 'Claude request failed').slice(0, 400) });
}

api.post('/coach/plan-week', async (req, res) => {
  const week = String(req.body?.week || thisWeek());
  if (!/^\d{4}-W\d{2}$/.test(week)) return res.status(400).json({ error: 'bad_week' });
  try {
    const result = await planWeek(req.user.id, week, { force: Boolean(req.body?.force) });
    // A plan that trips a blocking guardrail is reported, not stored.
    res.status(result.ok ? 200 : 422).json({ ok: result.ok, week: result.week, violations: result.violations });
  } catch (err) { coachError(res, err); }
});

api.post('/coach/review-digest', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'empty_digest' });
  try {
    res.json({ ok: true, ...(await reviewDigest(req.user.id, text.slice(0, 20000))) });
  } catch (err) { coachError(res, err); }
});

api.post('/coach/build-plan', async (req, res) => {
  try {
    res.json({ ok: true, plan: await buildMacrocycle(req.user.id) });
  } catch (err) { coachError(res, err); }
});

api.post('/coach/program-review', async (req, res) => {
  try {
    const result = await reviewProgram(req.user.id);
    res.status(result.ok ? 200 : 422).json(result);
  } catch (err) { coachError(res, err); }
});

api.get('/export', (req, res) => {
  const data = exportAll(req.user.id);
  if (data.settings) delete data.settings._key;
  res.setHeader('Content-Disposition', `attachment; filename="volume-ledger-${ymd(new Date())}.json"`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(data, null, 1));
});

app.use('/api', api);

app.use(express.static(config.publicDir, { extensions: ['html'], maxAge: 0 }));
// Client-side routing: every unknown path is a page in the app shell.
app.get('*splat', (_req, res) => res.sendFile(path.join(config.publicDir, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'server_error' });
});

pruneExpired();
setInterval(pruneExpired, 3600_000).unref();

/**
 * Is something already serving this port?
 *
 * Windows sets SO_REUSEADDR semantics that let a second process bind an
 * address another process is already listening on, so `listen` succeeds and
 * EADDRINUSE never fires — the new process prints a healthy banner while the
 * OLD one keeps answering the browser. Every .env change and code edit then
 * looks like it did nothing. Connecting first is the only reliable check.
 */
function portBusy(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: host === '0.0.0.0' ? '127.0.0.1' : host, port });
    const done = (busy) => { socket.destroy(); resolve(busy); };
    socket.setTimeout(800);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

function reportPortConflict() {
  console.error(`\n  Port ${config.port} is already in use.\n`);
  console.error('  Another Volume Ledger is still running, and the page in your browser is');
  console.error('  being served by THAT process — so .env changes and code edits will not');
  console.error('  show up until you stop it.\n');
  console.error('  Stop it, then start again:\n');
  console.error(`    Get-NetTCPConnection -LocalPort ${config.port} -State Listen |`);
  console.error('      ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n');
  console.error('  Or run this one somewhere else:  PORT=4318 npm start\n');
}

if (await portBusy(config.host, config.port)) {
  reportPortConflict();
  process.exit(1);
}

const server = app.listen(config.port, config.host, () => {
  const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`;
  console.log(`\n  Volume Ledger  ${url}\n`);
  console.log(`  sign-in    ${config.google.enabled ? 'Google' : config.devLoginAllowed ? 'local (no Google credentials set)' : 'NOT CONFIGURED'}`);
  console.log(`  strava     ${config.strava.enabled ? 'configured' : 'not configured — add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to .env'}`);
  const claude = claudeStatus('');
  console.log(`  claude     ${claude.available ? `${claude.model} via ${claude.source}` : 'no credentials found (offline coaching: npm run coach)'}`);
  console.log(`  database   ${config.dbPath}\n`);
  if (config.strava.enabled) {
    console.log('  Strava credentials are loaded. Each account still has to authorize:');
    console.log('  open the site, go to Settings, and click Connect Strava.\n');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') reportPortConflict();
  else console.error('\n  Server failed to start:', err.message, '\n');
  process.exit(1);
});
