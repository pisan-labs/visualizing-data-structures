import type { OpSpec, PseudoBlock, PseudoLine, Scalar, Step, Value } from '../../engine/types';
import { L, mark, plural, wholeArg } from '../_recursion/kit';

/** The most operations one session runs: enough for a charge of 4 to run out at +4 growth. */
export const MAX_OPS = 32;
/** Width of the binary counter. 32 increments never reach 2⁸, so it never wraps. */
export const BITS = 8;

export type Structure = 'array' | 'counter';
export type Method = 'aggregate' | 'accounting' | 'potential';
/** '4' grows by a constant: capacity + 4. */
export type Growth = '2' | '1.5' | '4';
export type Charge = 'auto' | '1' | '2' | '3' | '4';

export interface AmSettings {
  [key: string]: Scalar;
  structure: Structure;
  method: Method;
  growth: Growth;
  charge: Charge;
}

export const defaults: AmSettings = {
  structure: 'array',
  method: 'accounting',
  growth: '2',
  charge: 'auto',
};

/** The operation in progress: its cost so far and where it will end, known from its start. */
export interface Current {
  cost: number;
  final: number;
  bank: number;
  phi: number;
}

export interface AmState {
  /** The array: item i holds the value i + 1, since append j stores j. */
  capacity: number;
  size: number;
  /** The counter's bits, A[0] the least significant. */
  bits: number[];
  /**
   * Coins (by uid) on each array cell or counter bit, for the accounting method. The bank's
   * balance is the number of coins, or minus `debt` when it has run dry.
   */
  coins: number[][];
  debt: number;
  nextCoin: number;
  /** One entry per finished operation: its actual cost, the bank and Φ after it. */
  costs: number[];
  banks: number[];
  phis: number[];
  cur: Current | null;
  /**
   * What `costs`, `banks` and `phis` will hold when the current run ends, and the array's
   * capacity then: the view sizes the drawing and the chart's scales from these, so they hold
   * still for the whole run.
   */
  plan: Plan;
  room: number;
}

export interface Plan {
  costs: number[];
  banks: number[];
  phis: number[];
}

export interface AmExtra {
  /** The coins this operation's charge brings, waiting above the cell or bit it works on. */
  hand?: number[];
  /** Where the hand waits: the array cell being written or the bit being set. */
  target?: number;
  /** Coins spent this step, drawn on the cell or bit `at` that did the work. */
  spent?: { uid: number; at: number }[];
  /** The capacity before this operation grew the array: cells from here on are new. */
  grownFrom?: number;
  /** The cell or bit doing the work this step. */
  work?: number;
  /** The bank had no coin for this step's work. */
  short?: boolean;
}

type S = AmState;
type X = AmExtra;
type Op = OpSpec<S, AmSettings, X>;
type AmStep = Step<S, X>;

// ----- Rules -----

export function chargeOf(settings: AmSettings): number {
  if (settings.charge !== 'auto') return Number(settings.charge);
  if (settings.structure === 'counter') return 2;
  return settings.growth === '1.5' ? 4 : 3;
}

/** The capacity a full array grows to. An empty array (capacity 0) gets its first slots. */
export function grownCapacity(capacity: number, growth: Growth): number {
  if (growth === '4') return capacity + 4;
  if (growth === '1.5') return Math.max(1, Math.ceil(1.5 * capacity));
  return Math.max(1, 2 * capacity);
}

/** "2 × 8", "⌈1.5 × 8⌉", "8 + 4". */
export function growText(capacity: number, growth: Growth): string {
  if (growth === '4') return `${capacity} + 4`;
  return growth === '1.5' ? `⌈1.5 × ${capacity}⌉` : `2 × ${capacity}`;
}

/** The potential that fits the growth rule: zero right after a grow, and pays for the next one. */
export function phiFormula(settings: AmSettings): string {
  if (settings.structure === 'counter') return 'number of 1 bits';
  return settings.growth === '1.5' ? '3·size − 2·capacity' : '2·size − capacity';
}

export function phiOf(
  s: Pick<S, 'size' | 'capacity' | 'bits'>,
  settings: Pick<AmSettings, 'structure' | 'growth'>,
): number {
  if (settings.structure === 'counter') return s.bits.reduce((a, b) => a + b, 0);
  return settings.growth === '1.5' ? 3 * s.size - 2 * s.capacity : 2 * s.size - s.capacity;
}

