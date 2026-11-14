/**
 * XOR tricks. Two facts do all the work: x ^ x = 0 and x ^ 0 = x, and XOR does not care about
 * order. So XOR a list together and every value that comes in pairs cancels out.
 *
 * - single: every value comes in pairs but one. XOR them all: what is left is the single.
 * - missing: n distinct values from 0..n, one number missing. XOR every index 0..n − 1, n
 *   itself and every value: each number in 0..n appears twice except the missing one.
 * - two: every value comes in pairs but two, a and b. XOR them all to get x = a ^ b, which is not
 *   0, so a and b differ in some bit; the lowest, x & −x, splits the values into two groups,
 *   with a in one and b in the other and every pair together. XOR each group.
 * - swap: a ^= b; b ^= a; a ^= b swaps two values without a temporary. It is not faster, and it
 *   zeroes a value swapped with itself, so the code checks i ≠ j first.
 *
 * The naive way counts with a hash map (or a set): the same O(n) time, but O(n) extra space
 * against one or a few numbers. Sorting first would be O(n log n).
 *
 * Work, in the units of src/viz/_patterns/kit.ts: a bit op is one XOR, AND or negation of two
 * whole numbers; a lookup is one hash map read or write. The swap counts bit ops and copies.
 */
import type {
  Mark,
  MarkRole,
  OpSpec,
  PseudoBlock,
  PseudoLine,
  Scalar,
  Settings,
  Step,
  Value,
} from '../../engine/types';
import { approachOf, Work, workVars, type Approach, type Totals } from '../_patterns/kit';

export const MAX_N = 10;
export const MAX_VALUE = 63;

export type Goal = 'single' | 'missing' | 'two';

export interface XSettings {
  [key: string]: Scalar;
  approach: Approach;
  goal: Goal;
}

export const defaults: XSettings = { approach: 'pattern', goal: 'single' };

export interface XState {
  a: number[];
}

/** One row of the bits panel: a name, a value (null: empty), and a role per bit. */
export interface BitRow {
  name: string;
  value: number | null;
  /** By column, most significant first. */
  roles?: (MarkRole | undefined)[];
}

export interface XExtra {
  /** Bits drawn per value, fixed for the operation. */
  bits: number;
  rows: BitRow[];
  /** Two singles: the column of the splitting bit, once found. */
  low?: number;
  /** Two singles: each value's group, 0 or 1, once placed. */
  groups?: (0 | 1 | null)[];
  g?: [number, number];
  /** The naive way: the map, keys in the order they first appeared. */
  map?: { key: number; value: number }[];
  mapName?: string;
  /** Fixed for the operation: how many bit rows, how many map slots. */
  frame: { rows: number; map: number };
  /** The running XOR so far (single, missing, two's first pass). */
  acc?: number;
  /** Two singles, placing a value: which group it went to. */
  group?: 0 | 1;
  /** On the last step of Find: the answer (the two singles smaller first). */
  result?: number[];
}

export type XStep = Step<XState, XExtra>;
type Op = OpSpec<XState, XSettings, XExtra>;
type Gen = Generator<XStep, XState, void>;

const STARTS: Record<Goal, number[]> = {
  single: [4, 1, 6, 4, 9, 6, 1],
  missing: [3, 0, 6, 1, 5, 2],
  two: [7, 10, 5, 7, 9, 10],
};

export const START = STARTS.single;

export const init = (settings: Settings): XState => ({
  a: [...(STARTS[(settings.goal as Goal) ?? 'single'] ?? STARTS.single)],
});

