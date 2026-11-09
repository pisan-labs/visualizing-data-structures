/**
 * Sliding window: a stretch A[l..r] of the array that moves right, keeping a summary of what is
 * inside (a sum, the count of each value) up to date as values enter on the right and leave on
 * the left. Each value enters once and leaves at most once, so a pass is O(n), where trying
 * every window costs O(n·k) or O(n²). Three problems:
 *
 * - fixed(k): the largest sum of k consecutive values. The window keeps its size: each slide
 *   adds A[r] and drops A[r − k].
 * - atLeast(S): the shortest window whose sum is at least S. Grow on the right until the sum is
 *   big enough, then shrink from the left while it stays big enough. Values are never negative,
 *   so shrinking can only lower the sum and growing only raise it.
 * - distinct(): the longest window with no repeated value (the "longest substring without
 *   repeating characters" problem, on numbers). Grow on the right; when the new value is a
 *   repeat, shrink from the left until it is not.
 */
import type { Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  at,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  span,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { intArg } from '../_techniques/kit';

export interface WindowSettings {
  [key: string]: Scalar;
  draw: Draw;
}

export const defaults: WindowSettings = { draw: 'cells' };

export const START = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];

/** The largest S: twenty values of 99. */
export const MAX_S = 1980;

export interface WindowExtra extends ArrayExtra {
  /** distinct(): how many times each value is in the window, by value. */
  counts?: [value: number, count: number][];
}

export type WindowStep = ArrayStep & { extra?: WindowExtra };
type Op = OpSpec<ArrayState, WindowSettings, WindowExtra>;

export const init = (): ArrayState => makeState(START);

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** The window and the best one so far, as regions; l > r draws no window. */
function regions(
  l: number,
  r: number,
  label: string,
  best?: { from: number; to: number; label?: string },
): BarsRegion[] {
  const out: BarsRegion[] = [];
  if (best && best.to >= best.from)
    out.push({
      id: 'best',
      from: best.from,
      to: best.to,
      tone: 'plain',
      label: best.label ?? 'best',
    });
  if (r >= l) out.push({ id: 'window', from: l, to: r, tone: 'window', label });
  return out;
}

function pointers(l: number, r: number, n: number): BarsPointer[] {
  const ps: BarsPointer[] = [{ name: 'l', at: Math.min(l, n) }];
  if (r >= 0) ps.push({ name: 'r', at: r });
  return ps;
}

function refuse(s: ArrayState, why: string): WindowStep {
  return {
    state: s,
    marks: [],
    say: `Nothing to do. ${why}`,
    lines: [],
    level: 1,
    vars: { n: s.a.length },
  };
}

// ----- fixed(k): the largest sum of k consecutive values -----

