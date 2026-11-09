import type { OpSpec, PseudoBlock, Scalar, Step, Value } from '../../engine/types';
import { L, mark, plural, wholeArg } from '../_recursion/kit';

export const MIN_WIDTH = 4;
export const MAX_WIDTH = 10;
/** Listing more subsets than this would bury the picture. */
export const MAX_LISTED_BITS = 5;

export interface BitState {
  width: number;
  x: number;
  /** Bitwise operations done since the start, over all operations. */
  total: number;
  /** Masks listed by the last subsets or submasks run. */
  list: number[];
  /** What the list holds, e.g. "subsets of {0, 1, 2}". */
  listOf: string | null;
  /** How many bits each listed mask is drawn with. */
  listBits: number;
}

export interface BitSettings {
  [key: string]: Scalar;
  width: number;
  /** kernighan: x = x & (x - 1) once per set bit. scan: test every bit. */
  popcount: 'kernighan' | 'scan';
}

/** One row of bits drawn under x: a mask, a working copy, a result. */
export interface BitRow {
  label: string;
  value: number;
  /** The operator that makes this row from the rows above, drawn at its left. */
  op?: string;
}

export interface BitExtra {
  rows?: BitRow[];
  /** Bit positions to highlight in every row. */
  focus?: number[];
  /** A value handed back, drawn at the right. */
  out?: string;
}

type S = BitState;
type X = BitExtra;
type Op = OpSpec<S, BitSettings, X>;
type BitStep = Step<S, X>;

export const defaults: BitSettings = { width: 8, popcount: 'kernighan' };

export function init(settings: BitSettings): S {
  return { width: clampWidth(settings.width), x: 0, total: 0, list: [], listOf: null, listBits: 0 };
}

export function clampWidth(w: number): number {
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(Number(w) || defaults.width)));
}

/** "a" or "an" before a number of bits. */
export const a = (n: number) => (n === 8 || n === 11 || n === 18 ? 'an' : 'a');

export const full = (width: number) => (1 << width) - 1;

/** x in binary with exactly `width` digits. */
export function bin(x: number, width: number): string {
  return (x & full(width)).toString(2).padStart(width, '0');
}

/** The bit positions set in x, lowest first. */
export function members(x: number): number[] {
  const out: number[] = [];
  for (let i = 0; x >> i; i++) if ((x >> i) & 1) out.push(i);
  return out;
}

/** Spaced braces, so a one-item set never reads like a template slot. */
export const setText = (x: number) => (x ? `{ ${members(x).join(', ')} }` : '{ }');

export function popcountOf(x: number): number {
  return members(x).length;
}

function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return { x: s.x, binary: bin(s.x, s.width), ...more, 'total bit ops': s.total };
}

const reject = (s: S, say: string): BitStep => ({
  state: s,
  marks: [],
  say,
  lines: [],
  vars: vars(s),
  level: 1,
});

/** Read a bit position for x, or explain why it is not one. */
function bitArg(s: S, raw: Value | undefined): number | string {
  const i = wholeArg(raw, 0, s.width - 1);
  if (i === null)
    return `Bit positions in this ${s.width}-bit x go from 0 to ${s.width - 1}. Nothing changed.`;
  return i;
}

const xMarks = (bits: number[], role: 'active' | 'new' | 'found' | 'remove' | 'compare') =>
  bits.map((b) => mark(`x-${b}`, role));

const load: Op = {
  label: 'Set x',
  arity: 1,
  *run(s, [raw]) {
    const v = wholeArg(raw, 0, full(s.width));
    if (v === null) {
      yield reject(s, `x has ${s.width} bits, so it holds 0 to ${full(s.width)}. Nothing changed.`);
      return s;
    }
    const next: S = { ...s, x: v, list: [], listOf: null, listBits: 0 };
    yield {
      state: next,
      marks: xMarks(members(v), 'new'),
      say: `x = ${v}, which is ${bin(v, s.width)} in binary. As a set, x = ${setText(v)}: bit i is 1 when i is in the set.`,
      lines: ['load.set'],
      vars: vars(next),
      level: 1,
    };
    return next;
  },
};

type BitOpKind = 'set' | 'clear' | 'toggle';

