import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsCall, BarsPointer, BarsRegion } from '../../layouts/bars';
import {
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  span,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
  type Item,
} from '../_sorting/kit';

export interface MergeSettings {
  [key: string]: Scalar;
  /** topdown: CLRS, recursive. bottomup: merge runs of 1, 2, 4, ... with loops. */
  style: 'topdown' | 'bottomup';
  draw: Draw;
}

export const defaults: MergeSettings = { style: 'topdown', draw: 'bars' };

type Op = OpSpec<ArrayState, MergeSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, void, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

const values = (run: Run, p: number, r: number) =>
  run.a
    .slice(p, r + 1)
    .map((x) => x.value)
    .join(', ');

/** What the view should show around a merge: the call stack (or runs) and the window. */
interface Around {
  calls: () => BarsCall[];
  vars: () => Record<string, Scalar>;
  /** Level of the step that reports a finished merge. */
  doneLevel: 1 | 2;
}

/**
 * merge(A, p, q, r): copy A[p..q] into L and A[q+1..r] into R (drawn in the aux row under
 * their old slots), then take the smaller front value back into A[k] until both are used up.
 * Values keep their uids, so they visibly travel down into L and R and back up into A.
 */
function* merge(run: Run, p: number, q: number, r: number, around: Around): Gen {
  const n = run.n;
  const aux: (Item | null)[] = Array(n).fill(null);
  for (let k = p; k <= r; k++) {
    aux[k] = run.a[k]!;
    run.a[k] = { uid: 0, value: aux[k]!.value, stale: true };
  }
  const nL = q - p + 1;
  const nR = r - q;
  let i = 0;
  let j = 0;
  let k = p;
  const label = (x: number) => String(x <= q ? x - p : x - q - 1);
  const regions = (): BarsRegion[] => [
    { id: 'window', from: p, to: r, tone: 'window' },
    { id: 'L', row: 'aux', from: p, to: q, tone: 'plain', label: 'L' },
    { id: 'R', row: 'aux', from: q + 1, to: r, tone: 'plain', label: 'R' },
  ];
  const pointers = (): BarsPointer[] => [
    { name: 'k', at: k },
    ...(i < nL ? [{ name: 'i', at: p + i, row: 'aux' }] : []),
    ...(j < nR ? [{ name: 'j', at: q + 1 + j, row: 'aux' }] : []),
  ];
  const extra = (): ArrayExtra => ({
    aux: { items: [...aux], from: p, to: r, label },
    calls: around.calls(),
    regions: regions(),
    pointers: pointers(),
  });
  const vars = () => ({ ...around.vars(), i, j, k });
  yield run.step({
    say:
      `merge(A, ${p}, ${q}, ${r}): copy ${span(p, q)} into L and ${span(q + 1, r)} into R.` +
      (run.counts.writes === 0
        ? ' The faded values left in A are old copies; merging writes over them.'
        : '') +
      ` Start with i = 0, j = 0 and k = ${p}.`,
    lines: ['copy', 'init'],
    level: 2,
    vars: vars(),
    extra: extra(),
  });

  const take = function* (fromL: boolean, why: string, lines: string[]): Gen {
    const at = fromL ? p + i : q + 1 + j;
    const item = aux[at]!;
    run.a[k] = item;
    aux[at] = { uid: 0, value: item.value, stale: true };
    run.count('writes');
    const src = fromL ? `L[${i}]` : `R[${j}]`;
    const written = k;
    if (fromL) i++;
    else j++;
    k++;
    yield run.step({
      say: `${why}A[${written}] = ${src} = ${item.value}.`,
      lines,
      level: 2,
      marks: [mark(`v${item.uid}`, 'active')],
      vars: vars(),
      extra: extra(),
    });
  };

  while (i < nL && j < nR) {
    const x = aux[p + i]!;
    const y = aux[q + 1 + j]!;
    run.count('comparisons');
    yield run.step({
      say: `Compare the front of L, L[${i}] = ${x.value}, with the front of R, R[${j}] = ${y.value}.`,
      lines: ['loop', 'cmp'],
      level: 3,
      marks: [mark(`v${x.uid}`, 'compare'), mark(`v${y.uid}`, 'compare')],
      vars: vars(),
      extra: extra(),
    });
    if (x.value <= y.value) {
      const tie =
        x.value === y.value ? ' (on a tie L goes first, which keeps the sort stable)' : '';
      yield* take(true, `${x.value} ≤ ${y.value}, so take from L${tie}: `, ['takeL', 'inc']);
    } else {
      yield* take(false, `${y.value} < ${x.value}, so take from R: `, ['takeR', 'inc']);
    }
  }
  while (i < nL) yield* take(true, 'R is used up, so copy the rest of L: ', ['restL']);
  while (j < nR) yield* take(false, 'L is used up, so copy the rest of R: ', ['restR']);
  yield run.step({
    say: `${span(p, r)} is sorted: ${values(run, p, r)}.`,
    lines: ['merge'],
    level: around.doneLevel,
    vars: { ...around.vars() },
    extra: {
      calls: around.calls(),
      regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
    },
  });
}

