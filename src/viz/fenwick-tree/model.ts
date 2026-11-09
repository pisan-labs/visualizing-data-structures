import type { Mark, MarkRole, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import {
  MAX_VALUE,
  MIN_VALUE,
  plural,
  plus,
  minus,
  readIndex,
  readList,
  readNumber,
  span,
} from '../_range/kit';

/** The array the page starts with, already built. */
export const START = [5, 3, 8, 1, 9, 2, 7, 4];

/** Everything is 1-based, as usual for Fenwick trees: a[0] and t[0] are unused and stay 0. */
export interface FenState {
  /** A[1..n]. The tree does not need A; it is kept to draw and to check the sums. */
  a: number[];
  /** T[1..n]: T[i] is the sum of A[i − (i & −i) + 1 .. i]. */
  t: number[];
  /** Additions made by the last build, entries of T read by the last query, and entries of T
   * changed by the last add. */
  buildCost: number;
  queryCost: number;
  updateCost: number;
}

export interface FenSettings {
  [key: string]: Scalar;
  /** linear: copy A, then pass each T[i] up to T[i + (i & −i)], O(n). updates: n adds. */
  build: 'linear' | 'updates';
}

export interface Hop {
  /** up: from T[i] to T[i + (i & −i)], the range that contains it. down: from T[i] to
   * T[i − (i & −i)], the range just left of it. */
  dir: 'up' | 'down';
  from: number;
  role?: MarkRole;
}

export interface FenExtra {
  /** One line drawn at the top: the operation and its running result. */
  caption?: string;
  hops?: Hop[];
}

type S = FenState;
type X = FenExtra;
type Op = OpSpec<S, FenSettings, X>;
type FenStep = Step<S, X>;

export const defaults: FenSettings = { build: 'linear' };

/** i & −i: the lowest set bit of i, which is also how many values T[i] covers. */
export const low = (i: number) => i & -i;
/** The level of T[i] in the drawing: log₂ of its lowest set bit. */
export const levelOf = (i: number) => Math.log2(low(i));
/** The range of A that T[i] covers: [i − (i & −i) + 1, i]. */
export const coverOf = (i: number): [number, number] => [i - low(i) + 1, i];
/** "1100". */
export const bin = (i: number) => i.toString(2);
/** The update path from i: i, i + low(i), ... while at most n. */
export function upPath(i: number, n: number): number[] {
  const out: number[] = [];
  for (let j = i; j <= n; j += low(j)) out.push(j);
  return out;
}
/** The query path from i: i, i − low(i), ... while above 0. */
export function downPath(i: number): number[] {
  const out: number[] = [];
  for (let j = i; j > 0; j -= low(j)) out.push(j);
  return out;
}

export function treeOf(values: readonly number[]): number[] {
  const t = [0, ...values];
  for (let i = 1; i < t.length; i++) {
    const j = i + low(i);
    if (j < t.length) t[j]! += t[i]!;
  }
  return t;
}

const sizeOf = (s: S) => s.a.length - 1;
const mark = (id: string, role: MarkRole): Mark => ({ id, role });

/** Marks that pick out index i everywhere: its box, its T cell and its binary label. */
const focus = (i: number, role: MarkRole): Mark[] => [
  mark(`box-${i}`, role),
  mark(`t-${i}`, role),
  mark(`bin-${i}`, role === 'error' ? 'error' : 'active'),
];
const tagged = (i: number, role: MarkRole): Mark[] => [
  mark(`box-${i}`, role),
  mark(`t-${i}`, role),
];

/** Additions the linear build makes: one for every i whose i + (i & −i) is still at most n. */
export const linearCost = (n: number) =>
  Array.from({ length: n }, (_, k) => k + 1).filter((i) => i + low(i) <= n).length;

/** Additions n adds make: the length of every update path. */
export const updatesCost = (n: number) =>
  Array.from({ length: n }, (_, k) => upPath(k + 1, n).length).reduce((x, y) => x + y, 0);

export function init(settings: FenSettings): S {
  const n = START.length;
  return {
    a: [0, ...START],
    t: treeOf(START),
    buildCost: settings.build === 'updates' ? updatesCost(n) : linearCost(n),
    queryCost: 0,
    updateCost: 0,
  };
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: sizeOf(s),
    ...more,
    'build cost': s.buildCost,
    'query cost': s.queryCost,
    'update cost': s.updateCost,
  };
}

