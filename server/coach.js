// The coach: builds the training context, asks Claude for structured plans,
// and writes the results back.
//
// Each action splits into a prompt half and an apply half. The API path runs
// both with ask() in between; the offline path (server/cli.js, driven from a
// Claude Code session) prints the same prompt and applies hand-written JSON
// through the same normalizer, so the two routes cannot drift apart.
//
// One structural decision worth knowing: a weekly plan does NOT contain
// exercise lists. Claude assigns a program session to a day, and the server
// resolves the movements and their loads from the strength program. Changing
// which movements exist is a separate, capped review. Weekly churn is exactly
// how strength programs stop working.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config, decrypt } from './config.js';
import {
  getActivities, getDigests, getFeedback, getPlan, getSettings, getWeeks,
  listGoals, logCoachRun, savePlan, saveWeek, saveDigest,
} from './db.js';
import {
  applyProgramChange, ensureProgram, liftHistory, movementIndex,
  offProgramMovements, prescribeSession, strengthProgress,
} from './program.js';
import { checkWeekPlan, hasBlocking } from './guardrails.js';
import { fitnessSnapshot } from './fitness.js';
import { CATALOG, PATTERNS, movementId } from '../public/lib/movements.js';
import {
  ENDURANCE_SPORTS, formatVolume, isStrength, sportInfo, sportKey,
} from '../public/lib/sports.js';
import {
  DOW, mondayOf, thisWeek, todayYmd, weekAdd, weekDates, ymd,
} from '../public/lib/dates.js';

export const DEFAULT_SETTINGS = {
  goal: 'Build running volume to 75 miles a week and hold it, while keeping some bike and swim volume every week.',
  targetMpw: 75,
  targetDate: '',
  keep: '2 bike sessions, 1-2 swims, 2-3 strength sessions',
  limits: 'Monday stays off running. Stop and hold volume if knee pain changes gait, rises during a run, swells the next morning, hurts at rest, or passes 3/10.',
  restDays: ['Mon'],
};

export const RULES = [
  "You are the coach for one athlete's training log. You write the plan; they execute it and report back.",
  'Be concrete and quantitative. Prescribe distances, durations and efforts the athlete can execute without interpretation.',
  '',
  'Rules you do not break:',
  '- Raise weekly volume in any sport by at most about 10 percent, and never by more than one sensible step.',
  '- Every fourth week is a deload, roughly 20-25 percent below the build week before it. Program it even when the athlete feels good.',
  '- A great-feeling week is a reason to hold the planned progression, not to exceed it. When you hold them back, say so plainly and say why.',
  '- At most two hard days in a week, never on consecutive days.',
  "- Keep the athlete's stated minimums in the other sports unless the primary goal is genuinely at risk. Total load injures people, not one sport's load alone.",
  '- Injury signals override the plan: pain that changes gait, pain that rises during a session, swelling the next morning, pain at rest, or pain above 3/10. Any of those means holding volume, not adding, and advising a physio. Never program through them.',
  '- You are a coach, not a clinician. Name symptoms and refer; do not diagnose.',
  '',
  'Strength works differently from endurance, and the difference matters:',
  '- The athlete has a CORE PROGRAM of a few movements. Loads progress automatically from what they log;',
  '  you do not set weights in a weekly plan. Assign a program session to a day and the loads resolve themselves.',
  '- Tendons adapt over months, not weeks. A movement needs to stay in the program long enough to load the',
  '  tissue. Churning the exercise list is the most common way a strength program quietly stops working.',
  '- So changing the program is rare and deliberate. Add at most two movements per review, remove at most one,',
  '  and never remove a core movement without saying why. Prefer adjusting sets, reps or load over swapping.',
  '- When the athlete logs a movement that is not in the program, decide honestly: promote it if it covers a',
  '  pattern the program is thin on and they will keep doing it, trial it if it might earn a place, or leave it',
  '  out and say why. Enthusiasm for a new exercise is not a reason to program it.',
  '',
  'Write prose like a coach talking to an athlete they know: direct, specific, no cheerleading, no hedging.',
].join('\n');

// --- schemas ---------------------------------------------------------------
// Every field is required and non-nullable: strict JSON-schema output is most
// reliable that way. Empty means 0 or "", and is normalized after parsing.

const VolumeSchema = z.object({
  sport: z.string().describe('run, bike, swim, lift or mobility'),
  value: z.number().describe("volume in that sport's own unit: miles for run and walk, minutes for bike and hike, yards for swim, session count for lift and mobility"),
});

const SessionSchema = z.object({
  sport: z.string().describe('run, bike, swim, lift, mobility or cross'),
  title: z.string().describe('short prescription, e.g. "8 mi easy"'),
  miles: z.number().describe('0 when not a distance session; yards for a swim'),
  minutes: z.number().describe('0 when unknown'),
  intensity: z.string().describe('easy, steady, tempo, intervals, long, recovery, technique or heavy'),
  detail: z.string().describe('one sentence of instruction'),
  optional: z.boolean(),
  programSession: z.string().describe('for a lift or mobility session, the id of the strength program session to run (A, B, C). Empty string for every other sport — never invent exercises here.'),
});