function bitChange(kind: BitOpKind): Op {
  const label = { set: 'Set bit', clear: 'Clear bit', toggle: 'Toggle bit' }[kind];
  return {
    label,
    arity: 1,
    *run(s, [raw]) {
      const i = bitArg(s, raw);
      if (typeof i === 'string') {
        yield reject(s, i);
        return s;
      }
      const m = 1 << i;
      const w = s.width;
      const was = (s.x >> i) & 1;
      const mask: BitRow = { label: `1 << ${i}`, value: m, op: '<<' };
      const ops = kind === 'clear' ? 3 : 2;
      yield {
        state: s,
        marks: [mark(`row0-${i}`, 'active'), mark(`x-${i}`, 'compare')],
        say: `${kind}(${i}): make a mask with only bit ${i} set: 1 << ${i} = ${m}.`,
        lines: [`${kind}.mask`],
        vars: vars(s, { i, mask: bin(m, w), 'bit ops': 1 }),
        level: 2,
        extra: { rows: [mask], focus: [i] },
      };
      let x: number;
      let rows: BitRow[];
      let say: string;
      if (kind === 'set') {
        x = s.x | m;
        rows = [mask, { label: 'x | mask', value: x, op: '|' }];
        say = was
          ? `OR the mask into x. Bit ${i} was already 1, so x stays ${x}.`
          : `OR the mask into x. Bit ${i} turns on and every other bit stays: x = ${x}.`;
      } else if (kind === 'clear') {
        x = s.x & ~m;
        rows = [
          { label: '~mask', value: ~m & full(w), op: '~' },
          { label: 'x & ~mask', value: x, op: '&' },
        ];
        say = was
          ? `Flip the mask with ~ and AND it into x. Bit ${i} turns off: x = ${x}.`
          : `Flip the mask with ~ and AND it into x. Bit ${i} was already 0, so x stays ${x}.`;
      } else {
        x = s.x ^ m;
        rows = [mask, { label: 'x ^ mask', value: x, op: '^' }];
        say = `XOR the mask into x. Bit ${i} flips from ${was} to ${was ^ 1}: x = ${x}.`;
      }
      const next: S = { ...s, x, total: s.total + ops, list: [], listOf: null, listBits: 0 };
      yield {
        state: next,
        marks: [mark(`x-${i}`, x === s.x ? 'found' : 'new')],
        say,
        lines: [`${kind}.apply`],
        vars: vars(next, { i, mask: bin(m, w), 'bit ops': ops }),
        level: 1,
        extra: { rows, focus: [i] },
      };
      return next;
    },
  };
}

const test: Op = {
  label: 'Test bit',
  arity: 1,
  *run(s, [raw]) {
    const i = bitArg(s, raw);
    if (typeof i === 'string') {
      yield reject(s, i);
      return s;
    }
    const m = 1 << i;
    const bit = (s.x >> i) & 1;
    const next: S = { ...s, total: s.total + 2 };
    yield {
      state: s,
      marks: [mark(`x-${i}`, 'active')],
      say: `test(${i}): shift x right by ${i}, so bit ${i} lands in position 0.`,
      lines: ['test.shift'],
      vars: vars(s, { i, 'bit ops': 1 }),
      level: 2,
      extra: { rows: [{ label: `x >> ${i}`, value: s.x >> i, op: '>>' }], focus: [i] },
    };
    yield {
      state: next,
      marks: [mark(`x-${i}`, bit ? 'found' : 'remove'), mark('out', bit ? 'found' : 'remove')],
      say: bit
        ? `AND with 1 keeps only that bit: it is 1, so ${i} is in the set. (x & ${m} != 0 says the same.)`
        : `AND with 1 keeps only that bit: it is 0, so ${i} is not in the set.`,
      lines: ['test.and'],
      vars: vars(next, { i, returned: bit, 'bit ops': 2 }),
      level: 1,
      extra: {
        rows: [
          { label: `x >> ${i}`, value: s.x >> i, op: '>>' },
          { label: '(x >> i) & 1', value: bit, op: '&' },
        ],
        focus: [i],
        out: String(bit),
      },
    };
    return next;
  },
};

