/**
 * Interpolation search on a sorted array. Instead of looking in the middle, it guesses where x
 * should be from its value: if x is a third of the way from A[lo] to A[hi], look a third of the
 * way from lo to hi. On evenly spread values the guess lands next to x and the search takes
 * about log log n probes; on skewed values the guesses creep forward one slot at a time.
 *
 * In bars mode the view draws the guess: a straight line from the top of A[lo] to the top of
 * A[hi], and where the height of x meets it.
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

export interface InterpolationSettings {
  [key: string]: Scalar;
  /** Draw the straight line the guess comes from (bars mode). */
  guide: boolean;
  draw: Draw;
}

export const defaults: InterpolationSettings = { guide: true, draw: 'bars' };

/** The straight line from (lo, A[lo]) to (hi, A[hi]) and where x meets it. */
export interface Guide {
  lo: number;
  hi: number;
  x: number;
  /** The unrounded estimate, lo + (x - A[lo]) (hi - lo) / (A[hi] - A[lo]). */
  at: number;
}

export interface InterpolationExtra extends ArrayExtra {
  guide?: Guide;
}

type Op = OpSpec<ArrayState, InterpolationSettings, ArrayExtra>;

/** Twelve evenly spread values: a guess lands on or next to any of them. */
export const START = [5, 13, 21, 30, 38, 46, 55, 63, 71, 80, 88, 96];

export function init(): ArrayState {
  return makeState(START);
}

const NAME = 'interpolation search';

/** "4.67" or "5": the estimate as a learner would write it. */
export const fmt = (v: number): string =>
  Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);