const DaySchema = z.object({
  dow: z.string(),
  date: z.string().describe('YYYY-MM-DD'),
  sessions: z.array(SessionSchema).describe('empty array for a rest day'),
});

export const WeekPlanSchema = z.object({
  volumes: z.array(VolumeSchema).describe("the week's target volume in each sport being trained"),
  deload: z.boolean(),
  verdict: z.string().describe('exactly one of: push, hold, back off'),
  focus: z.string().describe("one short line naming the week's job"),
  coachNote: z.string().describe('2-4 short paragraphs separated by blank lines'),
  adjustments: z.array(z.string()).describe('specific changes from last week'),
  days: z.array(DaySchema).describe('exactly 7, Monday first'),
});

export const ReviewSchema = z.object({
  verdict: z.string().describe('exactly one of: push, hold, back off'),
  summary: z.string().describe('2-4 short paragraphs separated by blank lines'),
  observations: z.array(z.string()).describe('things true in the numbers they may not have noticed'),
  adjustments: z.array(z.string()),
  flags: z.array(z.string()).describe('symptoms or trends to watch; empty when none warranted'),
  nextWeek: z.array(VolumeSchema).describe('target volumes for the coming week'),
});

const PhaseSchema = z.object({
  n: z.number(),
  name: z.string(),
  weekFrom: z.number(),
  weekTo: z.number(),
  job: z.string().describe('one or two sentences on what this phase is for'),
});

const WeekTargetSchema = z.object({
  week: z.string().describe('ISO week key like 2026-W37'),
  index: z.number(),
  phase: z.number(),
  volumes: z.array(VolumeSchema),
  deload: z.boolean(),
});

export const MacrocycleSchema = z.object({
  targetDate: z.string().describe('YYYY-MM-DD when the goal is reached and holding'),
  rationale: z.string().describe('one paragraph on the shape of the plan and why'),
  phases: z.array(PhaseSchema).describe('3 to 5 phases'),
  weekTargets: z.array(WeekTargetSchema).describe('26 consecutive weeks'),
});

const ProgramMovementSchema = z.object({
  exId: z.string().describe('slug id; reuse the existing id for a movement already in the program'),
  name: z.string(),
  pattern: z.string().describe('hinge, squat, single-leg, calf, core, push, pull, carry or rehab'),
  role: z.string().describe('core for a permanent fixture, trial for something being tested'),
  sets: z.number(),
  reps: z.string().describe('"5", "8 each", "6-8", "45 sec"'),
  note: z.string().describe('cue or intent; empty string if none'),
  reviewWeeks: z.number().describe('for a trial, how many weeks before judging it; 0 for core'),
});

const ProgramSessionSchema = z.object({
  id: z.string().describe('short id, A B C'),
  name: z.string(),
  focus: z.string(),
  dayHint: z.string().describe('Mon..Sun, the day this session usually lands on'),
  movements: z.array(ProgramMovementSchema).describe('at most 6'),
});

export const ProgramReviewSchema = z.object({
  rationale: z.string().describe('2-3 paragraphs: what you changed, what you deliberately left alone, and why'),
  philosophy: z.string().describe("one or two sentences on what this program is for; carry the current one forward unless it should change"),
  sessions: z.array(ProgramSessionSchema),
  retired: z.array(z.object({
    exId: z.string(),
    name: z.string(),
    reason: z.string().describe('required — a core movement cannot be dropped without one'),
  })).describe('movements leaving the program; empty array if none'),
  decisions: z.array(z.object({
    exId: z.string(),
    name: z.string(),
    decision: z.string().describe('promote, trial, or leave-out'),
    reason: z.string(),
  })).describe('a verdict on each off-program movement the athlete has logged; empty array if none'),
});

// --- client ----------------------------------------------------------------
/** Resolve a client for this user: their own key first, then the server's. */
export function clientFor(userId) {
  if (config.anthropic.allowUserKeys) {
    const key = decrypt(getSettings(userId)?._key);
    if (key) return { client: new Anthropic({ apiKey: key }), source: 'user-key' };
  }
  if (config.anthropic.apiKey) {
    return { client: new Anthropic({ apiKey: config.anthropic.apiKey }), source: 'server-key' };
  }
  // No explicit key: the SDK still resolves ANTHROPIC_AUTH_TOKEN or an
  // `ant auth login` profile from disk.
  return { client: new Anthropic(), source: 'ambient' };
}

/**
 * Credentials the SDK can resolve without an explicit key. A keyless client
 * constructs fine and only fails at request time, so this is checked directly
 * rather than inferred from `new Anthropic()` succeeding.
 */
function ambientCredentials() {
  if (process.env.ANTHROPIC_AUTH_TOKEN) return 'auth-token';
  const dirs = [
    process.env.ANTHROPIC_CONFIG_DIR,
    path.join(os.homedir(), '.config', 'anthropic'),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'anthropic') : null,
    process.env.XDG_CONFIG_HOME ? path.join(process.env.XDG_CONFIG_HOME, 'anthropic') : null,
  ].filter(Boolean);
  for (const dir of dirs) {
    try { if (fs.existsSync(dir)) return 'ant-profile'; } catch { /* unreadable */ }
  }
  return null;
}

