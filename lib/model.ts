// The token radar's model (radar-2): one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol below it: the early rows the radar exists to find. A protocol is
// pre-token when its record carries no token (no market cap, no CoinGecko id, no symbol); a protocol
// is rankable when it is pre-token and not a wrapped, staked or bridged product of a token that
// already trades, by the same rule the watchlist uses: its category is not Bridge, Canonical Bridge,
// Liquid Staking, Liquid Restaking, Restaked BTC or CEX, its name carries no whole word wrapped,
// staked or staking, does not begin with an exchange's name, and does not end in a version marker
// (a name ending in V2, v2 or 2.0 is a pool of another protocol, not a launch of its own). WBTC is
// Bitcoin on Ethereum and Binance staked ETH is ETH in Binance's staking product: neither is a
// protocol still waiting on a launch of its own. Live-token protocols are kept apart: their market
// caps are facts, and they are also the model's calibration set.
//
// Implied value is calibrated from the snapshot itself, never from a hardcoded multiple:
//
//   multiple   = median(mcap_usd / tvl_usd) over live-token protocols in the protocol's own
//                category (at least 3 comparables; otherwise the global median), clamped to
//                [0.05, 2.0]. Centralised exchanges are left out of the calibration: an exchange
//                token prices the exchange, not a protocol.
//   base       = tvl_usd x multiple
//   growth     = clamp(change_7d, -60, 120) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.05 x min(chains - 1, 4)            (a protocol live on more chains reaches
//                                                         more farmers; at most +20%)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// The farmer pool is a stated assumption, not a promise: 7% of the implied value, the middle of the
// 5-10% a protocol typically allocates to its earliest users. It is shown beside the implied value so
// a reader sees what farming is worth to them, not just what the token might be worth.
//
// No protocol name is ever special-cased: the same functions score every row, and the dashboard
// recomputes every number from the snapshot figures, so the page's code and the board's data are
// visibly the same arithmetic.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  min_category_n: number;
  multiple_floor: number;
  multiple_cap: number;
  breadth_per_chain: number;
  breadth_max_chains: number;
  farmer_share: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  min_category_n: 3,
  multiple_floor: 0.05,
  multiple_cap: 2.0,
  breadth_per_chain: 0.05,
  breadth_max_chains: 4,
  farmer_share: 0.07,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 32;

/** One category's calibration: its multiple, how many comparables set it, and whether it fell back. */
export interface CategoryMultiple {
  multiple: number;
  n: number;
  fallback: boolean;
}

