/**
 * Binary search on a sorted array. The variant says what it returns: an index of x, the first
 * x, the first value >= x (lower bound), the first value > x (upper bound), or an index of x
 * with Java's encoding of the insertion point on a miss. The style says how it runs: a loop, or
 * a function that calls itself on the half that is left.
 *
 * The window is A[lo..hi] for the closed variants and A[lo..hi-1] for lower and upper bound.
 * Each probe compares x with A[mid] and throws away half the window; values outside it fade.
 * x hovers over the value it is compared with, and over the gap where it would go once the
 * window is empty.
 *
 * Binary search refuses an unsorted A and says why. "Sort A" sorts it, but only when asked.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsCall, BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  at,
  firstDescent,
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

export type Variant = 'exact' | 'first' | 'lower' | 'upper' | 'insert';
export type Style = 'iterative' | 'recursive';

export interface BinarySettings {
  [key: string]: Scalar;
  /** What the search returns. */
  variant: Variant;
  /** A loop, or a function that calls itself on the half that is left. */
  style: Style;
  draw: Draw;
}

export const defaults: BinarySettings = { variant: 'exact', style: 'iterative', draw: 'cells' };

type Op = OpSpec<ArrayState, BinarySettings, ArrayExtra>;
type Gen = Generator<ArrayStep, number, void>;
type Vars = Record<string, Scalar>;

/** Ten sorted values: any search takes at most 4 probes. */
export const START = [8, 12, 17, 24, 31, 35, 42, 50, 57, 63];

export function init(): ArrayState {
  return makeState(START);
}

/** Lower and upper bound keep a half-open window A[lo..hi-1]; the others keep A[lo..hi]. */
export const halfOpen = (v: Variant): boolean => v === 'lower' || v === 'upper';

/** Function names, shared by the pseudocode and the narration. */
export const NAMES: Record<Variant, string> = {
  exact: 'search',
  first: 'first',
  lower: 'lowerBound',
  upper: 'upperBound',
  insert: 'locate',
};

/** The first two values out of order, or null when A is sorted. */
export function outOfOrder(s: ArrayState): { say: string; marks: Mark[] } | null {
  const d = firstDescent(valuesOf(s));
  if (d < 0) return null;
  const p = s.a[d]!;
  const q = s.a[d + 1]!;
  return {
    say: `A is not sorted: ${at(d, p)} comes before ${at(d + 1, q)}, which is smaller.`,
    marks: [mark(vid(p), 'error'), mark(vid(q), 'error')],
  };
}

// ----- One probe -----

/** found: return mid. record: remember mid and keep looking left. left, right: which half. */
type Move = 'found' | 'record' | 'left' | 'right';

export function move(variant: Variant, v: number, x: number): Move {
  if (variant === 'lower') return v >= x ? 'left' : 'right';
  if (variant === 'upper') return v > x ? 'left' : 'right';
  if (v === x) return variant === 'first' ? 'record' : 'found';
  return v > x ? 'left' : 'right';
}

/** Why a probe went the way it did: "A[4] = 31 < 42, so x can only be right of mid". */
function why(variant: Variant, mid: number, v: number, x: number, m: Move): string {
  const a = at(mid, v);
  if (m === 'found' || m === 'record') return `${a} is x`;
  if (halfOpen(variant)) {
    const [yes, no] = variant === 'lower' ? ['≥', '<'] : ['>', '≤'];
    return m === 'left'
      ? `${a} ${yes} ${x}, so the answer is ${mid} or further left`
      : `${a} ${no} ${x}, so the answer is further right`;
  }
  return m === 'left'
    ? `${a} > ${x}, so x can only be left of mid`
    : `${a} < ${x}, so x can only be right of mid`;
}

/** ", between A[5] = 35 and A[6] = 42": where a value would go at index i. */
function gap(run: Run, i: number): string {
  const n = run.n;
  if (n === 0) return '';
  if (i === 0) return `, before ${at(0, run.v(0))}`;
  if (i === n) return `, after ${at(n - 1, run.v(n - 1))}`;
  return `, between ${at(i - 1, run.v(i - 1))} and ${at(i, run.v(i))}`;
}

