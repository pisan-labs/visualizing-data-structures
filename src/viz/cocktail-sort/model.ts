import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer } from '../../layouts/bars';
import {
  at,
  compareNeighbors,
  doneRegions,
  loadOp,
  makeState,
  plural,
  Run,
  span,
  walk,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';

export interface CocktailSettings {
  [key: string]: Scalar;
  /** one: each pass moves its end of the window in by one. last: to where it last swapped. */
  shrink: 'one' | 'last';
  draw: Draw;
}

export const defaults: CocktailSettings = { shrink: 'one', draw: 'bars' };

export const START = [42, 17, 63, 8, 35, 91, 24, 56];

type Op = OpSpec<ArrayState, CocktailSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, ArrayState, void>;

export function init(): ArrayState {
  return makeState(START);
}

function* finish(r: Run): Gen {
  for (let k = 0; k < r.n; k++) r.done.add(k);
  yield r.step({
    say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.`,
    lines: [],
    level: 1,
    vars: { n: r.n },
    extra: { regions: doneRegions(r) },
  });
  return r.state();
}

function* shake(r: Run, toLast: boolean): Gen {
  const n = r.n;
  let lo = 0;
  let hi = n - 1;
  let j = 0;
  let swapped = false;
  let last = 0;
  let pass = 0;
  const ptrs = (withJ: boolean): BarsPointer[] => [
    ...(withJ ? [{ name: 'j', at: j }] : []),
    { name: 'lo', at: lo },
    { name: 'hi', at: hi },
  ];
  const vars = (withJ = true): Record<string, Scalar> => ({
    lo,
    hi,
    ...(withJ ? { j } : {}),
    ...(toLast ? { last } : { swapped }),
  });
  const extra = (withJ = true): ArrayExtra => ({ pointers: ptrs(withJ), regions: doneRegions(r) });

  while (lo < hi) {
    // Forward pass: the largest value in A[lo..hi] moves to A[hi].
    pass++;
    if (toLast) last = lo;
    else swapped = false;
    yield r.step({
      say: `Pass ${pass}, forward: ${walk(lo, hi - 1)}. The largest value in ${span(lo, hi)} will end up in A[${hi}].`,
      lines: pass === 1 ? ['init', 'outer', 'freset'] : ['outer', 'freset'],
      level: 2,
      vars: vars(false),
      extra: extra(false),
    });
    const fwd = {
      back: false,
      extra,
      vars,
      lines: { compare: ['fwd', 'fcmp'], stay: ['fcmp'], swap: ['fswap', 'fflag'] },
      onSwap: () => {
        swapped = true;
        last = j;
      },
    };
    let any = false;
    for (j = lo; j <= hi - 1; j++) if (yield* compareNeighbors(r, j, fwd)) any = true;
    const oldHi = hi;
    hi = toLast ? last : hi - 1;
    for (let k = hi + 1; k <= oldHi; k++) r.done.add(k);
    if (!any) {
      for (let k = 0; k < n; k++) r.done.add(k);
      yield r.step({
        say: `No swaps in the forward pass, so every neighbor pair in ${span(lo, oldHi)} is in order. A is sorted.`,
        lines: toLast ? ['fbound'] : ['fbound', 'fcheck'],
        level: 1,
        vars: vars(false),
        extra: extra(false),
      });
      return yield* finish(r);
    }
    yield r.step({
      say: toLast
        ? `The last swap was at j = ${last}, so ${span(last + 1, oldHi)} is final. Set hi = ${hi}.`
        : `End of the forward pass: ${at(oldHi, r.v(oldHi))} is in its final place. Set hi = ${hi}.`,
      lines: toLast ? ['fbound'] : ['fbound', 'fcheck'],
      level: 1,
      vars: vars(false),
      extra: extra(false),
    });
    if (lo >= hi) break;

    // Backward pass: the smallest value in A[lo..hi] moves to A[lo].
    pass++;
    if (toLast) last = hi;
    else swapped = false;
    yield r.step({
      say: `Pass ${pass}, backward: ${walk(hi, lo + 1)}. The smallest value in ${span(lo, hi)} will end up in A[${lo}].`,
      lines: ['breset'],
      level: 2,
      vars: vars(false),
      extra: extra(false),
    });
    const bwd = {
      back: true,
      extra,
      vars,
      lines: { compare: ['bwd', 'bcmp'], stay: ['bcmp'], swap: ['bswap', 'bflag'] },
      onSwap: () => {
        swapped = true;
        last = j;
      },
    };
    any = false;
    for (j = hi; j >= lo + 1; j--) if (yield* compareNeighbors(r, j - 1, bwd)) any = true;
    const oldLo = lo;
    lo = toLast ? last : lo + 1;
    for (let k = oldLo; k < lo; k++) r.done.add(k);
    if (!any) {
      for (let k = 0; k < n; k++) r.done.add(k);
      yield r.step({
        say: `No swaps in the backward pass, so every neighbor pair in ${span(oldLo, hi)} is in order. A is sorted.`,
        lines: toLast ? ['bbound'] : ['bbound', 'bcheck'],
        level: 1,
        vars: vars(false),
        extra: extra(false),
      });
      return yield* finish(r);
    }
    yield r.step({
      say: toLast
        ? `The last swap was at j = ${last}, so ${span(oldLo, last - 1)} is final. Set lo = ${lo}.`
        : `End of the backward pass: ${at(oldLo, r.v(oldLo))} is in its final place. Set lo = ${lo}.`,
      lines: toLast ? ['bbound'] : ['bbound', 'bcheck'],
      level: 1,
      vars: vars(false),
      extra: extra(false),
    });
  }
  return yield* finish(r);
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const r = new Run(s, ['comparisons', 'swaps']);
    if (r.n < 2) {
      for (let k = 0; k < r.n; k++) r.done.add(k);
      yield r.step({
        say: r.n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n: r.n },
      });
      return r.state();
    }
    return yield* shake(r, settings.shrink === 'last');
  },
};

export const ops = {
  load: loadOp<CocktailSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: CocktailSettings): PseudoBlock[] {
  const toLast = st.shrink === 'last';
  const fwd = [
    L('fwd', 2, 'for j = lo to hi - 1', 'Forward: walk j from lo up to hi - 1.'),
    L('fcmp', 3, 'if A[j] > A[j + 1]', 'If a value is bigger than its right neighbor,'),
    L('fswap', 4, 'swap A[j] and A[j + 1]', 'swap them, so the bigger one moves right.'),
  ];
  const bwd = [
    L('bwd', 2, 'for j = hi downto lo + 1', 'Backward: walk j from hi down to lo + 1.'),
    L('bcmp', 3, 'if A[j] < A[j - 1]', 'If a value is smaller than its left neighbor,'),
    L('bswap', 4, 'swap A[j] and A[j - 1]', 'swap them, so the smaller one moves left.'),
  ];
  const head = [
    L('sig', 0, 'cocktailSort(A, n)', 'To cocktail-shaker sort the n values in A:'),
    L('init', 1, 'lo = 0; hi = n - 1', 'The unsorted window is all of A.'),
    L('outer', 1, 'while lo < hi', 'While the window holds two or more values:'),
  ];
  if (toLast) {
    return [
      {
        op: 'sort',
        lines: [
          ...head,
          L('freset', 2, 'last = lo', 'Assume the forward pass will not swap.'),
          ...fwd,
          L('fflag', 4, 'last = j', 'Remember where the last swap was.'),
          L('fbound', 2, 'hi = last', 'Everything right of the last swap is final.'),
          L('breset', 2, 'last = hi', 'Assume the backward pass will not swap.'),
          ...bwd,
          L('bflag', 4, 'last = j', 'Remember where the last swap was.'),
          L('bbound', 2, 'lo = last', 'Everything left of the last swap is final.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'sort',
      lines: [
        ...head,
        L('freset', 2, 'swapped = false', 'No swaps yet in this round.'),
        ...fwd,
        L('fflag', 4, 'swapped = true', 'Remember that the pass swapped.'),
        L('fbound', 2, 'hi = hi - 1', 'The largest value is now at hi: shrink the window.'),
        L('fcheck', 2, 'if not swapped: return', 'No swaps in the forward pass? Then A is sorted.'),
        L('breset', 2, 'swapped = false', 'Start the backward pass with no swaps.'),
        ...bwd,
        L('bflag', 4, 'swapped = true', 'Remember that the pass swapped.'),
        L('bbound', 2, 'lo = lo + 1', 'The smallest value is now at lo: shrink the window.'),
        L(
          'bcheck',
          2,
          'if not swapped: return',
          'No swaps in the backward pass? Then A is sorted.',
        ),
      ],
    },
  ];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to 20 whole numbers from 0 to 99).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