const copy = (s: S): S => ({ ...s, a: [...s.a], t: [...s.t] });

/** "T[12] covers 4 values, A[9..12]". */
function covering(i: number): string {
  const [lo, hi] = coverOf(i);
  return `T[${i}] covers ${plural(low(i), 'value')}, ${span(lo, hi)}`;
}

/** "13 = 1101₂, whose lowest set bit is 1" or "12 = 1100₂, whose lowest set bit is 4 (100₂)". */
function bits(i: number): string {
  const l = low(i);
  return `${i} = ${bin(i)}₂, whose lowest set bit is ${l}${l > 1 ? ` (${bin(l)}₂)` : ''}`;
}

/** A step that refuses the call and changes nothing. The code tabs' script skips these. */
function* refuse(s: S, say: string, line: string): Generator<FenStep, S, void> {
  yield {
    state: s,
    marks: [mark('a-name', 'error')],
    say,
    lines: [line],
    level: 1,
    vars: vars(s),
  };
  return s;
}

// ---------------------------------------------------------------------------------------------
// Build

function* buildLinear(vs: number[]): Generator<FenStep, S, void> {
  const n = vs.length;
  const w: S = { a: [0, ...vs], t: [0, ...vs], buildCost: 0, queryCost: 0, updateCost: 0 };
  yield {
    state: copy(w),
    marks: [],
    say: `build: A gets ${plural(n, 'value')}, A[1] to A[${n}]. Start with T as a copy of A. T[i] must hold the sum of the i & −i values that end at A[i], and for odd i that is already true: an odd i covers only A[i].`,
    lines: ['build.sig', 'bl.copy'],
    level: 2,
    vars: vars(w),
    extra: { caption: 'build: T = A' },
  };
  const done = (i: number) => Array.from({ length: i - 1 }, (_, k) => tagged(k + 1, 'done')).flat();
  for (let i = 1; i <= n; i++) {
    const j = i + low(i);
    if (j <= n) {
      const old = w.t[j]!;
      w.t[j] = old + w.t[i]!;
      w.buildCost += 1;
      yield {
        state: copy(w),
        marks: [...done(i), ...focus(i, 'active'), ...tagged(j, 'visit')],
        say: `i = ${bits(i)}. T[${i}] is complete now: every range inside it has passed its total up already. Its parent is j = i + (i & −i) = ${i} + ${low(i)} = ${j}, and ${covering(j)}, which contains T[${i}]'s range. Pass the total up: T[${j}] = ${plus(old, w.t[i]!)} = ${w.t[j]}.`,
        lines: ['bl.loop', 'bl.j', 'bl.if', 'bl.add'],
        level: 2,
        vars: vars(w, { i, 'i & -i': low(i), j }),
        extra: {
          caption: `build: T[${j}] += T[${i}]`,
          hops: [{ dir: 'up', from: i, role: 'active' }],
        },
      };
    } else {
      yield {
        state: copy(w),
        marks: [...done(i), ...focus(i, 'active')],
        say: `i = ${bits(i)}. T[${i}] is complete. j = ${i} + ${low(i)} = ${j} is past n = ${n}, so no range contains T[${i}]'s, and there is nothing to pass up.`,
        lines: ['bl.loop', 'bl.j', 'bl.if'],
        level: 3,
        vars: vars(w, { i, 'i & -i': low(i), j }),
        extra: { caption: `build: T[${i}] has no parent` },
      };
    }
  }
  yield {
    state: copy(w),
    marks: [],
    say: `T is built with ${plural(w.buildCost, 'addition')}, fewer than n: O(n). Every T[i] holds the sum of the values it covers.`,
    lines: [],
    level: 1,
    vars: vars(w),
    extra: {},
  };
  return copy(w);
}