/** What a result means, as a clause: "42 is at index 6". */
function answer(variant: Variant, run: Run, x: number, result: number): string {
  const n = run.n;
  if (halfOpen(variant)) {
    const rel = variant === 'lower' ? '≥' : '>';
    if (result < n) return `${at(result, run.v(result))} is the first value ${rel} ${x}`;
    return n === 0 ? 'A is empty' : `no value is ${rel} ${x}, so the answer is one past the end`;
  }
  if (result >= 0)
    return variant === 'first'
      ? `the first ${x} is at index ${result}`
      : `${x} is at index ${result}`;
  if (variant === 'insert') return `${x} is not in A, and it would go at index ${-result - 1}`;
  return `${x} is not in A`;
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The answer slot, marked found, when the result points at a value. */
function answerMarks(variant: Variant, run: Run, result: number): Mark[] {
  const ok = halfOpen(variant) ? result < run.n : result >= 0;
  return ok ? [mark(run.id(result), 'found')] : [];
}

const windowNow = (lo: number, last: number): string =>
  lo > last
    ? 'the window is now empty'
    : `the window is now ${span(lo, last)}${lo === last ? '' : `, ${last - lo + 1} values`}`;

interface View {
  lo: number;
  hi: number;
  mid?: number;
  /** Where x hovers: over mid, over the answer, or between two slots where it would go. */
  xAt: number;
  /** First occurrence: the leftmost x found so far. */
  r?: number;
}

function extraFor(n: number, open: boolean, x: number, w: View, calls?: BarsCall[]): ArrayExtra {
  const last = open ? w.hi - 1 : w.hi;
  const pointers: BarsPointer[] = [{ name: 'lo', at: w.lo }];
  if (w.mid !== undefined) pointers.push({ name: 'mid', at: w.mid });
  pointers.push({ name: 'hi', at: w.hi });
  if (w.r !== undefined && w.r >= 0) pointers.push({ name: 'r', at: w.r });
  const faded: { from: number; to: number }[] = [];
  if (w.lo > 0) faded.push({ from: 0, to: Math.min(w.lo, n) - 1 });
  if (last < n - 1) faded.push({ from: Math.max(last + 1, 0), to: n - 1 });
  const regions: BarsRegion[] =
    w.lo <= last ? [{ id: 'window', from: w.lo, to: last, tone: 'window' }] : [];
  return {
    pointers,
    regions,
    faded,
    held: { value: x, at: w.xAt, label: 'x' },
    ...(calls ? { calls } : {}),
  };
}

// ----- The loop -----

function* iterative(run: Run, x: number, variant: Variant): Gen {
  const n = run.n;
  const open = halfOpen(variant);
  const keepsR = variant === 'first';
  let lo = 0;
  let hi = open ? n : n - 1;
  let r = -1;
  const last = () => (open ? hi - 1 : hi);
  const step = (
    say: string,
    lines: string[],
    level: 1 | 2,
    w: { mid?: number; xAt: number },
    marks: Mark[] = [],
    more: Vars = {},
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
        ...(w.mid === undefined ? {} : { mid: w.mid }),
        ...(keepsR ? { r } : {}),
        n,
        ...more,
      },
      extra: extraFor(n, open, x, { lo, hi, r: keepsR ? r : undefined, ...w }),
    });

  const goal = open
    ? `Find the first value ${variant === 'lower' ? '≥' : '>'} ${x}`
    : `Look for ${keepsR ? `the first ${x}` : `x = ${x}`}`;
  yield step(
    `${goal}. The window starts as the whole array, ${span(0, n - 1)}: lo = 0 and hi = ${hi}` +
      (open ? ', one past the end.' : '.') +
      (keepsR ? ' r = -1 until x turns up.' : ''),
    ['init'],
    2,
    { xAt: (lo + last()) / 2 },
  );

  while (lo <= last()) {
    const mid = Math.floor((lo + hi) / 2);
    const v = run.v(mid);
    run.count('probes');
    const look = [mark(run.id(mid), 'compare')];
    yield step(
      `lo = ${lo} and hi = ${hi}, so mid = floor((${lo} + ${hi}) / 2) = ${mid}. Compare ${at(mid, v)} with x = ${x}.`,
      ['loop', 'mid'],
      2,
      { mid, xAt: mid },
      look,
    );
    const m = move(variant, v, x);
    const reason = why(variant, mid, v, x, m);
    if (m === 'found') {
      yield step(
        `${reason}. Found it: return ${mid}.`,
        ['eq', 'found'],
        1,
        { mid, xAt: mid },
        [mark(run.id(mid), 'found')],
        { result: mid },
      );
      return mid;
    }
    let say: string;
    let lines: string[];
    if (m === 'record') {
      r = mid;
      hi = mid - 1;
      say = `${reason}. Remember r = ${mid}, but there may be another ${x} further left: hi = mid - 1 = ${hi}, and ${windowNow(lo, last())}.`;
      lines = ['eq', 'record'];
    } else if (m === 'left') {
      hi = open ? mid : mid - 1;
      say = `${reason}. hi = ${open ? 'mid' : 'mid - 1'} = ${hi}, and ${windowNow(lo, last())}.`;
      lines = open ? ['test', 'left'] : ['eq', 'gt', 'left'];
    } else {
      lo = mid + 1;
      say = `${reason}. lo = mid + 1 = ${lo}, and ${windowNow(lo, last())}.`;
      lines = open ? ['test', 'right'] : ['eq', 'gt', 'right'];
    }
    yield step(say, lines, 1, { mid, xAt: mid }, look);
  }

  // The window is empty. What that means depends on the variant.
  const result = open ? lo : keepsR ? r : variant === 'insert' ? -(lo + 1) : -1;
  const empty = open
    ? `lo = hi = ${lo}: the window is empty.`
    : `lo = ${lo} > hi = ${hi}: the window is empty`;
  let say: string;
  if (open) say = `${empty} ${cap(answer(variant, run, x, result))}. Return ${lo}.`;
  else if (keepsR)
    say =
      r >= 0
        ? `${empty}, and r = ${r} is the leftmost ${x} found, so it is the first one. Return ${r}.`
        : `${empty} and no ${x} turned up, so r is still -1. Return -1.`;
  else if (variant === 'insert')
    say = `${empty}, so ${x} is not in A. It would go at index ${lo}${gap(run, lo)}. Return -(${lo} + 1) = ${result}.`;
  else say = `${empty}, so ${x} is not in A. Return -1.`;
  yield step(
    say,
    ['loop', open || keepsR ? 'ret' : 'miss'],
    1,
    { xAt: keepsR && r >= 0 ? r : lo - 0.5 },
    answerMarks(variant, run, result),
    { result },
  );
  return result;
}

