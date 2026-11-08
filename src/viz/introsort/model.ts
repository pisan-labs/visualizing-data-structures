/**
 * Introsort (Musser, 1997): quicksort that watches its own recursion depth. Each call gets a
 * depth budget, 2⌊log₂ n⌋ at the top. A part small enough goes to insertion sort; a call whose
 * budget has run out hands its part to heap sort, so the whole sort is O(n log n) even on inputs
 * built to make quicksort quadratic. Otherwise it partitions (Lomuto, median-of-3 pivot by
 * default, from the shared partition kit) and recurses with one less unit of budget.
 *
 * Sizes are tiny here (at most 20 values), so the insertion sort cutoff is a setting with a small
 * default; real libraries use 16. The killer preset is built against this exact partition by
 * McIlroy's adversary (`killer`), so it drives the depth to the limit.
 */
import type { OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsCall, BarsRegion } from '../../layouts/bars';
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
import { partition, partitionLines, type PivotRule } from '../_sorting/partition';

export interface IntroSettings {
  [key: string]: Scalar;
  pivot: 'median3' | 'last';
  /** The depth budget: 2⌊log₂ n⌋ (Musser, the C++ libraries) or ⌊log₂ n⌋. */
  depth: 'twice' | 'once';
  /** Parts of at most this many values go to insertion sort. */
  small: number;
  draw: Draw;
}

export const defaults: IntroSettings = { pivot: 'median3', depth: 'twice', small: 3, draw: 'bars' };

type Op = OpSpec<ArrayState, IntroSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, void, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

export const log2floor = (n: number): number => (n < 1 ? 0 : Math.floor(Math.log2(n)));

