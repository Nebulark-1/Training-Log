// Offline coach — the same coaching loop, driven from a Claude Code session
// instead of the Anthropic API. No API key needed.
//
//   npm run coach -- context                     what the coach reads
//   npm run coach -- prompt plan-week [2026-W38] the exact prompt the API sends
//   npm run coach -- prompt review "<digest>"    ...for a weekly review
//   npm run coach -- prompt build-plan           ...for the macrocycle
//   npm run coach -- schema plan-week            the JSON shape to reply with
//   npm run coach -- apply week 2026-W38 plan.json
//   npm run coach -- apply review digest.txt review.json
//   npm run coach -- apply plan macro.json
//
// `prompt` prints the coaching rules plus the athlete's data; hand the reply
// back as JSON through `apply`, which validates and stores it through exactly
// the same normalizer the API path uses.
import fs from 'node:fs';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { db, initDb } from './db.js';
import {
  RULES, MacrocycleSchema, ProgramReviewSchema, ReviewSchema, WeekPlanSchema,
  applyMacrocycle, applyProgramReview, applyReview, applyWeek, buildContext,
  macroPrompt, programPrompt, reviewPrompt, weekPrompt,
} from './coach.js';
import { saveDigest } from './db.js';
import { thisWeek } from '../public/lib/dates.js';

const SCHEMAS = {
  'plan-week': WeekPlanSchema,
  review: ReviewSchema,
  'build-plan': MacrocycleSchema,
  'program-review': ProgramReviewSchema,
};

initDb();

function die(msg) {
  process.stderr.write(`\n  ${msg}\n\n`);
  process.exit(1);
}

/** The account to act on. One user needs no flag; several require --user. */
function resolveUser(args) {
  const flagged = args.find((a) => a.startsWith('--user='));
  if (flagged) return flagged.slice(7);
  const rows = db.prepare('SELECT id, name, email FROM users ORDER BY created_at').all();
  if (rows.length === 0) die('No accounts yet. Open the app and sign in once.');
  if (rows.length === 1) return rows[0].id;
  process.stderr.write('\n  Several accounts — pass --user=<id>:\n');
  for (const r of rows) process.stderr.write(`    ${r.id}  ${r.name || ''} ${r.email || ''}\n`);
  process.exit(1);
  return null;
}

/** Reply shape, derived from the zod schema so it can never drift. */
function jsonShape(kind) {
  const schema = SCHEMAS[kind];
  if (!schema) die(`Unknown prompt kind "${kind}". Use plan-week, review or build-plan.`);
  return JSON.stringify(betaZodOutputFormat(schema).schema, null, 2);
}