/** Φ worked out: "2·9 − 16 = 2". */
export function phiWorked(s: Pick<S, 'size' | 'capacity' | 'bits'>, settings: AmSettings) {
  const phi = phiOf(s, settings);
  if (settings.structure === 'counter') return num(phi);
  return settings.growth === '1.5'
    ? `3·${s.size} − 2·${s.capacity} = ${num(phi)}`
    : `2·${s.size} − ${s.capacity} = ${num(phi)}`;
}

export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** A number with a real minus sign: −2, not -2. */
export const num = (v: number) => (v < 0 ? `−${-v}` : String(v));

/** 2.78, 3, 1.5: at most two decimals. */
export function avgText(total: number, n: number): string {
  if (n === 0) return '0';
  return String(Math.round((total / n) * 100) / 100);
}

/** Amortized cost of each finished operation: actual cost plus the change in Φ. */
export function amortized(s: Pick<S, 'costs' | 'phis'>): number[] {
  return s.costs.map((c, j) => c + s.phis[j]! - (j ? s.phis[j - 1]! : 0));
}

/** The 1-based operation where the bank first went below zero, or null. */
export const firstShort = (s: Pick<S, 'banks'>): number | null => {
  const j = s.banks.findIndex((b) => b < 0);
  return j < 0 ? null : j + 1;
};

/** The 1-based operation where Φ first went below its start (0), or null. */
export const firstBelow = (s: Pick<S, 'phis'>): number | null => {
  const j = s.phis.findIndex((p) => p < 0);
  return j < 0 ? null : j + 1;
};

export const bankOf = (s: Pick<S, 'coins' | 'debt'>) =>
  s.coins.reduce((a, c) => a + c.length, 0) - s.debt;

/** The counter as bits, most significant first. */
export const binary = (bits: readonly number[]) => [...bits].reverse().join('');
export const valueOf = (bits: readonly number[]) => bits.reduce((v, b, i) => v + b * 2 ** i, 0);

const noun = (settings: AmSettings) => (settings.structure === 'array' ? 'append' : 'increment');
export const nouns = (settings: AmSettings, n: number) => plural(n, noun(settings));

// ----- Steps -----

export function init(settings: AmSettings): S {
  return {
    capacity: 0,
    size: 0,
    bits: Array(BITS).fill(0),
    coins: settings.structure === 'counter' ? Array.from({ length: BITS }, () => []) : [],
    debt: 0,
    nextCoin: 1,
    costs: [],
    banks: [],
    phis: [],
    cur: null,
    plan: { costs: [], banks: [], phis: [] },
    room: 0,
  };
}

/** The plan for `count` more operations: their costs, the bank and Φ, and the room needed. */
export function simulate(s: S, settings: AmSettings, count: number): { plan: Plan; room: number } {
  const c = chargeOf(settings);
  let size = s.size;
  let capacity = s.capacity;
  let bits = [...s.bits];
  const plan: Plan = { costs: [...s.costs], banks: [...s.banks], phis: [...s.phis] };
  for (let k = 0; k < count; k++) {
    let cost: number;
    if (settings.structure === 'array') {
      cost = size === capacity ? size + 1 : 1;
      if (size === capacity) capacity = grownCapacity(capacity, settings.growth);
      size++;
    } else {
      let t = 0;
      while (t < BITS && bits[t] === 1) t++;
      bits = bits.map((b, i) => (i < t ? 0 : i === t ? 1 : b));
      cost = t + (t < BITS ? 1 : 0);
    }
    plan.costs.push(cost);
    plan.banks.push((plan.banks.at(-1) ?? 0) + c - cost);
    plan.phis.push(phiOf({ size, capacity, bits }, settings));
  }
  return { plan, room: capacity };
}

function vars(s: S, settings: AmSettings, more: Record<string, Scalar> = {}) {
  const n = s.costs.length;
  const total = sum(s.costs);
  const out: Record<string, Scalar> = {};
  out.operations = n;
  if (s.cur) out.cost = s.cur.cost;
  out.total = total;
  if (n > 0) out.average = Number(avgText(total, n));
  if (settings.structure === 'array') {
    out.size = s.size;
    out.capacity = s.capacity;
  } else {
    out.counter = binary(s.bits);
  }
  if (settings.method === 'accounting') {
    out.charge = chargeOf(settings);
    out.bank = bankOf(s);
  }
  // Φ belongs to the states between operations: mid-grow it would count slots not yet used.
  if (settings.method === 'potential') out['Φ'] = s.cur ? (s.phis.at(-1) ?? 0) : phiOf(s, settings);
  return { ...out, ...more };
}

