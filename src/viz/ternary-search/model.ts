/**
 * Ternary search, two ways.
 *
 * - search(x) on a sorted array: look at two points, a third and two thirds of the way across
 *   the window, and keep the third that can hold x. It takes log₃ n rounds, fewer than binary
 *   search's log₂ n, but each round makes up to four comparisons, so it makes more comparisons
 *   in all (4 / log₂ 3 ≈ 2.5 per halving against binary search's 2 at most).
 * - max() on a unimodal array (it rises, then falls): compare the values at the two points and
 *   drop the third on the lower side. This is the version that earns its keep: binary search
 *   cannot find a peak by comparing with x, because there is no x.
 *
 * The goal setting picks which one the page starts with (its first array and presets); both
 * buttons always work.
 */
import type { Rng } from '../../engine/rng';
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  ascending,
  at,
  distinctValues,
  loadOp,
  makeState,
  mark,
  numberFromArg,
  plural,
  Run,
  span,
  valuesOf,
  vid,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { binaryCost, outOfOrder, outside, sortAOp } from '../_sorting/search';

export type Goal = 'value' | 'max';

export interface TernarySettings {
  [key: string]: Scalar;
  goal: Goal;
  draw: Draw;
}

export const defaults: TernarySettings = { goal: 'value', draw: 'bars' };

type Op = OpSpec<ArrayState, TernarySettings, ArrayExtra>;
type Gen = Generator<ArrayStep, number, void>;

/** Fifteen sorted values. */
export const SORTED_START = [4, 9, 15, 22, 27, 33, 40, 46, 51, 58, 64, 71, 77, 85, 92];
/** Fourteen values that rise to 93, then fall. */
export const PEAK_START = [5, 12, 26, 38, 51, 67, 80, 93, 84, 70, 55, 41, 28, 15];

export function init(settings: TernarySettings): ArrayState {
  return makeState(settings.goal === 'max' ? PEAK_START : SORTED_START);
}

const NAME = 'ternary search';

/** Why A is not unimodal (rises, then falls, with no two neighbors equal), or null. */
export function notUnimodal(s: ArrayState): { say: string; marks: Mark[] } | null {
  const a = s.a;
  let falling = false;
  for (let i = 0; i + 1 < a.length; i++) {
    const [p, q] = [a[i]!, a[i + 1]!];
    const pair = [mark(vid(p), 'error'), mark(vid(q), 'error')];
    if (p.value === q.value)
      return {
        say: `A is not unimodal: ${at(i, p)} and ${at(i + 1, q)} are equal, a flat stretch where comparing two values cannot tell which side the peak is on.`,
        marks: pair,
      };
    if (p.value > q.value) falling = true;
    else if (falling)
      return {
        say: `A is not unimodal: it falls and then rises again at ${at(i, p)}, ${at(i + 1, q)}, so it has more than one peak or valley.`,
        marks: pair,
      };
  }
  return null;
}

interface Window {
  lo: number;
  hi: number;
  m1?: number;
  m2?: number;
}

function extraFor(n: number, w: Window, held?: { x: number; at: number }): ArrayExtra {
  const pointers: BarsPointer[] = [{ name: 'lo', at: w.lo }];
  if (w.m1 !== undefined) pointers.push({ name: 'm1', at: w.m1 });
  if (w.m2 !== undefined) pointers.push({ name: 'm2', at: w.m2 });
  pointers.push({ name: 'hi', at: w.hi });
  const regions: BarsRegion[] =
    w.lo <= w.hi && n > 0 ? [{ id: 'window', from: w.lo, to: w.hi, tone: 'window' }] : [];
  return {
    pointers,
    regions,
    faded: outside(n, w.lo, w.hi),
    ...(held ? { held: { value: held.x, at: held.at, label: 'x' } } : {}),
  };
}

// ----- search(x) on a sorted array -----