const lowbit: Op = {
  label: 'Lowest set bit',
  arity: 0,
  *run(s) {
    const w = s.width;
    const neg = -s.x & full(w);
    const low = s.x & -s.x;
    const at = low ? members(low)[0]! : -1;
    yield {
      state: s,
      marks: [],
      say: `-x in two's complement is ~x + 1: flip every bit, then add 1. With ${w} bits, -${s.x} is ${bin(neg, w)}.`,
      lines: ['low.neg'],
      vars: vars(s, { 'bit ops': 1 }),
      level: 2,
      extra: {
        rows: [
          { label: '~x', value: ~s.x & full(w), op: '~' },
          { label: '-x = ~x + 1', value: neg, op: '+1' },
        ],
      },
    };
    const next: S = { ...s, total: s.total + 2 };
    yield {
      state: next,
      marks: [...(at >= 0 ? [mark(`x-${at}`, 'found')] : []), mark('out', 'found')],
      say: low
        ? `Adding 1 carried up to the lowest 1 of x and stopped. Below it -x matches x (zeros), above it -x is the flip of x. So x & -x = ${low}: only bit ${at}.`
        : 'x is 0, so -x is 0 too and x & -x = 0: there is no set bit.',
      lines: ['low.and'],
      vars: vars(next, { returned: low, 'bit ops': 2 }),
      level: 1,
      extra: {
        rows: [
          { label: '-x', value: neg, op: '-' },
          { label: 'x & -x', value: low, op: '&' },
        ],
        focus: at >= 0 ? [at] : [],
        out: String(low),
      },
    };
    return next;
  },
};

const popcount: Op = {
  label: 'Count set bits',
  arity: 0,
  *run(s, _args, { settings }) {
    const w = s.width;
    let count = 0;
    let ops = 0;
    if (settings.popcount === 'scan') {
      for (let i = 0; i < w; i++) {
        const bit = (s.x >> i) & 1;
        ops += 2;
        if (bit) count++;
        yield {
          state: s,
          marks: [mark(`x-${i}`, bit ? 'found' : 'compare')],
          say: bit ? `Bit ${i} is 1. count = ${count}.` : `Bit ${i} is 0. count stays ${count}.`,
          lines: bit ? ['pop.scan.test', 'pop.scan.inc'] : ['pop.scan.test'],
          vars: vars(s, { i, count, 'bit ops': ops }),
          level: 3,
          extra: { focus: [i] },
        };
      }
    } else {
      let y = s.x;
      yield {
        state: s,
        marks: [],
        say: `popcount: copy x into y = ${y} and count = 0. Each pass of the loop removes one 1 from y.`,
        lines: ['pop.k.init'],
        vars: vars(s, { y, count, 'bit ops': ops }),
        level: 2,
        extra: { rows: [{ label: 'y', value: y }] },
      };
      while (y !== 0) {
        const z = y & (y - 1);
        const gone = members(y ^ z)[0]!;
        ops += 2;
        count++;
        yield {
          state: s,
          marks: [mark(`row2-${gone}`, 'remove')],
          say: `y - 1 turns the lowest 1 of y (bit ${gone}) into 0 and the zeros below it into 1s. AND with y clears exactly that bit: y = ${z}, count = ${count}.`,
          lines: ['pop.k.loop', 'pop.k.clear', 'pop.k.inc'],
          vars: vars(s, { y: z, count, 'bit ops': ops }),
          level: 3,
          extra: {
            rows: [
              { label: 'y', value: y },
              { label: 'y - 1', value: y - 1, op: '-1' },
              { label: 'y & (y - 1)', value: z, op: '&' },
            ],
            focus: [gone],
          },
        };
        y = z;
      }
    }
    const next: S = { ...s, total: s.total + ops };
    const passes =
      settings.popcount === 'scan'
        ? `It looked at all ${w} bits.`
        : `The loop ran once per set bit, ${plural(count, 'time')}.`;
    yield {
      state: next,
      marks: [...xMarks(members(s.x), 'found'), mark('out', 'found')],
      say: `x = ${bin(s.x, w)} has ${plural(count, 'set bit')}. ${passes}`,
      lines: [settings.popcount === 'scan' ? 'pop.scan.ret' : 'pop.k.ret'],
      vars: vars(next, { returned: count, count, 'bit ops': ops }),
      level: 1,
      extra: { out: String(count) },
    };
    return next;
  },
};