export function claudeStatus(userId) {
  const model = config.anthropic.model;
  if (config.anthropic.allowUserKeys && userId && decrypt(getSettings(userId)?._key)) {
    return { available: true, source: 'user-key', model };
  }
  if (config.anthropic.apiKey) return { available: true, source: 'server-key', model };
  const ambient = ambientCredentials();
  if (ambient) return { available: true, source: ambient, model };
  return { available: false, source: null, model };
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

async function ask(userId, kind, schema, userText) {
  const started = Date.now();
  if (!claudeStatus(userId).available) {
    throw Object.assign(
      new Error('No Claude credentials. Add an API key in Setup, set ANTHROPIC_API_KEY, or run `ant auth login`.'),
      { code: 'no_credentials', status: 401 },
    );
  }
  const { client } = clientFor(userId);

  const base = {
    model: config.anthropic.model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: RULES, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userText }],
    output_config: { effort: config.anthropic.effort, format: betaZodOutputFormat(schema) },
  };

  const send = (withFallbacks) => client.beta.messages.parse(
    withFallbacks ? { ...base, betas: [FALLBACK_BETA], fallbacks: 'default' } : base,
  );

  let message;
  try {
    message = await send(config.anthropic.fallbacks);
  } catch (err) {
    const msg = String(err?.message || '');
    if (config.anthropic.fallbacks && err?.status === 400 && /fallback|beta/i.test(msg)) {
      console.warn('[coach] server-side fallbacks rejected, retrying without:', msg.slice(0, 160));
      message = await send(false);
    } else {
      logCoachRun(userId, kind, { ok: false, ms: Date.now() - started, error: msg.slice(0, 400) });
      throw err;
    }
  }

  if (message.stop_reason === 'refusal') {
    logCoachRun(userId, kind, { model: message.model, ms: Date.now() - started, ok: false, error: 'refusal' });
    throw Object.assign(new Error('Claude declined this request. Try rewording it.'), { code: 'refused' });
  }
  if (!message.parsed_output) {
    logCoachRun(userId, kind, { model: message.model, ms: Date.now() - started, ok: false, error: 'unparsed' });
    throw Object.assign(new Error("Claude's answer did not match the expected shape. Try again."), { code: 'invalid_json' });
  }

  logCoachRun(userId, kind, {
    model: message.model, usage: message.usage, ms: Date.now() - started, ok: true,
  });
  return message.parsed_output;
}

// --- context ---------------------------------------------------------------
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const n0 = (x) => String(Math.round(x));
const mmss = (sec) => (!sec ? '-' : `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`);
const FEEL = { 1: 'rough', 2: 'flat', 3: 'fine', 4: 'good', 5: 'great' };

/** Settings with the goal list folded in. */
export function profileFor(userId) {
  const settings = { ...DEFAULT_SETTINGS, ...(getSettings(userId) || {}) };
  delete settings._key;
  delete settings._hasKey;
  return { settings, goals: listGoals(userId) };
}

/**
 * The whole picture, as compact text. Stays well inside the model's context
 * while carrying what the coaching decision actually turns on.
 */