function* searchRun(run: Run, x: number): Gen {
  const n = run.n;
  let lo = 0;
  let hi = n - 1;
  let rounds = 0;
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2,
    w: { m1?: number; m2?: number; xAt: number },
    marks: Mark[] = [],
    more: Record<string, Scalar> = {},
  ) =>
    run.step({
      say,
      lines,
      level,
      marks,
      vars: {
        x,
        lo,
        hi,
        ...(w.m1 === undefined ? {} : { m1: w.m1, m2: w.m2! }),
        n,
        rounds,
        ...more,
      },
      extra: extraFor(n, { lo, hi, m1: w.m1, m2: w.m2 }, { x, at: w.xAt }),
    });
  const versus = () => {
    const b = binaryCost(valuesOf(run.state()), x);
    const mine = run.counts.comparisons ?? 0;
    return {
      binary: b.comparisons,
      say: `${plural(rounds, 'round')} and ${plural(mine, 'comparison')} with x. Binary search would take ${plural(b.probes, 'round')} and ${plural(b.comparisons, 'comparison')}.`,
    };
  };

  yield step(
    `Look for x = ${x}. The window starts as the whole array, ${span(0, n - 1)}.`,
    ['init'],
    2,
    { xAt: (n - 1) / 2 },
  );
  while (lo <= hi) {
    const third = Math.floor((hi - lo) / 3);
    const m1 = lo + third;
    const m2 = hi - third;
    rounds++;
    const [v1, v2] = [run.v(m1), run.v(m2)];
    const look = [mark(run.id(m1), 'compare'), mark(run.id(m2), 'compare')];
    yield step(
      m1 === m2
        ? `One value is left: m1 = m2 = ${m1}. Compare x with ${at(m1, v1)}.`
        : `third = floor((${hi} − ${lo}) / 3) = ${third}, so m1 = ${m1} and m2 = ${m2}. Compare x with ${at(m1, v1)} and ${at(m2, v2)}.`,
      ['loop', 'mid'],
      2,
      { m1, m2, xAt: (m1 + m2) / 2 },
      look,
    );
    run.count('comparisons');
    if (v1 === x) {
      const vs = versus();
      yield step(
        `${at(m1, v1)} is x. Found it: return ${m1}. That took ${vs.say}`,
        ['eq1'],
        1,
        { m1, m2, xAt: m1 },
        [mark(run.id(m1), 'found')],
        { result: m1, binary: vs.binary },
      );
      return m1;
    }
    run.count('comparisons');
    if (v2 === x) {
      const vs = versus();
      yield step(
        `${at(m1, v1)} is not x, but ${at(m2, v2)} is. Found it: return ${m2}. That took ${vs.say}`,
        ['eq1', 'eq2'],
        1,
        { m1, m2, xAt: m2 },
        [mark(run.id(m2), 'found')],
        { result: m2, binary: vs.binary },
      );
      return m2;
    }
    run.count('comparisons');
    let say: string;
    let lines: string[];
    if (x < v1) {
      hi = m1 - 1;
      say = `${m1 === m2 ? 'It is not x' : 'Neither is x'}, and ${x} < ${v1}: keep the left part, hi = m1 − 1 = ${hi}.`;
      lines = ['eq1', 'eq2', 'lt', 'left'];
    } else {
      run.count('comparisons');
      if (x > v2) {
        lo = m2 + 1;
        say =
          m1 === m2
            ? `It is not x, and ${x} > ${v2}: keep the right part, lo = m2 + 1 = ${lo}.`
            : `Neither is x, ${x} > ${v1} and ${x} > ${v2}: keep the right third, lo = m2 + 1 = ${lo}.`;
        lines = ['eq1', 'eq2', 'lt', 'gt', 'right'];
      } else {
        lo = m1 + 1;
        hi = m2 - 1;
        say = `Neither is x, and ${v1} < ${x} < ${v2}: keep the middle third, lo = ${lo} and hi = ${hi}.`;
        lines = ['eq1', 'eq2', 'lt', 'gt', 'middle'];
      }
    }
    yield step(say, lines, 1, { m1, m2, xAt: (m1 + m2) / 2 }, look);
  }
  const vs = versus();
  yield step(
    `${n === 0 ? 'A is empty' : `lo = ${lo} > hi = ${hi}: the window is empty`}, so ${x} is not in A. Return −1. That took ${vs.say}`,
    ['loop', 'miss'],
    1,
    { xAt: Math.max(-0.5, Math.min(n - 0.5, lo - 0.5)) },
    [],
    { result: -1, binary: vs.binary },
  );
  return -1;
}