const mark = (id: string, role: MarkRole): Mark => ({ id, role });

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const and = (xs: (string | number)[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/** Bits needed for v, at least 3. */
export const bitsFor = (v: number) => Math.max(3, v.toString(2).length);

/** v in binary, `bits` digits. */
export const bin = (v: number, bits: number) => v.toString(2).padStart(bits, '0');

// ----- Input -----

const WHOLE = /^\d+$/;

/** For the input box: one value (an index for Swap) or a list of values to load. */
export function parseInput(token: string): Value | Error {
  const tokens = token.split(/[\s,;]+/).filter(Boolean);
  if (!tokens.length) return new Error('Type some values, such as 4 1 6 4 9 6 1.');
  if (tokens.length > MAX_N)
    return new Error(`That is ${tokens.length} values. Use at most ${MAX_N}.`);
  for (const t of tokens) {
    if (!WHOLE.test(t)) return new Error(`"${t}" is not a whole number from 0 to ${MAX_VALUE}.`);
    if (Number(t) > MAX_VALUE)
      return new Error(`${t} is too big. Use whole numbers from 0 to ${MAX_VALUE}.`);
  }
  return tokens.length === 1 ? Number(tokens[0]) : tokens.map(Number).join(' ');
}

export function readValues(arg: Value | undefined): number[] | string {
  const tokens = String(arg ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length) return 'Type some values first, such as 4 1 6 4 9 6 1.';
  if (tokens.length > MAX_N) return `That is ${tokens.length} values. Use at most ${MAX_N}.`;
  const out: number[] = [];
  for (const t of tokens) {
    if (!WHOLE.test(t) || Number(t) > MAX_VALUE)
      return `"${t}" is not a whole number from 0 to ${MAX_VALUE}.`;
    out.push(Number(t));
  }
  return out;
}

/** Values that appear an odd number of times, in the order they first appear. */
export function oddOnes(a: readonly number[]): number[] {
  const count = new Map<number, number>();
  for (const v of a) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].filter(([, c]) => c % 2 === 1).map(([v]) => v);
}

/** Why the list does not suit the goal, or null. */
export function unsuited(a: readonly number[], goal: Goal): string | null {
  if (goal === 'missing') {
    const n = a.length;
    if (new Set(a).size !== n || a.some((v) => v > n))
      return `The missing number needs ${n} different values from 0 to ${n}, so exactly one is missing; ${a.join(' ')} is not that. Try 3 0 6 1 5 2.`;
    return null;
  }
  const odd = oddOnes(a);
  if (goal === 'single' && odd.length !== 1)
    return odd.length
      ? `The single number needs every value in pairs but one, and here ${and(odd)} are all without a pair. Try 4 1 6 4 9 6 1.`
      : 'The single number needs every value in pairs but one, and here every value has a pair. Try 4 1 6 4 9 6 1.';
  if (goal === 'two' && odd.length !== 2)
    return `Two singles needs every value in pairs but two, and here ${odd.length ? `${and(odd)} ${odd.length === 1 ? 'is' : 'are'}` : 'none is'} without a pair. Try 7 10 5 7 9 10.`;
  return null;
}

// ----- Answers and totals -----

/** The answer for a goal: the single, the missing number, or the two singles (smaller first). */
export function answer(a: readonly number[], goal: Goal): number[] {
  if (goal === 'missing') {
    let acc = a.length;
    a.forEach((v, i) => (acc ^= i ^ v));
    return [acc];
  }
  const odd = oddOnes(a);
  return goal === 'two' ? [...odd].sort((x, y) => x - y) : odd;
}

/** What each approach costs on this list. */
export function totals(a: readonly number[], goal: Goal): Totals {
  const n = a.length;
  const distinct = [...new Set(a)];
  if (goal === 'missing') {
    const seen = new Set(a);
    let checks = 0;
    for (let i = 0; i <= n; i++) {
      checks++;
      if (!seen.has(i)) break;
    }
    return { pattern: 2 * n, naive: n + checks };
  }
  const odd = new Set(oddOnes(a));
  let scans = 0;
  let found = 0;
  for (const v of distinct) {
    scans++;
    if (odd.has(v) && ++found === (goal === 'two' ? 2 : 1)) break;
  }
  return { pattern: goal === 'two' ? 3 * n + 2 : n, naive: 2 * n + scans };
}

// ----- Bit rows -----

/** The roles of a XOR's result bits: a 1 that came in is new, a 1 cancelled out is removed. */
function xorRoles(before: number, x: number, bits: number): (MarkRole | undefined)[] {
  return [...bin(x, bits)].map((b, k) => {
    if (b !== '1') return undefined;
    return bin(before, bits)[k] === '1' ? 'remove' : 'new';
  });
}

const operandRoles = (x: number, bits: number): (MarkRole | undefined)[] =>
  [...bin(x, bits)].map((b) => (b === '1' ? 'active' : undefined));

/** The three rows of one XOR: target ^ operand = result. */
function xorRows(name: string, before: number, opName: string, x: number, bits: number): BitRow[] {
  return [
    { name, value: before },
    { name: opName, value: x, roles: operandRoles(x, bits) },
    { name: '=', value: before ^ x, roles: xorRoles(before, x, bits) },
  ];
}

const emptyRows = (names: string[]): BitRow[] => names.map((name) => ({ name, value: null }));

// ----- Steps -----

/** The index var, left out before the first value. */
const idx = (i: number | string): Record<string, Scalar> => (typeof i === 'number' ? { i } : {});

function refuse(st: XState, why: string): XStep {
  return {
    state: st,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: st.a.length },
  };
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(st, [arg], { settings }): Gen {
    const vs = readValues(arg);
    if (typeof vs === 'string') {
      yield refuse(st, `${vs} The list stays as it was.`);
      return st;
    }
    const next = { a: vs };
    const why = unsuited(vs, settings.goal);
    yield {
      state: next,
      marks: [],
      say: `Loaded ${plural(vs.length, 'value')}: ${vs.join(' ')}.${why ? ` ${why}` : ' Press Find.'}`,
      lines: [],
      level: 1,
      vars: { n: vs.length },
    };
    return next;
  },
};