export function buildContext(userId, { weeks: nWeeks = 12, sessions: nSessions = 24, fitness = true } = {}) {
  const { settings, goals } = profileFor(userId);
  const week = thisWeek();
  const horizon = weekAdd(week, -(nWeeks + 1));
  const fromDate = ymd(mondayOf(horizon));

  const activities = getActivities(userId, fromDate, 500);
  const feedback = new Map(getFeedback(userId, fromDate).map((f) => [f.sessionId, f]));
  const plan = getPlan(userId);
  const weekDocs = getWeeks(userId, horizon);
  const digests = getDigests(userId, 2);

  const L = [];
  L.push(`TODAY: ${todayYmd()} (${DOW[(new Date().getDay() + 6) % 7]}), current week ${week}`);
  L.push('');
  L.push('GOALS:');
  if (goals.length) {
    for (const g of goals) {
      L.push(`  ${g.primary ? '* ' : '  '}${describeGoal(g)}`);
    }
  } else {
    L.push(`    ${settings.goal || 'none set'} (unstructured)`);
    if (settings.targetMpw) L.push(`    target ${settings.targetMpw} run mi/wk${settings.targetDate ? ` by ${settings.targetDate}` : ''}`);
  }
  L.push(`KEEP ALONGSIDE: ${settings.keep || 'not specified'}`);
  L.push(`LIMITS: ${settings.limits || 'none stated'}`);
  if (settings.restDays?.length) L.push(`REST DAYS: ${settings.restDays.join(', ')}`);

  if (fitness) {
    const snap = fitnessSnapshot(userId, { goals });
    L.push('');
    L.push('DERIVED FITNESS (v0 heuristics, relative to this athlete\'s own history):');
    if (snap.endurance) {
      L.push(`  endurance ${snap.endurance.score}/100 — chronic 28d load ${snap.endurance.inputs.chronic28}`
        + ` vs personal peak ${snap.endurance.inputs.peakChronic28}, ${snap.endurance.inputs.activeDaysIn28}/28 active days`);
    }
    if (snap.speed) {
      L.push(`  speed ${snap.speed.score ?? '?'}/100 — ${snap.speed.inputs.qualityShare * 100 || 0}% of time above aerobic base`
        + `${snap.speed.inputs.efficiencyFactorTrendPct != null ? `, efficiency ${snap.speed.inputs.efficiencyFactorTrendPct > 0 ? '+' : ''}${snap.speed.inputs.efficiencyFactorTrendPct}%` : ''}`);
    }
    if (snap.confidence?.score != null) {
      L.push(`  goal confidence ${snap.confidence.score}/100 for "${snap.confidence.label}" — ${JSON.stringify(snap.confidence.inputs)}`);
    }
    if (snap.latest) {
      L.push(`  acute:chronic ${snap.latest.ratio?.toFixed?.(2) ?? '?'} (descriptive only, not a risk verdict)`);
    }
    const dec = snap.decoupling?.slice(0, 4) || [];
    if (dec.length) {
      L.push(`  aerobic decoupling on recent long runs: ${dec.map((d) => `${d.date} ${d.pct.toFixed(1)}%`).join(', ')}`);
    }
  }

  L.push('');
  if (plan) {
    L.push(`CURRENT MACROCYCLE (${plan.source || 'coach'}, built ${String(plan.generatedAt || '?').slice(0, 10)}):`);
    for (const ph of plan.phases || []) {
      L.push(`  phase ${ph.n} ${ph.name} weeks ${ph.weekFrom}-${ph.weekTo}${ph.job ? `: ${ph.job}` : ''}`);
    }
    const t = targetFor(plan, weekDocs, week);
    if (t) L.push(`  this week's target: ${describeVolumes(t)}`);
  } else {
    L.push('CURRENT MACROCYCLE: none yet.');
  }

  L.push('');
  L.push('WEEKLY ACTUALS, oldest first — volume per sport, then planned target:');
  for (let i = nWeeks; i >= 0; i--) {
    const k = weekAdd(week, -i);
    const r = rollup(activities, k);
    const t = targetFor(plan, weekDocs, k);
    if (!r.count && !t) continue;
    const parts = ENDURANCE_SPORTS
      .filter((s) => r.volumes[s])
      .map((s) => `${formatVolume(s, r.volumes[s])} ${s}`);
    if (r.strengthSessions) parts.push(`${r.strengthSessions}x lift`);
    L.push(`  ${k}  ${parts.join(' / ') || 'nothing'}`
      + `${r.longestRunMi ? ` / long ${n1(r.longestRunMi)} mi` : ''}`
      + `${r.hrAvg ? ` / ${n0(r.hrAvg)} bpm avg run` : ''}`
      + `${t ? ` / planned ${describeVolumes(t)}` : ' / unplanned'}`
      + `${k === week ? '   <- current week, in progress' : ''}`);
  }

  L.push('');
  L.push('RECENT SESSIONS, newest first:');
  for (const s of activities.slice(0, nSessions)) {
    const bits = [s.date, sportKey(s.sport)];
    if (sportKey(s.sport) === 'swim') bits.push(`${n0(s.yards || 0)}yd`);
    else if (s.miles) bits.push(`${n1(s.miles)}mi`);
    if (s.movingMin) bits.push(`${n0(s.movingMin)}min`);
    if (s.paceSecPerMi) bits.push(`${mmss(s.paceSecPerMi)}/mi`);
    if (s.speedMph) bits.push(`${n1(s.speedMph)}mph`);
    if (s.hrAvg) bits.push(`${n0(s.hrAvg)}bpm`);
    if (s.elevFt) bits.push(`${n0(s.elevFt)}ft`);
    if (s.runType) bits.push(`[${s.runType}]`);
    const f = feedback.get(s.id);
    if (f) {
      bits.push(`rpe ${f.rpe || '?'}`, `felt ${FEEL[f.feel] || '?'}`);
      if (f.pain) bits.push(`PAIN ${f.pain}/10${f.painSite ? ` ${f.painSite}` : ''}`);
      if (f.notes) bits.push(`"${String(f.notes).slice(0, 220)}"`);
    } else {
      bits.push('no note');
    }
    L.push(`  ${bits.join(' | ')}`);
  }

  L.push('');
  L.push(strengthBlock(userId));

  const digestLines = digests.filter((d) => d?.text);
  if (digestLines.length) {
    L.push('');
    L.push("RECENT WEEKLY DIGESTS, in the athlete's words:");
    for (const d of digestLines) {
      L.push(`  [${d.week}] ${String(d.text).slice(0, 1400).replace(/\s+/g, ' ')}`);
    }
  }

  return L.join('\n');
}

