/**
 * Two pointers: an index at each end of an array, moving toward each other, each move ruling
 * out a whole row or column of candidate pairs at once. Four operations:
 *
 * - pairSum(target) on a sorted array: if A[lo] + A[hi] is too small, A[lo] is too small for
 *   every partner left (they are all at most A[hi]), so lo moves right; if too big, hi moves
 *   left. At most n − 1 pairs are checked, against n(n − 1)/2 for trying them all.
 * - maxWater: the container between two walls holds min(A[lo], A[hi]) × (hi − lo). Moving the
 *   taller wall can only make it narrower and no taller, so the shorter one moves.
 * - dedupe on a sorted array: a slow pointer marks the end of the distinct values, a fast one
 *   reads ahead; each new value is copied down to slow. Same direction, not toward each other.
 * - reverse: swap the ends and step in.
 *
 * The pairs grid (an extra on the steps of pairSum and maxWater) shows every pair (i, j) with
 * i < j: checked, ruled out without a check, or still possible (lo ≤ i < j ≤ hi).
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
  valuesOf,
  vid,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';
import { outOfOrder, sortAOp } from '../_sorting/search';
import { intArg } from '../_techniques/kit';

export interface TwoSettings {
  [key: string]: Scalar;
  draw: Draw;
}

export const defaults: TwoSettings = { draw: 'bars' };

/** The largest target a pair of values (each 0 to 99) can reach. */
export const MAX_TARGET = 198;

/** What the page starts with: ten sorted values. */
export const START = [2, 5, 9, 14, 21, 27, 33, 40, 46, 52];

export interface PairsGrid {
  lo: number;
  hi: number;
  /** Pairs whose sum (or area) was computed, in order. */
  checked: [number, number][];
  /** The pair that answers the question. */
  found?: [number, number];
  /** Pairs just ruled out by the move this step shows. */
  cut?: [number, number][];
}

export interface TwoExtra extends ArrayExtra {
  pairs?: PairsGrid;
  /** The water between walls lo and hi, at height h. `best` draws the best one so far. */
  water?: { lo: number; hi: number; h: number; best?: boolean };
}

export type TwoStep = ArrayStep & { extra?: TwoExtra };
type Op = OpSpec<ArrayState, TwoSettings, TwoExtra>;
type Gen<R = void> = Generator<TwoStep, R, void>;

export const init = (): ArrayState => makeState(START);

export const brute = (n: number) => (n * (n - 1)) / 2;

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

/** Refuse to run on an unsorted array; the step says why. */
function* needsSorted(s: ArrayState, what: string): Gen<boolean> {
  const bad = outOfOrder(s);
  if (!bad) return true;
  yield {
    state: s,
    marks: bad.marks,
    say: `${bad.say} ${what} needs sorted values, so press Sort A first.`,
    lines: [],
    level: 1,
    vars: { n: s.a.length },
  };
  return false;
}

/** Pairs (i, j) with i < j in row `i` from j = from to `to`, or in column j from i = from to to. */
const row = (i: number, from: number, to: number): [number, number][] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [i, from + k] as [number, number]);
const col = (j: number, from: number, to: number): [number, number][] =>
  Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [from + k, j] as [number, number]);

const pairId = (i: number, j: number) => `pair-${i}-${j}`;

function pointers(lo: number, hi: number, role?: { lo?: Mark['role']; hi?: Mark['role'] }) {
  const ps: BarsPointer[] = [
    { name: 'lo', at: lo, role: role?.lo },
    { name: 'hi', at: hi, role: role?.hi },
  ];
  return ps;
}

// ----- pairSum(target) -----