const fixed: Op = {
  label: 'Max sum of k',
  arity: 1,
  *run(s, [arg]) {
    const n = s.a.length;
    const k = intArg(arg, 1, n, 'k');
    if (typeof k === 'string') {
      yield refuse(s, `${k} The window must fit in A, which has ${plural(n, 'value')}.`);
      return s;
    }
    const r0 = new Run(s, ['enters', 'leaves']);
    const brute = (n - k + 1) * k;
    let sum = 0;
    let best = 0;
    let bestAt = 0;
    const vars = (l: number, r: number, more: Record<string, Scalar> = {}) => ({
      k,
      l,
      r,
      sum,
      ...more,
      'brute force': brute,
    });
    const extra = (l: number, r: number, withBest: boolean): WindowExtra => ({
      pointers: pointers(l, r, n),
      regions: regions(
        l,
        r,
        `sum = ${sum}`,
        withBest ? { from: bestAt, to: bestAt + k - 1, label: `best = ${best}` } : undefined,
      ),
    });
    for (let r = 0; r < k; r++) {
      sum += r0.v(r);
      r0.count('enters');
      yield r0.step({
        say:
          r === 0
            ? `Build the first window of k = ${k}: ${at(0, r0.v(0))} enters, sum = ${sum}.`
            : `${at(r, r0.v(r))} enters: sum = ${sum}.`,
        lines: ['first'],
        level: 3,
        marks: [mark(r0.id(r), 'new')],
        vars: vars(0, r),
        extra: extra(0, r, false),
      });
    }
    best = sum;
    yield r0.step({
      say: `The first window, ${span(0, k - 1)}, sums to ${sum}. It is the best so far.`,
      lines: ['first', 'best0'],
      level: 2,
      vars: vars(0, k - 1, { best }),
      extra: extra(0, k - 1, true),
    });
    for (let r = k; r < n; r++) {
      const l = r - k + 1;
      const inn = r0.v(r);
      const out = r0.v(r - k);
      const before = sum;
      sum += inn - out;
      r0.count('enters');
      r0.count('leaves');
      const better = sum > best;
      if (better) {
        best = sum;
        bestAt = l;
      }
      yield r0.step({
        say: `Slide right: ${at(r, inn)} enters and ${at(r - k, out)} leaves, so sum = ${before} + ${inn} − ${out} = ${sum}.${better ? ' A new best.' : ` Not better than ${best}.`}`,
        lines: ['slide', 'move', 'better'],
        level: 2,
        marks: [mark(r0.id(r), 'new'), mark(r0.id(r - k), 'remove')],
        vars: vars(l, r, { best }),
        extra: extra(l, r, true),
      });
    }
    const counts = r0.counts;
    yield r0.step({
      say: `Done. The largest sum of ${k} consecutive values is ${best}, in ${span(bestAt, bestAt + k - 1)}: an average of ${fmt(best / k)}. ${counts.enters} enters and ${counts.leaves} leaves, one each per value; adding up every window from scratch takes ${brute} additions.`,
      lines: ['ret'],
      level: 1,
      marks: Array.from({ length: k }, (_, j) => mark(r0.id(bestAt + j), 'found')),
      vars: { ...vars(bestAt, bestAt + k - 1, { best }), result: best, at: bestAt },
      extra: {
        pointers: pointers(bestAt, bestAt + k - 1, n),
        regions: [
          { id: 'best', from: bestAt, to: bestAt + k - 1, tone: 'plain', label: `best = ${best}` },
        ],
      },
    });
    return r0.state();
  },
};

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0$/, ''));

// ----- atLeast(S): the shortest window with sum ≥ S -----

const atLeast: Op = {
  label: 'Shortest sum ≥ S',
  arity: 1,
  *run(s, [arg]) {
    const S = intArg(arg, 1, MAX_S, 'S');
    if (typeof S === 'string') {
      yield refuse(s, S);
      return s;
    }
    const run = new Run(s, ['enters', 'leaves']);
    const n = run.n;
    const brute = (n * (n + 1)) / 2;
    let l = 0;
    let sum = 0;
    let best = Infinity;
    let bestAt = -1;
    const bestText = () => (best === Infinity ? 'none yet' : best);
    const vars = (r: number, more: Record<string, Scalar> = {}) => ({
      S,
      l,
      r,
      sum,
      best: bestText(),
      ...more,
      'brute force': brute,
    });
    const extra = (r: number): WindowExtra => ({
      pointers: pointers(l, r, n),
      regions: regions(
        l,
        r,
        `sum = ${sum}`,
        bestAt >= 0 ? { from: bestAt, to: bestAt + best - 1 } : undefined,
      ),
    });
    yield run.step({
      say: `Find the shortest window whose sum is at least S = ${S}. Start with an empty window: l = 0, sum = 0.`,
      lines: ['ainit'],
      level: 2,
      vars: vars(-1),
      extra: extra(-1),
    });
    for (let r = 0; r < n; r++) {
      const v = run.v(r);
      sum += v;
      run.count('enters');
      yield run.step({
        say: `${at(r, v)} enters: sum = ${sum}${sum >= S ? `, at least ${S}.` : `, still below ${S}.`}`,
        lines: ['aloop', 'grow'],
        level: 2,
        marks: [mark(run.id(r), 'new')],
        vars: vars(r),
        extra: extra(r),
      });
      while (sum >= S && l <= r) {
        const len = r - l + 1;
        const better = len < best;
        if (better) {
          best = len;
          bestAt = l;
        }
        const out = run.v(l);
        const was = sum;
        sum -= out;
        l++;
        run.count('leaves');
        yield run.step({
          say: `${span(l - 1, r)} sums to ${was} ≥ ${S}, length ${len}.${better ? ' The shortest so far.' : ''} Try shorter: ${at(l - 1, out)} leaves, sum = ${sum}.`,
          lines: ['enough', 'record', 'shrink'],
          level: 2,
          marks: [mark(run.id(l - 1), 'remove')],
          vars: vars(r),
          extra: extra(r),
        });
      }
    }
    const found = best !== Infinity;
    const { enters, leaves } = run.counts;
    yield run.step({
      say: found
        ? `Done. The shortest window with sum ≥ ${S} has length ${best}: ${span(bestAt, bestAt + best - 1)}. Each value entered once and left at most once (${enters} enters, ${leaves} leaves); trying every window takes ${brute}.`
        : `Done. Even all of A sums to ${sum} < ${S}, so no window works: return 0. ${enters} enters; trying every window takes ${brute}.`,
      lines: ['aret'],
      level: 1,
      marks: found ? Array.from({ length: best }, (_, j) => mark(run.id(bestAt + j), 'found')) : [],
      vars: { ...vars(n - 1), result: found ? best : 0 },
      extra: found
        ? {
            pointers: pointers(l, n - 1, n),
            regions: [
              { id: 'best', from: bestAt, to: bestAt + best - 1, tone: 'plain', label: 'best' },
            ],
          }
        : { pointers: pointers(l, n - 1, n), regions: regions(l, n - 1, `sum = ${sum}`) },
    });
    return run.state();
  },
};