/** The strength program, its logged history, and anything logged off-program. */
export function strengthBlock(userId) {
  const program = ensureProgram(userId);
  const history = liftHistory(userId);
  const L = [];
  L.push(`STRENGTH PROGRAM v${program.version} (${program.updatedBy || 'seed'}, ${String(program.updatedAt || '').slice(0, 10)}):`);
  L.push(`  philosophy: ${program.philosophy}`);
  for (const session of program.sessions || []) {
    L.push(`  session ${session.id} "${session.name}" (${session.dayHint || 'any day'}) — ${session.focus || ''}`);
    for (const m of session.movements || []) {
      const records = history.get(m.exId) || [];
      const last = records[0];
      const best = records.map((r) => r.best).filter(Boolean).sort((a, b) => b.e1rm - a.e1rm)[0];
      L.push(`    ${m.name} [${m.pattern}/${m.role}] ${m.sets}x${m.reps}`
        + `${last ? ` — last ${last.date}: ${last.sets.map((s) => `${s.reps}@${s.lb || 'bw'}`).join(', ')}` : ' — never logged'}`
        + `${best ? `; best e1RM ${best.e1rm} lb` : ''}`
        + `${records.length ? `; ${records.length} sessions logged` : ''}`);
    }
  }
  if (program.retired?.length) {
    L.push(`  previously retired: ${program.retired.map((r) => `${r.name} (${r.reason || 'no reason recorded'})`).join('; ')}`);
  }

  const off = offProgramMovements(userId, program);
  if (off.length) {
    L.push('');
    L.push('LOGGED OFF-PROGRAM — the athlete did these on their own initiative:');
    for (const m of off) {
      L.push(`  ${m.name} [${m.pattern}] — ${m.timesLogged} session${m.timesLogged === 1 ? '' : 's'}, `
        + `${m.firstSeen} to ${m.lastSeen}${m.best ? `, best ${m.best.reps}@${m.best.lb} lb (e1RM ${m.best.e1rm})` : ''}`
        + `${m.previouslyRetired ? ' — WAS RETIRED FROM THE PROGRAM BEFORE' : ''}`);
    }
  }

  const progress = strengthProgress(userId).filter((p) => p.sessions >= 2).slice(0, 8);
  if (progress.length) {
    L.push('');
    L.push('STRENGTH TREND (estimated 1RM, first logged -> latest):');
    for (const p of progress) {
      L.push(`  ${p.name}: ${p.first.e1rm} -> ${p.latest.e1rm} lb `
        + `(${p.changeLb >= 0 ? '+' : ''}${p.changeLb} lb, ${p.changePct >= 0 ? '+' : ''}${p.changePct.toFixed(1)}%) over ${p.sessions} sessions`);
    }
  }
  return L.join('\n');
}

