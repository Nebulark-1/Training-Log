// npm run backtest -- [--horizon=8] [--lead=8] [--user=<id>] [--json]
//
// Prints what the scores would have said week by week and how the following
// weeks actually went, so the confidence number can be judged rather than
// trusted.
import { db } from './db.js';
import { backtest, buckets } from './backtest.js';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function resolveUser() {
  const flagged = flag('user', null);
  if (flagged) return flagged;
  const rows = db.prepare('SELECT id, name, email FROM users ORDER BY created_at').all();
  if (!rows.length) {
    process.stderr.write('\n  No accounts yet. Open the app and sign in once.\n\n');
    process.exit(1);
  }
  if (rows.length > 1) {
    process.stderr.write('\n  Several accounts — pass --user=<id>:\n');
    for (const r of rows) process.stderr.write(`    ${r.id}  ${r.name || ''} ${r.email || ''}\n`);
    process.exit(1);
  }
  return rows[0].id;
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const show = (v, n = 3) => padL(v == null ? '—' : v, n);

const result = backtest(resolveUser(), {
  horizon: Number(flag('horizon', 8)),
  lead: Number(flag('lead', 8)),
});

if (result.error) {
  process.stderr.write(`\n  ${result.error}\n\n`);
  process.exit(1);
}

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(result, null, 1)}\n`);
  process.exit(0);
}

const { points, correlation: r, horizonWeeks: h } = result;

process.stdout.write(`\n  Backtest — ${result.goal?.label || 'no primary goal'} (${result.sport})\n`);
process.stdout.write(`  What each score said, against the ${h} weeks that followed.\n\n`);

if (!points.length) {
  process.stdout.write('  Not enough history yet. Every point needs weeks of data before it\n');
  process.stdout.write(`  and ${h} weeks after it, so a log has to be a few months old.\n\n`);
  process.exit(0);
}

process.stdout.write(`  ${pad('week', 10)}${padL('end', 4)}${padL('spd', 5)}${padL('conf', 6)}`);
process.stdout.write(`${padL('before', 9)}${padL(`+${h}wk`, 8)}${padL('change', 9)}${padL('sore', 6)}\n`);
process.stdout.write(`  ${'-'.repeat(57)}\n`);
for (const p of points) {
  const arrow = p.changePct > 5 ? 'up' : p.changePct < -5 ? 'down' : 'flat';
  process.stdout.write(`  ${pad(p.week, 10)}${show(p.endurance, 4)}${show(p.speed, 5)}${show(p.confidence, 6)}`);
  process.stdout.write(`${padL(p.before, 9)}${padL(p.after, 8)}${padL(`${p.changePct}%`, 8)} ${pad(arrow, 5)}${padL(p.soreWeeks, 4)}\n`);
}

process.stdout.write(`\n  ${points.length} points, ${result.span.from} to ${result.span.to}\n\n`);

const fmt = (v) => (v == null ? '     —' : padL(v.toFixed(2), 6));
const OUTCOMES = [
  ['changePct', 'volume change, %'],
  ['changeAbs', 'volume change, absolute'],
  ['soreWeeks', 'weeks with pain 3+ (lower is better)'],
];

process.stdout.write('  Rank correlation with what actually happened.\n');
process.stdout.write('  "last month\'s volume" is the no-model predictor: a score has to beat it.\n\n');
process.stdout.write(`  ${pad('outcome', 38)}${padL('conf', 7)}${padL('end', 7)}${padL('spd', 7)}${padL('no model', 10)}\n`);
process.stdout.write(`  ${'-'.repeat(69)}\n`);
for (const [key, label] of OUTCOMES) {
  const c = r[key];
  process.stdout.write(`  ${pad(label, 38)}${fmt(c.confidence)} ${fmt(c.endurance)} ${fmt(c.speed)}`);
  process.stdout.write(`   ${fmt(c.baselineVolume)}\n`);
}
process.stdout.write('\n');

const beaten = OUTCOMES.filter(([key]) => {
  const c = r[key];
  return c.confidence != null && c.baselineVolume != null
    && Math.abs(c.confidence) > Math.abs(c.baselineVolume) + 0.05;
});
if (!beaten.length) {
  process.stdout.write('  Confidence does not beat the no-model predictor on any outcome here,\n');
  process.stdout.write('  which means it is mostly restating current volume rather than adding\n');
  process.stdout.write('  a judgement of its own.\n\n');
}

const band = buckets(points, 'confidence');
if (band.length) {
  process.stdout.write('  Confidence terciles, and the median volume change that followed:\n');
  for (const b of band) {
    process.stdout.write(`    ${pad(b.band, 8)}${pad(b.scoreRange, 9)}${padL(`${b.medianChangePct}%`, 8)}  (n=${b.n})\n`);
  }
  process.stdout.write('\n');
}

// A correlation off a dozen overlapping windows is a hint, not a finding.
if (points.length < 20) {
  process.stdout.write(`  Read this as weak evidence: ${points.length} points, consecutive windows\n`);
  process.stdout.write('  overlap so they are not independent, and a percentage change is\n');
  process.stdout.write('  dominated by how small the starting volume was.\n\n');
}
