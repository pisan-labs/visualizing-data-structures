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
  SORT_START,
  span,
  walk,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';

export interface BubbleSettings {
  [key: string]: Scalar;
  /** down: CLRS, j walks from the back and the smallest value moves to the front. */
  direction: 'down' | 'up';
  earlyExit: boolean;
  lastSwap: boolean;
  draw: Draw;
}

export const defaults: BubbleSettings = {
  direction: 'down',
  earlyExit: false,
  lastSwap: false,
  draw: 'bars',
};

type Op = OpSpec<ArrayState, BubbleSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, ArrayState, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/**
 * Compare one neighbor pair (lo, lo + 1) and swap it if it is out of order.
 * Yields a level-3 "compare" step and a level-2 outcome. Returns whether it swapped.
 */
function comparePair(
  r: Run,
  lo: number,
  down: boolean,
  ptrs: () => BarsPointer[],
  vars: () => Record<string, Scalar>,
  onSwap: { lines: string[]; then?: () => void },
): Generator<ArrayStep, boolean, void> {
  return compareNeighbors(r, lo, {
    back: down,
    extra: () => ({ pointers: ptrs(), regions: finalRegion(r) }),
    vars,
    lines: { compare: ['inner', 'cmp'], swap: ['swap', ...onSwap.lines] },
    onSwap: onSwap.then,
  });
}

const finalRegion = (r: Run) => doneRegions(r);

/** CLRS shape: n - 1 passes, optionally stopping after a pass with no swaps. */
function* passes(r: Run, down: boolean, early: boolean): Gen {
  const n = r.n;
  for (let i = 0; i <= n - 2; i++) {
    const fin = down ? i : n - 1 - i;
    let j = down ? n - 1 : 0;
    let swapped = false;
    const ptrs = (): BarsPointer[] =>
      down
        ? [
            { name: 'j', at: j },
            { name: 'i', at: i },
          ]
        : [{ name: 'j', at: j }];
    const vars = (): Record<string, Scalar> => ({
      i,
      j,
      ...(early ? { swapped } : {}),
    });
    yield r.step({
      say: down
        ? `Pass ${i + 1} (i = ${i}): ${walk(n - 1, i + 1)}. The smallest value in ${span(i, n - 1)} will end up in A[${i}].`
        : `Pass ${i + 1} (i = ${i}): ${walk(0, n - 2 - i)}. The largest value in ${span(0, n - 1 - i)} will end up in A[${n - 1 - i}].`,
      lines: early ? ['outer', 'reset'] : ['outer'],
      level: 2,
      vars: { i, ...(early ? { swapped } : {}) },
      extra: { pointers: down ? [{ name: 'i', at: i }] : [], regions: finalRegion(r) },
    });
    const onSwap = { lines: early ? ['flag'] : [], then: () => (swapped = true) };
    if (down) {
      for (j = n - 1; j >= i + 1; j--) yield* comparePair(r, j - 1, down, ptrs, vars, onSwap);
    } else {
      for (j = 0; j <= n - 2 - i; j++) yield* comparePair(r, j, down, ptrs, vars, onSwap);
    }
    r.done.add(fin);
    const placed = `${at(fin, r.v(fin))} is in its final place`;
    if (early && !swapped) {
      for (let k = 0; k < n; k++) r.done.add(k);
      yield r.step({
        say: `End of pass ${i + 1}: no swaps, so every neighbor pair is in order. A is sorted; stop early.`,
        lines: ['check', 'exit'],
        level: 1,
        vars: { i, swapped },
        extra: { regions: finalRegion(r) },
      });
      return yield* finish(r);
    }
    const last = i === n - 2;
    if (last) r.done.add(down ? n - 1 : 0);
    yield r.step({
      say:
        `End of pass ${i + 1}: ${placed}.` +
        (last
          ? ` The one value left, ${at(down ? n - 1 : 0, r.v(down ? n - 1 : 0))}, is in place too.`
          : early
            ? ' This pass swapped, so keep going.'
            : ''),
      lines: early ? ['check'] : ['outer'],
      level: 1,
      vars: { i, ...(early ? { swapped } : {}) },
      extra: { pointers: down ? [{ name: 'i', at: i }] : [], regions: finalRegion(r) },
    });
  }
  return yield* finish(r);
}