interface Ctx {
  a: number[];
  bits: number;
  totals: Totals;
  work: Work;
}

function* singlePattern(st: XState, c: Ctx): Gen {
  const { a, bits, work } = c;
  let acc = 0;
  const seen = new Map<number, number>();
  const vars = (i: number | string) => ({
    n: a.length,
    ...idx(i),
    acc,
    kept: 1,
    ...workVars(work, c.totals),
  });
  yield {
    state: st,
    marks: [],
    say: 'XOR every value into acc, starting from 0. A value XORed in twice cancels (x ^ x = 0) and 0 changes nothing (x ^ 0 = x), so the pairs vanish and the single is what is left.',
    lines: ['init'],
    level: 2,
    vars: vars('–'),
    extra: {
      bits,
      rows: [{ name: 'acc', value: 0 }, ...emptyRows(['x', '='])],
      frame: { rows: 3, map: 0 },
      acc,
    },
  };
  for (const [i, v] of a.entries()) {
    const before = acc;
    acc ^= v;
    work.add('bit ops');
    const times = (seen.get(v) ?? 0) + 1;
    seen.set(v, times);
    const alone = [...seen].filter(([, k]) => k % 2 === 1).map(([u]) => u);
    const left = alone.length
      ? alone.length === 1
        ? `acc = ${alone[0]}, the one value still without a partner`
        : `acc = ${alone.join(' ^ ')}, the values still without a partner`
      : 'acc is back to 0';
    const note =
      times % 2 === 0
        ? ` That is the second ${v}: the pair cancels, so ${left}.`
        : times > 1
          ? ` ${v} is back without a partner: it is in acc again.`
          : '';
    yield {
      state: st,
      marks: [mark(`a-${i}`, 'active')],
      say: `A[${i}] = ${v}: acc = ${before} ^ ${v} = ${acc} (${bin(before, bits)} ^ ${bin(v, bits)} = ${bin(acc, bits)}).${note}`,
      lines: ['loop', 'xor'],
      level: 2,
      vars: vars(i),
      extra: {
        bits,
        rows: xorRows('acc', before, `A[${i}]`, v, bits),
        frame: { rows: 3, map: 0 },
        acc,
      },
    };
  }
  const where = a.indexOf(acc);
  yield {
    state: st,
    marks: [mark(`a-${where}`, 'found')],
    say: `Done: the value without a pair is ${acc}. ${plural(a.length, 'XOR')} and one number kept; a hash map would keep ${plural(new Set(a).size, 'count')} and take ${plural(c.totals.naive, 'lookup')}.`,
    lines: ['ret'],
    level: 1,
    vars: vars(a.length - 1),
    extra: {
      bits,
      rows: [{ name: 'acc', value: acc, roles: operandRoles(acc, bits) }, ...emptyRows(['x', '='])],
      frame: { rows: 3, map: 0 },
      acc,
      result: [acc],
    },
  };
  return st;
}

