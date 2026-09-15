// Plans: which model coaches whom, how carefully, and how much per month.
//
// A tier decides three things. The model used for routine work (the weekly
// plan and the digest review — the bulk of what a coach does). The model used
// for key work (assessing the goal, reviewing the program, building the
// season — rare, and where judgement matters most). And a monthly coaching
// budget, metered in what the calls actually cost, because a re-plan is a
// real expense and nothing else stops someone pressing it daily.
//
// Effort stays high everywhere. Sonnet is cheap enough that thinking less is
// not where the saving is, and the weekly plan is the product — it should not
// be the thing that is worse on the entry tier.

/** Anthropic list prices, dollars per million tokens. */
export const PRICES = {
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
};

const OPUS = { model: 'claude-opus-5', effort: 'high' };
const SONNET = { model: 'claude-sonnet-5', effort: 'high' };

export const TIERS = {
  basic: {
    id: 'basic',
    label: 'Basic',
    price: 5,
    routine: SONNET,
    key: SONNET,
    // About three times a normal month's coaching on this tier.
    budget: 1.5,
    blurb: 'A coach that plans every week and reads every note.',
  },
  plus: {
    id: 'plus',
    label: 'Plus',
    price: 10,
    routine: SONNET,
    key: OPUS,
    budget: 3,
    blurb: 'The most capable model for the calls that matter most.',
  },
  expert: {
    id: 'expert',
    label: 'Expert',
    price: 20,
    routine: OPUS,
    key: OPUS,
    budget: 8,
    blurb: 'The most capable model for everything.',
  },
};

export const DEFAULT_TIER = 'basic';

/** The kinds of coaching call, and which of the two model slots each uses. */
export const KEY_KINDS = new Set(['goal-confidence', 'program-review', 'build-plan']);
export const isKeyKind = (kind) => KEY_KINDS.has(kind);

export const tierOf = (id) => TIERS[id] || TIERS[DEFAULT_TIER];

/** Model and effort for one call on one tier. */
export function modelFor(tierId, kind) {
  const tier = tierOf(tierId);
  return isKeyKind(kind) ? tier.key : tier.routine;
}

/** What one reply cost, from the usage the API reports. Unknown models cost as Opus. */
export function costOf(model, usage) {
  if (!usage) return 0;
  const p = PRICES[model] || PRICES['claude-opus-5'];
  const n = (k) => Number(usage[k]) || 0;
  return (n('input_tokens') * p.input
    + n('output_tokens') * p.output
    + n('cache_read_input_tokens') * p.cacheRead
    + n('cache_creation_input_tokens') * p.cacheWrite) / 1e6;
}

/** The first of next month, when the meter resets. */
export function nextReset(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toISOString().slice(0, 10);
}

export const monthStart = (now = new Date()) => (
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
);

/**
 * Where a user stands against their month. `unlimited` is the owner: the
 * meter still runs, so the number is known, but nothing is refused.
 */
export function allowance(tierId, spent, { unlimited = false } = {}) {
  const tier = tierOf(tierId);
  const budget = unlimited ? Infinity : tier.budget;
  const pct = unlimited ? 0 : Math.min(100, Math.round((spent / budget) * 100));
  return {
    tier: tier.id,
    label: tier.label,
    spent: Math.round(spent * 100) / 100,
    budget: unlimited ? null : budget,
    pct,
    exhausted: !unlimited && spent >= budget,
    resets: nextReset(),
  };
}
