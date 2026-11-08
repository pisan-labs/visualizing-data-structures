/**
 * Exponential search (also called galloping or doubling search) on a sorted array. Phase 1
 * looks at A[1], A[2], A[4], A[8], ... until it finds a value that is not smaller than x or
 * runs off the end. Phase 2 runs binary search on the last stretch it jumped over,
 * A[bound/2 .. min(bound, n - 1)]. Finding x at index i takes O(log i) probes, so it beats
 * binary search when x is near the front of a long (or unbounded) array.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  at,
  makeState,
  mark,
  numberFromArg,
  plural,
  Run,
  span,
  valuesOf,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { binaryCost, outOfOrder, outside, sortAOp, sortedLoadOp } from '../_sorting/search';

export interface ExponentialSettings {
  [key: string]: Scalar;
  draw: Draw;
}

export const defaults: ExponentialSettings = { draw: 'cells' };

type Op = OpSpec<ArrayState, ExponentialSettings, ArrayExtra>;

/** Twenty sorted values: long enough that a value near the front is a real shortcut. */
export const START = [3, 7, 12, 18, 21, 26, 30, 35, 41, 47, 52, 58, 64, 71, 79, 83, 88, 91, 95, 98];

export function init(): ArrayState {
  return makeState(START);
}

const NAME = 'exponential search';

function* searchRun(run: Run, x: number): Generator<ArrayStep, number, void> {
  const n = run.n;
  let bound = 1;
  // Phase 2's window, once it starts.
  let lo = -1;
  let hi = -1;
  const top = () => Math.min(bound, n - 1);

  const doubling = (xAt: number): ArrayExtra => {
    const from = Math.floor(bound / 2);
    const regions: BarsRegion[] =
      n > 0 ? [{ id: 'window', from: Math.min(from, n - 1), to: top(), tone: 'window' }] : [];
    return {
      pointers: [{ name: 'bound', at: Math.min(bound, n) }],
      regions,
      faded: from > 0 ? [{ from: 0, to: Math.min(from, n) - 1 }] : [],
      held: { value: x, at: xAt, label: 'x' },
    };
  };
  const binary = (mid: number | undefined, xAt: number): ArrayExtra => {
    const pointers: BarsPointer[] = [{ name: 'lo', at: lo }];
    if (mid !== undefined) pointers.push({ name: 'mid', at: mid });
    pointers.push({ name: 'hi', at: hi });
    return {
      pointers,
      regions: lo <= hi ? [{ id: 'window', from: lo, to: hi, tone: 'window' }] : [],
      faded: outside(n, lo, hi),
      held: { value: x, at: xAt, label: 'x' },
    };
  };
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2,
    extra: ArrayExtra,
    marks: Mark[] = [],
    more: Record<string, Scalar> = {},
  ) =>
    run.step({
      say,
      lines,
      level,
      marks,
      vars: { x, bound, ...(lo >= 0 ? { lo, hi } : {}), n, ...more },
      extra,
    });
  const versus = () => {
    const b = binaryCost(valuesOf(run.state()), x).probes;
    const mine = run.counts.probes ?? 0;
    return {
      binary: b,
      say: `${plural(mine, 'probe')} in all. Binary search on all of A would take ${plural(b, 'probe')}${b === mine ? ' too' : ''}.`,
    };
  };

  yield step(
    `Look for x = ${x}. Phase 1: jump ahead, doubling the step. Start with bound = 1.`,
    ['init'],
    2,
    doubling(Math.min(1, n - 1)),
  );

  // Phase 1: double bound while A[bound] < x.
  while (bound < n && run.v(bound) < x) {
    run.count('probes');
    const v = run.v(bound);
    const old = bound;
    bound *= 2;
    yield step(
      `${at(old, v)} < ${x}, so x is further right. Double the bound: bound = ${old * 2}.`,
      ['grow', 'double'],
      2,
      doubling(old),
      [mark(run.id(old), 'compare')],
    );
  }
  const from = Math.floor(bound / 2);
  let why: string;
  const marks: Mark[] = [];
  if (bound < n) {
    run.count('probes');
    why = `${at(bound, run.v(bound))} ≥ ${x}, so x can only be at or before index ${bound}.`;
    marks.push(mark(run.id(bound), 'compare'));
  } else {
    why =
      n === 0
        ? 'A is empty.'
        : `bound = ${bound} is past the end (n = ${n}), so x can only be in what is left.`;
  }
  lo = from;
  hi = top();
  yield step(
    n === 0
      ? `${why} There is nothing to search.`
      : `${why} Phase 2: binary search ${span(lo, hi)}, between bound / 2 = ${from} and ${bound < n ? `bound = ${bound}` : `the end, ${n - 1}`}.`,
    ['grow', 'bs'],
    1,
    binary(undefined, (lo + hi) / 2),
    marks,
  );

  // Phase 2: binary search A[lo..hi].
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const v = run.v(mid);
    run.count('probes');
    const look = [mark(run.id(mid), 'compare')];
    yield step(
      `mid = floor((${lo} + ${hi}) / 2) = ${mid}. Compare ${at(mid, v)} with x = ${x}.`,
      ['loop', 'mid'],
      2,
      binary(mid, mid),
      look,
      { mid },
    );
    if (v === x) {
      const vs = versus();
      yield step(
        `${at(mid, v)} is x. Found it: return ${mid}. ${vs.say}`,
        ['eq'],
        1,
        binary(mid, mid),
        [mark(run.id(mid), 'found')],
        { mid, result: mid, binary: vs.binary },
      );
      return mid;
    }
    if (v > x) {
      hi = mid - 1;
      yield step(
        `${at(mid, v)} > ${x}, so x can only be left of mid: hi = ${hi}.`,
        ['eq', 'gt', 'left'],
        1,
        binary(mid, mid),
        look,
        { mid },
      );
    } else {
      lo = mid + 1;
      yield step(
        `${at(mid, v)} < ${x}, so x can only be right of mid: lo = ${lo}.`,
        ['eq', 'gt', 'right'],
        1,
        binary(mid, mid),
        look,
        { mid },
      );
    }
  }
  const vs = versus();
  yield step(
    `${n === 0 ? 'A is empty' : `lo = ${lo} > hi = ${hi}: the window is empty`}, so ${x} is not in A. Return −1. ${vs.say}`,
    ['loop', 'miss'],
    1,
    binary(undefined, Math.max(-0.5, Math.min(n - 0.5, lo - 0.5))),
    [],
    { result: -1, binary: vs.binary },
  );
  return -1;
}

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
        say: `${bad.say} Exponential search needs A in order: A[bound] < x has to mean that x is further right. Press Sort A first, or load sorted values.`,
        lines: ['sig'],
        level: 1,
        vars: { x: parsed, n },
      };
      return s;
    }
    const run = new Run(s, ['probes']);
    yield* searchRun(run, parsed);
    return run.state();
  },
};