/** CLRS: mergeSort(A, p, r) splits at q = floor((p + r) / 2), sorts both halves, merges. */
function* topDown(run: Run): Gen {
  const stack: BarsCall[] = [];
  const calls = () => stack.map((c) => ({ ...c }));
  function* sortRange(p: number, r: number): Gen {
    stack.push({ from: p, to: r });
    const depth = stack.length - 1;
    const vars = (q?: number) => ({ p, ...(q === undefined ? {} : { q }), r, depth });
    if (p >= r) {
      yield run.step({
        say: `mergeSort(A, ${p}, ${r}): one value is already sorted, so return.`,
        lines: ['base'],
        level: 2,
        vars: vars(),
        extra: {
          calls: calls(),
          regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
        },
      });
      stack.pop();
      return;
    }
    const q = Math.floor((p + r) / 2);
    yield run.step({
      say: `mergeSort(A, ${p}, ${r}): split ${span(p, r)} at q = ${q} into ${span(p, q)} and ${span(q + 1, r)}.`,
      lines: ['base', 'mid'],
      level: 2,
      vars: vars(q),
      extra: {
        calls: calls(),
        regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
        pointers: [{ name: 'q', at: q }],
      },
    });
    yield* sortRange(p, q);
    yield* sortRange(q + 1, r);
    yield* merge(run, p, q, r, { calls, vars: () => vars(q), doneLevel: 1 });
    stack.pop();
  }
  yield* sortRange(0, run.n - 1);
}

/** Bottom-up: merge neighboring runs of width 1, 2, 4, ... until one run is left. */
function* bottomUp(run: Run): Gen {
  const n = run.n;
  for (let width = 1; width < n; width *= 2) {
    let current = 0;
    // One row of brackets for the merged runs this pass, one for the runs being merged.
    const calls = (): BarsCall[] => {
      const out: BarsCall[] = [];
      for (let s = 0, t = 0; s < n; s += 2 * width, t++) {
        const hi = Math.min(s + 2 * width, n) - 1;
        out.push({ from: s, to: hi, depth: 0, current: t === current });
        out.push({ from: s, to: Math.min(s + width, n) - 1, depth: 1, current: t === current });
        if (s + width < n) out.push({ from: s + width, to: hi, depth: 1, current: t === current });
      }
      return out;
    };
    yield run.step({
      say: `width = ${width}: A is made of sorted runs of ${plural(width, 'value')}. Merge each neighboring pair into a run of ${2 * width}.`,
      lines: width === 1 ? ['winit', 'width'] : ['width'],
      level: 2,
      vars: { width },
      extra: { calls: calls() },
    });
    for (let p = 0, t = 0; p < n; p += 2 * width, t++) {
      current = t;
      const q = Math.min(p + width, n) - 1;
      const r = Math.min(p + 2 * width, n) - 1;
      const vars = () => ({ width, p, q, r });
      if (q >= r) {
        yield run.step({
          say: `${span(p, r)} has no partner this pass, so it stays as it is.`,
          lines: ['run', 'mid', 'hi', 'merge'],
          level: 2,
          vars: vars(),
          extra: { calls: calls(), regions: [{ id: 'window', from: p, to: r, tone: 'window' }] },
        });
        continue;
      }
      yield* merge(run, p, q, r, { calls, vars, doneLevel: 2 });
    }
    yield run.step({
      say:
        2 * width >= n
          ? `width = ${width} done: one run is left, so A is sorted.`
          : `width = ${width} done: every run of ${2 * width} is sorted. ${run.a.map((x) => x.value).join(', ')}.`,
      lines: ['double'],
      level: 1,
      vars: { width },
      extra: { calls: calls() },
    });
  }
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const run = new Run(s, ['comparisons', 'writes']);
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
    yield* settings.style === 'bottomup' ? bottomUp(run) : topDown(run);
    for (let k = 0; k < run.n; k++) run.done.add(k);
    yield run.step({
      say: `Sorted: ${run.a.map((x) => x.value).join(', ')}. That took ${run.tally()}.`,
      lines: [],
      level: 1,
      vars: { n: run.n },
      extra: { regions: doneRegions(run) },
    });
    return run.state();
  },
};