/** The depth budget at the top for n values. */
export const depthLimit = (n: number, st: IntroSettings): number =>
  (st.depth === 'once' ? 1 : 2) * log2floor(n);

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings, rng }) {
    const run = new Run(s, ['comparisons', 'swaps']);
    const n = run.n;
    const start = [...run.a];
    const small = Math.max(1, Math.round(settings.small));
    if (n < 2) {
      for (let k = 0; k < n; k++) run.done.add(k);
      yield run.step({
        say: n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n },
      });
      return run.state();
    }
    const top = depthLimit(n, settings);
    const stack: BarsCall[] = [];
    const calls = () => stack.map((c) => ({ ...c }));
    let maxDepth = 0;
    let heaps = 0;
    let inserts = 0;

    yield run.step({
      say: `n = ${n}, so the depth budget is ${settings.depth === 'once' ? '' : '2 × '}⌊log₂ ${n}⌋ = ${top}. Parts of at most ${plural(small, 'value')} go to insertion sort.`,
      lines: ['sig', 'start'],
      level: 2,
      vars: { n, limit: top, small },
    });

    function* insertion(p: number, r: number, vars: () => Record<string, Scalar>): Gen {
      const region = (): BarsRegion[] => [
        { id: 'part', from: p, to: r, tone: 'window', label: 'insertion sort' },
      ];
      yield run.step({
        say: `${span(p, r)} has ${plural(r - p + 1, 'value')}, at most ${small}: insertion sort it.`,
        lines: ['small', 'ins', 'isig'],
        level: 2,
        vars: vars(),
        extra: { calls: calls(), regions: region() },
      });
      for (let i = p + 1; i <= r; i++) {
        for (let j = i; j > p; j--) {
          const [x, y] = [run.v(j - 1), run.v(j)];
          run.count('comparisons');
          const pair = [mark(run.id(j - 1), 'compare'), mark(run.id(j), 'compare')];
          if (x <= y) {
            yield run.step({
              say: `${at(j - 1, x)} ≤ ${at(j, y)}: ${y} is in place.`,
              lines: ['ifor', 'iwhile'],
              level: 3,
              marks: pair,
              vars: { ...vars(), i, j },
              extra: { calls: calls(), regions: region(), pointers: [{ name: 'j', at: j }] },
            });
            break;
          }
          run.swap(j - 1, j);
          run.count('swaps');
          yield run.step({
            say: `${x} > ${y}: swap them, so ${y} moves left to A[${j - 1}].`,
            lines: ['iwhile', 'iswap'],
            level: 2,
            marks: [mark(run.id(j - 1), 'active'), mark(run.id(j), 'active')],
            vars: { ...vars(), i, j: j - 1 },
            extra: { calls: calls(), regions: region(), pointers: [{ name: 'j', at: j - 1 }] },
          });
        }
      }
      for (let k = p; k <= r; k++) run.done.add(k);
      inserts++;
      yield run.step({
        say: `${span(p, r)} is sorted: ${run.a
          .slice(p, r + 1)
          .map((x) => x.value)
          .join(', ')}. These values are in their final places.`,
        lines: ['ins'],
        level: 2,
        vars: vars(),
        extra: { calls: calls(), regions: [...doneRegions(run)] },
      });
    }

    function* heapSort(p: number, r: number, vars: () => Record<string, Scalar>): Gen {
      const m = r - p + 1;
      let size = m;
      const region = (): BarsRegion[] => [
        ...doneRegions(run),
        { id: 'part', from: p, to: p + size - 1, tone: 'window', label: 'heap' },
      ];
      const extra = (pointers: { name: string; at: number }[] = []): ArrayExtra => ({
        calls: calls(),
        regions: region(),
        pointers,
      });
      /** Sift the value at heap index i down within a heap of `size`. */
      function* siftDown(i: number): Gen {
        for (;;) {
          const l = 2 * i + 1;
          const rr = l + 1;
          if (l >= size) return;
          let big = l;
          if (rr < size) {
            run.count('comparisons');
            if (run.v(p + rr) > run.v(p + l)) big = rr;
          }
          run.count('comparisons');
          const [vi, vb] = [run.v(p + i), run.v(p + big)];
          if (vb <= vi) {
            yield run.step({
              say: `${at(p + i, vi)} is at least as big as its children, so it stays.`,
              lines: ['hsift'],
              level: 3,
              marks: [mark(run.id(p + i), 'compare'), mark(run.id(p + big), 'compare')],
              vars: vars(),
              extra: extra(),
            });
            return;
          }
          run.swap(p + i, p + big);
          run.count('swaps');
          yield run.step({
            say: `Its bigger child, ${at(p + big, vb)}, is bigger than ${vi}: swap them, and keep sifting ${vi} down.`,
            lines: ['hsift'],
            level: 3,
            marks: [mark(run.id(p + i), 'active'), mark(run.id(p + big), 'active')],
            vars: vars(),
            extra: extra(),
          });
          i = big;
        }
      }

      heaps++;
      yield run.step({
        say: `The depth budget is used up, so quicksort may be going badly here. Hand ${span(p, r)} to heap sort, which is O(m log m) whatever the input.`,
        lines: ['small', 'deep', 'heap', 'hsig'],
        level: 1,
        vars: vars(),
        extra: extra(),
      });
      for (let i = Math.floor(m / 2) - 1; i >= 0; i--) yield* siftDown(i);
      yield run.step({
        say: `${span(p, r)} is now a max-heap: its biggest value, ${run.v(p)}, is at A[${p}].`,
        lines: ['hbuild'],
        level: 2,
        marks: [mark(run.id(p), 'found')],
        vars: vars(),
        extra: extra(),
      });
      for (let end = m - 1; end >= 1; end--) {
        const big = run.v(p);
        run.swap(p, p + end);
        run.count('swaps');
        size = end;
        run.done.add(p + end);
        yield run.step({
          say: `Swap the biggest, ${big}, into A[${p + end}], its final place. The heap shrinks to ${span(p, p + end - 1)}.`,
          lines: ['hloop', 'hswap'],
          level: 2,
          marks: [mark(run.id(p + end), 'done'), mark(run.id(p), 'active')],
          vars: vars(),
          extra: extra(),
        });
        yield* siftDown(0);
      }
      run.done.add(p);
      size = 0;
      yield run.step({
        say: `Heap sort is done: ${span(p, r)} is sorted.`,
        lines: ['heap'],
        level: 2,
        vars: vars(),
        extra: extra(),
      });
    }

    function* loop(p: number, r: number, limit: number): Gen {
      if (p > r) return;
      stack.push({ from: p, to: r });
      const depth = stack.length - 1;
      maxDepth = Math.max(maxDepth, depth);
      const vars = () => ({ p, r, depth, limit });
      const size = r - p + 1;
      if (size === 1) {
        run.done.add(p);
        stack.pop();
        return;
      }
      if (size <= small) {
        yield* insertion(p, r, vars);
        stack.pop();
        return;
      }
      if (limit === 0) {
        yield* heapSort(p, r, vars);
        stack.pop();
        return;
      }
      const q = yield* partition(
        run,
        p,
        r,
        { partition: 'lomuto', pivot: settings.pivot as PivotRule },
        rng,
        {
          calls,
          vars,
          intro: {
            say: `introLoop(A, ${p}, ${r}) at depth ${depth}, budget ${limit}: ${plural(size, 'value')}, more than ${small}, so partition.`,
            lines: ['lsig', 'small', 'deep', 'part'],
          },
        },
      );
      yield run.step({
        say: `${run.v(q)} is in its final place, A[${q}]. Recurse on each side with budget ${limit - 1}.`,
        lines: ['left', 'right'],
        level: 2,
        vars: { ...vars(), q },
        extra: {
          calls: calls(),
          regions: [{ id: 'window', from: p, to: r, tone: 'window' }],
          pointers: [{ name: 'q', at: q, role: 'done' }],
        },
      });
      yield* loop(p, q - 1, limit - 1);
      yield* loop(q + 1, r, limit - 1);
      stack.pop();
    }

    yield* loop(0, n - 1, top);
    for (let k = 0; k < n; k++) run.done.add(k);
    const fallback =
      heaps === 0
        ? `The calls went ${plural(maxDepth, 'level')} deep, within the budget of ${top}, so heap sort was never needed.`
        : `The budget of ${top} ran out ${heaps === 1 ? 'once' : `${heaps} times`}, and heap sort took over ${heaps === 1 ? 'that part' : 'those parts'}.`;
    yield run.step({
      say: `Sorted: ${run.a.map((x) => x.value).join(', ')}. That took ${run.tally()}. ${fallback}${inserts ? ` Insertion sort finished ${plural(inserts, 'small part')}.` : ''}${stabilityNote(start, run.a)}`,
      lines: [],
      level: 1,
      vars: { n, limit: top, maxDepth, heapsorts: heaps },
      extra: { regions: doneRegions(run) },
    });
    return run.state();
  },
};