const reject = (s: S, settings: AmSettings, say: string): AmStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s, settings),
  level: 1,
});

/** Coins taken from `coins` (copied, never changed in place). */
function take(coins: number[][], at: number): { coins: number[][]; uid: number } {
  const next = coins.map((c) => c);
  const pile = next[at]!;
  next[at] = pile.slice(0, -1);
  return { coins: next, uid: pile[pile.length - 1]! };
}

interface Purse {
  coins: number[][];
  hand: number[];
  debt: number;
}

type Source = 'own' | 'other' | 'hand' | 'short';

/**
 * Pay one coin for work on cell or bit `at`: its own coin first, then its partner's in the half
 * that came in since the last grow (the textbook story for doubling), then the newest cell with a
 * coin, then the operation's own charge (keeping one coin for the final write), and only then
 * borrow, which puts the bank below zero.
 */
function payOne(
  p: Purse,
  at: number,
  partner: number | null,
): { purse: Purse; source: Source; from: number; uid: number | null } {
  const has = (i: number | null): i is number => i !== null && (p.coins[i]?.length ?? 0) > 0;
  let from: number | null = has(at) ? at : has(partner) ? partner : null;
  if (from === null) {
    for (let i = p.coins.length - 1; i >= 0; i--) {
      if (has(i)) {
        from = i;
        break;
      }
    }
  }
  if (from !== null) {
    const t = take(p.coins, from);
    return {
      purse: { ...p, coins: t.coins },
      source: from === at ? 'own' : 'other',
      from,
      uid: t.uid,
    };
  }
  if (p.hand.length > 1) {
    return {
      purse: { ...p, hand: p.hand.slice(1) },
      source: 'hand',
      from: at,
      uid: p.hand[0]!,
    };
  }
  return { purse: { ...p, debt: p.debt + 1 }, source: 'short', from: at, uid: null };
}

/** The charge's last coins: one pays for the final write, the rest repay debt, then stay. */
function settle(p: Purse, at: number) {
  const [write, ...rest] = p.hand;
  const repay = Math.min(p.debt, rest.length);
  const keep = rest.slice(repay);
  const coins = p.coins.map((c) => c);
  coins[at] = [...(coins[at] ?? []), ...keep];
  const spent = [write, ...rest.slice(0, repay)].filter((u): u is number => u !== undefined);
  return { coins, debt: p.debt - repay, spent, repay, keep: keep.length, left: p.hand.length };
}

const coinWord = (n: number) => plural(n, 'coin');

/** What paid for one unit of work, for the narration. */
function paidBy(source: Source, from: number, settings: AmSettings, debt: number): string {
  const thing = settings.structure === 'array' ? 'cell' : 'bit';
  const name = (i: number) => (settings.structure === 'array' ? `item ${i + 1}` : `bit ${i}`);
  switch (source) {
    case 'own':
      return `A coin from its ${thing} pays.`;
    case 'other':
      return `Its ${thing} has no coin, so a coin from ${name(from)} pays.`;
    case 'hand':
      return `No coin is left in the ${settings.structure}, so a coin from this ${noun(settings)}'s charge pays.`;
    case 'short':
      return `There is no coin anywhere to pay for it: the bank is short, at −${debt}.`;
  }
}

/** The closing sentence of an operation, by method. */
function verdict(
  settings: AmSettings,
  done: S,
  cost: number,
  phiBefore: number,
  coinNote: string,
): string {
  const n = done.costs.length;
  const total = sum(done.costs);
  const word = noun(settings);
  if (settings.method === 'aggregate') {
    const unit = settings.structure === 'array' ? 'total' : 'bit flips in total';
    return `So far: ${total} ${unit} for ${nouns(settings, n)}, ${avgText(total, n)} per ${word}.`;
  }
  if (settings.method === 'accounting') {
    const bank = bankOf(done);
    const c = chargeOf(settings);
    if (bank < 0) {
      const first = firstShort(done) === n;
      return `${coinNote}The bank is at ${num(bank)}${first ? `: a charge of ${c} per ${word} is too small` : ', still short'}.`;
    }
    return `${coinNote}Bank: ${coinWord(bank)}.`;
  }
  const phi = done.phis[n - 1]!;
  const d = phi - phiBefore;
  const am = cost + d;
  const dText = d < 0 ? `(${num(d)})` : String(d);
  const below =
    phi < 0
      ? ` Φ is now below its start, 0, so the amortized costs no longer cover the actual ones.`
      : '';
  return `Φ goes from ${num(phiBefore)} to ${num(phi)}, so the amortized cost is ${cost} + ${dText} = ${num(am)}.${below}`;
}