function* buildByUpdates(vs: number[]): Generator<FenStep, S, void> {
  const n = vs.length;
  const w: S = {
    a: [0, ...vs],
    t: Array<number>(n + 1).fill(0),
    buildCost: 0,
    queryCost: 0,
    updateCost: 0,
  };
  yield {
    state: copy(w),
    marks: [],
    say: `build: A gets ${plural(n, 'value')}, A[1] to A[${n}]. Start with T all zeros, then add each value along its update path: add(k, A[k]) for k = 1 to ${n}.`,
    lines: ['build.sig', 'bu.zero'],
    level: 2,
    vars: vars(w),
    extra: { caption: 'build: T = 0' },
  };
  for (let k = 1; k <= n; k++) {
    const x = w.a[k]!;
    const path = upPath(k, n);
    for (const [p, i] of path.entries()) {
      const old = w.t[i]!;
      w.t[i] = old + x;
      w.buildCost += 1;
      const next = i + low(i);
      yield {
        state: copy(w),
        marks: [
          mark(`a-${k}`, 'active'),
          ...path.slice(0, p).flatMap((d) => tagged(d, 'new')),
          ...focus(i, 'active'),
        ],
        say: `add(${k}, ${x}): i = ${bits(i)}. T[${i}] = ${plus(old, x)} = ${w.t[i]}. Next, i = ${i} + ${low(i)} = ${next}${next > n ? `, past n = ${n}` : ''}.`,
        lines: ['bu.ad.loop', 'bu.ad.add', 'bu.ad.up'],
        level: 3,
        vars: vars(w, { k, i, 'i & -i': low(i) }),
        extra: {
          caption: `build: add(${k}, ${x})`,
          hops: path
            .slice(0, p + 1)
            .filter((d) => d + low(d) <= n)
            .map((d) => ({ dir: 'up' as const, from: d, role: d === i ? 'active' : undefined })),
        },
      };
    }
    yield {
      state: copy(w),
      marks: [mark(`a-${k}`, 'active'), ...path.flatMap((d) => tagged(d, 'new'))],
      say: `A[${k}] = ${x} is now in T[${path.join('], T[')}]: ${plural(path.length, 'entry', 'entries')}, every range that contains position ${k}.`,
      lines: ['bu.loop', 'bu.add'],
      level: 2,
      vars: vars(w, { k }),
      extra: {
        caption: `build: add(${k}, ${x})`,
        hops: path.filter((d) => d + low(d) <= n).map((d) => ({ dir: 'up' as const, from: d })),
      },
    };
  }
  yield {
    state: copy(w),
    marks: [],
    say: `T is built with ${plural(w.buildCost, 'addition')}. Each value climbs up to ⌊log₂ n⌋ + 1 entries, so this way is O(n log n). The linear build makes ${plural(linearCost(n), 'addition')} for the same values.`,
    lines: [],
    level: 1,
    vars: vars(w),
    extra: {},
  };
  return copy(w);
}

const build: Op = {
  label: 'Build',
  arity: 1,
  *run(s, [arg], { settings }) {
    const vs = readList(arg);
    if (typeof vs === 'string')
      return yield* refuse(s, `Nothing built. ${vs} The array stays as it was.`, 'build.sig');
    return settings.build === 'updates' ? yield* buildByUpdates(vs) : yield* buildLinear(vs);
  },
};

// ---------------------------------------------------------------------------------------------
// Queries

interface Walk {
  /** Indices of T read so far, in order. */
  read: number[];
  total: number;
}

/**
 * The query path from i0 down to 0, adding T[i] at each stop. `sign` −1 subtracts (the second
 * half of a range sum). `before` are marks to keep from earlier steps.
 */