function describeGoal(g) {
  if (g.metric === 'raceTime') {
    const h = Math.floor(g.target / 3600);
    const m = Math.floor((g.target % 3600) / 60);
    const s = Math.round(g.target % 60);
    return `${g.sport} ${g.distanceMi} mi in ${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      + `${g.byDate ? ` by ${g.byDate}` : ''}${g.note ? ` — ${g.note}` : ''}`;
  }
  const info = sportInfo(g.sport);
  const unit = g.metric === 'weeklySessions' ? 'sessions/wk'
    : g.metric === 'weeklyDuration' ? 'min/wk'
      : `${info.unit}/wk`;
  return `${g.sport} ${g.target} ${unit}${g.byDate ? ` by ${g.byDate}` : ' (no date)'}${g.note ? ` — ${g.note}` : ''}`;
}

function describeVolumes(target) {
  const vols = target.volumes || target;
  const parts = [];
  for (const [sport, value] of Object.entries(vols)) {
    if (!value || typeof value !== 'number') continue;
    parts.push(`${formatVolume(sport, value)} ${sport}`);
  }
  if (!parts.length && target.runMiles) parts.push(`${target.runMiles} mi run`);
  return parts.join(' / ') || 'no target';
}

function rollup(activities, weekKey) {
  const dates = new Set(weekDates(weekKey));
  const r = { volumes: {}, count: 0, strengthSessions: 0, longestRunMi: 0, hrSum: 0, hrN: 0 };
  for (const s of activities) {
    if (!dates.has(s.date)) continue;
    r.count++;
    const key = sportKey(s.sport);
    const info = sportInfo(key);
    const add = info.metric === 'sessions' ? 1
      : info.metric === 'duration' ? (s.movingMin || 0)
        : key === 'swim' ? (s.yards || 0) : (s.miles || 0);
    r.volumes[key] = (r.volumes[key] || 0) + add;
    if (isStrength(key)) r.strengthSessions++;
    if (key === 'run') {
      r.longestRunMi = Math.max(r.longestRunMi, s.miles || 0);
      if (s.hrAvg) { r.hrSum += s.hrAvg; r.hrN++; }
    }
  }
  r.hrAvg = r.hrN ? r.hrSum / r.hrN : null;
  return r;
}

function targetFor(plan, weekDocs, weekKey) {
  const wk = weekDocs.find((w) => w.week === weekKey);
  if (wk?.volumes) return { volumes: wk.volumes, deload: wk.deload };
  if (wk?.targets?.runMiles != null) return { volumes: { run: wk.targets.runMiles }, deload: wk.deload };
  const t = plan?.weekTargets?.find((x) => x.week === weekKey);
  if (!t) return null;
  if (t.volumes) return { volumes: t.volumes, deload: t.deload };
  if (t.runMiles != null) return { volumes: { run: t.runMiles }, deload: t.deload };
  return null;
}

// --- normalizing model output ---------------------------------------------
const VERDICTS = ['push', 'hold', 'back off'];
function verdictOf(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (VERDICTS.includes(v)) return v;
  if (/back|ease|drop|reduce|cut/.test(v)) return 'back off';
  if (/hold|steady|maintain|same/.test(v)) return 'hold';
  if (/push|build|progress|raise/.test(v)) return 'push';
  return 'hold';
}
const orNull = (x) => (typeof x === 'number' && x > 0 ? x : null);

/** A volume array from the model becomes a {sport: value} map. */
function volumeMap(list) {
  const out = {};
  for (const v of list || []) {
    const key = sportKey(v.sport);
    const value = Number(v.value) || 0;
    if (value > 0) out[key] = (out[key] || 0) + value;
  }
  return out;
}

/** Legacy shape, kept populated so older readers keep working. */
function legacyTargets(volumes) {
  return {
    runMiles: volumes.run ?? null,
    bikeHours: volumes.bike != null ? Math.round((volumes.bike / 60) * 10) / 10 : null,
    swimSessions: volumes.swimSessions ?? null,
    strengthSessions: volumes.lift ?? null,
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

// --- plan a week -----------------------------------------------------------
export function weekPrompt(userId, weekKey) {
  const prev = weekAdd(weekKey, -1);
  const dates = weekDates(weekKey);
  const program = ensureProgram(userId);
  const sessionIds = (program.sessions || []).map((s) => `${s.id} (${s.name}, usually ${s.dayHint})`);
  const task = [
    buildContext(userId, { weeks: 12, sessions: 22 }),
    '',
    '=== TASK ===',
    `Write the training week for ${weekKey} (Monday ${dates[0]} through Sunday ${dates[6]}).`,
    `Decide the volumes yourself from the macrocycle target, what they actually did in ${prev},`,
    'and how their notes read. If the evidence says hold or drop, hold or drop, and say why in coachNote.',
    '',
    `Return exactly 7 days in order, Monday first, with these dates: ${dates.join(', ')}.`,
    'A rest day is a day with an empty sessions array.',
    'Distance sessions need miles set (yards for a swim); time-based sessions need minutes.',
    '',
    'For strength, set programSession to one of the existing program sessions and leave the rest to the app:',
    ...sessionIds.map((s) => `  ${s}`),
    'Do not invent exercises in a weekly plan. Loads progress automatically from what the athlete logs.',
    'If the program itself needs changing, say so in coachNote and it will be handled in a program review.',
  ].join('\n');
  return { kind: 'plan-week', schema: WeekPlanSchema, task, dates };
}

export function applyWeek(userId, weekKey, out, source = 'claude', { force = false } = {}) {
  const dates = weekDates(weekKey);
  const program = ensureProgram(userId);
  const history = liftHistory(userId);
  const volumes = volumeMap(out.volumes);

  const days = dates.map((date, i) => {
    const src = out.days?.[i] || {};
    return {
      dow: DOW[i],
      date,
      sessions: (src.sessions || []).map((s) => {
        const sport = sportKey(s.sport);
        const session = {
          sport,
          title: String(s.title || ''),
          miles: orNull(s.miles),
          minutes: orNull(s.minutes),
          intensity: s.intensity ? String(s.intensity) : null,
          detail: s.detail ? String(s.detail) : null,
          optional: Boolean(s.optional),
        };
        if (sport === 'swim' && session.miles && session.miles > 100) {
          // Swims come back in yards; keep them there.
          session.yards = session.miles;
          session.miles = null;
        }
        if (isStrength(sport)) {
          const wanted = String(s.programSession || '').trim().toUpperCase();
          const resolved = prescribeSession(program, wanted, history)
            || prescribeSession(program, (program.sessions || [])[0]?.id, history);
          if (resolved) {
            session.programSession = resolved.programSession;
            session.title = session.title || resolved.name;
            session.exercises = resolved.exercises;
          }
        }
        return session;
      }),
    };
  });

  const doc = {
    week: weekKey,
    volumes,
    targets: legacyTargets(volumes),
    deload: Boolean(out.deload),
    verdict: verdictOf(out.verdict),
    focus: out.focus || null,
    coachNote: out.coachNote || null,
    adjustments: (out.adjustments || []).slice(0, 8),
    days,
    source,
    generatedAt: new Date().toISOString(),
  };

  const violations = checkWeekPlan(doc, weekHistory(userId, weekKey), weekContext(userId, weekKey));
  doc.violations = violations;
  if (hasBlocking(violations) && !force) {
    return { ok: false, violations, week: doc };
  }
  saveWeek(userId, weekKey, doc);
  return { ok: true, violations, week: doc };
}

/**
 * Actual volumes behind this week: the immediately previous week (which the
 * pain check uses) and the best of the last three (which the progression
 * ceiling uses, so a deload does not become an artificial ceiling).
 */
function weekHistory(userId, weekKey) {
  const activities = getActivities(userId, ymd(mondayOf(weekAdd(weekKey, -6))), 400);
  const previous = rollup(activities, weekAdd(weekKey, -1)).volumes;
  const baseline = {};
  for (let i = 1; i <= 3; i++) {
    const vols = rollup(activities, weekAdd(weekKey, -i)).volumes;
    for (const [sport, value] of Object.entries(vols)) {
      baseline[sport] = Math.max(baseline[sport] || 0, value);
    }
  }
  return { previous, baseline };
}

function weekContext(userId, weekKey) {
  const { settings } = profileFor(userId);
  const from = ymd(mondayOf(weekAdd(weekKey, -2)));
  const recentPain = getFeedback(userId, from)
    .filter((f) => (f.pain ?? 0) >= 3)
    .map((f) => ({ date: f.date, pain: f.pain, site: f.painSite }));

  // How many consecutive build weeks precede this one.
  let buildStreak = 0;
  const docs = new Map(getWeeks(userId, weekAdd(weekKey, -8)).map((w) => [w.week, w]));
  for (let i = 1; i <= 6; i++) {
    const doc = docs.get(weekAdd(weekKey, -i));
    if (!doc) break;
    if (doc.deload) break;
    buildStreak++;
  }
  return { settings, recentPain, restDays: settings.restDays || [], buildStreak, today: todayYmd() };
}

export async function planWeek(userId, weekKey, { force = false } = {}) {
  const { schema, task } = weekPrompt(userId, weekKey);
  const out = await ask(userId, 'plan-week', schema, task);
  return applyWeek(userId, weekKey, out, 'claude', { force });
}

// --- review the weekly digest ---------------------------------------------
export function reviewPrompt(userId, text) {
  const week = thisWeek();
  const last = weekAdd(week, -1);
  const task = [
    buildContext(userId, { weeks: 12, sessions: 26 }),
    '',
    `=== THIS MORNING'S DIGEST (about the week that just finished, ${last}) ===`,
    text,
    '',
    '=== TASK ===',
    `Review the week that just ended against what was planned, then set the direction for ${week}.`,
    'Weigh what they wrote against the numbers: if the digest sounds great but the load jumped, hold them.',
    'If the digest sounds flat and the numbers are fine, look for sleep, life load, or pace creep in easy work.',
    'Leave flags empty unless something genuinely warrants watching.',
  ].join('\n');
  return { kind: 'review-digest', schema: ReviewSchema, task, week, last };
}