/** The accounting sentence about where the charge's coins went. */
function coinStory(
  settings: AmSettings,
  at: string,
  c: number,
  coins: { used: number; repay: number; keep: number },
): string {
  const array = settings.structure === 'array';
  const parts: string[] = [];
  if (coins.used) {
    const work = array ? ['a copy', 'copies'] : ['a reset', 'resets'];
    parts.push(`${coins.used} paid for ${coins.used === 1 ? work[0] : work[1]}`);
  }
  parts.push(`1 paid for ${array ? 'the write' : 'setting the bit'}`);
  if (coins.repay) parts.push(`${coins.repay} paid down the bank's debt`);
  if (coins.keep) parts.push(`${coins.keep} ${coins.keep === 1 ? 'sits' : 'sit'} on ${at}`);
  if (parts.length === 1) return `Its 1 coin paid for ${array ? 'the write' : 'setting the bit'}. `;
  return `Of its ${coinWord(c)}, ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}. `;
}

function* append(s: S, settings: AmSettings, note: string): Generator<AmStep, S, void> {
  const acct = settings.method === 'accounting';
  const c = chargeOf(settings);
  const j = s.costs.length + 1;
  const full = s.size === s.capacity;
  const capacity = full ? grownCapacity(s.capacity, settings.growth) : s.capacity;
  const copies = full ? s.size : 0;
  const cost = copies + 1;
  const bank = (s.banks.at(-1) ?? 0) + c - cost;
  const phiBefore = phiOf(s, settings);
  const phi = phiOf({ size: s.size + 1, capacity, bits: s.bits }, settings);
  const at = s.size;
  let st: S = { ...s, cur: { cost: 0, final: cost, bank, phi } };
  let purse: Purse = { coins: st.coins, hand: [], debt: st.debt };
  if (acct) {
    purse.hand = Array.from({ length: c }, (_, k) => s.nextCoin + k);
    st = { ...st, nextCoin: s.nextCoin + c };
  }
  const base: X = { target: at };
  const pays = acct ? ` It pays its charge of ${coinWord(c)} into the bank.` : '';
  yield {
    state: st,
    marks: [
      mark('rd-size', 'active'),
      mark('rd-cap', full ? 'error' : 'active'),
      ...purse.hand.map((u) => mark(`coin-${u}`, 'new')),
    ],
    say: `${note}Append ${j}: size = ${s.size} and capacity = ${s.capacity}, so ${s.capacity === 0 ? 'there are no slots yet' : full ? 'the array is full' : 'there is room'}.${pays}`,
    lines: ['append.pre', 'append.full'],
    vars: vars(st, settings, { x: j }),
    level: 2,
    extra: { ...base, hand: purse.hand },
  };

  if (full) {
    st = {
      ...st,
      capacity,
      coins: [...purse.coins, ...Array.from({ length: capacity - s.capacity }, () => [])],
    };
    purse = { ...purse, coins: st.coins };
    const grow: X = { ...base, hand: purse.hand, grownFrom: s.capacity };
    const fresh = Array.from({ length: capacity - s.capacity }, (_, k) =>
      mark(`cell-${s.capacity + k}`, 'new'),
    );
    yield {
      state: st,
      marks: [mark('rd-cap', 'active'), ...fresh],
      say:
        s.capacity === 0
          ? `Allocate the first array, with ${plural(capacity, 'slot')}. There is nothing to copy yet.`
          : `Allocate a new array of ${growText(s.capacity, settings.growth)} = ${capacity} slots. Copying ${s.size === 1 ? 'the 1 item' : `the ${s.size} items`} across will cost ${s.size}.`,
      lines: s.size === 0 ? ['append.grow', 'append.swap'] : ['append.grow'],
      vars: vars(st, settings, { x: j }),
      level: 2,
      extra: grow,
    };
    const half = Math.floor(s.size / 2);
    for (let k = 0; k < copies; k++) {
      const paid = acct ? payOne(purse, k, k < half ? k + half : null) : null;
      if (paid) purse = paid.purse;
      st = { ...st, coins: purse.coins, debt: purse.debt, cur: { ...st.cur!, cost: k + 1 } };
      const last = k === copies - 1;
      const short = paid?.source === 'short';
      const copied = `Copy item ${k + 1} across: cost 1${last ? '' : `, ${k + 1} so far`}.`;
      const end = !last
        ? ''
        : s.size === 1
          ? ' The item is in the new array.'
          : ` All ${s.size} items are in the new array: ${s.size} units of work.`;
      yield {
        state: st,
        marks: [
          mark(`cell-${k}`, short ? 'error' : 'active'),
          mark(`v${k + 1}`, 'active'),
          mark(`bar-${j}`, 'active'),
          ...(paid?.uid ? [mark(`coin-${paid.uid}`, 'remove')] : []),
          ...(short ? [mark('rd-method', 'error')] : []),
        ],
        say: `${copied}${paid ? ` ${paidBy(paid.source, paid.from, settings, purse.debt)}` : ''}${end}`,
        lines: last
          ? ['append.loop', 'append.copy', 'append.swap']
          : ['append.loop', 'append.copy'],
        vars: vars(st, settings, { x: j }),
        level: last || short ? 2 : 3,
        extra: {
          ...grow,
          hand: purse.hand,
          work: k,
          short,
          spent: paid?.uid ? [{ uid: paid.uid, at: k }] : [],
        },
      };
    }
  }

  const settled = acct ? settle(purse, at) : null;
  const done: S = {
    ...st,
    size: s.size + 1,
    coins: settled ? settled.coins : st.coins,
    debt: settled ? settled.debt : st.debt,
    costs: [...s.costs, cost],
    banks: [...s.banks, bank],
    phis: [...s.phis, phi],
    cur: null,
  };
  const story = settled
    ? coinStory(settings, `A[${at}]`, c, {
        used: c - settled.left,
        repay: settled.repay,
        keep: settled.keep,
      })
    : '';
  const parts = copies ? ` (${plural(copies, 'copy', 'copies')} and 1 write)` : '';
  yield {
    state: done,
    marks: [
      mark(`cell-${at}`, 'new'),
      mark(`v${j}`, 'new'),
      mark(`bar-${j}`, bank < 0 && acct ? 'error' : 'active'),
      mark('rd-method', bank < 0 && acct ? 'error' : 'found'),
      ...(settled?.spent ?? []).map((u) => mark(`coin-${u}`, 'remove')),
    ],
    say: `Store ${j} in A[${at}]: cost 1. This append cost ${cost}${parts}. ${verdict(settings, done, cost, phiBefore, story)}`,
    lines: ['append.store', 'append.inc', 'append.post'],
    vars: vars(done, settings, { x: j, cost }),
    level: 1,
    extra: {
      ...base,
      work: at,
      spent: (settled?.spent ?? []).map((uid) => ({ uid, at })),
    },
  };
  return done;
}

