// The coach: builds the training context, asks Claude for structured plans,
// and writes the results back.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { config, decrypt } from './config.js';
import {
  getActivities, getDigests, getFeedback, getPlan, getSettings,
  getWeeks, logCoachRun, savePlan, saveWeek, saveDigest,
} from './db.js';
import {
  DOW, mondayOf, todayYmd, thisWeek, weekAdd, weekDates, ymd,
} from '../public/lib/dates.js';

export const DEFAULT_SETTINGS = {
  goal: 'Build running volume to 75 miles a week and hold it, while keeping some bike and swim volume every week.',
  targetMpw: 75,
  targetDate: '',
  keep: '2 bike sessions, 1-2 swims, 2-3 strength sessions',
  limits: 'Monday stays off running. Stop and hold volume if knee pain changes gait, rises during a run, swells the next morning, hurts at rest, or passes 3/10.',
};

const RULES = [
  "You are the coach for one athlete's training log. You write the plan; they execute it and report back.",
  'Be concrete and quantitative. Prescribe distances in miles, durations in minutes, and efforts the athlete can execute without interpretation.',
  '',
  'Rules you do not break:',
  '- Raise weekly running volume by at most about 10 percent, and never by more than 5 miles in one step.',
  '- Every fourth week is a deload, roughly 20-25 percent below the build week before it. Program it even when the athlete feels good.',
  '- A great-feeling week is a reason to hold the planned progression, not to exceed it. When you hold them back, say so plainly and say why.',
  '- At most two hard running days in a week, never on consecutive days.',
  "- Keep the athlete's stated bike and swim minimums unless running volume is genuinely at risk. Total load injures people, not running load alone.",
  '- Injury signals override the plan: pain that changes gait, pain that rises during a run, swelling the next morning, pain at rest, or pain above 3/10. Any of those means drop to the last symptom-free volume, hold two weeks, and advise seeing a physio. Never program through them.',
  '- You are a coach, not a clinician. Name symptoms and refer; do not diagnose.',
  '',
  'Write prose like a coach talking to an athlete they know: direct, specific, no cheerleading, no hedging.',
].join('\n');

// --- schemas ---------------------------------------------------------------
// Every field is required and non-nullable: strict JSON-schema output is most
// reliable that way. Empty means 0 or "", and is normalized after parsing.
const SessionSchema = z.object({
  sport: z.string().describe('run, bike, swim, lift, strength or mobility'),
  title: z.string().describe('short prescription, e.g. "8 mi easy"'),
  miles: z.number().describe('0 when not a distance session'),
  minutes: z.number().describe('0 when unknown'),
  intensity: z.string().describe('easy, steady, tempo, intervals, long, recovery, technique or heavy'),
  detail: z.string().describe('one sentence of instruction'),
  optional: z.boolean(),
});

const DaySchema = z.object({
  dow: z.string(),
  date: z.string().describe('YYYY-MM-DD'),
  sessions: z.array(SessionSchema).describe('empty array for a rest day'),
});

const TargetsSchema = z.object({
  runMiles: z.number(),
  bikeHours: z.number(),
  swimSessions: z.number(),
  strengthSessions: z.number(),
});

const WeekPlanSchema = z.object({
  targets: TargetsSchema,
  deload: z.boolean(),
  verdict: z.string().describe('exactly one of: push, hold, back off'),
  focus: z.string().describe("one short line naming the week's job"),
  coachNote: z.string().describe('2-4 short paragraphs separated by blank lines'),
  adjustments: z.array(z.string()).describe('specific changes from last week'),
  days: z.array(DaySchema).describe('exactly 7, Monday first'),
});

const ReviewSchema = z.object({
  verdict: z.string().describe('exactly one of: push, hold, back off'),
  summary: z.string().describe('2-4 short paragraphs separated by blank lines'),
  observations: z.array(z.string()).describe('things true in the numbers they may not have noticed'),
  adjustments: z.array(z.string()),
  flags: z.array(z.string()).describe('symptoms or trends to watch; empty when none warranted'),
  nextWeek: TargetsSchema,
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
  runMiles: z.number(),
  bikeHours: z.number(),
  swimSessions: z.number(),
  strengthSessions: z.number(),
  deload: z.boolean(),
});