function* missingPattern(st: XState, c: Ctx): Gen {
  const { a, bits, work } = c;
  const n = a.length;
  let acc = n;
  const vars = (i: number | string) => ({
    n,
    ...idx(i),
    acc,
    kept: 1,
    ...workVars(work, c.totals),
  });
  yield {
    state: st,
    marks: [],
    say: `The values are ${n} different numbers from 0 to ${n}, so one is missing. Start acc at n = ${n}, then XOR in every index 0 to ${n - 1} and every value. Each number from 0 to ${n} goes in twice, once as an index (or n) and once as a value, except the missing one, which goes in only once.`,
    lines: ['init'],
    level: 2,
    vars: vars('–'),
    extra: {
      bits,
      rows: [{ name: 'acc', value: acc }, ...emptyRows(['x', '='])],
      frame: { rows: 3, map: 0 },
      acc,
    },
  };
  for (const [i, v] of a.entries()) {
    let before = acc;
    acc ^= i;
    work.add('bit ops');
    yield {
      state: st,
      marks: [mark(`a-${i}-i`, 'active')],
      say: `Index ${i}: acc = ${before} ^ ${i} = ${acc}.`,
      lines: ['loop', 'index'],
      level: 2,
      vars: vars(i),
      extra: { bits, rows: xorRows('acc', before, 'i', i, bits), frame: { rows: 3, map: 0 }, acc },
    };
    before = acc;
    acc ^= v;
    work.add('bit ops');
    yield {
      state: st,
      marks: [mark(`a-${i}`, 'active')],
      say: `A[${i}] = ${v}: acc = ${before} ^ ${v} = ${acc}.`,
      lines: ['loop', 'value'],
      level: 2,
      vars: vars(i),
      extra: {
        bits,
        rows: xorRows('acc', before, `A[${i}]`, v, bits),
        frame: { rows: 3, map: 0 },
        acc,
      },
    };
  }
  yield {
    state: st,
    marks: [],
    say: `Done: ${acc} is missing. ${plural(2 * n, 'XOR')} and one number kept, and no sum that could overflow; a set of the values would take ${plural(c.totals.naive, 'lookup')} and keep ${plural(n, 'value')}.`,
    lines: ['ret'],
    level: 1,
    vars: vars(n - 1),
    extra: {
      bits,
      rows: [{ name: 'acc', value: acc, roles: operandRoles(acc, bits) }, ...emptyRows(['x', '='])],
      frame: { rows: 3, map: 0 },
      acc,
      result: [acc],
    },
  };
  return st;
}

function* twoPattern(st: XState, c: Ctx): Gen {
  const { a, bits, work } = c;
  const n = a.length;
  let x = 0;
  const groups: (0 | 1 | null)[] = a.map(() => null);
  const g: [number, number] = [0, 0];
  let low: number | undefined = undefined;
  const frame = { rows: 3, map: 0 };
  const vars = (i: number | string) => ({
    n,
    ...idx(i),
    x,
    ...(low !== undefined ? { low: 1 << (bits - 1 - low), g0: g[0], g1: g[1] } : {}),
    kept: 4,
    ...workVars(work, c.totals),
  });
  const extra = (rows: BitRow[]): XExtra => ({
    bits,
    rows,
    ...(low !== undefined ? { low, groups: [...groups], g: [g[0], g[1]] } : {}),
    frame,
    acc: x,
  });
  yield {
    state: st,
    marks: [],
    say: 'Every value comes in pairs but two, a and b. First XOR everything: the pairs cancel, leaving x = a ^ b.',
    lines: ['init'],
    level: 2,
    vars: vars('–'),
    extra: extra([{ name: 'x', value: 0 }, ...emptyRows(['v', '='])]),
  };
  for (const [i, v] of a.entries()) {
    const before = x;
    x ^= v;
    work.add('bit ops');
    yield {
      state: st,
      marks: [mark(`a-${i}`, 'active')],
      say: `A[${i}] = ${v}: x = ${before} ^ ${v} = ${x}.`,
      lines: ['all', 'xall'],
      level: 2,
      vars: vars(i),
      extra: extra(xorRows('x', before, `A[${i}]`, v, bits)),
    };
  }
  const mask = (1 << bits) - 1;
  const neg = -x & mask;
  const lowValue = x & -x;
  work.add('bit ops', 2);
  low = bits - 1 - Math.log2(lowValue);
  const lowRoles = (v: number) =>
    [...bin(v, bits)].map((b, k) =>
      k === low ? (b === '1' ? 'found' : 'compare') : undefined,
    ) as (MarkRole | undefined)[];
  yield {
    state: st,
    marks: [],
    say: `x = ${x} = ${bin(x, bits)} is not 0, since a ≠ b: they differ wherever x has a 1. Take the lowest: −x flips every bit of x and adds 1, so x & −x keeps only the lowest 1, ${bin(lowValue, bits)} = ${lowValue}. a has that bit and b does not, or the other way round.`,
    lines: ['low'],
    level: 2,
    vars: vars('–'),
    extra: extra([
      { name: 'x', value: x },
      { name: '−x', value: neg },
      { name: 'low', value: lowValue, roles: lowRoles(lowValue) },
    ]),
  };
  for (const [i, v] of a.entries()) {
    const k: 0 | 1 = v & lowValue ? 1 : 0;
    work.add('bit ops', 2);
    const before = g[k];
    g[k] ^= v;
    groups[i] = k;
    yield {
      state: st,
      marks: [mark(`a-${i}`, 'active')],
      say: `A[${i}] = ${v} = ${bin(v, bits)}: that bit is ${k}, so it goes to group ${k}: g${k} = ${before} ^ ${v} = ${g[k]}.`,
      lines: ['split', k ? 'g1' : 'g0'],
      level: 2,
      vars: vars(i),
      extra: {
        ...extra([
          { name: `g${k}`, value: before },
          { name: `A[${i}]`, value: v, roles: lowRoles(v) },
          { name: '=', value: g[k], roles: xorRoles(before, v, bits) },
        ]),
        group: k,
      },
    };
  }
  const [p, q] = [Math.min(g[0], g[1]), Math.max(g[0], g[1])];
  yield {
    state: st,
    marks: [mark(`a-${a.indexOf(g[0])}`, 'found'), mark(`a-${a.indexOf(g[1])}`, 'found')],
    say: `Done: the two values without a pair are ${p} and ${q}. Every pair landed in one group, since its two copies share every bit, and cancelled there. ${plural(c.totals.pattern, 'bit op')} and four numbers kept; a hash map would keep ${plural(new Set(a).size, 'count')} and take ${plural(c.totals.naive, 'lookup')}.`,
    lines: ['ret'],
    level: 1,
    vars: vars(n - 1),
    extra: {
      ...extra([
        { name: 'g0', value: g[0], roles: operandRoles(g[0], bits) },
        { name: 'g1', value: g[1], roles: operandRoles(g[1], bits) },
        { name: 'low', value: lowValue, roles: lowRoles(lowValue) },
      ]),
      result: [p, q],
    },
  };
  return st;
}