function* increment(s: S, settings: AmSettings, note: string): Generator<AmStep, S, void> {
  const acct = settings.method === 'accounting';
  const c = chargeOf(settings);
  const j = s.costs.length + 1;
  let t = 0;
  while (t < BITS && s.bits[t] === 1) t++;
  const sets = t < BITS;
  const cost = t + (sets ? 1 : 0);
  const bank = (s.banks.at(-1) ?? 0) + c - cost;
  const phiBefore = phiOf(s, settings);
  const after = s.bits.map((b, i) => (i < t ? 0 : i === t ? 1 : b));
  const phi = phiOf({ ...s, bits: after }, settings);
  let st: S = { ...s, cur: { cost: 0, final: cost, bank, phi } };
  let purse: Purse = { coins: st.coins, hand: [], debt: st.debt };
  if (acct) {
    purse.hand = Array.from({ length: c }, (_, k) => s.nextCoin + k);
    st = { ...st, nextCoin: s.nextCoin + c };
  }
  const target = Math.min(t, BITS - 1);
  const base: X = { target };
  const pays = acct ? ` It pays its charge of ${coinWord(c)} into the bank.` : '';
  yield {
    state: st,
    marks: [mark('bit-0', 'active'), ...purse.hand.map((u) => mark(`coin-${u}`, 'new'))],
    say: `${note}Increment ${j}: the counter reads ${binary(s.bits)}, which is ${valueOf(s.bits)}. Start at bit 0.${pays}`,
    lines: ['inc.pre', 'inc.start'],
    vars: vars(st, settings),
    level: 2,
    extra: { ...base, hand: purse.hand },
  };

  for (let i = 0; i < t; i++) {
    const paid = acct ? payOne(purse, i, null) : null;
    if (paid) purse = paid.purse;
    const bits = st.bits.map((b, k) => (k === i ? 0 : b));
    st = { ...st, bits, coins: purse.coins, debt: purse.debt, cur: { ...st.cur!, cost: i + 1 } };
    const last = i === t - 1;
    const short = paid?.source === 'short';
    yield {
      state: st,
      marks: [
        mark(`bit-${i}`, short ? 'error' : 'active'),
        mark(`b-${i}`, 'active'),
        mark(`bar-${j}`, 'active'),
        ...(paid?.uid ? [mark(`coin-${paid.uid}`, 'remove')] : []),
        ...(short ? [mark('rd-method', 'error')] : []),
      ],
      say: `Bit ${i} is 1: reset it to 0, cost 1.${paid ? ` ${paidBy(paid.source, paid.from, settings, purse.debt)}` : ''}`,
      lines: ['inc.loop', 'inc.reset', 'inc.next'],
      vars: vars(st, settings, { i }),
      level: last || short ? 2 : 3,
      extra: {
        ...base,
        hand: purse.hand,
        work: i,
        short,
        spent: paid?.uid ? [{ uid: paid.uid, at: i }] : [],
      },
    };
  }

  const settled = acct && sets ? settle(purse, t) : null;
  const done: S = {
    ...st,
    bits: after,
    coins: settled ? settled.coins : st.coins,
    debt: settled ? settled.debt : st.debt,
    costs: [...s.costs, cost],
    banks: [...s.banks, bank],
    phis: [...s.phis, phi],
    cur: null,
  };
  const story = settled
    ? coinStory(settings, `bit ${t}`, c, {
        used: c - settled.left,
        repay: settled.repay,
        keep: settled.keep,
      })
    : '';
  const parts = t ? ` (${plural(t, 'reset')} and 1 set)` : '';
  yield {
    state: done,
    marks: [
      ...(sets ? [mark(`bit-${t}`, 'new'), mark(`b-${t}`, 'new')] : []),
      mark(`bar-${j}`, bank < 0 && acct ? 'error' : 'active'),
      mark('rd-method', bank < 0 && acct ? 'error' : 'found'),
      ...(settled?.spent ?? []).map((u) => mark(`coin-${u}`, 'remove')),
    ],
    say: `${sets ? `Bit ${t} is 0: set it to 1, cost 1.` : 'Every bit was 1, so the counter wraps around to 0.'} This increment cost ${cost}${parts}, and the counter reads ${binary(after)}. ${verdict(settings, done, cost, phiBefore, story)}`,
    lines: ['inc.loop', 'inc.check', 'inc.set', 'inc.post'],
    vars: vars(done, settings, { i: t, cost }),
    level: 1,
    extra: {
      ...base,
      work: target,
      spent: (settled?.spent ?? []).map((uid) => ({ uid, at: t })),
    },
  };
  return done;
}