const MacrocycleSchema = z.object({
  targetDate: z.string().describe('YYYY-MM-DD when the goal volume is reached and holding'),
  rationale: z.string().describe('one paragraph on the shape of the plan and why'),
  phases: z.array(PhaseSchema).describe('3 to 5 phases'),
  weekTargets: z.array(WeekTargetSchema).describe('26 consecutive weeks'),
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
    // Retry once without the fallback parameter if this deployment rejects it.
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

function rollup(activities, weekKey) {
  const dates = weekDates(weekKey);
  const from = dates[0];
  const to = dates[6];
  const r = { runMi: 0, runs: 0, longest: 0, elevFt: 0, bikeMin: 0, swimYd: 0, swims: 0, lifts: 0, hrSum: 0, hrN: 0, any: 0 };
  for (const s of activities) {
    if (s.date < from || s.date > to) continue;
    r.any++;
    if (s.sport === 'run') {
      r.runMi += s.miles || 0; r.runs++; r.elevFt += s.elevFt || 0;
      if ((s.miles || 0) > r.longest) r.longest = s.miles || 0;
      if (s.hrAvg) { r.hrSum += s.hrAvg; r.hrN++; }
    } else if (s.sport === 'bike') r.bikeMin += s.movingMin || 0;
    else if (s.sport === 'swim') { r.swimYd += s.yards || 0; r.swims++; }
    else if (s.sport === 'lift' || s.sport === 'strength') r.lifts++;
  }
  r.hrAvg = r.hrN ? r.hrSum / r.hrN : null;
  return r;
}

function targetFor(plan, weeks, weekKey) {
  const wk = weeks.find((w) => w.week === weekKey);
  if (wk?.targets?.runMiles != null) return { ...wk.targets, deload: wk.deload };
  const t = plan?.weekTargets?.find((x) => x.week === weekKey);
  return t || null;
}

/**
 * The whole picture, as compact text. Stays well inside the model's context
 * while carrying what the coaching decision actually turns on.
 */
export function buildContext(userId, { weeks: nWeeks = 12, sessions: nSessions = 24 } = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...(getSettings(userId) || {}) };
  const week = thisWeek();
  const horizon = weekAdd(week, -(nWeeks + 1));
  const fromDate = ymd(mondayOf(horizon));

  const activities = getActivities(userId, fromDate, 500);
  const feedbackList = getFeedback(userId, fromDate);
  const feedback = new Map(feedbackList.map((f) => [f.sessionId, f]));
  const plan = getPlan(userId);
  const weekDocs = getWeeks(userId, horizon);
  const digests = getDigests(userId, 2);

  const L = [];
  L.push(`GOAL: ${settings.goal || ''}`);
  L.push(`TARGET: ${settings.targetMpw || '?'} run mi/wk${settings.targetDate ? ` by ${settings.targetDate}` : ' (no date set - propose one)'}`);
  L.push(`KEEP ALONGSIDE: ${settings.keep || 'not specified'}`);
  L.push(`LIMITS: ${settings.limits || 'none stated'}`);
  L.push(`TODAY: ${todayYmd()} (${DOW[(new Date().getDay() + 6) % 7]}), current week ${week}`);

  L.push('');
  if (plan) {
    L.push(`CURRENT MACROCYCLE (${plan.source || 'coach'}, built ${String(plan.generatedAt || '?').slice(0, 10)}):`);
    for (const ph of plan.phases || []) {
      L.push(`  phase ${ph.n} ${ph.name} weeks ${ph.weekFrom}-${ph.weekTo}${ph.job ? `: ${ph.job}` : ''}`);
    }
    const t = targetFor(plan, weekDocs, week);
    if (t) L.push(`  this week's target: ${t.runMiles} mi${t.deload ? ' (deload)' : ''}`);
  } else {
    L.push('CURRENT MACROCYCLE: none yet.');
  }

  L.push('');
  L.push('WEEKLY ACTUALS, oldest first (run mi / runs / longest / bike h / swim yd / lifts / avg run HR / planned):');
  for (let i = nWeeks; i >= 0; i--) {
    const k = weekAdd(week, -i);
    const r = rollup(activities, k);
    const t = targetFor(plan, weekDocs, k);
    if (!r.any && !t) continue;
    L.push(`  ${k}  ${n1(r.runMi)} mi / ${r.runs} runs / ${n1(r.longest)} long / ${n1(r.bikeMin / 60)} h bike / ` +
      `${n0(r.swimYd)} yd swim / ${r.lifts} lift / ${r.hrAvg ? `${n0(r.hrAvg)} bpm` : 'no hr'}` +
      `${t?.runMiles ? ` / planned ${n0(t.runMiles)}${t.deload ? ' deload' : ''}` : ' / unplanned'}` +
      `${k === week ? '   <- current week, in progress' : ''}`);
  }

  L.push('');
  L.push('RECENT SESSIONS, newest first:');
  for (const s of activities.slice(0, nSessions)) {
    const bits = [s.date, s.sport];
    if (s.sport === 'swim') bits.push(`${n0(s.yards || 0)}yd`);
    else if (s.miles) bits.push(`${n1(s.miles)}mi`);
    if (s.movingMin) bits.push(`${n0(s.movingMin)}min`);
    if (s.paceSecPerMi) bits.push(`${mmss(s.paceSecPerMi)}/mi`);
    if (s.speedMph) bits.push(`${n1(s.speedMph)}mph`);
    if (s.hrAvg) bits.push(`${n0(s.hrAvg)}bpm`);
    if (s.elevFt) bits.push(`${n0(s.elevFt)}ft`);
    if (s.runType) bits.push(`[${s.runType}]`);
    if (s.lifts?.length) {
      bits.push(`lifts: ${s.lifts.map((l) => `${l.ex} ${l.sets || '?'}x${l.reps || '?'}${l.lb ? `@${l.lb}lb` : ''}`).join('; ')}`);
    }
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

  if (digests.length) {
    L.push('');
    L.push("RECENT WEEKLY DIGESTS, in the athlete's words:");
    for (const d of digests) {
      if (d?.text) L.push(`  [${d.week}] ${String(d.text).slice(0, 1400).replace(/\s+/g, ' ')}`);
    }
  }

  return L.join('\n');
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
const targets = (t) => ({
  runMiles: orNull(t?.runMiles),
  bikeHours: orNull(t?.bikeHours),
  swimSessions: orNull(t?.swimSessions),
  strengthSessions: orNull(t?.strengthSessions),
});

// --- actions ---------------------------------------------------------------
export async function planWeek(userId, weekKey) {
  const prev = weekAdd(weekKey, -1);
  const dates = weekDates(weekKey);
  const context = buildContext(userId, { weeks: 12, sessions: 22 });

  const task = [
    context,
    '',
    '=== TASK ===',
    `Write the training week for ${weekKey} (Monday ${dates[0]} through Sunday ${dates[6]}).`,
    `Decide the week's run mileage yourself from the macrocycle target, what they actually did in ${prev},`,
    'and how their notes read. If the evidence says hold or drop, hold or drop, and say why in coachNote.',
    '',
    `Return exactly 7 days in order, Monday first, with these dates: ${dates.join(', ')}.`,
    'A rest day is a day with an empty sessions array. Every run session needs miles set.',
    'Every bike, swim, lift or strength session needs minutes set. Use 0 for a value that does not apply.',
  ].join('\n');

  const out = await ask(userId, 'plan-week', WeekPlanSchema, task);

  const days = dates.map((date, i) => {
    const src = out.days?.[i] || {};
    return {
      dow: DOW[i],
      date,
      sessions: (src.sessions || []).map((s) => ({
        sport: String(s.sport || 'other').toLowerCase(),
        title: String(s.title || ''),
        miles: orNull(s.miles),
        minutes: orNull(s.minutes),
        intensity: s.intensity ? String(s.intensity) : null,
        detail: s.detail ? String(s.detail) : null,
        optional: Boolean(s.optional),
      })),
    };
  });

  const doc = {
    week: weekKey,
    targets: targets(out.targets),
    deload: Boolean(out.deload),
    verdict: verdictOf(out.verdict),
    focus: out.focus || null,
    coachNote: out.coachNote || null,
    adjustments: (out.adjustments || []).slice(0, 8),
    days,
    source: 'claude',
    generatedAt: new Date().toISOString(),
  };
  saveWeek(userId, weekKey, doc);
  return doc;
}

export async function reviewDigest(userId, text) {
  const week = thisWeek();
  const last = weekAdd(week, -1);
  saveDigest(userId, week, { week, text, submittedAt: new Date().toISOString() });

  const task = [
    buildContext(userId, { weeks: 12, sessions: 26 }),
    '',
    `=== THIS MORNING'S DIGEST (about the week that just finished, ${last}) ===`,
    text,
    '',
    '=== TASK ===',
    `Review the week that just ended against what was planned, then set the direction for ${week}.`,
    'Weigh what they wrote against the numbers: if the digest sounds great but the load jumped, hold them.',
    'If the digest sounds flat and the numbers are fine, look for sleep, life load, or pace creep in easy runs.',
    'Leave flags empty unless something genuinely warrants watching.',
  ].join('\n');

  const out = await ask(userId, 'review-digest', ReviewSchema, task);

  const review = {
    verdict: verdictOf(out.verdict),
    summary: out.summary || '',
    observations: (out.observations || []).slice(0, 8),
    adjustments: (out.adjustments || []).slice(0, 8),
    flags: (out.flags || []).slice(0, 6),
    nextWeek: targets(out.nextWeek),
    generatedAt: new Date().toISOString(),
  };
  saveDigest(userId, week, { week, text, submittedAt: new Date().toISOString(), review });

  const plan = await planWeek(userId, week);
  return { review, week: plan };
}

export async function buildMacrocycle(userId) {
  const settings = { ...DEFAULT_SETTINGS, ...(getSettings(userId) || {}) };
  const week = thisWeek();

  const task = [
    buildContext(userId, { weeks: 16, sessions: 20 }),
    '',
    '=== TASK ===',
    `Build the macrocycle that gets this athlete from the volume their recent weeks actually show to`,
    `${settings.targetMpw || 75} run miles a week, held sustainably. Start from the evidence in the weekly`,
    'actuals above, not from an assumption about where they should be. Set the timeline yourself.',
    'Use 3 to 5 phases. Give week-by-week targets for 26 consecutive weeks with every fourth week a deload,',
    'and bike, swim and strength alongside so their stated minimums hold.',
    `weekTargets must start at ${week} with index 1 and run to index 26.`,
  ].join('\n');

  const out = await ask(userId, 'build-plan', MacrocycleSchema, task);

  const weekTargets = (out.weekTargets || []).slice(0, 30).map((t, i) => ({
    week: /^\d{4}-W\d{2}$/.test(String(t.week)) ? t.week : weekAdd(week, i),
    index: t.index || i + 1,
    phase: t.phase || null,
    runMiles: orNull(t.runMiles),
    bikeHours: orNull(t.bikeHours),
    swimSessions: orNull(t.swimSessions),
    strengthSessions: orNull(t.strengthSessions),
    deload: Boolean(t.deload),
  }));

  const doc = {
    goal: settings.goal || '',
    targetMpw: settings.targetMpw || null,
    targetDate: out.targetDate || settings.targetDate || '',
    rationale: out.rationale || '',
    phases: (out.phases || []).map((p) => ({
      n: p.n || 0, name: String(p.name || ''),
      weekFrom: p.weekFrom || 0, weekTo: p.weekTo || 0, job: String(p.job || ''),
    })),
    weekTargets,
    source: 'claude',
    generatedAt: new Date().toISOString(),
  };
  savePlan(userId, doc);
  return doc;
}