export function applyReview(userId, text, out) {
  const week = thisWeek();
  const review = {
    verdict: verdictOf(out.verdict),
    summary: out.summary || '',
    observations: (out.observations || []).slice(0, 8),
    adjustments: (out.adjustments || []).slice(0, 8),
    flags: (out.flags || []).slice(0, 6),
    nextWeek: volumeMap(out.nextWeek),
    generatedAt: new Date().toISOString(),
  };
  saveDigest(userId, week, { week, text, submittedAt: new Date().toISOString(), review });
  return review;
}

export async function reviewDigest(userId, text) {
  const week = thisWeek();
  // Store the digest before spending anything, so the text survives a failure.
  saveDigest(userId, week, { week, text, submittedAt: new Date().toISOString() });
  const { schema, task } = reviewPrompt(userId, text);
  const out = await ask(userId, 'review-digest', schema, task);
  const review = applyReview(userId, text, out);
  const planned = await planWeek(userId, week);
  return { review, week: planned.week, violations: planned.violations, ok: planned.ok };
}

// --- build the macrocycle --------------------------------------------------
export function macroPrompt(userId) {
  const { settings, goals } = profileFor(userId);
  const week = thisWeek();
  const primary = goals.find((g) => g.primary) || goals[0];
  const target = primary ? describeGoal(primary) : `${settings.targetMpw || 75} run mi/wk`;
  const task = [
    buildContext(userId, { weeks: 16, sessions: 20 }),
    '',
    '=== TASK ===',
    `Build the macrocycle that gets this athlete from the volume their recent weeks actually show to: ${target}.`,
    'Start from the evidence in the weekly actuals above, not from an assumption about where they should be.',
    primary?.byDate
      ? `The date is fixed (${primary.byDate}), so work backwards from it: taper, peak, build, base.`
      : 'No date is set, so propose one and say what it assumes.',
    'Use 3 to 5 phases. Give week-by-week targets for 26 consecutive weeks with every fourth week a deload,',
    'and volumes for every sport being trained so their stated minimums hold.',
    `weekTargets must start at ${week} with index 1 and run to index 26.`,
  ].join('\n');
  return { kind: 'build-plan', schema: MacrocycleSchema, task, week };
}

export function applyMacrocycle(userId, out, source = 'claude') {
  const { settings, goals } = profileFor(userId);
  const week = thisWeek();
  const primary = goals.find((g) => g.primary) || goals[0] || null;

  const weekTargets = (out.weekTargets || []).slice(0, 30).map((t, i) => {
    const volumes = volumeMap(t.volumes);
    return {
      week: /^\d{4}-W\d{2}$/.test(String(t.week)) ? t.week : weekAdd(week, i),
      index: t.index || i + 1,
      phase: t.phase || null,
      volumes,
      ...legacyTargets(volumes),
      deload: Boolean(t.deload),
    };
  });

  const doc = {
    goal: primary ? describeGoal(primary) : (settings.goal || ''),
    goalId: primary?.id || null,
    targetMpw: settings.targetMpw || null,
    targetDate: out.targetDate || primary?.byDate || settings.targetDate || '',
    rationale: out.rationale || '',
    phases: (out.phases || []).map((ph) => ({
      n: ph.n || 0,
      name: String(ph.name || ''),
      weekFrom: ph.weekFrom || 0,
      weekTo: ph.weekTo || 0,
      job: String(ph.job || ''),
    })),
    weekTargets,
    source,
    generatedAt: new Date().toISOString(),
  };
  savePlan(userId, doc);
  return doc;
}