/** The closing step of a run of several operations: the totals, by method. */
function summary(st: S, settings: AmSettings, k: number): AmStep {
  const n = st.costs.length;
  const total = sum(st.costs);
  const word = noun(settings);
  const run = sum(st.costs.slice(n - k));
  const head = `${nouns(settings, k)} cost ${run} in all, ${avgText(run, k)} per ${word}.`;
  let say: string;
  let line: string;
  if (settings.method === 'aggregate') {
    say =
      n === k
        ? head
        : `${head} Over all ${nouns(settings, n)} so far: ${total}, which is ${avgText(total, n)} per ${word}.`;
    line = settings.structure === 'array' ? 'append.post' : 'inc.post';
  } else if (settings.method === 'accounting') {
    const c = chargeOf(settings);
    const bank = st.banks[n - 1]!;
    const first = firstShort(st);
    const tail =
      first === null
        ? `The bank never went below zero: ${coinWord(bank)} left over.`
        : `The bank first went below zero at ${word} ${first}, so a charge of ${c} is not enough.`;
    say = `${head} Charged ${c} each, ${c * n} in all, against an actual ${total}. ${tail}`;
    line = 'run.loop';
  } else {
    const am = num(sum(amortized(st)));
    const low = firstBelow(st);
    const tail =
      low === null
        ? `Φ never went below its start, so the actual total is at most the amortized total.`
        : `Φ went below its start at ${word} ${low}, where the amortized costs added up to ${num(sum(amortized(st).slice(0, low)))} against an actual ${sum(st.costs.slice(0, low))}: this Φ does not bound the actual cost.`;
    say = `${head} The amortized costs add up to ${am}, against an actual ${total}, and Φ ended at ${num(st.phis[n - 1]!)}. ${tail}`;
    line = 'run.loop';
  }
  return {
    state: st,
    marks: [mark('rd-method', 'found')],
    say,
    lines: [line],
    vars: vars(st, settings),
    level: 1,
  };
}