/** The last-swap rule: the next pass stops where this pass last swapped. */
function* lastSwapPasses(r: Run, down: boolean): Gen {
  const n = r.n;
  let pass = 0;
  if (down) {
    let start = 0;
    while (start < n - 1) {
      let last = n - 1;
      let j = n - 1;
      const ptrs = (): BarsPointer[] => [
        { name: 'j', at: j },
        { name: 'start', at: start },
        { name: 'last', at: last },
      ];
      const vars = () => ({ start, last, j });
      pass++;
      yield r.step({
        say: `Pass ${pass}: ${start === 0 ? 'nothing is final yet' : `${span(0, start - 1)} is final`}. Set last = ${n - 1} and ${walk(n - 1, start + 1)}.`,
        lines: pass === 1 ? ['init', 'outer', 'reset'] : ['outer', 'reset'],
        level: 2,
        vars: { start, last },
        extra: {
          pointers: [
            { name: 'start', at: start },
            { name: 'last', at: last },
          ],
          regions: finalRegion(r),
        },
      });
      let swapped = false;
      const onSwap = {
        lines: ['flag'],
        then: () => {
          last = j;
          swapped = true;
        },
      };
      for (j = n - 1; j >= start + 1; j--) yield* comparePair(r, j - 1, true, ptrs, vars, onSwap);
      for (let k = start; k < last; k++) r.done.add(k);
      if (last === n - 1) r.done.add(n - 1);
      const was = start;
      start = last;
      yield r.step({
        say:
          (swapped
            ? `The last swap was at j = ${last}`
            : `No swaps in this pass, so last is still ${n - 1}`) +
          `, so ${span(was, last - 1)} is final. Set start = ${last}.` +
          (start >= n - 1 ? ` Only A[${n - 1}] is left, so A is sorted.` : ''),
        lines: ['bound'],
        level: 1,
        vars: { start, last },
        extra: { pointers: [{ name: 'start', at: start }], regions: finalRegion(r) },
      });
    }
  } else {
    let end = n - 1;
    while (end > 0) {
      let last = 0;
      let j = 0;
      const ptrs = (): BarsPointer[] => [
        { name: 'j', at: j },
        { name: 'end', at: end },
        { name: 'last', at: last },
      ];
      const vars = () => ({ end, last, j });
      pass++;
      yield r.step({
        say: `Pass ${pass}: ${end === n - 1 ? 'nothing is final yet' : `${span(end + 1, n - 1)} is final`}. Set last = 0 and ${walk(0, end - 1)}.`,
        lines: pass === 1 ? ['init', 'outer', 'reset'] : ['outer', 'reset'],
        level: 2,
        vars: { end, last },
        extra: {
          pointers: [
            { name: 'end', at: end },
            { name: 'last', at: last },
          ],
          regions: finalRegion(r),
        },
      });
      let swapped = false;
      const onSwap = {
        lines: ['flag'],
        then: () => {
          last = j;
          swapped = true;
        },
      };
      for (j = 0; j <= end - 1; j++) yield* comparePair(r, j, false, ptrs, vars, onSwap);
      for (let k = last + 1; k <= end; k++) r.done.add(k);
      if (last === 0) r.done.add(0);
      const was = end;
      end = last;
      yield r.step({
        say:
          (swapped
            ? `The last swap was at j = ${last}`
            : 'No swaps in this pass, so last is still 0') +
          `, so ${span(last + 1, was)} is final. Set end = ${last}.` +
          (end <= 0 ? ' Only A[0] is left, so A is sorted.' : ''),
        lines: ['bound'],
        level: 1,
        vars: { end, last },
        extra: { pointers: [{ name: 'end', at: end }], regions: finalRegion(r) },
      });
    }
  }
  return yield* finish(r);
}