// ----- The recursive version -----

function* recursive(run: Run, x: number, variant: Variant): Gen {
  const n = run.n;
  const open = halfOpen(variant);
  const stack: BarsCall[] = [];
  const calls = () => stack.map((c) => ({ ...c }));
  const sig = (lo: number, hi: number) => `${NAMES[variant]}(A, x, ${lo}, ${hi})`;
  /** The window where the answer was settled, for the last step. */
  let settled: View = { lo: 0, hi: open ? n : n - 1, xAt: 0 };

  function* call(lo: number, hi: number): Gen {
    const last = open ? hi - 1 : hi;
    stack.push({ from: lo, to: last });
    const depth = stack.length - 1;
    const here = `${sig(lo, hi)}${depth > 0 ? ` at depth ${depth}` : ''}`;
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2,
      w: { mid?: number; xAt: number },
      marks: Mark[] = [],
    ) =>
      run.step({
        say,
        lines,
        level,
        marks,
        vars: { x, lo, hi, ...(w.mid === undefined ? {} : { mid: w.mid }), n, depth },
        extra: extraFor(n, open, x, { lo, hi, ...w }, calls()),
      });

    if (lo > last) {
      const result = open ? lo : variant === 'insert' ? -(lo + 1) : -1;
      const empty = open
        ? `lo = hi = ${lo}, so the window is empty`
        : `lo = ${lo} > hi = ${hi}, so the window is empty`;
      const then = open
        ? `Return ${lo}.`
        : variant === 'insert'
          ? `${x} is not in A; it would go at index ${lo}${gap(run, lo)}. Return -(${lo} + 1) = ${result}.`
          : variant === 'first'
            ? `There is no ${x} in it: return -1.`
            : `${x} is not in A: return -1.`;
      settled = { lo, hi, xAt: lo - 0.5 };
      yield step(`${here}: ${empty}. ${then}`, ['base', 'none'], 2, { xAt: lo - 0.5 });
      stack.pop();
      return result;
    }

    const mid = Math.floor((lo + hi) / 2);
    const v = run.v(mid);
    run.count('probes');
    const look = [mark(run.id(mid), 'compare')];
    yield step(
      `${here}: mid = floor((${lo} + ${hi}) / 2) = ${mid}. Compare ${at(mid, v)} with x = ${x}.`,
      ['base', 'mid'],
      2,
      { mid, xAt: mid },
      look,
    );
    const m = move(variant, v, x);
    const reason = why(variant, mid, v, x, m);
    let result: number;
    if (m === 'found') {
      settled = { lo, hi, mid, xAt: mid };
      yield step(`${reason}. Return ${mid}.`, ['eq', 'found'], 1, { mid, xAt: mid }, [
        mark(run.id(mid), 'found'),
      ]);
      result = mid;
    } else if (m === 'record') {
      yield step(
        `${reason}, but there may be another ${x} further left. Call ${sig(lo, mid - 1)} to look.`,
        ['eq', 'rec'],
        1,
        { mid, xAt: mid },
        look,
      );
      const r = yield* call(lo, mid - 1);
      result = r === -1 ? mid : r;
      settled = { lo, hi, mid, xAt: result };
      yield step(
        r === -1
          ? `Back in ${sig(lo, hi)}: the call returned -1, so no ${x} comes before A[${mid}]. A[${mid}] is the first ${x}: return ${mid}.`
          : `Back in ${sig(lo, hi)}: the call found a ${x} further left, at index ${r}. Return ${r}.`,
        ['check', r === -1 ? 'retmid' : 'retr'],
        2,
        { mid, xAt: result },
        [mark(run.id(result), 'found')],
      );
    } else {
      const [nlo, nhi] = m === 'left' ? [lo, open ? mid : mid - 1] : [mid + 1, hi];
      yield step(
        `${reason}: return ${sig(nlo, nhi)}.`,
        [...(open ? ['test'] : ['eq', 'gt']), m],
        1,
        { mid, xAt: mid },
        look,
      );
      // A tail call: this call returns whatever the next one returns.
      result = yield* call(nlo, nhi);
    }
    stack.pop();
    return result;
  }

  const top = open ? n : n - 1;
  const result = yield* call(0, top);
  yield run.step({
    say:
      (variant === 'first' ? '' : `Every call passes ${result} back up, so `) +
      `${sig(0, top)} returns ${result}: ${answer(variant, run, x, result)}.`,
    lines: ['sig'],
    level: 1,
    marks: answerMarks(variant, run, result),
    vars: { x, n, result },
    extra: extraFor(n, open, x, settled),
  });
  return result;
}