/** Run `k` operations (as many as still fit) and, for more than one, sum them up. */
function* many(s: S, settings: AmSettings, k: number): Generator<AmStep, S, void> {
  const left = MAX_OPS - s.costs.length;
  if (left === 0) {
    yield reject(
      s,
      settings,
      `This page stops at ${MAX_OPS} operations, and all ${MAX_OPS} are done. Start over with a preset to run more.`,
    );
    return s;
  }
  const count = Math.min(k, left);
  const note =
    count < k
      ? `Only ${count} more fit (this page stops at ${MAX_OPS}), so this runs ${count}. `
      : '';
  let st: S = { ...s, ...simulate(s, settings, count) };
  for (let i = 0; i < count; i++) {
    const one = settings.structure === 'array' ? append : increment;
    st = yield* one(st, settings, i === 0 ? note : '');
  }
  if (count > 1) yield summary(st, settings, count);
  return st;
}

const run: Op = {
  label: 'Run k operations',
  arity: 1,
  *run(s, [raw]: Value[], { settings }) {
    const k = wholeArg(raw, 1, MAX_OPS);
    if (k === null) {
      yield reject(s, settings, `Pick k from 1 to ${MAX_OPS}. Nothing changed.`);
      return s;
    }
    return yield* many(s, settings, k);
  },
};

const once: Op = {
  label: 'One more operation',
  arity: 0,
  *run(s, _args, { settings }) {
    return yield* many(s, settings, 1);
  },
};

export const ops: Record<string, Op> = { run, once };

// ----- Pseudocode -----

function analysis(settings: AmSettings, op: 'append' | 'inc') {
  const pay = settings.method === 'accounting' ? 'bank = bank − 1' : 'cost = cost + 1';
  const payPlain =
    settings.method === 'accounting' ? 'paying one coin from the bank' : 'adding 1 to the cost';
  const word = op === 'append' ? 'append' : 'increment';
  const phi = phiFormula(settings);
  const pre: PseudoLine =
    settings.method === 'aggregate'
      ? L(`${op}.pre`, 1, 'cost = 0', `Start counting this ${word}'s work at 0.`)
      : settings.method === 'accounting'
        ? L(
            `${op}.pre`,
            1,
            'bank = bank + charge',
            `Put the charge, ${coinWord(chargeOf(settings))}, in the bank.`,
          )
        : L(`${op}.pre`, 1, `before = Φ = ${phi}`, `Note Φ, the ${phi}, before any work.`);
  const post: PseudoLine =
    settings.method === 'aggregate'
      ? L(
          `${op}.post`,
          1,
          'total = total + cost',
          `Add the cost to the running total; total / ${word}s is the average.`,
        )
      : settings.method === 'accounting'
        ? L(
            `${op}.post`,
            1,
            'if bank < 0: error "charge too small"',
            'If the bank owes coins, the charge is too small.',
          )
        : L(
            `${op}.post`,
            1,
            `amortized = cost + (${phi}) − before`,
            'The amortized cost is the actual cost plus the change in Φ.',
          );
  return { pay, payPlain, pre, post };
}

