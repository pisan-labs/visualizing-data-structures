import type { Mark, OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { familyHash, FAMILY_A, FAMILY_B, FAMILY_P } from '../_hashing/family';
import { readNumber } from '../_hashing/hashing';

export interface CmsState {
  d: number;
  w: number;
  /** C[i][j]: row i (one per hash function), column j. */
  rows: number[][];
  /** The exact count of every item seen, in first-seen order. A real sketch keeps none of
   * this; we do, to show how far off the estimates are. */
  counts: [item: number, count: number][];
  /** Stream length: the number of add calls. */
  n: number;
  /** Items the last heavy() reported. */
  heavy: number[] | null;
}

export type Update = 'standard' | 'conservative';

export interface CmsSettings {
  [key: string]: Scalar;
  d: number;
  w: number;
  update: Update;
  phi: '0.1' | '0.2' | '0.25';
}

export interface CmsExtra {
  arg?: { text: string; error?: boolean };
  formula?: string;
  /** Item whose row in the table is being looked at. */
  focus?: number;
  /** Counters read in this operation, as "i-j". */
  read?: string[];
}

type S = CmsState;
type X = CmsExtra;
type Op = OpSpec<S, CmsSettings, X>;
type CmsStep = Step<S, X>;
type Level = 1 | 2 | 3;

export const defaults: CmsSettings = { d: 3, w: 8, update: 'standard', phi: '0.2' };

export function init(settings: CmsSettings): S {
  return {
    d: settings.d,
    w: settings.w,
    rows: Array.from({ length: settings.d }, () => Array(settings.w).fill(0)),
    counts: [],
    n: 0,
    heavy: null,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (i: number, j: number) => `c-${i}-${j}`;
export const itemId = (x: number) => `it-${x}`;

export const trueCount = (s: S, x: number) => s.counts.find(([y]) => y === x)?.[1] ?? 0;
export const columns = (x: number, s: { d: number; w: number }) =>
  Array.from({ length: s.d }, (_, i) => familyHash(i, x, s.w).value);
export const estimateOf = (s: S, x: number) =>
  Math.min(...columns(x, s).map((j, i) => s.rows[i]![j]!));

const fmt = (x: number) => String(Math.round(x * 100) / 100);

function readouts(s: S): Record<string, Scalar> {
  const eps = Math.E / s.w;
  return {
    N: s.n,
    distinct: s.counts.length,
    d: s.d,
    w: s.w,
    'ε = e/w': fmt(eps),
    'δ = e^−d': fmt(Math.exp(-s.d)),
    εN: fmt(eps * s.n),
  };
}

const list = (xs: (string | number)[]): string =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

/** The other items seen that share counter C[i][j]. */
export const sharers = (s: S, i: number, j: number, except: number): number[] =>
  s.counts.map(([y]) => y).filter((y) => y !== except && familyHash(i, y, s.w).value === j);

interface Ctx {
  s: S;
  extra: X;
  vars: Record<string, Scalar>;
}

function step(c: Ctx, say: string, lines: string[], level: Level, marks: Mark[]): CmsStep {
  const extra: X = { ...c.extra, read: c.extra.read ? [...c.extra.read] : undefined };
  return { state: c.s, marks, say, lines, vars: { ...c.vars, ...readouts(c.s) }, level, extra };
}

function* badArg(s: S, name: string, raw: Value, err: Error, line: string) {
  const c: Ctx = { s, extra: { arg: { text: String(raw), error: true } }, vars: {} };
  yield step(c, `${name}(${String(raw)}): ${err.message} The sketch is unchanged.`, [line], 1, [
    mark('arg-box', 'error'),
  ]);
  return s;
}

function setCell(s: S, i: number, j: number, v: number): S {
  return { ...s, rows: s.rows.map((r, q) => (q === i ? r.map((c, p) => (p === j ? v : c)) : r)) };
}

// ---------------------------------------------------------------------------------------------
// add

function* addItem(s0: S, raw: Value, settings: CmsSettings): Generator<CmsStep, S, void> {
  const x = readNumber(raw);
  if (x instanceof Error) return yield* badArg(s0, 'add', raw, x, 'add.sig');
  const conservative = settings.update === 'conservative';
  const had = trueCount(s0, x);
  const counts: S['counts'] = had
    ? s0.counts.map(([y, k]) => [y, y === x ? k + 1 : k])
    : [...s0.counts, [x, 1]];
  let s: S = { ...s0, heavy: null };
  const read: string[] = [];
  const c: Ctx = { s: s0, extra: { arg: { text: String(x) }, focus: x, read }, vars: { x } };
  const cols = columns(x, s0);
  yield step(
    c,
    conservative
      ? `add(${x}): find ${x}'s counter in each of the ${s0.d} rows. With conservative update, only the counters at the current minimum go up.`
      : `add(${x}): add 1 to ${x}'s counter in each of the ${s0.d} rows.`,
    ['add.sig'],
    2,
    [mark('arg-box', 'active')],
  );
  let target = 0;
  if (conservative) {
    const vals = cols.map((j, i) => s0.rows[i]![j]!);
    const est = Math.min(...vals);
    target = est + 1;
    c.vars.est = est;
    c.extra.formula = `min(${vals.join(', ')}) = ${est}`;
    cols.forEach((j, i) => read.push(`${i}-${j}`));
    yield step(
      c,
      `The counters of ${x} are ${cols.map((j, i) => `C[${i + 1}][${j}] = ${vals[i]}`).join(', ')}. The estimate is their minimum, ${est}, so after this add the count of ${x} is at most ${target}. Raise each counter to ${target}, and leave larger ones alone.`,
      ['add.est'],
      2,
      cols.map((j, i) => mark(cellId(i, j), 'compare')),
    );
  }
  for (let i = 0; i < s0.d; i++) {
    const h = familyHash(i, x, s0.w);
    const j = h.value;
    const before = s.rows[i]![j]!;
    const after = conservative ? Math.max(before, target) : before + 1;
    s = setCell(s, i, j, after);
    if (i === s0.d - 1) s = { ...s, counts, n: s0.n + 1 };
    c.s = s;
    c.vars.i = i + 1;
    c.vars.j = j;
    c.extra.formula = h.short;
    if (!read.includes(`${i}-${j}`)) read.push(`${i}-${j}`);
    const last = i === s0.d - 1;
    const what =
      after === before
        ? `C[${i + 1}][${j}] is ${before} already, at least ${target}: leave it.`
        : `C[${i + 1}][${j}]: ${before} → ${after}.`;
    yield step(
      c,
      `Row ${i + 1}: ${h.say}. ${what}${last ? ` ${x} has now been added ${had + 1} ${had ? 'times' : 'time'}; N = ${s.n}.` : ''}`,
      conservative ? ['add.cons', 'add.loop', 'add.raise'] : ['add.loop', 'add.inc'],
      last ? 1 : 2,
      [
        mark(cellId(i, j), after === before ? 'compare' : 'new'),
        ...(last ? [mark(itemId(x), 'new')] : []),
      ],
    );
  }
  return s;
}

const add: Op = {
  label: 'Add',
  arity: 1,
  *run(s, [raw], { settings }) {
    return yield* addItem(s, raw!, settings);
  },
};

// ---------------------------------------------------------------------------------------------
// estimate

const estimate: Op = {
  label: 'Estimate',
  arity: 1,
  *run(s, [raw]) {
    const x = readNumber(raw!);
    if (x instanceof Error) return yield* badArg(s, 'estimate', raw!, x, 'est.sig');
    const read: string[] = [];
    const c: Ctx = { s, extra: { arg: { text: String(x) }, focus: x, read }, vars: { x } };
    yield step(
      c,
      `estimate(${x}): read ${x}'s counter in each row and take the smallest. Every counter is at least the true count, because every add of ${x} raised all of them.`,
      ['est.sig'],
      2,
      [mark('arg-box', 'active')],
    );
    const cols = columns(x, s);
    const vals: number[] = [];
    for (let i = 0; i < s.d; i++) {
      const h = familyHash(i, x, s.w);
      const j = h.value;
      vals.push(s.rows[i]![j]!);
      read.push(`${i}-${j}`);
      c.vars.i = i + 1;
      c.vars.j = j;
      c.extra.formula = h.short;
      if (i < s.d - 1)
        yield step(
          c,
          `Row ${i + 1}: ${h.say}. C[${i + 1}][${j}] = ${vals[i]}.`,
          ['est.loop', 'est.read'],
          2,
          [mark(cellId(i, j), 'compare')],
        );
    }
    const est = Math.min(...vals);
    const real = trueCount(s, x);
    const err = est - real;
    c.vars.estimate = est;
    c.vars.true = real;
    c.vars.error = err;
    c.extra.formula = `min(${vals.join(', ')}) = ${est}`;
    const best = vals.indexOf(est);
    const lastH = familyHash(s.d - 1, x, s.w);
    const alone = sharers(s, best, cols[best]!, x).length === 0;
    const why =
      err === 0
        ? `The true count is ${real}, so the estimate is exact.${alone ? ` In row ${best + 1} no other item shares the counter of ${x}.` : ''}`
        : `The true count is ${real}, so the estimate is ${err} too high: in ${s.d === 1 ? 'its only row' : 'every row'} ${x} shares its counter with other items (${cols
            .map((j, i) => `row ${i + 1}: ${list(sharers(s, i, j, x)) || 'none'}`)
            .join('; ')}).`;
    yield step(
      c,
      `Row ${s.d}: ${lastH.say}. C[${s.d}][${lastH.value}] = ${vals.at(-1)}. The estimate is min(${vals.join(', ')}) = ${est}. ${why}`,
      ['est.loop', 'est.read', 'est.min'],
      1,
      [
        ...cols.map((j, i) =>
          mark(cellId(i, j), i === best ? (err ? 'error' : 'found') : 'compare'),
        ),
        ...(real ? [mark(itemId(x), err ? 'error' : 'found')] : []),
      ],
    );
    return s;
  },
};

// ---------------------------------------------------------------------------------------------
// heavy hitters

/** Items seen whose estimate is at least φ·N, largest estimate first. */
export function heavyHitters(s: S, phi: number): { item: number; est: number; real: number }[] {
  // In whole percent, so 0.1 · 30 is exactly 3.
  const percent = Math.round(phi * 100);
  return s.counts
    .map(([item, real]) => ({ item, est: estimateOf(s, item), real }))
    .filter((h) => h.est * 100 >= percent * s.n && h.est > 0)
    .sort((a, b) => b.est - a.est || a.item - b.item);
}

const heavy: Op = {
  label: 'Heavy hitters',
  arity: 0,
  *run(s0, _args, { settings }) {
    const phi = Number(settings.phi);
    const bar = phi * s0.n;
    const hits = heavyHitters(s0, phi);
    const s: S = { ...s0, heavy: hits.map((h) => h.item) };
    const fake = hits.filter((h) => h.real * 100 < Math.round(phi * 100) * s0.n);
    const c: Ctx = {
      s,
      extra: { formula: `report x if estimate(x) ≥ ${phi}·${s0.n} = ${fmt(bar)}` },
      vars: { φN: fmt(bar) },
    };
    const say =
      s0.n === 0
        ? 'heavy(): nothing has been added yet, so there are no heavy hitters.'
        : `heavy(): estimate every item seen and report those with estimate ≥ φ·N = ${phi}·${s0.n} = ${fmt(bar)}. ${
            hits.length
              ? `${list(hits.map((h) => `${h.item} (estimate ${h.est}, true ${h.real})`))}.`
              : 'No item reaches it.'
          }${
            fake.length
              ? ` ${list(fake.map((h) => h.item))} ${fake.length === 1 ? 'is' : 'are'} reported only because of overestimates: a false heavy hitter.`
              : hits.length
                ? ' Every one is a real heavy hitter, and none is missed: an estimate is never too low.'
                : ''
          }`;
    yield step(
      c,
      say,
      ['hh.sig', 'hh.loop', 'hh.test'],
      1,
      hits.map((h) => mark(itemId(h.item), fake.includes(h) ? 'error' : 'found')),
    );
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s0) {
    const s = init({ ...defaults, d: s0.d, w: s0.w });
    yield step(
      { s, extra: {}, vars: {} },
      'clear(): every counter is 0 again.',
      ['clr.sig', 'clr.set'],
      1,
      [],
    );
    return s;
  },
};

export const ops: Record<string, Op> = { add, estimate, heavy, clear };

// ---------------------------------------------------------------------------------------------
// pseudocode and text

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CmsSettings): PseudoBlock[] {
  const cons = settings.update === 'conservative';
  return [
    {
      op: 'add',
      lines: cons
        ? [
            L('add.sig', 0, 'add(x)  // conservative update', 'To add x (conservative update):'),
            L('add.est', 1, 'e = min over i of C[i][hᵢ(x)]', 'find the current estimate e;'),
            L('add.cons', 1, 'for i = 1 to d', 'for each row,'),
            L('add.loop', 2, 'j = hᵢ(x)', 'find the counter of x'),
            L(
              'add.raise',
              2,
              'C[i][j] = max(C[i][j], e + 1)',
              'and raise it to e + 1 if it is lower.',
            ),
          ]
        : [
            L('add.sig', 0, 'add(x)', 'To add x:'),
            L('add.loop', 1, 'for i = 1 to d', 'for each row,'),
            L(
              'add.inc',
              2,
              'C[i][hᵢ(x)] = C[i][hᵢ(x)] + 1',
              'add 1 to the counter its hash picks.',
            ),
          ],
    },
    {
      op: 'estimate',
      lines: [
        L('est.sig', 0, 'estimate(x)', 'To estimate how often x was added:'),
        L('est.loop', 1, 'for i = 1 to d', 'for each row,'),
        L('est.read', 2, 'vᵢ = C[i][hᵢ(x)]', 'read the counter its hash picks.'),
        L('est.min', 1, 'return min(v₁, …, v_d)', 'The smallest one is the estimate.'),
      ],
    },
    {
      op: 'heavy',
      lines: [
        L(
          'hh.sig',
          0,
          `heavy()  // φ = ${settings.phi}`,
          `To find the items that make up at least ${Number(settings.phi) * 100}% of the stream:`,
        ),
        L('hh.loop', 1, 'for each item x seen', 'for every item seen,'),
        L('hh.test', 2, 'if estimate(x) ≥ φ·N: report x', 'report it if its estimate reaches φ·N.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clr.sig', 0, 'clear()', 'To empty the sketch:'),
        L('clr.set', 1, 'C[i][j] = 0 for all i, j', 'set every counter to 0.'),
      ],
    },
  ];
}

export function hashList(d: number): string {
  return Array.from({ length: d }, (_, i) => `(${FAMILY_A[i]}, ${FAMILY_B[i]})`).join(', ');
}

export function initialSay(state: S, settings: CmsSettings): string {
  return `An empty count-min sketch: ${state.d} rows of ${state.w} counters, all 0. Row i uses hᵢ(x) = ((aᵢ·x + bᵢ) mod ${FAMILY_P}) mod ${state.w}, with (aᵢ, bᵢ) = ${hashList(state.d)}.${
    settings.update === 'conservative' ? ' Conservative update is on.' : ''
  }`;
}

export function initialVars(state: S) {
  return readouts(state);
}

export function describe(state: S): string {
  const rows = state.rows.map((r, i) => `row ${i + 1}: ${r.join(' ')}`).join('; ');
  const counts = state.counts.length
    ? ` True counts: ${state.counts.map(([x, k]) => `${x} ×${k}`).join(', ')}.`
    : ' Nothing added yet.';
  return `Count-min sketch with ${state.d} rows of ${state.w} counters. ${rows}.${counts}`;
}
