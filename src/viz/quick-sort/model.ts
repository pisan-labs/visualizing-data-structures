import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsCall } from '../../layouts/bars';
import {
  doneRegions,
  loadOp,
  makeState,
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
import { partition, partitionLines, type PivotRule, type Scheme } from '../_sorting/partition';

export interface QuickSettings {
  [key: string]: Scalar;
  partition: Scheme;
  pivot: PivotRule;
  draw: Draw;
}

export const defaults: QuickSettings = { partition: 'lomuto', pivot: 'last', draw: 'bars' };

type Op = OpSpec<ArrayState, QuickSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, void, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const run = new Run(s, ['comparisons', 'swaps']);
    const start = [...run.a];
    const lomuto = settings.partition === 'lomuto';
    const stack: BarsCall[] = [];
    let maxDepth = 0;
    const calls = () => stack.map((c) => ({ ...c }));

    function* quicksort(p: number, r: number): Gen {
      stack.push({ from: p, to: r });
      const depth = stack.length - 1;
      maxDepth = Math.max(maxDepth, depth);
      const vars = () => ({ p, r, depth });
      if (p >= r) {
        if (p === r) run.done.add(p);
        yield run.step({
          say:
            p === r
              ? `quicksort(A, ${p}, ${r}): one value, so it is already in its final place.`
              : `quicksort(A, ${p}, ${r}): an empty range, nothing to do.`,
          lines: ['test'],
          level: 2,
          vars: vars(),
          extra: {
            calls: calls(),
            regions: p === r ? [{ id: 'window', from: p, to: r, tone: 'window' }] : [],
          },
        });
        stack.pop();
        return;
      }
      yield run.step({
        say: `quicksort(A, ${p}, ${r}) at depth ${depth}: partition ${span(p, r)} around a pivot.`,
        lines: ['test', 'part'],
        level: 2,
        vars: vars(),
        extra: { calls: calls(), regions: [{ id: 'window', from: p, to: r, tone: 'window' }] },
      });
      const q = yield* partition(run, p, r, settings, rng, { calls, vars });
      const [lo, hi] = lomuto ? [q - 1, q + 1] : [q, q + 1];
      yield run.step({
        say: lomuto
          ? `Partition done: ${run.v(q)} is in its final place, A[${q}]. Now sort ${lo >= p ? span(p, lo) : 'the empty left part'} and then ${hi <= r ? span(hi, r) : 'the empty right part'}.`
          : `Partition done at q = ${q}. Now sort ${span(p, q)} and then ${span(q + 1, r)}.`,
        lines: ['left', 'right'],
        level: 1,
        vars: { ...vars(), q },
        extra: {
          calls: calls(),
          regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
          pointers: [{ name: 'q', at: q, role: lomuto ? 'done' : undefined }],
        },
      });
      yield* quicksort(p, lo);
      yield* quicksort(hi, r);
      stack.pop();
    }

    if (run.n < 2) {
      for (let k = 0; k < run.n; k++) run.done.add(k);
      yield run.step({
        say: run.n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n: run.n },
      });
      return run.state();
    }
    yield* quicksort(0, run.n - 1);
    for (let k = 0; k < run.n; k++) run.done.add(k);
    yield run.step({
      say: `Sorted: ${run.a.map((x) => x.value).join(', ')}. That took ${run.tally()}, and the calls went ${plural(maxDepth, 'level')} deep.${stabilityNote(start, run.a)}`,
      lines: [],
      level: 1,
      vars: { n: run.n, maxDepth },
      extra: { regions: doneRegions(run) },
    });
    return run.state();
  },
};

export const ops = {
  load: loadOp<QuickSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: QuickSettings): PseudoBlock[] {
  const lomuto = st.partition === 'lomuto';
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'quicksort(A, p, r)', 'To quicksort A[p..r]:'),
        L('test', 1, 'if p < r', 'If there are two or more values,'),
        lomuto
          ? L('part', 2, 'q = partition(A, p, r)', 'partition them; the pivot lands at q.')
          : L('part', 2, 'q = hoarePartition(A, p, r)', 'partition them at q.'),
        lomuto
          ? L('left', 2, 'quicksort(A, p, q - 1)', 'Sort the part left of the pivot,')
          : L('left', 2, 'quicksort(A, p, q)', 'Sort the left part, A[p..q],'),
        L('right', 2, 'quicksort(A, q + 1, r)', 'then the part right of it.'),
        ...partitionLines(st),
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