// ----- distinct(): the longest window with no repeated value -----

const distinct: Op = {
  label: 'Longest with no repeat',
  arity: 0,
  *run(s) {
    const run = new Run(s, ['enters', 'leaves']);
    const n = run.n;
    const brute = (n * (n + 1)) / 2;
    const count = new Map<number, number>();
    let l = 0;
    let best = 0;
    let bestAt = 0;
    const counts = (): [number, number][] =>
      [...count.entries()].filter(([, c]) => c > 0).sort((a, b) => a[0] - b[0]);
    const vars = (r: number, more: Record<string, Scalar> = {}) => ({
      l,
      r,
      best,
      ...more,
      'brute force': brute,
    });
    const extra = (r: number): WindowExtra => ({
      pointers: pointers(l, r, n),
      regions: regions(
        l,
        r,
        `length = ${Math.max(0, r - l + 1)}`,
        best > 0 ? { from: bestAt, to: bestAt + best - 1 } : undefined,
      ),
      counts: counts(),
    });
    yield run.step({
      say: `Find the longest window with no value twice. count[v] says how many times v is in the window; it starts empty.`,
      lines: ['dinit'],
      level: 2,
      vars: vars(-1),
      extra: extra(-1),
    });
    for (let r = 0; r < n; r++) {
      const v = run.v(r);
      count.set(v, (count.get(v) ?? 0) + 1);
      run.count('enters');
      const repeat = count.get(v)! > 1;
      yield run.step({
        say: repeat
          ? `${at(r, v)} enters, but ${v} is already in the window: count[${v}] = ${count.get(v)}. Shrink from the left until it is not.`
          : `${at(r, v)} enters: count[${v}] = 1, no repeat.`,
        lines: ['dloop', 'add'],
        level: 2,
        marks: [
          mark(run.id(r), repeat ? 'error' : 'new'),
          mark(`count-${v}`, repeat ? 'error' : 'new'),
        ],
        vars: vars(r),
        extra: extra(r),
      });
      while (count.get(v)! > 1) {
        const out = run.v(l);
        count.set(out, count.get(out)! - 1);
        l++;
        run.count('leaves');
        const still = count.get(v)! > 1;
        yield run.step({
          say: `${at(l - 1, out)} leaves: count[${out}] = ${count.get(out)}.${still ? ` ${v} is still repeated.` : ` Now ${v} is in the window once.`}`,
          lines: ['repeat', 'drop'],
          level: 2,
          marks: [
            mark(run.id(l - 1), 'remove'),
            ...(count.get(out)! > 0 ? [mark(`count-${out}`, 'remove')] : []),
          ],
          vars: vars(r),
          extra: extra(r),
        });
      }
      const len = r - l + 1;
      if (len > best) {
        best = len;
        bestAt = l;
        yield run.step({
          say: `${span(l, r)} has no repeat and length ${len}: the longest so far.`,
          lines: ['longest'],
          level: 3,
          vars: vars(r),
          extra: extra(r),
        });
      }
    }
    const { enters, leaves } = run.counts;
    const marks: Mark[] = Array.from({ length: best }, (_, j) => mark(run.id(bestAt + j), 'found'));
    const end: WindowExtra = {
      pointers: pointers(l, n - 1, n),
      regions: [{ id: 'best', from: bestAt, to: bestAt + best - 1, tone: 'plain', label: 'best' }],
      counts: counts(),
    };
    yield run.step({
      say: `Done. The longest window with no repeated value has length ${best}: ${span(bestAt, bestAt + best - 1)}. ${enters} enters and ${leaves} leaves; checking every window takes ${brute}.`,
      lines: ['dret'],
      level: 1,
      marks,
      vars: { ...vars(n - 1), result: best, at: bestAt },
      extra: end,
    });
    return run.state();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<WindowSettings>({
    ready:
      'Type k and press Max sum of k, type S and press Shortest sum ≥ S, or press Longest with no repeat.',
  }) as Op,
  fixed,
  atLeast,
  distinct,
};

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'fixed',
      lines: [
        L('sig', 0, 'maxSum(A, k)', 'To find the largest sum of k values in a row:'),
        L('first', 1, 'sum = A[0] + … + A[k − 1]', 'Add up the first window.'),
        L('best0', 1, 'best = sum; at = 0', 'It is the best so far.'),
        L('slide', 1, 'for r = k to n − 1', 'Slide the window one step at a time:'),
        L('move', 2, 'sum = sum + A[r] − A[r − k]', 'the new value enters, the oldest leaves.'),
        L('better', 2, 'if sum > best: best = sum; at = r − k + 1', 'Keep the best window.'),
        L('ret', 1, 'return best', 'Hand back the largest sum (best / k is the average).'),
      ],
    },
    {
      op: 'atLeast',
      lines: [
        L(
          'asig',
          0,
          'shortest(A, S)   // A[i] ≥ 0',
          'To find the shortest window with sum at least S:',
        ),
        L('ainit', 1, 'l = 0; sum = 0; best = ∞', 'Start with an empty window.'),
        L('aloop', 1, 'for r = 0 to n − 1', 'Grow the window to the right:'),
        L('grow', 2, 'sum = sum + A[r]', 'A[r] enters.'),
        L('enough', 2, 'while sum ≥ S', 'While the window is big enough,'),
        L('record', 3, 'best = min(best, r − l + 1)', 'remember its length,'),
        L('shrink', 3, 'sum = sum − A[l]; l = l + 1', 'and let the leftmost value leave.'),
        L('aret', 1, 'return best (0 if ∞)', 'Hand back the shortest length found.'),
      ],
    },
    {
      op: 'distinct',
      lines: [
        L('dsig', 0, 'longestDistinct(A)', 'To find the longest window with no value twice:'),
        L('dinit', 1, 'l = 0; best = 0; count = {}', 'Start with an empty window.'),
        L('dloop', 1, 'for r = 0 to n − 1', 'Grow the window to the right:'),
        L('add', 2, 'count[A[r]] = count[A[r]] + 1', 'A[r] enters.'),
        L('repeat', 2, 'while count[A[r]] > 1', 'While A[r] is in the window twice,'),
        L('drop', 3, 'count[A[l]] = count[A[l]] − 1; l = l + 1', 'let the leftmost value leave.'),
        L('longest', 2, 'best = max(best, r − l + 1)', 'Keep the longest window.'),
        L('dret', 1, 'return best', 'Hand back its length.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}. Type a window size k such as 3 and press Max sum of k, or try the other two windows. Load your own values to start over.`;
}

export const initialVars = (state: ArrayState) => ({ n: state.a.length });