const subsets: Op = {
  label: 'All subsets',
  arity: 1,
  *run(s, [raw]) {
    const limit = Math.min(MAX_LISTED_BITS, s.width);
    const n = wholeArg(raw, 1, limit);
    if (n === null) {
      yield reject(
        s,
        `List the subsets of { 0, ..., n - 1 } for n from 1 to ${limit}. Nothing ran.`,
      );
      return s;
    }
    const all = 1 << n;
    const listOf = `subsets of ${setText(all - 1)}`;
    let list: number[] = [];
    yield {
      state: { ...s, list, listOf, listBits: n },
      marks: [],
      say: `There are 2^${n} = ${all} subsets of ${n} items. Each one is a number from 0 to ${all - 1}: count up and read the bits.`,
      lines: ['sub.loop'],
      vars: vars(s, { n, subsets: 0, 'bit ops': 1 }),
      level: 2,
    };
    for (let m = 0; m < all; m++) {
      list = [...list, m];
      yield {
        state: { ...s, list, listOf, listBits: n },
        marks: [mark(`out-${m}`, 'new')],
        say: `mask = ${m} = ${bin(m, n)}: the subset ${setText(m)}.`,
        lines: ['sub.loop', 'sub.visit'],
        vars: vars(s, { n, mask: m, subsets: list.length, 'bit ops': 1 + list.length }),
        level: 3,
        extra: { rows: [{ label: 'mask', value: m }], focus: members(m) },
      };
    }
    const next: S = { ...s, list, listOf, listBits: n, total: s.total + 1 + all };
    yield {
      state: next,
      marks: [],
      say: `Done: all ${all} subsets, one per number from 0 to ${all - 1}. Adding one more item would double the list.`,
      lines: ['sub.done'],
      vars: vars(next, { n, subsets: all, 'bit ops': 1 + all }),
      level: 1,
    };
    return next;
  },
};

const submasks: Op = {
  label: 'Submasks of x',
  arity: 0,
  *run(s) {
    const k = popcountOf(s.x);
    if (k > MAX_LISTED_BITS) {
      yield reject(
        s,
        `x has ${k} set bits, so it has 2^${k} = ${1 << k} submasks. That is too many to list here: clear bits until at most ${MAX_LISTED_BITS} are set.`,
      );
      return s;
    }
    const w = s.width;
    const listOf = `submasks of ${bin(s.x, w)}`;
    let list: number[] = [];
    let sub = s.x;
    let ops = 0;
    for (;;) {
      list = [...list, sub];
      yield {
        state: { ...s, list, listOf, listBits: w },
        marks: [mark(`out-${list.length - 1}`, 'new')],
        say:
          list.length === 1
            ? `Start with sub = x = ${sub}, the whole set ${setText(sub)}.`
            : `sub = ${sub} = ${bin(sub, w)}, the subset ${setText(sub)}.`,
        lines: list.length === 1 ? ['mask.init', 'mask.visit'] : ['mask.visit'],
        vars: vars(s, { sub, found: list.length, 'bit ops': ops }),
        level: list.length === 1 ? 2 : 3,
        extra: { rows: [{ label: 'sub', value: sub }] },
      };
      if (sub === 0) break;
      const next = (sub - 1) & s.x;
      ops += 2;
      yield {
        state: { ...s, list, listOf, listBits: w },
        marks: [],
        say: `sub - 1 clears the lowest 1 of sub and sets every bit below it; & x keeps only the bits of x. Next: sub = ${next}.`,
        lines: ['mask.zero', 'mask.next'],
        vars: vars(s, { sub: next, found: list.length, 'bit ops': ops }),
        level: 3,
        extra: {
          rows: [
            { label: 'sub', value: sub },
            { label: 'sub - 1', value: sub - 1, op: '-1' },
            { label: '(sub - 1) & x', value: next, op: '&' },
          ],
        },
      };
      sub = next;
    }
    const done: S = { ...s, list, listOf, listBits: w, total: s.total + ops };
    yield {
      state: done,
      marks: [],
      say: `sub reached 0, so stop. x has ${plural(k, 'set bit')} and ${plural(list.length, 'submask')}, listed from largest to smallest. The loop never visited a number that is not a submask.`,
      lines: ['mask.zero'],
      vars: vars(done, { found: list.length, 'bit ops': ops }),
      level: 1,
    };
    return done;
  },
};