export const ops = {
  load: sortedLoadOp<ExponentialSettings>(NAME),
  search,
  sort: sortAOp<ExponentialSettings>(NAME),
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'search',
      lines: [
        L('sig', 0, 'exponentialSearch(A, n, x)', 'To find x in sorted A[0..n-1]:'),
        L('init', 1, 'bound = 1', 'Start one step in.'),
        L('grow', 1, 'while bound < n and A[bound] < x', 'While A[bound] is still too small,'),
        L('double', 2, 'bound = 2 * bound', 'jump twice as far.'),
        L(
          'bs',
          1,
          'lo = floor(bound / 2); hi = min(bound, n - 1)',
          'x is between the last two jumps: binary search there.',
        ),
        L('loop', 1, 'while lo <= hi', 'While the window is not empty,'),
        L('mid', 2, 'mid = floor((lo + hi) / 2)', 'look at the middle of the window.'),
        L('eq', 2, 'if A[mid] == x: return mid', 'If it is x, found it.'),
        L('gt', 2, 'if A[mid] > x', 'If it is bigger than x,'),
        L('left', 3, 'hi = mid - 1', 'x can only be left of mid.'),
        L('right', 2, 'else lo = mid + 1', 'Otherwise it can only be right of mid.'),
        L('miss', 1, 'return -1', 'Not there.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'sorted value')}: ${valuesOf(state).join(', ')}. Type a value and press Search, or load your own values first.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