export async function buildMacrocycle(userId) {
  const { schema, task } = macroPrompt(userId);
  const out = await ask(userId, 'build-plan', schema, task);
  return applyMacrocycle(userId, out);
}

// --- review the strength program -------------------------------------------
export function programPrompt(userId) {
  const program = ensureProgram(userId);
  const off = offProgramMovements(userId, program);
  const patterns = Object.entries(PATTERNS)
    .map(([k, v]) => `  ${k}${v.required ? ' (required)' : ''}: ${v.note}`);
  const catalogNames = CATALOG.map((m) => `${m.id} (${m.pattern})`).join(', ');

  const task = [
    buildContext(userId, { weeks: 10, sessions: 16 }),
    '',
    '=== TASK ===',
    'Review the strength program. Most reviews should change very little: adjust sets, reps or intent,',
    'and leave the movement list alone. Only change the list when the evidence in the log demands it.',
    '',
    'Return the FULL program you want in force from now on — every session, every movement, including the',
    'ones you are keeping unchanged. Reuse the existing exId for anything already in the program.',
    '',
    'Hard limits, enforced in code and rejected if broken:',
    '  - at most 2 movements added',
    '  - at most 1 core movement removed, and never without a reason in `retired`',
    '  - at most 6 movements per session',
    '  - a core movement that has been in the program under 6 weeks has not had time to work',
    '',
    'Patterns a program like this must cover:',
    ...patterns,
    '',
    off.length
      ? 'Give a verdict on each off-program movement listed above in `decisions`: promote (into the program as '
        + 'core), trial (in for a fixed number of weeks, then judged), or leave-out. Be honest — most should be '
        + 'leave-out or trial. A movement earns a permanent place by covering a thin pattern and being repeated.'
      : 'No off-program movements to rule on; return an empty decisions array.',
    '',
    `Catalog ids you can draw on: ${catalogNames}`,
    'A movement outside the catalog is allowed if it is genuinely the right choice; give it a slug id.',
  ].join('\n');
  return { kind: 'program-review', schema: ProgramReviewSchema, task, program, offProgram: off };
}

export function applyProgramReview(userId, out, { by = 'claude' } = {}) {
  const current = ensureProgram(userId);
  const today = new Date().toISOString();
  const before = movementIndex(current);

  const proposed = {
    ...current,
    philosophy: out.philosophy || current.philosophy,
    sessions: (out.sessions || []).map((s) => ({
      id: String(s.id || '').toUpperCase().slice(0, 4) || 'A',
      name: String(s.name || ''),
      focus: String(s.focus || ''),
      dayHint: String(s.dayHint || ''),
      movements: (s.movements || []).slice(0, 10).map((m) => {
        const exId = String(m.exId || movementId(m.name)).slice(0, 60);
        const existing = before.get(exId);
        const role = String(m.role || 'core').toLowerCase() === 'trial' ? 'trial' : 'core';
        return {
          exId,
          name: String(m.name || exId),
          pattern: String(m.pattern || 'other'),
          unilateral: existing?.unilateral ?? /each/i.test(String(m.reps || '')),
          role,
          sets: Number(m.sets) || 3,
          reps: String(m.reps || '8').slice(0, 40),
          // Loads are not the model's to set; progression owns them.
          loadLb: existing?.loadLb ?? 0,
          note: String(m.note || '').slice(0, 240),
          addedAt: existing?.addedAt || today,
          addedReason: existing?.addedReason || (out.rationale || '').slice(0, 200),
          reviewAt: role === 'trial' && Number(m.reviewWeeks) > 0
            ? new Date(Date.now() + Number(m.reviewWeeks) * 7 * 86400000).toISOString()
            : null,
        };
      }),
    })),
    retired: (out.retired || []).map((r) => ({
      exId: String(r.exId || movementId(r.name)),
      name: String(r.name || ''),
      reason: String(r.reason || ''),
      removedAt: today,
    })),
  };

  const result = applyProgramChange(userId, proposed, { by, reason: out.rationale || '', today });
  return {
    ...result,
    rationale: out.rationale || '',
    decisions: (out.decisions || []).map((d) => ({
      exId: String(d.exId || movementId(d.name)),
      name: String(d.name || ''),
      decision: ['promote', 'trial', 'leave-out'].includes(String(d.decision).toLowerCase())
        ? String(d.decision).toLowerCase() : 'leave-out',
      reason: String(d.reason || ''),
    })),
  };
}

export async function reviewProgram(userId) {
  const { schema, task } = programPrompt(userId);
  const out = await ask(userId, 'program-review', schema, task);
  return applyProgramReview(userId, out);
}