export const ops = {
  load: loadOp<MergeSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

const MERGE: PseudoLine[] = [
  L('msig', 0, 'merge(A, p, q, r)', 'To merge the sorted runs A[p..q] and A[q+1..r]:'),
  L('copy', 1, 'L = A[p..q]; R = A[q+1..r]', 'Copy each run into its own array.'),
  L('init', 1, 'i = 0; j = 0; k = p', 'Start at the front of L, of R, and of the range in A.'),
  L('loop', 1, 'while i < len(L) and j < len(R)', 'While both L and R have values left,'),
  L('cmp', 2, 'if L[i] <= R[j]', 'if the front of L is not bigger,'),
  L('takeL', 3, 'A[k] = L[i]; i = i + 1', 'take it from L,'),
  L('takeR', 2, 'else A[k] = R[j]; j = j + 1', 'otherwise take the front of R,'),
  L('inc', 2, 'k = k + 1', 'and move to the next slot of A.'),
  L('restL', 1, 'while i < len(L): A[k++] = L[i++]', 'Copy what is left of L,'),
  L('restR', 1, 'while j < len(R): A[k++] = R[j++]', 'then what is left of R.'),
];

export function pseudocode(st: MergeSettings): PseudoBlock[] {
  if (st.style === 'bottomup') {
    return [
      {
        op: 'sort',
        lines: [
          L('sig', 0, 'mergeSort(A, n)', 'To merge sort the n values in A without recursion:'),
          L('winit', 1, 'width = 1', 'Every single value is a sorted run.'),
          L('width', 1, 'while width < n', 'While there is more than one run:'),
          L('run', 2, 'for p = 0 to n - 1 step 2 * width', 'for each pair of neighboring runs,'),
          L('mid', 3, 'q = min(p + width, n) - 1', 'the first run ends at q,'),
          L('hi', 3, 'r = min(p + 2 * width, n) - 1', 'the second ends at r;'),
          L('merge', 3, 'if q < r: merge(A, p, q, r)', 'merge them if there are two.'),
          L('double', 2, 'width = 2 * width', 'Runs are now twice as long.'),
          ...MERGE,
        ],
      },
    ];
  }
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'mergeSort(A, p, r)', 'To merge sort A[p..r]:'),
        L('base', 1, 'if p >= r: return', 'One value (or none) is already sorted.'),
        L('mid', 1, 'q = floor((p + r) / 2)', 'Find the middle.'),
        L('left', 1, 'mergeSort(A, p, q)', 'Sort the left half,'),
        L('right', 1, 'mergeSort(A, q + 1, r)', 'sort the right half,'),
        L('merge', 1, 'merge(A, p, q, r)', 'and merge the two sorted halves.'),
        ...MERGE,
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