const pairSum: Op = {
  label: 'Pair sum',
  arity: 1,
  *run(s, [arg]) {
    const target = intArg(arg, 0, MAX_TARGET, 'The target');
    if (typeof target === 'string') {
      yield {
        state: s,
        marks: [],
        say: `No search. ${target}`,
        lines: [],
        level: 1,
        vars: { n: s.a.length },
      };
      return s;
    }
    if (!(yield* needsSorted(s, 'Two pointers for a pair sum'))) return s;
    const r = new Run(s, ['pairs checked']);
    const n = r.n;
    const total = brute(n);
    let lo = 0;
    let hi = n - 1;
    const grid: PairsGrid = { lo, hi, checked: [] };
    const snap = (more: Partial<PairsGrid> = {}): PairsGrid => ({
      lo,
      hi,
      checked: [...grid.checked],
      ...(grid.found ? { found: grid.found } : {}),
      ...more,
    });
    const vars = (more: Record<string, Scalar> = {}) => ({
      target,
      lo,
      hi,
      ...more,
      'brute force': total,
    });
    const extra = (more: Partial<PairsGrid> = {}, region = true): TwoExtra => ({
      pointers: pointers(lo, hi),
      regions:
        region && lo <= hi
          ? [{ id: 'live', from: lo, to: hi, tone: 'window', label: 'still possible' }]
          : [],
      faded: [
        ...(lo > 0 ? [{ from: 0, to: lo - 1 }] : []),
        ...(hi < n - 1 ? [{ from: hi + 1, to: n - 1 }] : []),
      ],
      pairs: snap(more),
    });

    yield r.step({
      say: `Look for two values that add up to ${target}. Start with lo = 0 and hi = ${n - 1}, the two ends: every pair, ${total} of them, is still possible.`,
      lines: ['init'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });
    while (lo < hi) {
      const [x, y] = [r.v(lo), r.v(hi)];
      const sum = x + y;
      grid.checked.push([lo, hi]);
      r.count('pairs checked');
      const both = [
        mark(r.id(lo), 'compare'),
        mark(r.id(hi), 'compare'),
        mark(pairId(lo, hi), 'compare'),
      ];
      yield r.step({
        say: `${at(lo, x)} + ${at(hi, y)} = ${sum}. Compare it with the target, ${target}.`,
        lines: ['loop', 'sum'],
        level: 2,
        marks: both,
        vars: vars({ sum }),
        extra: extra(),
      });
      if (sum === target) {
        grid.found = [lo, hi];
        const checked = r.counts['pairs checked']!;
        yield r.step({
          say: `${sum} is the target: A[${lo}] + A[${hi}] = ${target}. Found the pair after checking ${plural(checked, 'pair')}; trying every pair could take ${total}.`,
          lines: ['found'],
          level: 1,
          marks: [mark(r.id(lo), 'found'), mark(r.id(hi), 'found'), mark(pairId(lo, hi), 'found')],
          vars: vars({ sum, result: `${lo}, ${hi}` }),
          extra: extra(),
        });
        return r.state();
      }
      if (sum < target) {
        const cut = row(lo, lo + 1, hi - 1);
        const say = `${sum} < ${target}: too small. Every partner of ${at(lo, x)} still in play is at most A[${hi}], so every pair with A[${lo}] is too small. Rule out ${plural(cut.length + 1, 'pair')} at once: lo = ${lo + 1}.`;
        lo++;
        yield r.step({
          say,
          lines: ['less', 'right'],
          level: 2,
          marks: [mark(r.id(lo - 1), 'remove'), mark('ptr-lo', 'active')],
          vars: vars({ sum }),
          extra: extra({ cut }),
        });
      } else {
        const cut = col(hi, lo + 1, hi - 1);
        const say = `${sum} > ${target}: too big. Every partner of ${at(hi, y)} still in play is at least A[${lo}], so every pair with A[${hi}] is too big. Rule out ${plural(cut.length + 1, 'pair')} at once: hi = ${hi - 1}.`;
        hi--;
        yield r.step({
          say,
          lines: ['less', 'more', 'left'],
          level: 2,
          marks: [mark(r.id(hi + 1), 'remove'), mark('ptr-hi', 'active')],
          vars: vars({ sum }),
          extra: extra({ cut }),
        });
      }
    }
    const checked = r.counts['pairs checked']!;
    yield r.step({
      say:
        n < 2
          ? `A has ${plural(n, 'value')}, so there is no pair at all.`
          : `lo = hi = ${lo}: no pair is left, so no two values add up to ${target}. That took ${plural(checked, 'check')}; trying every pair takes ${total}.`,
      lines: ['loop', 'none'],
      level: 1,
      vars: vars({ result: 'none' }),
      extra: extra({}, false),
    });
    return r.state();
  },
};

// ----- maxWater -----

const maxWater: Op = {
  label: 'Most water',
  arity: 0,
  *run(s) {
    const r = new Run(s, ['pairs checked']);
    const n = r.n;
    const total = brute(n);
    let lo = 0;
    let hi = n - 1;
    let best = 0;
    let bestAt: [number, number] | null = null;
    const checked: [number, number][] = [];
    const grid = (more: Partial<PairsGrid> = {}): PairsGrid => ({
      lo,
      hi,
      checked: [...checked],
      ...more,
    });
    const vars = (more: Record<string, Scalar> = {}) => ({
      lo,
      hi,
      ...more,
      best,
      'brute force': total,
    });
    const extra = (more: Partial<PairsGrid> = {}, water?: TwoExtra['water']): TwoExtra => ({
      pointers: pointers(lo, hi),
      faded: [
        ...(lo > 0 ? [{ from: 0, to: lo - 1 }] : []),
        ...(hi < n - 1 ? [{ from: hi + 1, to: n - 1 }] : []),
      ],
      pairs: grid(more),
      ...(water ? { water } : {}),
    });

    yield r.step({
      say: `Each value is the height of a wall. Two walls hold water up to the shorter one, so A[i] and A[j] hold min(A[i], A[j]) × (j − i). Start with the widest pair, lo = 0 and hi = ${n - 1}.`,
      lines: ['winit'],
      level: 2,
      vars: vars(),
      extra: extra(),
    });
    while (lo < hi) {
      const [x, y] = [r.v(lo), r.v(hi)];
      const h = Math.min(x, y);
      const area = h * (hi - lo);
      checked.push([lo, hi]);
      r.count('pairs checked');
      const better = area > best;
      if (better) {
        best = area;
        bestAt = [lo, hi];
      }
      yield r.step({
        say: `Between ${at(lo, x)} and ${at(hi, y)}: min(${x}, ${y}) × (${hi} − ${lo}) = ${h} × ${hi - lo} = ${area}.${better ? ` The best so far.` : ` Not better than ${best}.`}`,
        lines: ['wloop', 'area', 'best'],
        level: 2,
        marks: [
          mark(r.id(lo), 'compare'),
          mark(r.id(hi), 'compare'),
          mark(pairId(lo, hi), 'compare'),
        ],
        vars: vars({ area }),
        extra: extra({}, { lo, hi, h }),
      });
      if (x < y) {
        const cut = row(lo, lo + 1, hi - 1);
        lo++;
        yield r.step({
          say: `${at(lo - 1, x)} is the shorter wall. With any closer partner it holds at most ${x} × a smaller width, so never more than ${area}. No pair with A[${lo - 1}] can beat this one: lo = ${lo}.`,
          lines: ['shorter', 'wright'],
          level: 2,
          marks: [mark(r.id(lo - 1), 'remove'), mark('ptr-lo', 'active')],
          vars: vars({ area }),
          extra: extra({ cut }),
        });
      } else {
        const cut = col(hi, lo + 1, hi - 1);
        hi--;
        yield r.step({
          say: `${at(hi + 1, y)} is ${x === y ? 'as short as the other wall' : 'the shorter wall'}. With any closer partner it holds at most ${y} × a smaller width, so never more than ${area}. No pair with A[${hi + 1}] can beat this one: hi = ${hi}.`,
          lines: ['shorter', 'welse', 'wleft'],
          level: 2,
          marks: [mark(r.id(hi + 1), 'remove'), mark('ptr-hi', 'active')],
          vars: vars({ area }),
          extra: extra({ cut }),
        });
      }
    }
    const done = bestAt
      ? (() => {
          const [i, j] = bestAt;
          const h = Math.min(r.v(i), r.v(j));
          return {
            say: `The pointers met. The most water is ${best}, between A[${i}] and A[${j}]. That took ${plural(r.counts['pairs checked']!, 'pair')}; trying every pair takes ${total}.`,
            marks: [mark(r.id(i), 'found'), mark(r.id(j), 'found'), mark(pairId(i, j), 'found')],
            extra: { ...extra({ found: bestAt }), water: { lo: i, hi: j, h, best: true } },
            result: best,
          };
        })()
      : {
          say: 'Fewer than two walls: no water at all.',
          marks: [],
          extra: extra(),
          result: 0,
        };
    yield r.step({
      say: done.say,
      lines: ['wret'],
      level: 1,
      marks: done.marks,
      vars: vars({ result: done.result }),
      extra: done.extra,
    });
    return r.state();
  },
};

// ----- dedupe: slow and fast pointers -----

const dedupe: Op = {
  label: 'Remove duplicates',
  arity: 0,
  *run(s) {
    if (!(yield* needsSorted(s, 'Removing duplicates with two pointers'))) return s;
    const r = new Run(s, ['comparisons', 'copies']);
    const n = r.n;
    let slow = 0;
    const extra = (fast?: number): TwoExtra => {
      const ps: BarsPointer[] = [{ name: 'slow', at: slow }];
      if (fast !== undefined && fast < n) ps.push({ name: 'fast', at: fast });
      const regions: BarsRegion[] = [
        { id: 'kept', from: 0, to: slow, tone: 'plain', label: 'distinct' },
      ];
      return { pointers: ps, regions };
    };
    const vars = (fast?: number) => ({ slow, ...(fast !== undefined ? { fast } : {}), n });
    yield r.step({
      say: `A is sorted, so equal values sit side by side. slow = 0 marks the last distinct value kept so far; fast reads ahead from 1.`,
      lines: ['dinit'],
      level: 2,
      vars: vars(1),
      extra: extra(1),
    });
    for (let fast = 1; fast < n; fast++) {
      const v = r.v(fast);
      const kept = r.v(slow);
      r.count('comparisons');
      if (v === kept) {
        yield r.step({
          say: `${at(fast, v)} equals A[slow] = A[${slow}] = ${kept}: a duplicate. Skip it.`,
          lines: ['dloop', 'differ'],
          level: 2,
          marks: [mark(r.id(fast), 'remove'), mark(r.id(slow), 'compare')],
          vars: vars(fast),
          extra: extra(fast),
        });
        continue;
      }
      slow++;
      if (slow === fast) {
        r.count('copies');
        yield r.step({
          say: `${at(fast, v)} differs from ${kept}: a new value. slow = ${slow}, and A[${slow}] = A[${fast}] writes ${v} onto itself.`,
          lines: ['dloop', 'differ', 'grow', 'copy'],
          level: 2,
          marks: [mark(r.id(fast), 'new')],
          vars: vars(fast),
          extra: extra(fast),
        });
        continue;
      }
      // The value moves down to slow (same uid); a stale copy stays behind at fast.
      const item = r.a[fast]!;
      r.a[slow] = item;
      r.a[fast] = { uid: r.nextUid++, value: v, stale: true };
      r.count('copies');
      yield r.step({
        say: `${at(fast, v)} differs from ${kept}: a new value. slow = ${slow}, and copy it down: A[${slow}] = ${v}.`,
        lines: ['dloop', 'differ', 'grow', 'copy'],
        level: 2,
        marks: [mark(vid(item), 'new')],
        vars: vars(fast),
        extra: extra(fast),
      });
    }
    const k = slow + 1;
    const left = n - k;
    if (left > 0) {
      yield r.step({
        say: `fast has read all of A. ${span(0, slow)} holds each value once; ${span(k, n - 1)} is left over.`,
        lines: ['dret'],
        level: 2,
        vars: vars(),
        extra: { ...extra(), faded: [{ from: k, to: n - 1 }] },
      });
    }
    const kept = r.a.slice(0, k);
    r.a = kept;
    yield r.step({
      say:
        left > 0
          ? `Return k = slow + 1 = ${k}. The caller keeps ${span(0, k - 1)} = ${valuesOf(r.state()).join(', ')} and drops the ${plural(left, 'leftover')}: ${plural(r.counts.comparisons!, 'comparison')}, one per value after the first.`
          : `Return k = ${k}: no value was repeated, so A is unchanged.`,
      lines: ['dret'],
      level: 1,
      vars: { ...vars(), result: k },
      extra: { regions: [{ id: 'kept', from: 0, to: k - 1, tone: 'done', label: 'distinct' }] },
    });
    return r.state();
  },
};

// ----- reverse -----

const reverse: Op = {
  label: 'Reverse',
  arity: 0,
  *run(s) {
    const r = new Run(s, ['swaps']);
    const n = r.n;
    let lo = 0;
    let hi = n - 1;
    const extra = (): TwoExtra => ({ pointers: pointers(lo, hi) });
    yield r.step({
      say: `Reverse A in place: swap the two ends, then step both pointers in. lo = 0, hi = ${n - 1}.`,
      lines: ['rinit'],
      level: 2,
      vars: { lo, hi, n },
      extra: extra(),
    });
    while (lo < hi) {
      const [x, y] = [r.v(lo), r.v(hi)];
      r.swap(lo, hi);
      r.count('swaps');
      yield r.step({
        say: `Swap ${at(lo, x)} and ${at(hi, y)}: ${y} moves to A[${lo}], ${x} to A[${hi}].`,
        lines: ['rloop', 'swap'],
        level: 2,
        marks: [mark(r.id(lo), 'active'), mark(r.id(hi), 'active')],
        vars: { lo, hi, n },
        extra: extra(),
      });
      lo++;
      hi--;
    }
    yield r.step({
      say:
        n < 2
          ? 'One value is already its own reverse.'
          : `lo = ${lo} and hi = ${hi} have ${lo === hi ? 'met in the middle' : 'crossed'}, so A is reversed: ${valuesOf(r.state()).join(', ')}. That took ${plural(r.counts.swaps!, 'swap')}, ⌊n/2⌋ for n = ${n}.`,
      lines: ['rloop'],
      level: 1,
      vars: { lo, hi, n },
      extra: extra(),
    });
    return r.state();
  },
};

export const ops: Record<string, Op> = {
  load: loadOp<TwoSettings>({
    ready: 'Pair sum and Remove duplicates need sorted values; Reverse and Most water take any.',
  }) as Op,
  pairSum,
  dedupe,
  reverse,
  water: maxWater,
  sort: sortAOp<TwoSettings>('two pointers') as Op,
};

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'pairSum',
      lines: [
        L(
          'sig',
          0,
          'pairSum(A, target)   // A sorted',
          'To find two values that add up to target:',
        ),
        L('init', 1, 'lo = 0; hi = n − 1', 'Point at both ends.'),
        L('loop', 1, 'while lo < hi', 'While two values are left between the pointers,'),
        L('sum', 2, 'sum = A[lo] + A[hi]', 'add the two ends.'),
        L('found', 2, 'if sum == target: return (lo, hi)', 'If that is the target, done.'),
        L('less', 2, 'if sum < target', 'If it is too small,'),
        L('right', 3, 'lo = lo + 1', 'the smaller end cannot be in any pair: move it right.'),
        L('more', 2, 'else', 'If it is too big,'),
        L('left', 3, 'hi = hi − 1', 'the bigger end cannot be in any pair: move it left.'),
        L('none', 1, 'return none', 'No pair adds up to target.'),
      ],
    },
    {
      op: 'water',
      lines: [
        L('wsig', 0, 'maxWater(A)', 'To find the two walls that hold the most water:'),
        L('winit', 1, 'lo = 0; hi = n − 1; best = 0', 'Start with the widest pair.'),
        L('wloop', 1, 'while lo < hi', 'While the walls have not met,'),
        L('area', 2, 'area = min(A[lo], A[hi]) · (hi − lo)', 'water fills up to the shorter wall.'),
        L('best', 2, 'best = max(best, area)', 'Keep the best so far.'),
        L('shorter', 2, 'if A[lo] < A[hi]', 'If the left wall is the shorter one,'),
        L('wright', 3, 'lo = lo + 1', 'it cannot do better with a closer wall: move it in.'),
        L('welse', 2, 'else', 'Otherwise the right wall is no taller,'),
        L('wleft', 3, 'hi = hi − 1', 'so move it in.'),
        L('wret', 1, 'return best', 'Hand back the most water.'),
      ],
    },
    {
      op: 'dedupe',
      lines: [
        L('dsig', 0, 'removeDuplicates(A)   // A sorted', 'To keep one copy of each value:'),
        L('dinit', 1, 'slow = 0', 'The first value is kept.'),
        L('dloop', 1, 'for fast = 1 to n − 1', 'Read every other value in turn.'),
        L('differ', 2, 'if A[fast] ≠ A[slow]', 'If it differs from the last value kept,'),
        L('grow', 3, 'slow = slow + 1', 'make room after the kept values'),
        L('copy', 3, 'A[slow] = A[fast]', 'and copy it there.'),
        L('dret', 1, 'return slow + 1', 'Hand back how many values are kept.'),
      ],
    },
    {
      op: 'reverse',
      lines: [
        L('rsig', 0, 'reverse(A)', 'To reverse A in place:'),
        L('rinit', 1, 'lo = 0; hi = n − 1', 'Point at both ends.'),
        L('rloop', 1, 'while lo < hi', 'While the pointers have not met,'),
        L('swap', 2, 'swap A[lo], A[hi]; lo = lo + 1; hi = hi − 1', 'swap the ends and step in.'),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${state.a.length} sorted values. Press Pair sum with a target such as 50, or try Reverse and Most water. Load your own values to start over.`;
}

export const initialVars = (state: ArrayState) => ({ n: state.a.length });