function grownLine(settings: AmSettings): { text: string; plain: string } {
  if (settings.growth === '4')
    return {
      text: 'B = new array of capacity + 4 slots',
      plain: 'get an array with 4 more slots,',
    };
  if (settings.growth === '1.5')
    return {
      text: 'B = new array of max(1, ⌈1.5 × capacity⌉) slots',
      plain: 'get an array 1.5 times as big (one slot at first),',
    };
  return {
    text: 'B = new array of max(1, 2 × capacity) slots',
    plain: 'get an array twice as big (one slot at first),',
  };
}

export function pseudocode(settings: AmSettings): PseudoBlock[] {
  const array = settings.structure === 'array';
  const { pay, payPlain, pre, post } = analysis(settings, array ? 'append' : 'inc');
  const g = grownLine(settings);
  const body: PseudoLine[] = array
    ? [
        L('append.sig', 0, 'append(x)', 'To append x:'),
        pre,
        L('append.full', 1, 'if size == capacity', 'If every slot is in use,'),
        L('append.grow', 2, g.text, g.plain),
        L('append.loop', 2, 'for i = 0 to size − 1', 'and for each item'),
        L('append.copy', 3, `B[i] = A[i]; ${pay}`, `copy it across, ${payPlain}.`),
        L('append.swap', 2, 'A = B', 'Use the new array from now on.'),
        L('append.store', 1, `A[size] = x; ${pay}`, `Put x in the first free slot, ${payPlain}.`),
        L('append.inc', 1, 'size = size + 1', 'Count one more item.'),
        post,
      ]
    : [
        L('inc.sig', 0, 'increment()', 'To add 1 to the counter:'),
        pre,
        L('inc.start', 1, 'i = 0', 'Start at the lowest bit.'),
        L('inc.loop', 1, `while i < ${BITS} and A[i] == 1`, 'While the bit is a 1,'),
        L('inc.reset', 2, `A[i] = 0; ${pay}`, `reset it to 0, ${payPlain},`),
        L('inc.next', 2, 'i = i + 1', 'and move to the next bit up.'),
        L('inc.check', 1, `if i < ${BITS}`, 'If the counter has not run out of bits,'),
        L('inc.set', 2, `A[i] = 1; ${pay}`, `set that bit to 1, ${payPlain}.`),
        post,
      ];
  const call = array ? 'append(j)' : 'increment()';
  return [
    {
      op: 'run',
      lines: [
        L('run.sig', 0, 'run(k)', `To do k ${array ? 'appends' : 'increments'}:`),
        L('run.loop', 1, 'for j = 1 to k', 'for each j from 1 to k,'),
        L('run.call', 2, call, array ? 'append j.' : 'add 1 to the counter.'),
        ...body,
      ],
    },
    { op: 'once', lines: body },
  ];
}

// ----- Text -----

export function initialSay(_state: S, settings: AmSettings): string {
  const array = settings.structure === 'array';
  const what = array
    ? 'An empty dynamic array, with no slots yet. Each append costs 1 for the write plus 1 for every item a grow copies.'
    : `An ${BITS}-bit binary counter at 0. Each increment costs 1 for every bit it flips.`;
  const how =
    settings.method === 'aggregate'
      ? 'The chart keeps the running average.'
      : settings.method === 'accounting'
        ? `Each ${noun(settings)} pays ${coinWord(chargeOf(settings))}; spare coins wait on the ${array ? 'cells' : 'bits'} for later work.`
        : `Φ = ${phiFormula(settings)} stores up work in advance.`;
  return `${what} ${how} Type k and press Run.`;
}

export function initialVars(state: S, settings: AmSettings) {
  return vars(state, settings);
}

export function describe(state: S, settings: AmSettings = defaults): string {
  const n = state.costs.length;
  const total = sum(state.costs);
  const head =
    settings.structure === 'array'
      ? `Dynamic array after ${nouns(settings, n)}: size ${state.size}, capacity ${state.capacity}.`
      : `Binary counter after ${nouns(settings, n)}: ${binary(state.bits)}, which is ${valueOf(state.bits)}.`;
  const cost = n ? ` Actual cost ${total} in total, ${avgText(total, n)} per operation.` : '';
  const method =
    settings.method === 'accounting'
      ? ` Bank: ${bankOf(state)}.`
      : settings.method === 'potential'
        ? ` Φ = ${phiOf(state, settings)}.`
        : '';
  return `${head}${cost}${method}`;
}