function* walk(
  w: S,
  i0: number,
  opts: {
    lines: { loop: string[] };
    name: string;
    varName: string;
    before: Mark[];
    covered: MarkRole;
    boxRole: MarkRole;
    caption: (terms: number[], total: number) => string;
    more: Record<string, Scalar>;
  },
): Generator<FenStep, Walk, void> {
  const read: number[] = [];
  let total = 0;
  for (let i = i0; i > 0; i -= low(i)) {
    const before = total;
    total += w.t[i]!;
    w.queryCost += 1;
    read.push(i);
    const next = i - low(i);
    const [lo] = coverOf(i);
    yield {
      state: copy(w),
      marks: [
        ...opts.before,
        ...read.slice(0, -1).flatMap((d) => tagged(d, opts.boxRole)),
        ...Array.from({ length: i0 - lo + 1 }, (_, k) => mark(`a-${lo + k}`, opts.covered)),
        ...focus(i, 'active'),
      ],
      say: `i = ${bits(i)}, so ${covering(i)}. ${opts.varName} = ${plus(before, w.t[i]!)} = ${total}. Clear the lowest set bit: i = ${i} − ${low(i)} = ${next}${next === 0 ? ', which ends the walk' : ''}.`,
      lines: opts.lines.loop,
      level: 2,
      vars: vars(w, { ...opts.more, i, 'i & -i': low(i), [opts.varName]: total }),
      extra: {
        caption: opts.caption(
          read.map((d) => w.t[d]!),
          total,
        ),
        hops: read
          .filter((d) => d - low(d) > 0)
          .map((d) => ({ dir: 'down' as const, from: d, role: d === i ? 'active' : undefined })),
      },
    };
  }
  return { read, total };
}

const termsText = (terms: number[]) =>
  terms.length
    ? terms.map((x, k) => (k === 0 ? String(x) : x < 0 ? `− ${-x}` : `+ ${x}`)).join(' ')
    : '0';

function badIndex(s: S, i: number, from: 0 | 1): string | null {
  const n = sizeOf(s);
  if (i < from || i > n)
    return `There is no A[${i}]: A has ${plural(n, 'value')}, A[1] to A[${n}]${from === 0 ? ' (and prefix(0) is the empty sum)' : ''}.`;
  return null;
}

const prefix: Op = {
  label: 'Prefix sum',
  arity: 1,
  *run(s, [ri]) {
    const i0 = readIndex(ri);
    if (typeof i0 === 'string') return yield* refuse(s, `prefix(i): ${i0}`, 'prefix.sig');
    const bad = badIndex(s, i0, 0);
    if (bad) return yield* refuse(s, `prefix(${i0}): ${bad}`, 'prefix.sig');
    const w = copy(s);
    w.queryCost = 0;
    if (i0 === 0) {
      yield {
        state: copy(w),
        marks: [],
        say: 'prefix(0) adds up no values, so it is 0. The loop never runs: i is already 0.',
        lines: ['prefix.sig', 'pf.zero', 'pf.loop', 'pf.ret'],
        level: 1,
        vars: vars(w, { sum: 0 }),
        extra: { caption: 'prefix(0) = 0' },
      };
      return copy(w);
    }
    const caption = (terms: number[], total: number) =>
      `prefix(${i0}) = ${termsText(terms)}${terms.length > 1 ? ` = ${total}` : ''}`;
    const r = yield* walk(w, i0, {
      lines: { loop: ['pf.loop', 'pf.add', 'pf.drop'] },
      name: 'prefix',
      varName: 'sum',
      before: [],
      covered: 'found',
      boxRole: 'found',
      caption,
      more: {},
    });
    yield {
      state: copy(w),
      marks: [
        ...r.read.flatMap((d) => tagged(d, 'found')),
        ...Array.from({ length: i0 }, (_, k) => mark(`a-${k + 1}`, 'found')),
      ],
      say:
        r.read.length === 1
          ? `i = 0, so stop. prefix(${i0}) = ${r.total}, from 1 entry of T: ${i0} = ${bin(i0)}₂ has one 1 bit, and T[${i0}] covers all of ${span(1, i0)}.`
          : `i = 0, so stop. prefix(${i0}) = ${r.total}, from ${r.read.length} entries of T: one for each 1 bit of ${i0} = ${bin(i0)}₂. Their ranges fit together into ${span(1, i0)}.`,
      lines: ['pf.ret'],
      level: 1,
      vars: vars(w, { sum: r.total }),
      extra: {
        caption: caption(
          r.read.map((d) => w.t[d]!),
          r.total,
        ),
        hops: r.read.filter((d) => d - low(d) > 0).map((d) => ({ dir: 'down' as const, from: d })),
      },
    };
    return copy(w);
  },
};

