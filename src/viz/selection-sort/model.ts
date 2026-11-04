import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer } from '../../layouts/bars';
import {
  at,
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  span,
  stabilityNote,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';

export interface SelectionSettings {
  [key: string]: Scalar;
  /** min: CLRS, the smallest value goes to the front. max: the largest goes to the end. */
  select: 'min' | 'max';
  draw: Draw;
}

export const defaults: SelectionSettings = { select: 'min', draw: 'bars' };

type Op = OpSpec<ArrayState, SelectionSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, ArrayState, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** If the swap of A[a] and A[b] (a < b) jumps a value over an equal one, say so. */
function unstable(r: Run, a: number, b: number): string {
  const moving = [r.v(a), r.v(b)];
  for (let k = a + 1; k < b; k++) {
    if (r.v(k) === moving[0])
      return ` The ${moving[0]} from A[${a}] jumps over the ${moving[0]} in A[${k}], so the two change order. This is why selection sort is not stable.`;
    if (r.v(k) === moving[1])
      return ` The ${moving[1]} from A[${b}] jumps over the ${moving[1]} in A[${k}], so the two change order. This is why selection sort is not stable.`;
  }
  return '';
}

function* select(r: Run, useMin: boolean): Gen {
  const n = r.n;
  const start = [...r.a];
  const word = useMin ? 'smallest' : 'largest';
  const name = useMin ? 'min' : 'max';
  for (let pass = 0; pass <= n - 2; pass++) {
    // The slot this pass fills, and the range it searches.
    const slot = useMin ? pass : n - 1 - pass;
    const from = useMin ? pass : 0;
    const to = useMin ? n - 1 : slot;
    let best = useMin ? pass : 0;
    let j = from + 1;
    const ptrs = (withJ: boolean): BarsPointer[] => [
      ...(withJ ? [{ name: 'j', at: j }] : []),
      { name, at: best, role: 'found' as const },
      { name: useMin ? 'i' : 'last', at: slot },
    ];
    const vars = (withJ: boolean): Record<string, Scalar> => ({
      [useMin ? 'i' : 'last']: slot,
      [name]: best,
      ...(withJ ? { j } : {}),
    });
    const extra = (withJ: boolean): ArrayExtra => ({
      pointers: ptrs(withJ),
      regions: doneRegions(r),
    });
    yield r.step({
      say: `Pass ${pass + 1}: find the ${word} value in ${span(from, to)}; it goes to A[${slot}]. Start with ${name} = ${best}, ${at(best, r.v(best))}.`,
      lines: ['outer', 'init'],
      level: 2,
      marks: [mark(r.id(best), 'found')],
      vars: vars(false),
      extra: extra(false),
    });
    for (j = from + 1; j <= to; j++) {
      const [x, y] = [r.v(j), r.v(best)];
      r.count('comparisons');
      const question = `Is ${at(j, x)} ${useMin ? 'smaller' : 'bigger'} than the ${word} so far, A[${name}] = ${y}?`;
      if (useMin ? x < y : x > y) {
        // A new minimum: show the question first, then the answer.
        yield r.step({
          say: question,
          lines: ['inner', 'cmp'],
          level: 3,
          marks: [mark(r.id(j), 'compare'), mark(r.id(best), 'found')],
          vars: vars(true),
          extra: extra(true),
        });
        best = j;
        yield r.step({
          say: `${x} ${useMin ? '<' : '>'} ${y}, so ${name} = ${j}. ${x} is the ${word} so far.`,
          lines: ['update'],
          level: 2,
          marks: [mark(r.id(j), 'found')],
          vars: vars(true),
          extra: extra(true),
        });
      } else {
        // Nothing changes, so the question and its answer are one step.
        yield r.step({
          say: `${question} No: ${name} stays ${best}.`,
          lines: ['inner', 'cmp'],
          level: 2,
          marks: [mark(r.id(j), 'compare'), mark(r.id(best), 'found')],
          vars: vars(true),
          extra: extra(true),
        });
      }
    }
    const [lo, hi] = [Math.min(slot, best), Math.max(slot, best)];
    const note = slot === best ? '' : unstable(r, lo, hi);
    const value = r.v(best);
    const was = r.v(slot);
    r.swap(slot, best);
    r.count('swaps');
    r.done.add(slot);
    if (pass === n - 2) r.done.add(useMin ? n - 1 : 0);
    yield r.step({
      say:
        (slot === best
          ? `${at(slot, value)} is already the ${word}, so swapping it with itself changes nothing. It is in its final place.`
          : `Swap ${at(slot, was)} with A[${name}] = ${value}. ${value} is in its final place.`) +
        note +
        (pass === n - 2
          ? ` The last value, ${at(useMin ? n - 1 : 0, r.v(useMin ? n - 1 : 0))}, is in place too.`
          : ''),
      lines: ['swap'],
      level: 1,
      marks: slot === best ? [] : [mark(r.id(slot), 'active'), mark(r.id(best), 'active')],
      vars: vars(false),
      extra: { pointers: ptrs(false), regions: doneRegions(r) },
    });
  }
  for (let k = 0; k < n; k++) r.done.add(k);
  yield r.step({
    say: `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.${stabilityNote(start, r.a)}`,
    lines: [],
    level: 1,
    vars: { n },
    extra: { regions: doneRegions(r) },
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
    return yield* select(r, settings.select === 'min');
  },
};

export const ops = {
  load: loadOp<SelectionSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: SelectionSettings): PseudoBlock[] {
  const sig = L('sig', 0, 'selectionSort(A, n)', 'To selection sort the n values in A:');
  if (st.select === 'max') {
    return [
      {
        op: 'sort',
        lines: [
          sig,
          L('outer', 1, 'for last = n - 1 downto 1', 'Fill the slots from the back.'),
          L('init', 2, 'max = 0', 'Guess that the largest value is at the front.'),
          L('inner', 2, 'for j = 1 to last', 'Look at every value up to last:'),
          L('cmp', 3, 'if A[j] > A[max]', 'if it is bigger than the largest so far,'),
          L('update', 4, 'max = j', 'remember where it is.'),
          L('swap', 2, 'swap A[last] and A[max]', 'Put the largest value in its final place.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'sort',
      lines: [
        sig,
        L('outer', 1, 'for i = 0 to n - 2', 'Fill the slots from the front.'),
        L('init', 2, 'min = i', 'Guess that the smallest value is at i.'),
        L('inner', 2, 'for j = i + 1 to n - 1', 'Look at every value after i:'),
        L('cmp', 3, 'if A[j] < A[min]', 'if it is smaller than the smallest so far,'),
        L('update', 4, 'min = j', 'remember where it is.'),
        L('swap', 2, 'swap A[i] and A[min]', 'Put the smallest value in its final place.'),
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