// ----- max() on a unimodal array -----

function* maxRun(run: Run): Gen {
  const n = run.n;
  let lo = 0;
  let hi = n - 1;
  let rounds = 0;
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2,
    w: { m1?: number; m2?: number },
    marks: Mark[] = [],
    more: Record<string, Scalar> = {},
  ) =>
    run.step({
      say,
      lines,
      level,
      marks,
      vars: {
        lo,
        hi,
        ...(w.m1 === undefined ? {} : { m1: w.m1, m2: w.m2! }),
        n,
        rounds,
        ...more,
      },
      extra: extraFor(n, { lo, hi, m1: w.m1, m2: w.m2 }),
    });

  if (n === 0) {
    yield step('A is empty, so there is no maximum. Return −1.', ['msig'], 1, {}, [], {
      result: -1,
    });
    return -1;
  }
  yield step(
    `Find the peak of A: it rises, then falls. The window starts as ${span(0, n - 1)}.`,
    ['minit'],
    2,
    {},
  );
  while (lo < hi) {
    const third = Math.floor((hi - lo) / 3);
    const m1 = lo + third;
    const m2 = hi - third;
    rounds++;
    const [v1, v2] = [run.v(m1), run.v(m2)];
    const look = [mark(run.id(m1), 'compare'), mark(run.id(m2), 'compare')];
    yield step(
      `third = floor((${hi} − ${lo}) / 3) = ${third}, so m1 = ${m1} and m2 = ${m2}. Compare ${at(m1, v1)} with ${at(m2, v2)}.`,
      ['mloop', 'mmid'],
      2,
      { m1, m2 },
      look,
    );
    run.count('comparisons');
    let say: string;
    let lines: string[];
    if (v1 < v2) {
      lo = m1 + 1;
      say = `${v1} < ${v2}: the values still climb from m1 to m2, so the peak is right of m1. lo = m1 + 1 = ${lo}.`;
      lines = ['mcmp', 'mright'];
    } else {
      hi = m2 - 1;
      say = `${v1} > ${v2}: the values fall from m1 to m2, so the peak is left of m2. hi = m2 − 1 = ${hi}.`;
      lines = ['mcmp', 'mleft'];
    }
    yield step(say, lines, 1, { m1, m2 }, look);
  }
  yield step(
    `lo = hi = ${lo}: one value is left, and it is the peak, ${at(lo, run.v(lo))}. Return ${lo}. That took ${plural(rounds, 'round')} of one comparison each.`,
    ['mloop', 'mret'],
    1,
    {},
    [mark(run.id(lo), 'found')],
    { result: lo },
  );
  return lo;
}

/**
 * n distinct values that rise to a peak at a random place, then fall: sorted values dealt out
 * so the biggest sits at the peak.
 */
export function unimodal(rng: Rng, n: number): number[] {
  const vs = ascending(distinctValues(rng, n));
  const peakAt = rng.int(0, n - 1);
  const left: number[] = [];
  const right: number[] = [];
  for (let k = n - 2; k >= 0; k--) {
    const room = { left: peakAt - left.length, right: n - 1 - peakAt - right.length };
    const goLeft = room.right === 0 || (room.left > 0 && rng.int(0, 1) === 0);
    (goLeft ? left : right).push(vs[k]!);
  }
  return [...left.reverse(), vs[n - 1]!, ...right];
}