const sum: Op = {
  label: 'Range sum',
  arity: 2,
  *run(s, [rl, rr]) {
    const l = readIndex(rl);
    const r = readIndex(rr);
    if (typeof l === 'string' || typeof r === 'string')
      return yield* refuse(s, `sum(l, r): ${typeof l === 'string' ? l : r}`, 'sum.sig');
    const bad = badIndex(s, l, 1) ?? badIndex(s, r, 1);
    if (bad) return yield* refuse(s, `sum(${l}, ${r}): ${bad}`, 'sum.sig');
    if (l > r)
      return yield* refuse(
        s,
        `sum(${l}, ${r}): l = ${l} is after r = ${r}. The range runs from l up to r, so swap them.`,
        'sum.sig',
      );
    const w = copy(s);
    w.queryCost = 0;
    const head = `sum(${l}, ${r}) = prefix(${r}) − prefix(${l - 1})`;
    yield {
      state: copy(w),
      marks: [],
      say: `${head}: everything up to A[${r}], minus everything before A[${l}].${l === 1 ? ' prefix(0) is 0, so only the first walk is needed.' : ''}`,
      lines: ['sum.sig', 'sm.ret'],
      level: 2,
      vars: vars(w, { l, r }),
      extra: { caption: head },
    };
    const right = yield* walk(w, r, {
      lines: { loop: ['sm.loop', 'sm.add', 'sm.drop'] },
      name: 'prefix',
      varName: `prefix(${r})`,
      before: [],
      covered: 'found',
      boxRole: 'found',
      caption: (terms, total) =>
        `prefix(${r}) = ${termsText(terms)}${terms.length > 1 ? ` = ${total}` : ''}`,
      more: { l, r },
    });
    const kept = [
      ...right.read.flatMap((d) => tagged(d, 'found')),
      ...Array.from({ length: r }, (_, k) => mark(`a-${k + 1}`, 'found')),
    ];
    let left: Walk = { read: [], total: 0 };
    if (l > 1) {
      left = yield* walk(w, l - 1, {
        lines: { loop: ['sm.loop', 'sm.add', 'sm.drop'] },
        name: 'prefix',
        varName: `prefix(${l - 1})`,
        before: kept,
        covered: 'stale',
        boxRole: 'compare',
        caption: (terms, total) =>
          `prefix(${l - 1}) = ${termsText(terms)}${terms.length > 1 ? ` = ${total}` : ''}`,
        more: { l, r, [`prefix(${r})`]: right.total },
      });
    }
    const answer = right.total - left.total;
    yield {
      state: copy(w),
      marks: [
        ...right.read.flatMap((d) => tagged(d, 'found')),
        ...left.read.flatMap((d) => tagged(d, 'compare')),
        ...Array.from({ length: r - l + 1 }, (_, k) => mark(`a-${l + k}`, 'found')),
        ...Array.from({ length: l - 1 }, (_, k) => mark(`a-${k + 1}`, 'stale')),
      ],
      say: `sum(${l}, ${r}) = prefix(${r}) − prefix(${l - 1}) = ${minus(right.total, left.total)} = ${answer}. That took ${plural(w.queryCost, 'read')} of T: at most two walks of ⌊log₂ n⌋ + 1 steps, however long the range.`,
      lines: ['sm.ret'],
      level: 1,
      vars: vars(w, { l, r, sum: answer }),
      extra: { caption: `${head} = ${minus(right.total, left.total)} = ${answer}` },
    };
    return copy(w);
  },
};

// ---------------------------------------------------------------------------------------------
// Update

