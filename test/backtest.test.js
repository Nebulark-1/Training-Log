// The backtest is the only thing that can tell us a score is wrong, so it had
// better not be wrong itself. A correlation function with a sign error would
// quietly certify a broken model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buckets, spearman } from '../server/backtest.js';

test('a perfect ranking correlates at 1', () => {
  assert.equal(spearman([[1, 10], [2, 20], [3, 30], [4, 40], [5, 50]]), 1);
});

test('a perfectly reversed ranking correlates at -1', () => {
  assert.equal(spearman([[1, 50], [2, 40], [3, 30], [4, 20], [5, 10]]), -1);
});

test('correlation is about order, not distance', () => {
  // The scores are ordinal opinions, so a huge outlier must not dominate.
  assert.equal(spearman([[1, 1], [2, 2], [3, 3], [4, 1e9]]), 1);
});

test('ties are handled rather than skewing the result', () => {
  const rho = spearman([[1, 5], [1, 6], [2, 7], [3, 8], [3, 9]]);
  assert.ok(rho > 0.9, `expected a strong positive, got ${rho}`);
});

test('a flat outcome has no correlation to report', () => {
  // Every window the same means zero variance; a number here would be invented.
  assert.equal(spearman([[1, 0], [2, 0], [3, 0], [4, 0]]), null);
});

test('too few points is not enough to correlate', () => {
  assert.equal(spearman([[1, 2], [2, 3]]), null);
});

test('noise correlates near zero', () => {
  const rho = spearman([[1, 3], [2, 1], [3, 4], [4, 2], [5, 3]]);
  assert.ok(Math.abs(rho) < 0.6, `expected something weak, got ${rho}`);
});

test('terciles split the points and report the median that followed', () => {
  const points = Array.from({ length: 9 }, (_, i) => ({
    confidence: i * 10,
    changePct: 100 - i * 10,
  }));
  const band = buckets(points, 'confidence');
  assert.equal(band.length, 3);
  assert.deepEqual(band.map((b) => b.n), [3, 3, 3]);
  assert.equal(band[0].band, 'low');
  assert.ok(band[0].medianChangePct > band[2].medianChangePct,
    'the low band should show the larger subsequent change here');
});

test('terciles ignore points with no score rather than counting them as zero', () => {
  const points = [
    ...Array.from({ length: 6 }, (_, i) => ({ confidence: i * 10, changePct: i })),
    { confidence: null, changePct: 99 },
  ];
  const band = buckets(points, 'confidence');
  assert.equal(band.reduce((n, b) => n + b.n, 0), 6);
});