/** The calibration the snapshot itself yields: a global multiple and one per category. */
export interface Calibration {
  global_multiple: number;
  global_n: number;
  categories: Record<string, CategoryMultiple>;
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  farmer_pool_usd: number;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
  model: {
    category_multiple: number;
    comparables: number;
    multiple_fallback: boolean;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the farm plan generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  farmer_pool_usd: number;
  category_multiple: number;
  comparables: number;
  multiple_fallback: boolean;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_hold_days: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One calibration comparable: a live-token protocol's category and its market-cap-to-TVL ratio. */
export interface Comparable {
  category: string | null;
  ratio: number;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  calibration: Calibration;
  rows: RadarRow[];
  live: LiveRow[];
  comparables: Comparable[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted list of numbers; the middle value, or the mean of the middle two. */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are wrapped, staked or bridged products of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** A whole word wrapped, staked or staking anywhere in a name, in any case. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** A name beginning with an exchange's name. */
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/**
 * Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or bridged
 * product of a token that already trades, by the same rule the watchlist uses.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/**
 * The calibration the snapshot yields: the median market-cap-to-TVL ratio of the live-token protocols,
 * per category and overall. A category with fewer than `min_category_n` comparables falls back to the
 * global median, and every multiple is clamped to [multiple_floor, multiple_cap] so one outlier
 * category cannot set an absurd price. Computed from the snapshot at run time: a new snapshot
 * recalibrates the whole board on its own.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const all: number[] = [];
  const byCategory = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    all.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
  }
  all.sort((a, b) => a - b);
  const globalRaw = median(all);
  const global = Math.min(model.multiple_cap, Math.max(model.multiple_floor, globalRaw));
  const categories: Record<string, CategoryMultiple> = {};
  for (const [category, ratios] of [...byCategory.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    ratios.sort((a, b) => a - b);
    if (ratios.length >= model.min_category_n) {
      categories[category] = { multiple: round4(Math.min(model.multiple_cap, Math.max(model.multiple_floor, median(ratios)))), n: ratios.length, fallback: false };
    } else {
      categories[category] = { multiple: round4(global), n: ratios.length, fallback: true };
    }
  }
  return { global_multiple: round4(global), global_n: all.length, categories };
}

/** The multiple one category gets: its own calibration, or the global one when it has none. */
export function multipleFor(category: string | null, calibration: Calibration): CategoryMultiple {
  if (category !== null && calibration.categories[category] !== undefined) return calibration.categories[category]!;
  return { multiple: calibration.global_multiple, n: 0, fallback: true };
}

/** The multipliers and the implied value one protocol gets under `model` and `calibration`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; comparables: number; fallback: boolean; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const entry = multipleFor(protocol.category, calibration);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const breadthMult = 1 + model.breadth_per_chain * Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const base = protocol.tvl_usd * entry.multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, multiple: entry.multiple, comparables: entry.n, fallback: entry.fallback, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Typical gas for one transaction on a chain, in dollars: setup action and a weekly action. */
function gasFor(chain: string): { setup: number; weekly: number } {
  const c = chain.toLowerCase();
  if (c === 'ethereum') return { setup: 12, weekly: 6 };
  if (c === 'solana' || c === 'tron' || c === 'sui' || c === 'aptos') return { setup: 1, weekly: 1 };
  if (['base', 'arbitrum', 'optimism', 'ink', 'blast', 'mode', 'zksync era', 'polygon', 'bsc', 'avalanche', 'gnosis', 'linea', 'scroll', 'mantle', 'opbnb', 'berachain', 'monad', 'megaeth'].includes(c)) return { setup: 2, weekly: 1 };
  return { setup: 4, weekly: 2 };
}

/** The category's two distinctive actions, in the words a farmer can follow. */
function playbookFor(p: SnapshotProtocol, capital: number, chain: string): { action: string; weekly: string } {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      action: `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
      weekly: `Borrow a small amount against the supply, then repay it, keeping the health factor above 2.`,
    };
  }
  if (c.includes('dex') || c.includes('leveraged farm')) {
    return {
      action: `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
      weekly: `Route one swap through ${name} so the wallet shows trading activity as well as liquidity.`,
    };
  }
  if (c.includes('yield') || c.includes('curator') || c.includes('allocator') || c.includes('risk')) {
    return {
      action: `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`,
      weekly: `Claim or compound the vault's rewards once, so the position keeps accruing.`,
    };
  }
  if (c.includes('bridge')) {
    return {
      action: `Bridge $${capital} of USDC through ${name} to ${chain} and use the bridged funds in its app.`,
      weekly: `Bridge a small amount back or onward so the wallet shows repeat bridging volume.`,
    };
  }
  if (c.includes('staking') || c.includes('restak')) {
    return {
      action: `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token.`,
      weekly: `Check the receipt token's balance and restake any rewards it accrues.`,
    };
  }
  if (c.includes('perpetual') || c.includes('derivative')) {
    return {
      action: `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
      weekly: `Open and close one small position so the wallet shows trading volume without large exposure.`,
    };
  }
  if (c.includes('prediction')) {
    return {
      action: `Fund $${capital} and place one market position on ${name}.`,
      weekly: `Place one more small position in a market that resolves soon.`,
    };
  }
  if (c.includes('stable')) {
    return {
      action: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
      weekly: `Hold the stable asset in the protocol's own pool or savings product.`,
    };
  }
  if (c.includes('rwa')) {
    return {
      action: `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`,
      weekly: `Claim the asset's yield once so the wallet shows an active holding.`,
    };
  }
  if (c.includes('insurance')) {
    return {
      action: `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
      weekly: `Check the policy's status and renew or extend it before it lapses.`,
    };
  }
  if (c.includes('index')) {
    return {
      action: `Mint $${capital} of the ${name} index token on ${chain} and hold it.`,
      weekly: `Rebalance or top up the index position by a small amount.`,
    };
  }
  if (c.includes('payment')) {
    return {
      action: `Route $${capital} of payments through ${name} on ${chain} and keep a balance in the app.`,
      weekly: `Send one more payment through ${name} so the wallet stays active.`,
    };
  }
  if (c.includes('privacy')) {
    return {
      action: `Use ${name} on ${chain} to move $${capital} privately and keep the receipt.`,
      weekly: `Make one more private transfer so the wallet shows repeat use.`,
    };
  }
  if (c.includes('ai agent') || c.includes('ai')) {
    return {
      action: `Use ${name}'s agent product on ${chain} with $${capital} of funds and keep the position open.`,
      weekly: `Run one more agent task so the wallet shows repeat product use.`,
    };
  }
  return {
    action: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`,
    weekly: `Make one qualifying action, such as a deposit, a swap or a vote, so the wallet stays active.`,
  };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time, plus the plan's totals.
 * The plan is derived from the protocol's own record (category, chains, TVL, age), never from a
 * hand-written list of names. The dashboard generates the same plan from the same derivation.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null): { steps: FarmStep[]; capital: number; gas: number; hold: number } {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const play = playbookFor(p, capital, chain);
  const weeks = Math.max(1, Math.ceil(hold / 7));
  const totalGas = gas.setup + gas.weekly * weeks + 3;
  return {
    capital,
    gas: totalGas,
    hold,
    steps: [
      {
        text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
        cost: 'under $3 of gas for the first transaction',
        time: '5 minutes',
      },
      {
        text: play.action,
        cost: `$${capital} of capital and about $${gas.setup} of gas on ${chain}`,
        time: '15 minutes to set up',
      },
      {
        text: play.weekly,
        cost: `about $${gas.weekly} of gas a week on ${chain}`,
        time: '10 minutes a week',
      },
      {
        text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
        cost: `the $${capital} stays in the position`,
        time: `${hold} days`,
      },
      {
        text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
        cost: 'no fee to check, and never pay to claim',
        time: '10 minutes',
      },
      {
        text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ],
  };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const calibration = calibrate(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, whatever its TVL. The floor is never
  // the whole board, and a small protocol the snapshot just started tracking is exactly the early
  // find the radar exists to surface.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    const plan = farmPlan(p, v.age);
    return { p, v, plan };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    watchlist: snapshot.watchlist.includes(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    farmer_pool_usd: Math.max(1, Math.round(s.v.implied * model.farmer_share)),
    farm_capital_usd: s.plan.capital,
    farm_gas_usd: s.plan.gas,
    farm_hold_days: s.plan.hold,
    model: {
      category_multiple: s.v.multiple,
      comparables: s.v.comparables,
      multiple_fallback: s.v.fallback,
      growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult),
      maturity_multiplier: round4(s.v.maturityMult),
      breadth_multiplier: round4(s.v.breadthMult),
      age_days: s.v.age,
    },
    farm_steps: s.plan.steps.map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Every calibration comparable, so the dashboard can recompute the multiples itself. Ratios are
 * carried at full precision (no rounding) and null-category protocols are included, so the page's
 * calibration is bit for bit the same arithmetic as this file's. */
export function comparables(snapshot: Snapshot): Comparable[] {
  const out: Comparable[] = [];
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0 || p.mcap_usd <= 0) continue;
    if (p.category === 'CEX') continue;
    out.push({ category: p.category, ratio: p.mcap_usd / p.tvl_usd });
  }
  out.sort((a, b) => {
    const ac = a.category ?? '';
    const bc = b.category ?? '';
    return ac < bc ? -1 : ac > bc ? 1 : a.ratio - b.ratio;
  });
  return out;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    watchlist: row.watchlist,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    farmer_pool_usd: row.farmer_pool_usd,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    multiple_fallback: row.model.multiple_fallback,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_capital_usd: row.farm_capital_usd,
    farm_gas_usd: row.farm_gas_usd,
    farm_hold_days: row.farm_hold_days,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const calibration = calibrate(snapshot, model);
  const early = board.filter((r) => !r.watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    calibration,
    rows: board.map(radarRow),
    live,
    comparables: comparables(snapshot),
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