export const ops = {
  load,
  set: bitChange('set'),
  clear: bitChange('clear'),
  toggle: bitChange('toggle'),
  test,
  lowbit,
  popcount,
  subsets,
  submasks,
};

export function pseudocode(settings: BitSettings): PseudoBlock[] {
  const pop =
    settings.popcount === 'scan'
      ? [
          L('pop.scan.sig', 0, 'popcount(x)', 'To count the 1 bits of x:'),
          L(
            'pop.scan.test',
            1,
            'for i = 0 to w - 1: if (x >> i) & 1',
            'Look at every bit in turn;',
          ),
          L('pop.scan.inc', 2, 'count = count + 1', 'count each one that is 1.'),
          L('pop.scan.ret', 1, 'return count', 'Hand back the count.'),
        ]
      : [
          L('pop.k.sig', 0, 'popcount(x)', 'To count the 1 bits of x:'),
          L('pop.k.init', 1, 'y = x; count = 0', 'Start with a copy of x and a count of 0.'),
          L('pop.k.loop', 1, 'while y != 0', 'While a 1 is left,'),
          L('pop.k.clear', 2, 'y = y & (y - 1)', 'clear the lowest 1,'),
          L('pop.k.inc', 2, 'count = count + 1', 'and count it.'),
          L('pop.k.ret', 1, 'return count', 'Hand back the count.'),
        ];
  return [
    { op: 'load', lines: [L('load.set', 0, 'x = v', 'Store v in x.')] },
    {
      op: 'set',
      lines: [
        L('set.mask', 0, 'mask = 1 << i', 'Make a number with only bit i on.'),
        L('set.apply', 0, 'x = x | mask', 'Turn bit i on and leave the rest alone.'),
      ],
    },
    {
      op: 'clear',
      lines: [
        L('clear.mask', 0, 'mask = 1 << i', 'Make a number with only bit i on.'),
        L('clear.apply', 0, 'x = x & ~mask', 'Turn bit i off and leave the rest alone.'),
      ],
    },
    {
      op: 'toggle',
      lines: [
        L('toggle.mask', 0, 'mask = 1 << i', 'Make a number with only bit i on.'),
        L('toggle.apply', 0, 'x = x ^ mask', 'Flip bit i and leave the rest alone.'),
      ],
    },
    {
      op: 'test',
      lines: [
        L('test.shift', 0, 't = x >> i', 'Slide x right until bit i is the last bit.'),
        L('test.and', 0, 'return t & 1', 'Hand back that last bit: 1 if i is in the set.'),
      ],
    },
    {
      op: 'lowbit',
      lines: [
        L('low.neg', 0, '-x = ~x + 1', 'Negate x: flip every bit and add 1.'),
        L('low.and', 0, 'return x & -x', 'Keep only the lowest 1 of x.'),
      ],
    },
    { op: 'popcount', lines: pop },
    {
      op: 'subsets',
      lines: [
        L('sub.loop', 0, 'for mask = 0 to 2^n - 1', 'Count from 0 up to 2 to the n, minus 1.'),
        L('sub.visit', 1, 'visit {i : bit i of mask is 1}', 'Each number is one subset.'),
        L('sub.done', 0, 'done: 2^n subsets', 'Every subset came up exactly once.'),
      ],
    },
    {
      op: 'submasks',
      lines: [
        L('mask.init', 0, 'sub = x', 'Start with all of x.'),
        L('mask.visit', 1, 'visit sub', 'Use this subset of x.'),
        L('mask.zero', 1, 'if sub == 0: stop', 'Stop after the empty set.'),
        L('mask.next', 1, 'sub = (sub - 1) & x', 'Step to the next smaller subset of x.'),
      ],
    },
  ];
}

export function initialSay(state: S): string {
  return `x is ${a(state.width)} ${state.width}-bit integer, all zeros. Read it as a set: bit i is 1 when i is in the set, so x = 0 is the empty set.`;
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const one = state.list.length === 1;
  const list = state.listOf
    ? ` Listed ${state.list.length} ${one ? state.listOf.replace(/^(submask|subset)s /, '$1 ') : state.listOf}.`
    : '';
  return `x = ${state.x}, binary ${bin(state.x, state.width)}, the set ${setText(state.x)}.${list}`;
}