// ----- Operations -----

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg]) {
    const n = s.a.length;
    const parsed = numberFromArg(arg, 'value to look for');
    if (typeof parsed === 'string') {
      yield {
        state: s,
        marks: [mark('row-a', 'error')],
        say: `search needs one value to look for. ${parsed}`,
        lines: ['sig'],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const bad = outOfOrder(s);
    if (bad) {
      yield {
        state: s,
        marks: bad.marks,
        say: `${bad.say} Searching for x needs A in order. Press Sort A first, or press Find max if A rises and then falls.`,
        lines: ['sig'],
        level: 1,
        vars: { x: parsed, n },
      };
      return s;
    }
    const run = new Run(s, ['comparisons']);
    yield* searchRun(run, parsed);
    return run.state();
  },
};

const max: Op = {
  label: 'Find max',
  arity: 0,
  *run(s) {
    const bad = notUnimodal(s);
    if (bad) {
      yield {
        state: s,
        marks: bad.marks,
        say: `${bad.say} Load values that rise and then fall, such as 3 8 14 20 17 9.`,
        lines: ['msig'],
        level: 1,
        vars: { n: s.a.length },
      };
      return s;
    }
    const run = new Run(s, ['comparisons']);
    yield* maxRun(run);
    return run.state();
  },
};

export const ops = {
  load: loadOp<TernarySettings>({
    ready:
      'A is sorted, so Search can use it. (Find max works too: a sorted array peaks at its last value.)',
    warn: (s) => {
      const bad = outOfOrder(s);
      if (!bad) return null;
      if (!notUnimodal(s))
        return {
          say: 'A rises and then falls, so press Find max to find its peak. To search for a value, press Sort A first.',
          marks: [],
        };
      return { say: `${bad.say} Press Sort A before you search.`, marks: bad.marks };
    },
  }),
  search,
  max,
  sort: sortAOp<TernarySettings>(NAME),
};

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const thirds = (id: string, indent: number) =>
  L(
    id,
    indent,
    'third = floor((hi - lo) / 3); m1 = lo + third; m2 = hi - third',
    'Look a third and two thirds of the way across the window.',
  );

const searchLines = [
  L('sig', 0, 'ternarySearch(A, n, x)', 'To find x in sorted A[0..n-1]:'),
  L('init', 1, 'lo = 0; hi = n - 1', 'The window A[lo..hi] starts as all of A.'),
  L('loop', 1, 'while lo <= hi', 'While the window is not empty,'),
  thirds('mid', 2),
  L('eq1', 2, 'if A[m1] == x: return m1', 'If the first point is x, found it.'),
  L('eq2', 2, 'if A[m2] == x: return m2', 'If the second point is x, found it.'),
  L('lt', 2, 'if x < A[m1]', 'If x is below the first point,'),
  L('left', 3, 'hi = m1 - 1', 'keep the left third.'),
  L('gt', 2, 'else if x > A[m2]', 'If x is above the second point,'),
  L('right', 3, 'lo = m2 + 1', 'keep the right third.'),
  L('middle', 2, 'else lo = m1 + 1; hi = m2 - 1', 'Otherwise keep the middle third.'),
  L('miss', 1, 'return -1', 'Not there.'),
];

const maxLines = [
  L('msig', 0, 'ternaryMax(A, n)', 'To find the peak of A, which rises and then falls:'),
  L('minit', 1, 'lo = 0; hi = n - 1', 'The window starts as all of A.'),
  L('mloop', 1, 'while lo < hi', 'While more than one value is left,'),
  thirds('mmid', 2),
  L('mcmp', 2, 'if A[m1] < A[m2]', 'if the values climb from m1 to m2,'),
  L('mright', 3, 'lo = m1 + 1', 'the peak is right of m1.'),
  L('mleft', 2, 'else hi = m2 - 1', 'Otherwise it is left of m2.'),
  L('mret', 1, 'return lo', 'The one value left is the peak.'),
];

export function pseudocode(st: TernarySettings): PseudoBlock[] {
  const blocks = [
    { op: 'search', lines: searchLines },
    { op: 'max', lines: maxLines },
  ];
  return st.goal === 'max' ? blocks.reverse() : blocks;
}

export function initialSay(state: ArrayState, st: TernarySettings): string {
  const vs = valuesOf(state).join(', ');
  return st.goal === 'max'
    ? `A holds ${plural(state.a.length, 'value')} that rise and then fall: ${vs}. Press Find max to find the peak.`
    : `A holds ${plural(state.a.length, 'sorted value')}: ${vs}. Type a value and press Search, or load your own values first.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