// ----- Operations -----

const search: Op = {
  label: 'Search',
  arity: 1,
  *run(s, [arg], { settings }) {
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
        say: `${bad.say} Binary search needs A in order. It throws away half of the window after looking at one value, and on an unsorted A that half could hold ${x}. Press Sort A to sort it first, or load sorted values.`,
        lines: ['sig'],
        level: 1,
        vars: { x, n },
      };
      return s;
    }
    const run = new Run(s, ['probes']);
    if (settings.style === 'recursive') yield* recursive(run, x, settings.variant);
    else yield* iterative(run, x, settings.variant);
    return run.state();
  },
};

/** Sorting is a separate, visible step: binary search never sorts behind your back. */
const sortA: Op = {
  label: 'Sort A',
  arity: 0,
  *run(s) {
    const n = s.a.length;
    if (!outOfOrder(s)) {
      yield {
        state: s,
        marks: [],
        say: 'A is already sorted, so there is nothing to do.',
        lines: [],
        level: 1,
        vars: { n },
      };
      return s;
    }
    const a = [...s.a].sort((p, q) => p.value - q.value);
    const next: ArrayState = { a, nextUid: s.nextUid };
    yield {
      state: next,
      marks: a.filter((x, i) => s.a[i] !== x).map((x) => mark(vid(x), 'active')),
      say: `Sorted A with a library sort: ${valuesOf(next).join(', ')}. Now binary search can use it.`,
      lines: [],
      level: 1,
      vars: { n },
    };
    return next;
  },
};

export const ops = {
  load: loadOp<BinarySettings>({
    ready: 'A is sorted, so binary search can use it. Type a value and press Search.',
    warn: (s) => {
      const bad = outOfOrder(s);
      return (
        bad && {
          say: `${bad.say} Binary search needs sorted values, so press Sort A before you search.`,
          marks: bad.marks,
        }
      );
    },
  }),
  search,
  sort: sortA,
};

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const mid = (indent: number) =>
  L('mid', indent, 'mid = floor((lo + hi) / 2)', 'Look at the middle of the window.');