const add: Op = {
  label: 'Add',
  arity: 2,
  *run(s, [ri, rd]) {
    const i0 = readIndex(ri);
    const d = readNumber(rd);
    if (typeof i0 === 'string') return yield* refuse(s, `add(i, delta): ${i0}`, 'add.sig');
    if (typeof d === 'string') return yield* refuse(s, `add(${i0}, delta): ${d}`, 'add.sig');
    const bad = badIndex(s, i0, 1);
    if (bad) return yield* refuse(s, `add(${i0}, ${d}): ${bad}`, 'add.sig');
    const old = s.a[i0]!;
    if (old + d < MIN_VALUE || old + d > MAX_VALUE)
      return yield* refuse(
        s,
        `add(${i0}, ${d}): A[${i0}] would become ${old + d}. Keep values from ${MIN_VALUE} to ${MAX_VALUE} so they fit in the drawing.`,
        'add.sig',
      );
    const n = sizeOf(s);
    const w = copy(s);
    w.updateCost = 0;
    w.a[i0] = old + d;
    yield {
      state: copy(w),
      marks: [mark(`a-${i0}`, 'active')],
      say: `add(${i0}, ${d}): A[${i0}] goes from ${old} to ${old + d}. Every T[i] whose range contains position ${i0} must change by ${d} too. Start at i = ${i0}.`,
      lines: ['add.sig'],
      level: 2,
      vars: vars(w, { delta: d }),
      extra: { caption: `add(${i0}, ${d})` },
    };
    const path = upPath(i0, n);
    for (const [p, i] of path.entries()) {
      const before = w.t[i]!;
      w.t[i] = before + d;
      w.updateCost += 1;
      const next = i + low(i);
      yield {
        state: copy(w),
        marks: [
          mark(`a-${i0}`, 'active'),
          ...path.slice(0, p).flatMap((x) => tagged(x, 'new')),
          ...focus(i, 'active'),
        ],
        say: `i = ${bits(i)}, so ${covering(i)}, which contains A[${i0}]. T[${i}] = ${plus(before, d)} = ${w.t[i]}. Add the lowest set bit: i = ${i} + ${low(i)} = ${next}${next > n ? `, past n = ${n}` : ''}.`,
        lines: ['ad.loop', 'ad.add', 'ad.up'],
        level: 2,
        vars: vars(w, { delta: d, i, 'i & -i': low(i) }),
        extra: {
          caption: `add(${i0}, ${d}): T[${path.slice(0, p + 1).join('], T[')}] += ${d}`,
          hops: path
            .slice(0, p + 1)
            .filter((x) => x + low(x) <= n)
            .map((x) => ({ dir: 'up' as const, from: x, role: x === i ? 'active' : undefined })),
        },
      };
    }
    yield {
      state: copy(w),
      marks: [mark(`a-${i0}`, 'active'), ...path.flatMap((x) => tagged(x, 'new'))],
      say: `i = ${path[path.length - 1]! + low(path[path.length - 1]!)} is past n = ${n}, so stop. add changed ${plural(path.length, 'entry', 'entries')} of T, every range that contains position ${i0}: T[${path.join('], T[')}].`,
      lines: ['ad.loop'],
      level: 1,
      vars: vars(w, { delta: d }),
      extra: {
        caption: `add(${i0}, ${d}): T[${path.join('], T[')}] += ${d}`,
        hops: path.filter((x) => x + low(x) <= n).map((x) => ({ dir: 'up' as const, from: x })),
      },
    };
    return copy(w);
  },
};

/** Every step of an operation carries step data, even an empty one (see the view). */
function steady(op: Op): Op {
  return {
    ...op,
    *run(s, args, ctx) {
      const gen = op.run(s, args, ctx);
      let r = gen.next();
      while (!r.done) {
        yield { ...r.value, extra: r.value.extra ?? {} };
        r = gen.next();
      }
      return r.value;
    },
  };
}