function readJson(path) {
  if (!path) die('Give the path to a JSON file.');
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch {
    die(`Cannot read ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`${path} is not valid JSON: ${err.message}`);
  }
  return null;
}

const NEWLINE = String.fromCharCode(10);

function reportViolations(violations) {
  for (const v of violations || []) {
    process.stdout.write(`  [${v.severity}] ${v.code}: ${v.message}` + NEWLINE);
  }
}

/**
 * Validate against the same schema the API path enforces. A couple of fields
 * are filled in first — required by the schema but tedious to type by hand on
 * every run and swim.
 */
function validate(kind, data) {
  if (kind === 'plan-week') {
    for (const day of data.days || []) {
      for (const s of day.sessions || []) {
        if (typeof s.programSession !== 'string') s.programSession = '';
      }
    }
  }
  const result = SCHEMAS[kind].safeParse(data);
  if (!result.success) {
    process.stderr.write('\n  That JSON does not match the expected shape:\n\n');
    for (const issue of result.error.issues.slice(0, 20)) {
      process.stderr.write(`    ${issue.path.join('.') || '(root)'}: ${issue.message}\n`);
    }
    process.stderr.write(`\n  Run:  npm run coach -- schema ${kind}\n\n`);
    process.exit(1);
  }
  return result.data;
}

const [, , command, ...args] = process.argv;
const userId = ['context', 'prompt', 'schema', 'apply'].includes(command) ? resolveUser(args) : null;
const positional = args.filter((a) => !a.startsWith('--'));

switch (command) {
  case 'context': {
    const weeks = Number(args.find((a) => a.startsWith('--weeks='))?.slice(8)) || 12;
    const sessions = Number(args.find((a) => a.startsWith('--sessions='))?.slice(11)) || 24;
    process.stdout.write(`${buildContext(userId, { weeks, sessions })}\n`);
    break;
  }

  case 'prompt': {
    const kind = positional[0] || 'plan-week';
    let built;
    if (kind === 'plan-week') built = weekPrompt(userId, positional[1] || thisWeek());
    else if (kind === 'review') {
      const text = positional[1];
      if (!text) die('Pass the digest text, or a file: prompt review "<text>" | prompt review @digest.txt');
      built = reviewPrompt(userId, text.startsWith('@') ? fs.readFileSync(text.slice(1), 'utf8') : text);
    } else if (kind === 'build-plan') built = macroPrompt(userId);
    else if (kind === 'program-review') built = programPrompt(userId);
    else die(`Unknown prompt kind "${kind}". Use plan-week, review, build-plan or program-review.`);

    process.stdout.write(`=== COACHING RULES ===\n${RULES}\n\n${built.task}\n\n`);
    process.stdout.write(`=== REPLY WITH JSON MATCHING THIS SCHEMA ===\n${jsonShape(kind === 'plan-week' ? 'plan-week' : kind)}\n`);
    break;
  }

  case 'schema':
    process.stdout.write(`${jsonShape(positional[0] || 'plan-week')}\n`);
    break;

  case 'apply': {
    const what = positional[0];
    if (what === 'week') {
      const week = positional[1];
      if (!/^\d{4}-W\d{2}$/.test(String(week))) die('Usage: apply week <2026-W38> <plan.json>');
      const data = validate('plan-week', readJson(positional[2]));
      const result = applyWeek(userId, week, data, 'claude-code', { force: args.includes('--force') });
      const doc = result.week;
      const runs = doc.days.flatMap((d) => d.sessions).filter((s) => s.sport === 'run');
      const miles = runs.reduce((n, s) => n + (s.miles || 0), 0);
      const lifts = doc.days.flatMap((d) => d.sessions).filter((s) => s.exercises?.length);
      reportViolations(result.violations);
      if (!result.ok) {
        process.stderr.write(NEWLINE + '  NOT SAVED - a guardrail blocked it. Fix the plan, or re-run with'
          + ' --force if you have decided the guardrail is wrong here.' + NEWLINE + NEWLINE);
        process.exit(1);
      }
      process.stdout.write(`\n  Saved ${week}: ${doc.verdict}, ${doc.volumes?.run ?? '?'} mi run target, `
        + `${runs.length} runs totalling ${miles.toFixed(1)} mi, ${lifts.length} programmed strength sessions.\n\n`);
    } else if (what === 'review') {
      const textPath = positional[1];
      const text = textPath && fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8').trim() : textPath;
      if (!text) die('Usage: apply review <digest.txt|"text"> <review.json>');
      const data = validate('review', readJson(positional[2]));
      const review = applyReview(userId, text, data);
      process.stdout.write(`\n  Saved the review for ${thisWeek()}: ${review.verdict}`
        + `${review.flags.length ? `, ${review.flags.length} flag(s)` : ''}.\n`
        + '  Now apply the week plan:  npm run coach -- apply week <week> <plan.json>\n\n');
    } else if (what === 'plan') {
      const data = validate('build-plan', readJson(positional[1]));
      const doc = applyMacrocycle(userId, data, 'claude-code');
      process.stdout.write(`\n  Saved the macrocycle: ${doc.phases.length} phases, `
        + `${doc.weekTargets.length} weeks${doc.targetDate ? `, target ${doc.targetDate}` : ''}.\n\n`);
    } else if (what === 'program') {
      const data = validate('program-review', readJson(positional[1]));
      const result = applyProgramReview(userId, data, { by: 'claude-code' });
      reportViolations(result.violations);
      if (!result.ok) {
        process.stderr.write(NEWLINE + '  NOT SAVED - a program guardrail blocked it.' + NEWLINE + NEWLINE);
        process.exit(1);
      }
      process.stdout.write(`\n  Program is now v${result.program.version}. `
        + `${result.decisions.length} verdict(s) on off-program movements.\n`);
      for (const d of result.decisions) {
        process.stdout.write(`    ${d.name}: ${d.decision} - ${d.reason}\n`);
      }
      process.stdout.write('\n');
    } else if (what === 'digest') {
      const textPath = positional[1];
      const text = textPath && fs.existsSync(textPath) ? fs.readFileSync(textPath, 'utf8').trim() : textPath;
      if (!text) die('Usage: apply digest <digest.txt|"text">');
      saveDigest(userId, thisWeek(), { week: thisWeek(), text, submittedAt: new Date().toISOString() });
      process.stdout.write(`\n  Stored the digest for ${thisWeek()}.\n\n`);
    } else {
      die('Usage: apply <week|review|plan|program|digest> ...');
    }
    break;
  }

  default:
    process.stdout.write(`
  Offline coach — same loop, no API key.

    npm run coach -- context [--weeks=12] [--sessions=24]
    npm run coach -- prompt plan-week [2026-W38]
    npm run coach -- prompt review "<digest text>" | @digest.txt
    npm run coach -- prompt build-plan
    npm run coach -- prompt program-review
    npm run coach -- schema plan-week | review | build-plan | program-review
    npm run coach -- apply week <2026-W38> <plan.json>
    npm run coach -- apply review <digest.txt> <review.json>
    npm run coach -- apply plan <macro.json>
    npm run coach -- apply program <program.json>
    npm run coach -- apply digest <digest.txt>

  Add --user=<id> when the database holds more than one account.
`);
}