function* searchRun(run: Run, x: number): Generator<ArrayStep, number, void> {
  const n = run.n;
  let lo = 0;
  let hi = n - 1;
  const extra = (pos?: number, guide?: Guide, xAt?: number): InterpolationExtra => {
    const pointers: BarsPointer[] = [{ name: 'lo', at: lo }];
    if (pos !== undefined) pointers.push({ name: 'pos', at: pos });
    pointers.push({ name: 'hi', at: hi });
    const regions: BarsRegion[] =
      lo <= hi ? [{ id: 'window', from: lo, to: hi, tone: 'window' }] : [];
    return {
      pointers,
      regions,
      faded: outside(n, lo, hi),
      held: { value: x, at: xAt ?? (pos !== undefined ? pos : (lo + hi) / 2), label: 'x' },
      ...(guide ? { guide } : {}),
    };
  };
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2,
    e: InterpolationExtra,
    marks: Mark[] = [],
    more: Record<string, Scalar> = {},
  ) =>
    run.step({
      say,
      lines,
      level,
      marks,
      vars: { x, lo, hi, n, ...more },
      extra: e,
    });

  const finish = (result: number) => {
    const b = binaryCost(valuesOf(run.state()), x);
    const probes = run.counts.probes ?? 0;
    const cmp =
      b.probes === probes
        ? `Binary search would also take ${plural(b.probes, 'probe')}.`
        : `Binary search would take ${plural(b.probes, 'probe')}.`;
    return { cmp, result, binary: b.probes };
  };

  yield step(
    `Look for x = ${x}. The window starts as the whole array, ${span(0, n - 1)}: lo = 0 and hi = ${hi}.`,
    ['init'],
    2,
    extra(),
  );

  while (lo <= hi && run.v(lo) <= x && x <= run.v(hi)) {
    const [a, b] = [run.v(lo), run.v(hi)];
    if (a === b) {
      // Every value in the window is x: the formula would divide by zero.
      run.count('probes');
      const f = finish(lo);
      yield step(
        `A[lo] = A[hi] = ${a} and x is between them, so the whole window is ${a}s and x is one of them. Return ${lo}. ${f.cmp}`,
        ['loop', 'flat'],
        1,
        extra(lo),
        [mark(run.id(lo), 'found')],
        { pos: lo, result: lo, binary: f.binary },
      );
      return lo;
    }
    const exact = lo + ((x - a) * (hi - lo)) / (b - a);
    const pos = Math.floor(exact);
    const v = run.v(pos);
    run.count('probes');
    const guide: Guide = { lo, hi, x, at: exact };
    yield step(
      `${x} lies between A[lo] = ${a} and A[hi] = ${b}. Guess pos = ${lo} + (${x} − ${a}) × (${hi} − ${lo}) / (${b} − ${a}) = ${fmt(exact)}` +
        (Number.isInteger(exact) ? '.' : `, rounded down to ${pos}.`) +
        ` Compare ${at(pos, v)} with x.`,
      ['loop', 'pos'],
      2,
      extra(pos, guide),
      [mark(run.id(pos), 'compare')],
      { pos },
    );
    if (v === x) {
      const f = finish(pos);
      yield step(
        `${at(pos, v)} is x. Found it: return ${pos}. That took ${plural(run.counts.probes!, 'probe')}. ${f.cmp}`,
        ['eq'],
        1,
        extra(pos, guide),
        [mark(run.id(pos), 'found')],
        { pos, result: pos, binary: f.binary },
      );
      return pos;
    }
    let say: string;
    let lines: string[];
    if (v < x) {
      lo = pos + 1;
      say = `${at(pos, v)} < ${x}, so x can only be right of pos: lo = pos + 1 = ${lo}.`;
      lines = ['eq', 'lt', 'right'];
    } else {
      hi = pos - 1;
      say = `${at(pos, v)} > ${x}, so x can only be left of pos: hi = pos − 1 = ${hi}.`;
      lines = ['eq', 'lt', 'left'];
    }
    yield step(say, lines, 1, extra(pos, undefined, pos), [mark(run.id(pos), 'compare')], { pos });
  }

  // Why the loop stopped: an empty window, or x outside A[lo..hi].
  let why: string;
  if (n === 0) why = 'A is empty';
  else if (lo > hi) why = `lo = ${lo} > hi = ${hi}: the window is empty`;
  else if (x < run.v(lo)) why = `x = ${x} < A[lo] = ${run.v(lo)}, so x cannot be in the window`;
  else why = `x = ${x} > A[hi] = ${run.v(hi)}, so x cannot be in the window`;
  const f = finish(-1);
  yield step(
    `${why}. ${x} is not in A: return −1. That took ${plural(run.counts.probes ?? 0, 'probe')}. ${f.cmp}`,
    ['loop', 'miss'],
    1,
    extra(undefined, undefined, Math.max(-0.5, Math.min(n - 0.5, lo - 0.5))),
    [],
    { result: -1, binary: f.binary },
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
    const x = parsed;
    const bad = outOfOrder(s);
    if (bad) {
      yield {
        state: s,
        marks: bad.marks,
        say: `${bad.say} Interpolation search needs A in order: its guess assumes the values climb from A[lo] to A[hi]. Press Sort A first, or load sorted values.`,
        lines: ['sig'],
        level: 1,
        vars: { x, n },
      };
      return s;
    }
    const run = new Run(s, ['probes']);
    yield* searchRun(run, x);
    return run.state();
  },
};

export const ops = {
  load: sortedLoadOp<InterpolationSettings>(NAME),
  search,
  sort: sortAOp<InterpolationSettings>(NAME),
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
        L('sig', 0, 'interpolationSearch(A, n, x)', 'To find x in sorted A[0..n-1]:'),
        L('init', 1, 'lo = 0; hi = n - 1', 'The window A[lo..hi] starts as all of A.'),
        L(
          'loop',
          1,
          'while lo <= hi and A[lo] <= x <= A[hi]',
          'While x could still be in the window,',
        ),
        L('flat', 2, 'if A[lo] == A[hi]: return lo', 'if the window is all one value, it is x.'),
        L(
          'pos',
          2,
          'pos = lo + floor((x - A[lo]) * (hi - lo) / (A[hi] - A[lo]))',
          'Guess where x is from how far it sits between A[lo] and A[hi].',
        ),
        L('eq', 2, 'if A[pos] == x: return pos', 'If the guess is x, found it.'),
        L('lt', 2, 'if A[pos] < x', 'If the guess is too small,'),
        L('right', 3, 'lo = pos + 1', 'x is further right.'),
        L('left', 2, 'else hi = pos - 1', 'Otherwise x is further left.'),
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