export const ops = {
  prefix: steady(prefix),
  sum: steady(sum),
  add: steady(add),
  build: steady(build),
};

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FenSettings): PseudoBlock[] {
  const buildBlock: PseudoBlock =
    settings.build === 'updates'
      ? {
          op: 'build',
          lines: [
            L('build.sig', 0, 'build(A)', 'To build T from A:'),
            L('bu.zero', 1, 'T[1..n] = 0', 'start with every entry at zero,'),
            L('bu.loop', 1, 'for k = 1 to n', 'then for each value of A,'),
            L('bu.add', 2, 'add(k, A[k])', 'add it to every range that contains it.'),
            L('bu.ad.sig', 0, 'add(i, delta)', 'Adding delta at position i:'),
            L('bu.ad.loop', 1, 'while i ≤ n', 'until i runs past the end,'),
            L('bu.ad.add', 2, 'T[i] = T[i] + delta', 'add delta to the range T[i] covers,'),
            L('bu.ad.up', 2, 'i = i + (i & −i)', 'then add the lowest set bit of i.'),
          ],
        }
      : {
          op: 'build',
          lines: [
            L('build.sig', 0, 'build(A)', 'To build T from A:'),
            L('bl.copy', 1, 'T[1..n] = A[1..n]', 'start with a copy of A,'),
            L('bl.loop', 1, 'for i = 1 to n', 'then for each index, left to right,'),
            L(
              'bl.j',
              2,
              'j = i + (i & −i)',
              'find the next range that contains the one T[i] covers,',
            ),
            L('bl.if', 2, 'if j ≤ n', 'and if there is one,'),
            L('bl.add', 3, 'T[j] = T[j] + T[i]', 'pass the total of T[i] up to it.'),
          ],
        };
  return [
    {
      op: 'prefix',
      lines: [
        L('prefix.sig', 0, 'prefix(i)', 'To add up A[1] through A[i]:'),
        L('pf.zero', 1, 'sum = 0', 'start from nothing,'),
        L('pf.loop', 1, 'while i > 0', 'and until i runs out,'),
        L('pf.add', 2, 'sum = sum + T[i]', 'add the range T[i] covers,'),
        L('pf.drop', 2, 'i = i − (i & −i)', 'then clear the lowest set bit of i.'),
        L('pf.ret', 1, 'return sum', 'The total is the answer.'),
        L(
          'pf.note',
          0,
          '// T[i] = A[i − (i & −i) + 1] + … + A[i]',
          'T[i] holds the sum of the i & −i values that end at A[i].',
        ),
      ],
    },
    {
      op: 'sum',
      lines: [
        L('sum.sig', 0, 'sum(l, r)', 'To add up A[l] through A[r]:'),
        L(
          'sm.ret',
          1,
          'return prefix(r) − prefix(l − 1)',
          'take the sum up to A[r] and subtract the sum before A[l].',
        ),
        L('sm.sig', 0, 'prefix(i)', 'Each prefix sum is a walk:'),
        L('sm.loop', 1, 'while i > 0', 'until i runs out,'),
        L('sm.add', 2, 'sum = sum + T[i]', 'add the range T[i] covers,'),
        L('sm.drop', 2, 'i = i − (i & −i)', 'then clear the lowest set bit of i.'),
      ],
    },
    {
      op: 'add',
      lines: [
        L('add.sig', 0, 'add(i, delta)', 'To add delta to A[i]:'),
        L('ad.loop', 1, 'while i ≤ n', 'until i runs past the end,'),
        L('ad.add', 2, 'T[i] = T[i] + delta', 'add delta to the range T[i] covers,'),
        L('ad.up', 2, 'i = i + (i & −i)', 'then add the lowest set bit of i.'),
      ],
    },
    buildBlock,
  ];
}

// ---------------------------------------------------------------------------------------------
// Text

export function initialSay(state: S): string {
  const n = sizeOf(state);
  return `A holds ${plural(n, 'value')}, A[1] to A[${n}], and the Fenwick tree T is built. T[i] holds the sum of the i & −i values that end at A[i], where i & −i is the lowest set bit of i. Type an index for a prefix sum, two for a range sum or an add, or a list to build from.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const n = sizeOf(state);
  return `A holds ${plural(n, 'value')}, from A[1]: ${state.a.slice(1).join(', ')}. T, from T[1]: ${state.t.slice(1).join(', ')}.`;
}
