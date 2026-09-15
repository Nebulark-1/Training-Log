// Plans decide who is coached by what and how much of it they get. The
// arithmetic is small, and it is what stands between a $5 plan and a $50 bill.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TIER, KEY_KINDS, PRICES, TIERS, allowance, costOf, isKeyKind, modelFor,
  monthStart, nextReset, tierOf,
} from '../server/tiers.js';

test('every tier prices out well under what it charges', () => {
  // A normal month: four weekly sends (review + plan, both routine) plus one
  // key call. Measured on the real log: ~11k input, ~15k output tokens across
  // that, of which the key call is ~1.6k in / 2.8k out.
  for (const t of Object.values(TIERS)) {
    const routine = costOf(t.routine.model, { input_tokens: 9400, output_tokens: 12000 });
    const key = costOf(t.key.model, { input_tokens: 1600, output_tokens: 2800 });
    const month = routine + key;
    assert.ok(month < t.price * 0.2, `${t.id}: a normal month costs $${month.toFixed(2)} against $${t.price}`);
    assert.ok(t.budget > month * 2, `${t.id}: the budget ($${t.budget}) should cover well over a normal month ($${month.toFixed(2)})`);
  }
});

test('the entry tier keeps effort high', () => {
  // Sonnet is cheap enough that thinking less is not where the saving is, and
  // the weekly plan is the product.
  assert.equal(TIERS.basic.routine.effort, 'high');
  assert.equal(TIERS.basic.key.effort, 'high');
});

test('key work goes to the key model and routine work to the routine one', () => {
  assert.equal(modelFor('plus', 'goal-confidence').model, 'claude-opus-5');
  assert.equal(modelFor('plus', 'program-review').model, 'claude-opus-5');
  assert.equal(modelFor('plus', 'build-plan').model, 'claude-opus-5');
  assert.equal(modelFor('plus', 'plan-week').model, 'claude-sonnet-5');
  assert.equal(modelFor('plus', 'review').model, 'claude-sonnet-5');
});

test('the weekly plan is routine on every tier, because it happens every week', () => {
  assert.equal(isKeyKind('plan-week'), false);
  assert.equal(isKeyKind('review'), false);
  assert.ok(KEY_KINDS.size >= 3);
});

test('an unknown tier falls back to the default rather than throwing', () => {
  assert.equal(tierOf('platinum').id, DEFAULT_TIER);
  assert.equal(modelFor(undefined, 'plan-week').model, TIERS[DEFAULT_TIER].routine.model);
});

test('cost is priced from the usage the API reports', () => {
  const usage = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 1000, cache_creation_input_tokens: 1000 };
  const p = PRICES['claude-opus-5'];
  const want = (1000 * (p.input + p.output + p.cacheRead + p.cacheWrite)) / 1e6;
  assert.ok(Math.abs(costOf('claude-opus-5', usage) - want) < 1e-9);
});

test('a reply that reported no usage costs nothing, and an unknown model costs as Opus', () => {
  assert.equal(costOf('claude-opus-5', null), 0);
  assert.equal(costOf('claude-mystery-9', { output_tokens: 1000 }), costOf('claude-opus-5', { output_tokens: 1000 }));
});

test('Sonnet is cheaper than Opus on every line', () => {
  for (const k of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    assert.ok(PRICES['claude-sonnet-5'][k] < PRICES['claude-opus-5'][k], k);
  }
});

test('an allowance says where the month stands and when it resets', () => {
  const a = allowance('basic', 0.75);
  assert.equal(a.pct, 50);
  assert.equal(a.exhausted, false);
  assert.match(a.resets, /^\d{4}-\d{2}-01$/);
});

test('reaching the budget is exhausted; a cent under is not', () => {
  assert.equal(allowance('basic', TIERS.basic.budget).exhausted, true);
  assert.equal(allowance('basic', TIERS.basic.budget - 0.01).exhausted, false);
  assert.equal(allowance('basic', TIERS.basic.budget * 3).pct, 100, 'the meter caps at 100');
});

test('the owner is metered but never refused', () => {
  const a = allowance('expert', 500, { unlimited: true });
  assert.equal(a.exhausted, false);
  assert.equal(a.budget, null);
  assert.equal(a.spent, 500, 'the number is still known');
});

test('the month resets on the first, in UTC', () => {
  assert.equal(nextReset(new Date('2026-09-15T12:00:00Z')), '2026-10-01');
  assert.equal(nextReset(new Date('2026-12-31T23:59:59Z')), '2027-01-01');
  assert.equal(monthStart(new Date('2026-09-15T12:00:00Z')), '2026-09-01T00:00:00.000Z');
});

test('a day has a ceiling that is not the monthly budget', () => {
  const a = allowance('basic', 0.1, { today: 3 });
  assert.equal(a.cappedToday, true, 'three calls is the entry tier\'s day');
  assert.equal(a.exhausted, false, 'while the month is barely touched');
  assert.equal(allowance('expert', 0.1, { today: 3 }).cappedToday, false, 'a bigger plan gets a bigger day');
});

test('a second call right after the first is asked to wait', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  const a = allowance('plus', 0, { lastRunAt: '2026-09-15T11:59:30Z', now });
  assert.equal(a.coolingDown, true);
  assert.ok(a.coolsInSec > 0 && a.coolsInSec <= 90);
  const later = allowance('plus', 0, { lastRunAt: '2026-09-15T11:50:00Z', now });
  assert.equal(later.coolingDown, false);
});

test('the owner has no daily ceiling but still cools down', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  const a = allowance('expert', 0, { unlimited: true, today: 40, lastRunAt: '2026-09-15T11:59:50Z', now });
  assert.equal(a.cappedToday, false);
  assert.equal(a.dailyCap, null);
  assert.equal(a.coolingDown, true, 'the cooldown is a double-click guard, for everyone');
});