/** The naive way: a hash map of counts (or, for the missing number, a set). */
function* counting(st: XState, c: Ctx, goal: Goal): Gen {
  const { a, bits, work } = c;
  const n = a.length;
  const missing = goal === 'missing';
  const map = new Map<number, number>();
  const slots = new Set(a).size;
  const frame = { rows: 0, map: slots };
  const mapName = missing ? 'seen' : 'count';
  const extra = (): XExtra => ({
    bits,
    rows: [],
    map: [...map].map(([key, value]) => ({ key, value })),
    mapName,
    frame,
  });
  const vars = (i: number | string) => ({
    n,
    ...idx(i),
    kept: map.size,
    ...workVars(work, c.totals),
  });
  const slot = (k: number) => [...map.keys()].indexOf(k);
  yield {
    state: st,
    marks: [],
    say: missing
      ? `Put every value in a set, then check 0, 1, 2, ... until one is not there.`
      : `Count every value in a hash map, then look through the map for ${goal === 'two' ? 'the two values' : 'the value'} with an odd count.`,
    lines: ['init'],
    level: 2,
    vars: vars('–'),
    extra: extra(),
  };
  for (const [i, v] of a.entries()) {
    if (missing) {
      work.add('lookups');
      map.set(v, 1);
    } else {
      work.add('lookups', 2);
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    const s = slot(v);
    yield {
      state: st,
      marks: [mark(`a-${i}`, 'active'), mark(`mk-${s}`, 'new'), mark(`mv-${s}`, 'new')],
      say: missing
        ? `A[${i}] = ${v}: add it to the set.`
        : `A[${i}] = ${v}: count[${v}] = ${map.get(v)! - 1} + 1 = ${map.get(v)}.`,
      lines: ['loop', 'count'],
      level: 2,
      vars: vars(i),
      extra: extra(),
    };
  }
  const found: number[] = [];
  if (missing) {
    for (let k = 0; k <= n; k++) {
      work.add('lookups');
      const has = map.has(k);
      if (!has) found.push(k);
      yield {
        state: st,
        marks: has ? [mark(`mk-${slot(k)}`, 'compare')] : [],
        say: has ? `Is ${k} in the set? Yes.` : `Is ${k} in the set? No: ${k} is missing.`,
        lines: has ? ['scan'] : ['scan', 'hit'],
        level: 2,
        vars: vars('–'),
        extra: extra(),
      };
      if (!has) break;
    }
  } else {
    const want = goal === 'two' ? 2 : 1;
    for (const [s, [k, cnt]] of [...map].entries()) {
      work.add('lookups');
      const odd = cnt % 2 === 1;
      if (odd) found.push(k);
      yield {
        state: st,
        marks: [
          mark(`mk-${s}`, odd ? 'found' : 'compare'),
          mark(`mv-${s}`, odd ? 'found' : 'compare'),
        ],
        say: `count[${k}] = ${cnt}: ${odd ? `odd, so ${k} has no pair.` : 'even, a pair.'}`,
        lines: odd ? ['scan', 'hit'] : ['scan'],
        level: 2,
        vars: vars('–'),
        extra: extra(),
      };
      if (found.length === want) break;
    }
  }
  const sorted = [...found].sort((x, y) => x - y);
  const kept = map.size;
  yield {
    state: st,
    marks: missing ? [] : found.map((k) => mark(`mk-${slot(k)}`, 'found')),
    say: `Done: ${
      missing
        ? `${sorted[0]} is missing`
        : goal === 'two'
          ? `the two values without a pair are ${sorted[0]} and ${sorted[1]}`
          : `the value without a pair is ${sorted[0]}`
    }. The ${missing ? 'set' : 'map'} took ${plural(work.get('lookups'), 'lookup')} and keeps ${plural(kept, missing ? 'value' : 'count')}; XOR would take ${plural(c.totals.pattern, 'bit op')} and keep ${goal === 'two' ? 'four numbers' : 'one'}.`,
    lines: ['ret'],
    level: 1,
    vars: vars('–'),
    extra: { ...extra(), result: sorted },
  };
  return st;
}

const find: Op = {
  label: 'Find',
  arity: 0,
  *run(st, _args, { settings }): Gen {
    const goal = settings.goal;
    const why = unsuited(st.a, goal);
    if (why) {
      yield refuse(st, why);
      return st;
    }
    const a = st.a;
    const bits = bitsFor(Math.max(a.length, ...a));
    const c: Ctx = { a, bits, totals: totals(a, goal), work: new Work(['bit ops', 'lookups']) };
    if (approachOf(settings) === 'naive') return yield* counting(st, c, goal);
    if (goal === 'missing') return yield* missingPattern(st, c);
    if (goal === 'two') return yield* twoPattern(st, c);
    return yield* singlePattern(st, c);
  },
};

function readIndex(v: Value | undefined, n: number): number | string {
  const t = String(v ?? '').trim();
  if (!WHOLE.test(t) || Number(t) >= n)
    return `Swap takes two indices from 0 to ${n - 1}, such as 0 ${Math.min(2, n - 1)}.`;
  return Number(t);
}

const swap: Op = {
  label: 'Swap',
  arity: 2,
  *run(st, [vi, vj], { settings }): Gen {
    const n = st.a.length;
    const i = readIndex(vi, n);
    const j = readIndex(vj, n);
    if (typeof i === 'string' || typeof j === 'string') {
      yield refuse(st, typeof i === 'string' ? i : (j as string));
      return st;
    }
    const a = [...st.a];
    const naive = approachOf(settings) === 'naive';
    const bits = bitsFor(Math.max(n, ...a));
    const work = new Work(['bit ops', 'copies']);
    const tot: Totals = { naive: 3, pattern: 3 };
    const frame = { rows: 3, map: 0 };
    const vars = () => ({
      i,
      j,
      'A[i]': a[i]!,
      'A[j]': a[j]!,
      kept: naive ? 1 : 0,
      ...workVars(work, tot),
    });
    const at = (rows: BitRow[]): XExtra => ({ bits, rows, frame });
    if (i === j) {
      yield {
        state: st,
        marks: [mark(`a-${i}`, 'compare')],
        say: naive
          ? `Swap A[${i}] with itself: nothing changes, and nothing needs doing.`
          : `Swap A[${i}] with itself: nothing to do. Without the check, A[${i}] ^= A[${i}] would make it 0 (x ^ x = 0) and the value would be lost.`,
        lines: ['same'],
        level: 1,
        vars: vars(),
        extra: at(emptyRows(naive ? [`A[${i}]`, `A[${j}]`, 'temp'] : [`A[${i}]`, `A[${j}]`, '='])),
      };
      return st;
    }
    if (naive) {
      const temp = a[i]!;
      work.add('copies');
      yield {
        state: { a: [...a] },
        marks: [mark(`a-${i}`, 'active'), mark('bit2-dec', 'new')],
        say: `temp = A[${i}] = ${temp}.`,
        lines: ['temp'],
        level: 2,
        vars: vars(),
        extra: at([
          { name: `A[${i}]`, value: a[i]! },
          { name: `A[${j}]`, value: a[j]! },
          { name: 'temp', value: temp },
        ]),
      };
      a[i] = a[j]!;
      work.add('copies');
      yield {
        state: { a: [...a] },
        marks: [mark(`a-${i}`, 'new')],
        say: `A[${i}] = A[${j}] = ${a[i]}.`,
        lines: ['copy'],
        level: 2,
        vars: vars(),
        extra: at([
          { name: `A[${i}]`, value: a[i]! },
          { name: `A[${j}]`, value: a[j]! },
          { name: 'temp', value: temp },
        ]),
      };
      a[j] = temp;
      work.add('copies');
      const end = { a: [...a] };
      yield {
        state: end,
        marks: [mark(`a-${i}`, 'found'), mark(`a-${j}`, 'found')],
        say: `A[${j}] = temp = ${temp}. Swapped, with one extra variable and 3 copies; three XORs would also take 3 steps.`,
        lines: ['back'],
        level: 1,
        vars: vars(),
        extra: at([
          { name: `A[${i}]`, value: a[i]! },
          { name: `A[${j}]`, value: a[j]! },
          { name: 'temp', value: temp },
        ]),
      };
      return end;
    }
    const [vi0, vj0] = [a[i]!, a[j]!];
    const step = (t: number, o: number, line: string, last: boolean): XStep => {
      const before = a[t]!;
      a[t] = before ^ a[o]!;
      work.add('bit ops');
      const s = { a: [...a] };
      return {
        state: s,
        marks: [mark(`a-${t}`, last ? 'found' : 'new'), mark(`a-${o}`, last ? 'found' : 'active')],
        say: `A[${t}] ^= A[${o}]: ${before} ^ ${a[o]} = ${a[t]}.${
          line === 'x1'
            ? ` A[${t}] now holds the mix ${vi0} ^ ${vj0}.`
            : line === 'x2'
              ? ` The ${vj0} in the mix cancels with A[${t}]'s own ${vj0}, leaving ${vi0}: A[${t}] now holds the old A[${o}].`
              : ` Now the ${vi0} in the mix cancels, leaving ${vj0}. Swapped, with no extra variable; a temporary would take 3 copies, no slower.`
        }`,
        lines: [line],
        level: last ? 1 : 2,
        vars: vars(),
        extra: at(xorRows(`A[${t}]`, before, `A[${o}]`, a[o]!, bits)),
      };
    };
    yield step(i, j, 'x1', false);
    yield step(j, i, 'x2', false);
    const last = step(i, j, 'x3', true);
    yield last;
    return last.state;
  },
};

export const ops: Record<string, Op> = { find, swap, load };

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: XSettings): PseudoBlock[] {
  const naive = approachOf(settings) === 'naive';
  const goal = settings.goal;
  let find: PseudoLine[];
  if (naive) {
    find =
      goal === 'missing'
        ? [
            L(
              'sig',
              0,
              'missing(A)   // with a set',
              'To find the number missing from 0..n, with a set:',
            ),
            L('init', 1, 'seen = empty set', 'Start with an empty set.'),
            L('loop', 1, 'for each value v in A', 'For each value,'),
            L('count', 2, 'add v to seen', 'remember it.'),
            L('scan', 1, 'for k = 0 to n', 'Then check 0, 1, 2, ... in turn:'),
            L(
              'hit',
              2,
              'if k not in seen: missing = k; stop',
              'the first one not seen is missing.',
            ),
            L('ret', 1, 'return missing', 'Hand it back.'),
          ]
        : [
            L(
              'sig',
              0,
              goal === 'two'
                ? 'twoSingles(A)   // with a hash map'
                : 'single(A)   // with a hash map',
              goal === 'two'
                ? 'To find the two values without a pair, with a hash map:'
                : 'To find the value without a pair, with a hash map:',
            ),
            L('init', 1, 'count = empty map', 'Start with no counts.'),
            L('loop', 1, 'for each value v in A', 'For each value,'),
            L('count', 2, 'count[v] = count[v] + 1', 'count it.'),
            L('scan', 1, 'for each (v, c) in count', 'Then look through the counts:'),
            L(
              'hit',
              2,
              goal === 'two' ? 'if c is odd: keep v; stop at two' : 'if c is odd: single = v; stop',
              'an odd count has no pair.',
            ),
            L(
              'ret',
              1,
              goal === 'two' ? 'return the two kept' : 'return single',
              goal === 'two' ? 'Hand back the two.' : 'Hand it back.',
            ),
          ];
  } else if (goal === 'missing') {
    find = [
      L('sig', 0, 'missing(A)   // n values from 0..n', 'To find the number missing from 0..n:'),
      L('init', 1, 'acc = n', 'Start with n, the one number that is not an index.'),
      L('loop', 1, 'for i = 0 to n − 1', 'For each position:'),
      L('index', 2, 'acc = acc ^ i', 'XOR in the index'),
      L('value', 2, 'acc = acc ^ A[i]', 'and the value there.'),
      L(
        'ret',
        1,
        'return acc',
        'Everything else came in twice and cancelled: what is left is missing.',
      ),
    ];
  } else if (goal === 'two') {
    find = [
      L('sig', 0, 'twoSingles(A)', 'To find the two values without a pair:'),
      L('init', 1, 'x = 0', 'Start from 0.'),
      L('all', 1, 'for each value v in A', 'XOR in every value:'),
      L('xall', 2, 'x = x ^ v   // ends as a ^ b', 'the pairs cancel, leaving a ^ b.'),
      L('low', 1, 'low = x & −x', 'Keep only the lowest 1 of x: a bit where a and b differ.'),
      L('split', 1, 'for each value v in A', 'Split the values by that bit:'),
      L('g1', 2, 'if v & low: g1 = g1 ^ v', 'those with it go to group 1,'),
      L('g0', 2, 'else: g0 = g0 ^ v', 'the others to group 0.'),
      L(
        'ret',
        1,
        'return g0, g1',
        'Each group holds one single and whole pairs: XOR leaves the single.',
      ),
    ];
  } else {
    find = [
      L('sig', 0, 'single(A)', 'To find the value without a pair:'),
      L('init', 1, 'acc = 0', 'Start from 0.'),
      L('loop', 1, 'for each value v in A', 'For each value,'),
      L('xor', 2, 'acc = acc ^ v', 'XOR it in: a pair cancels itself.'),
      L('ret', 1, 'return acc', 'What is left is the single.'),
    ];
  }
  const swapLines = naive
    ? [
        L('sig', 0, 'swap(A, i, j)   // with a temporary', 'To swap two values, the usual way:'),
        L('same', 1, 'if i == j: return', 'swapping a value with itself needs nothing;'),
        L('temp', 1, 'temp = A[i]', 'keep a copy of A[i],'),
        L('copy', 1, 'A[i] = A[j]', 'copy A[j] over it,'),
        L('back', 1, 'A[j] = temp', 'and put the copy in A[j].'),
      ]
    : [
        L('sig', 0, 'swap(A, i, j)   // no temporary', 'To swap two values without a temporary:'),
        L('same', 1, 'if i == j: return', 'swapping a value with itself would zero it, so stop;'),
        L('x1', 1, 'A[i] = A[i] ^ A[j]', 'mix the two into A[i],'),
        L(
          'x2',
          1,
          'A[j] = A[j] ^ A[i]',
          'take A[j] back out of the mix: A[j] now holds the old A[i],',
        ),
        L('x3', 1, 'A[i] = A[i] ^ A[j]', 'and take that out too: A[i] holds the old A[j].'),
      ];
  return [
    { op: 'find', lines: find },
    { op: 'swap', lines: swapLines },
  ];
}

// ----- Start -----

export function describe(st: XState): string {
  return `A holds ${plural(st.a.length, 'value')}: ${st.a.join(', ')}.`;
}

const GOAL_SAY: Record<Goal, string> = {
  single: 'Every value comes in pairs but one. Press Find to find it with XOR.',
  missing:
    'These are different numbers from 0 to n, with one missing. Press Find to find it with XOR.',
  two: 'Every value comes in pairs but two. Press Find to find both with XOR.',
};

export function initialSay(st: XState, settings: XSettings): string {
  return `A holds ${st.a.join(' ')}. ${GOAL_SAY[settings.goal] ?? GOAL_SAY.single} Type two indices and press Swap to swap two values without a temporary, or type values and press Load.`;
}

export const initialVars = (st: XState) => ({ n: st.a.length });