function* finish(r: Run): Gen {
  for (let k = 0; k < r.n; k++) r.done.add(k);
  yield r.step({
    say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.`,
    lines: [],
    level: 1,
    vars: { n: r.n },
    extra: { regions: finalRegion(r) },
  });
  return r.state();
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
    const down = settings.direction === 'down';
    if (settings.lastSwap) return yield* lastSwapPasses(r, down);
    return yield* passes(r, down, settings.earlyExit);
  },
};

export const ops = {
  load: loadOp<BubbleSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: BubbleSettings): PseudoBlock[] {
  const down = st.direction === 'down';
  const cmp = (indent: number) =>
    down
      ? L('cmp', indent, 'if A[j] < A[j - 1]', 'If a value is smaller than its left neighbor,')
      : L('cmp', indent, 'if A[j] > A[j + 1]', 'If a value is bigger than its right neighbor,');
  const swap = (indent: number) =>
    down
      ? L('swap', indent, 'swap A[j] and A[j - 1]', 'swap them, so the smaller one moves left.')
      : L('swap', indent, 'swap A[j] and A[j + 1]', 'swap them, so the bigger one moves right.');
  const sig = L('sig', 0, 'bubbleSort(A, n)', 'To bubble sort the n values in A:');
  if (st.lastSwap) {
    const lines = down
      ? [
          sig,
          L('init', 1, 'start = 0', 'Nothing is in its final place yet.'),
          L('outer', 1, 'while start < n - 1', 'While two or more values may be out of place:'),
          L('reset', 2, 'last = n - 1', 'Assume this pass will not swap.'),
          L(
            'inner',
            2,
            'for j = n - 1 downto start + 1',
            'Walk j from the back down to start + 1.',
          ),
          cmp(3),
          swap(4),
          L('flag', 4, 'last = j', 'Remember where the last swap was.'),
          L('bound', 2, 'start = last', 'Everything left of the last swap is final.'),
        ]
      : [
          sig,
          L('init', 1, 'end = n - 1', 'Nothing is in its final place yet.'),
          L('outer', 1, 'while end > 0', 'While two or more values may be out of place:'),
          L('reset', 2, 'last = 0', 'Assume this pass will not swap.'),
          L('inner', 2, 'for j = 0 to end - 1', 'Walk j from the front up to end - 1.'),
          cmp(3),
          swap(4),
          L('flag', 4, 'last = j', 'Remember where the last swap was.'),
          L('bound', 2, 'end = last', 'Everything right of the last swap is final.'),
        ];
    return [{ op: 'sort', lines }];
  }
  const outer = L('outer', 1, 'for i = 0 to n - 2', 'Make n - 1 passes, one for each i.');
  const inner = down
    ? L('inner', 2, 'for j = n - 1 downto i + 1', 'Walk j from the back down to i + 1.')
    : L('inner', 2, 'for j = 0 to n - 2 - i', 'Walk j from the front up to n - 2 - i.');
  if (st.earlyExit) {
    return [
      {
        op: 'sort',
        lines: [
          sig,
          outer,
          L('reset', 2, 'swapped = false', 'No swaps yet in this pass.'),
          inner,
          cmp(3),
          swap(4),
          L('flag', 4, 'swapped = true', 'Remember that this pass swapped.'),
          L('check', 2, 'if not swapped', 'If the whole pass made no swaps,'),
          L('exit', 3, 'return', 'the array is sorted: stop early.'),
        ],
      },
    ];
  }
  return [{ op: 'sort', lines: [sig, outer, inner, cmp(3), swap(4)] }];
}

export function initialSay(state: ArrayState): string {
  return `A holds ${plural(state.a.length, 'value')}: ${state.a.map((x) => x.value).join(', ')}. Sort them, or load your own (up to 20 whole numbers from 0 to 99).`;
}

export function initialVars(state: ArrayState) {
  return { n: state.a.length };
}