function iterativeLines(v: Variant): PseudoLine[] {
  const name = NAMES[v];
  if (halfOpen(v)) {
    const lower = v === 'lower';
    return [
      L(
        'sig',
        0,
        `${name}(A, n, x)`,
        `To find the first value ${lower ? '≥' : '>'} x in sorted A[0..n-1]:`,
      ),
      L('init', 1, 'lo = 0; hi = n', 'The window A[lo..hi-1] starts as all of A.'),
      L('loop', 1, 'while lo < hi', 'While the window is not empty,'),
      mid(2),
      L(
        'test',
        2,
        lower ? 'if A[mid] >= x' : 'if A[mid] > x',
        lower ? 'if A[mid] is at least x,' : 'if A[mid] is bigger than x,',
      ),
      L('left', 3, 'hi = mid', 'the answer is mid or further left.'),
      L('right', 2, 'else lo = mid + 1', 'Otherwise it is further right.'),
      L('ret', 1, 'return lo', 'Now lo = hi: that is the answer.'),
    ];
  }
  const first = v === 'first';
  return [
    L('sig', 0, `${name}(A, n, x)`, `To find ${first ? 'the first x' : 'x'} in sorted A[0..n-1]:`),
    L(
      'init',
      1,
      first ? 'lo = 0; hi = n - 1; r = -1' : 'lo = 0; hi = n - 1',
      first
        ? 'The window A[lo..hi] starts as all of A; no x found yet.'
        : 'The window A[lo..hi] starts as all of A.',
    ),
    L('loop', 1, 'while lo <= hi', 'While the window is not empty,'),
    mid(2),
    L('eq', 2, 'if A[mid] == x', 'if A[mid] is x,'),
    first
      ? L('record', 3, 'r = mid; hi = mid - 1', 'remember it and keep looking left.')
      : L('found', 3, 'return mid', 'found it.'),
    L('gt', 2, 'else if A[mid] > x', 'If A[mid] is bigger than x,'),
    L('left', 3, 'hi = mid - 1', 'x can only be left of mid.'),
    L('right', 2, 'else lo = mid + 1', 'Otherwise it can only be right of mid.'),
    first
      ? L('ret', 1, 'return r', 'The leftmost x found, or -1.')
      : v === 'insert'
        ? L('miss', 1, 'return -(lo + 1)', 'Not there: x would go at index lo.')
        : L('miss', 1, 'return -1', 'Not there.'),
  ];
}

function recursiveLines(v: Variant): PseudoLine[] {
  const name = NAMES[v];
  const call = (lo: string, hi: string) => `return ${name}(A, x, ${lo}, ${hi})`;
  if (halfOpen(v)) {
    const lower = v === 'lower';
    return [
      L(
        'sig',
        0,
        `${name}(A, x, lo, hi)`,
        `The first value ${lower ? '≥' : '>'} x in A[lo..hi-1], or hi:`,
      ),
      L('base', 1, 'if lo == hi', 'If the window is empty,'),
      L('none', 2, 'return lo', 'lo is the answer.'),
      mid(1),
      L(
        'test',
        1,
        lower ? 'if A[mid] >= x' : 'if A[mid] > x',
        lower ? 'If A[mid] is at least x,' : 'If A[mid] is bigger than x,',
      ),
      L('left', 2, call('lo', 'mid'), 'the answer is mid or further left.'),
      L('right', 1, call('mid + 1', 'hi'), 'Otherwise it is further right.'),
    ];
  }
  const first = v === 'first';
  return [
    L('sig', 0, `${name}(A, x, lo, hi)`, `To find ${first ? 'the first x' : 'x'} in A[lo..hi]:`),
    L('base', 1, 'if lo > hi', 'If the window is empty,'),
    v === 'insert'
      ? L('none', 2, 'return -(lo + 1)', 'x is not there; it would go at index lo.')
      : L('none', 2, 'return -1', 'x is not there.'),
    mid(1),
    L('eq', 1, 'if A[mid] == x', 'If A[mid] is x,'),
    ...(first
      ? [
          L('rec', 2, 'r = first(A, x, lo, mid - 1)', 'look for an earlier x on the left.'),
          L('check', 2, 'if r == -1', 'If there is none,'),
          L('retmid', 3, 'return mid', 'mid is the first x.'),
          L('retr', 2, 'return r', 'Otherwise the earlier one is.'),
        ]
      : [L('found', 2, 'return mid', 'found it.')]),
    L('gt', 1, 'if A[mid] > x', 'If A[mid] is bigger than x,'),
    L('left', 2, call('lo', 'mid - 1'), 'x can only be left of mid.'),
    L('right', 1, call('mid + 1', 'hi'), 'Otherwise it can only be right of mid.'),
  ];
}

export function pseudocode(st: BinarySettings): PseudoBlock[] {
  return [
    {
      op: 'search',
      lines: st.style === 'recursive' ? recursiveLines(st.variant) : iterativeLines(st.variant),
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'sorted value')}: ${valuesOf(state).join(', ')}. Type a value and press Search, or load your own values first.`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