export const ops = {
  load: loadOp<IntroSettings>({ ready: 'Ready to sort.' }),
  sort,
};

// ----- The killer input -----

/**
 * McIlroy's adversary ("A killer adversary for quicksort", 1999) against this page's quicksort
 * with no depth limit: values start as "gas", bigger than everything; when two gas values are
 * compared, one is frozen to the next smallest solid value, preferring the pivot candidate. The
 * comparisons quicksort makes then fix an input on which it peels off as little as possible per
 * partition. Returns n distinct values from 4 to 99.
 */
export function killer(n: number, st: IntroSettings): number[] {
  const GAS = n;
  const val = Array.from({ length: n }, () => GAS);
  let solid = 0;
  let candidate = -1;
  const cmp = (x: number, y: number): number => {
    if (val[x] === GAS && val[y] === GAS) val[x === candidate ? x : y] = solid++;
    if (val[x] === GAS) candidate = x;
    else if (val[y] === GAS) candidate = y;
    return val[x]! - val[y]!;
  };
  const a = Array.from({ length: n }, (_, i) => i);
  const small = Math.max(1, Math.round(st.small));
  const swap = (i: number, j: number) => ([a[i], a[j]] = [a[j]!, a[i]!]);
  const quick = (p: number, r: number): void => {
    if (r - p + 1 <= small) {
      for (let i = p + 1; i <= r; i++)
        for (let j = i; j > p && cmp(a[j - 1]!, a[j]!) > 0; j--) swap(j - 1, j);
      return;
    }
    if (st.pivot === 'median3') {
      const mid = Math.floor((p + r) / 2);
      const c = [p, mid, r].sort((x, y) => cmp(a[x]!, a[y]!) || x - y)[1]!;
      if (c !== r) swap(c, r);
    }
    const x = a[r]!;
    let i = p - 1;
    for (let j = p; j < r; j++)
      if (cmp(a[j]!, x) <= 0) {
        i++;
        swap(i, j);
      }
    swap(i + 1, r);
    quick(p, i);
    quick(i + 2, r);
  };
  quick(0, n - 1);
  for (let k = 0; k < n; k++) if (val[k] === GAS) val[k] = solid++;
  const step = Math.max(1, Math.floor(95 / Math.max(1, n - 1)));
  return val.map((v) => 4 + v * step);
}

// ----- Pseudocode -----

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: IntroSettings): PseudoBlock[] {
  const k = Math.max(1, Math.round(st.small));
  const budget = st.depth === 'once' ? 'floor(log2 n)' : '2 * floor(log2 n)';
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'introsort(A, n)', 'To sort A[0..n-1]:'),
        L('start', 1, `introLoop(A, 0, n - 1, ${budget})`, 'run quicksort with a depth budget.'),
        L('lsig', 0, 'introLoop(A, p, r, limit)', 'To sort A[p..r] with this much budget left:'),
        L('small', 1, `if r - p + 1 <= ${k}`, `if it has at most ${k} values,`),
        L('ins', 2, 'insertionSort(A, p, r); return', 'insertion sort it and stop.'),
        L('deep', 1, 'if limit == 0', 'If the budget is used up,'),
        L('heap', 2, 'heapSort(A, p, r); return', 'heap sort it and stop.'),
        L('part', 1, 'q = partition(A, p, r)', 'Otherwise partition; the pivot lands at q.'),
        L('left', 1, 'introLoop(A, p, q - 1, limit - 1)', 'Sort the left part with one less,'),
        L('right', 1, 'introLoop(A, q + 1, r, limit - 1)', 'then the right part.'),
        ...partitionLines({ partition: 'lomuto', pivot: st.pivot as PivotRule }),
        L('isig', 0, 'insertionSort(A, p, r)', 'To insertion sort A[p..r]:'),
        L('ifor', 1, 'for i = p + 1 to r', 'take each value in turn'),
        L(
          'iwhile',
          2,
          'for j = i down to p + 1 while A[j - 1] > A[j]',
          'and while its left neighbor is bigger,',
        ),
        L('iswap', 3, 'swap A[j - 1] and A[j]', 'swap it one slot left.'),
        L('hsig', 0, 'heapSort(A, p, r)', 'To heap sort A[p..r]:'),
        L('hbuild', 1, 'build a max-heap on A[p..r]', 'arrange it as a max-heap, biggest at A[p];'),
        L('hloop', 1, 'for end = r down to p + 1', 'then, from the back,'),
        L('hswap', 2, 'swap A[p] and A[end]', 'move the biggest to the end of the heap'),
        L('hsift', 2, 'siftDown(A, p, end - 1)', 'and sift the new root down.'),
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
