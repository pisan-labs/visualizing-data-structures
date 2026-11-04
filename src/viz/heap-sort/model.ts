import type { Level, Mark, OpSpec, PseudoBlock, PseudoLine, Scalar } from '../../engine/types';
import type { BarsPointer, BarsRegion } from '../../layouts/bars';
import { heapEdgeId } from '../../layouts/heap';
import {
  doneRegions,
  loadOp,
  makeState,
  mark,
  plural,
  Run,
  SORT_START,
  stabilityNote,
  vid,
  type ArrayExtra,
  type ArrayState,
  type ArrayStep,
  type Draw,
} from '../_sorting/kit';

export interface HeapSortSettings {
  [key: string]: Scalar;
  /**
   * one: CLRS, A[1..n], the children of i are 2i and 2i + 1.
   * zero: A[0..n − 1], the children of i are 2i + 1 and 2i + 2.
   */
  index: 'one' | 'zero';
  draw: Draw;
}

export const defaults: HeapSortSettings = { index: 'one', draw: 'bars' };

type Op = OpSpec<ArrayState, HeapSortSettings, ArrayExtra>;
type Gen = Generator<ArrayStep, void, void>;

export function init(): ArrayState {
  return makeState(SORT_START);
}

/** The region over the heap part of A; the view reads heapSize from it. */
export const HEAP_REGION = 'heap';

/** The working array, the heap's size and the page's index convention for one sort. */
class Sorter {
  readonly r: Run;
  readonly base: number;
  heapSize: number;
  /** heapSort's loop variable during phase 2 (a 0-based slot), or -1. */
  last = -1;

  constructor(s: ArrayState, settings: HeapSortSettings) {
    this.r = new Run(s, ['comparisons', 'swaps']);
    this.base = settings.index === 'zero' ? 0 : 1;
    this.heapSize = this.r.n;
  }

  /** The index a learner sees for 0-based slot p. */
  ix(p: number): number {
    return p + this.base;
  }

  /** "A[3] = 8". */
  at(p: number): string {
    return `A[${this.ix(p)}] = ${this.r.v(p)}`;
  }

  /** "A[2..5]", or "A[2]" for one slot. */
  span(lo: number, hi: number): string {
    return lo === hi ? `A[${this.ix(lo)}]` : `A[${this.ix(lo)}..${this.ix(hi)}]`;
  }

  regions(): BarsRegion[] {
    const heap: BarsRegion[] =
      this.heapSize > 0
        ? [
            {
              id: HEAP_REGION,
              from: 0,
              to: this.heapSize - 1,
              tone: 'window',
              // Two short labels in one lane: leave the heap's out when it is one slot wide.
              label: this.heapSize >= 2 ? 'heap' : undefined,
            },
          ]
        : [];
    return [...heap, ...doneRegions(this.r)];
  }

  step(
    say: string,
    lines: string[],
    level: Level,
    marks: Mark[],
    pointers: BarsPointer[],
    vars: Record<string, Scalar> = {},
  ): ArrayStep {
    return this.r.step({
      say,
      lines,
      level,
      marks,
      vars: {
        heapSize: this.heapSize,
        ...(this.last >= 0 ? { last: this.ix(this.last) } : {}),
        ...vars,
      },
      extra: { pointers, regions: this.regions() },
    });
  }
}

const ptr = (name: string, at: number, role?: BarsPointer['role']): BarsPointer => ({
  name,
  at,
  ...(role ? { role } : {}),
});

/**
 * How the last step of a maxHeapify call looks: its level, and a sentence to add. The sentence
 * is made when that step is, so it can name the root the sift leaves behind.
 */
interface Finish {
  level: Level;
  say?: () => string;
}

/**
 * maxHeapify(A, start) as in CLRS: compare the value with its children, swap it with the larger
 * child if that child is bigger, and carry on from there (the recursive call, as a loop). Every
 * comparison is a level-3 step and every swap a level-2 step. The step where the value stops
 * takes `finish`; landing on a leaf decides nothing, so that one is level 3 unless it ends a
 * phase (level 1).
 */
function* maxHeapify(c: Sorter, start: number, finish: Finish): Gen {
  const { r } = c;
  let p = start;
  for (;;) {
    const x = r.a[p]!;
    const n = c.heapSize;
    const l = 2 * p + 1;
    const rr = 2 * p + 2;
    const call = `maxHeapify(A, ${c.ix(p)})`;
    const vars = (largest: number) => ({
      i: c.ix(p),
      l: c.ix(l),
      r: c.ix(rr),
      largest: c.ix(largest),
    });
    if (l >= n) {
      // Only a recursive call lands on a leaf: every first call is on a node with a child. There
      // is nothing to decide, so it is fine detail unless it ends a phase.
      yield c.step(
        `${call}: l = ${c.ix(l)} is past the heap's last slot, A[${c.ix(n - 1)}], so ${x.value} has no children. It stays at A[${c.ix(p)}].${finish.say?.() ?? ''}`,
        ['mh.lr', 'mh.cmpL', 'mh.else', 'mh.cmpR', 'mh.check'],
        finish.level === 1 ? 1 : 3,
        [mark(vid(x), 'found')],
        [ptr('i', p)],
        vars(p),
      );
      return;
    }

    let b = p;
    const lv = r.v(l);
    r.count('comparisons');
    if (lv > x.value) b = l;
    const noRight =
      rr >= n ? ` r = ${c.ix(rr)} is past the heap's last slot, so there is no right child.` : '';
    yield c.step(
      `${call}: l = ${c.ix(l)} and r = ${c.ix(rr)}. Is A[${c.ix(l)}] = ${lv} bigger than A[${c.ix(p)}] = ${x.value}? ${lv > x.value ? 'Yes' : 'No'}, so largest = ${c.ix(b)}.${noRight}`,
      ['mh.lr', 'mh.cmpL', b === l ? 'mh.setL' : 'mh.else', ...(rr >= n ? ['mh.cmpR'] : [])],
      3,
      [mark(vid(x), 'active'), mark(r.id(l), 'compare')],
      [ptr('i', p)],
      vars(b),
    );
    if (rr < n) {
      const prev = b;
      const rv = r.v(rr);
      const bv = r.v(prev);
      r.count('comparisons');
      const won = rv > bv;
      if (won) b = rr;
      yield c.step(
        `Is A[${c.ix(rr)}] = ${rv} bigger than A[largest] = ${bv}? ${won ? `Yes, so largest = ${c.ix(rr)}` : `No, so largest stays ${c.ix(prev)}`}.`,
        won ? ['mh.cmpR', 'mh.setR'] : ['mh.cmpR'],
        3,
        // Both values in the comparison: A[r], and A[largest] (A[i] itself, or the left child).
        [
          mark(vid(x), 'active'),
          mark(r.id(rr), 'compare'),
          ...(prev === p ? [] : [mark(r.id(prev), 'compare')]),
        ],
        [ptr('i', p)],
        vars(b),
      );
    }

    const kids = [l, rr].filter((q) => q < n);
    const has = kids.length === 1 ? `one child, ${lv}` : `children ${lv} and ${r.v(rr)}`;
    const kidMarks = kids.map((q) => mark(r.id(q), 'compare'));
    if (b === p) {
      yield c.step(
        `${call}: A[${c.ix(p)}] = ${x.value} has ${has}. ${kids.length === 1 ? 'It is not' : 'Neither is'} bigger than ${x.value}, so largest = i and ${x.value} stays at A[${c.ix(p)}].${finish.say?.() ?? ''}`,
        ['mh.check'],
        finish.level,
        [mark(vid(x), 'found'), ...kidMarks],
        [ptr('i', p)],
        vars(p),
      );
      return;
    }
    const y = r.a[b]!;
    const why =
      kids.length === 1
        ? `That child, ${y.value} at A[${c.ix(b)}], is bigger than ${x.value}`
        : lv === r.v(rr)
          ? `They tie, and a tie goes to the left child, A[${c.ix(b)}]. ${y.value} is bigger than ${x.value}`
          : `The larger is ${y.value} at A[${c.ix(b)}], and it is bigger than ${x.value}`;
    r.swap(p, b);
    r.count('swaps');
    yield c.step(
      `${call}: A[${c.ix(p)}] = ${x.value} has ${has}. ${why}, so swap them. ${x.value} moves down to A[${c.ix(b)}], and maxHeapify(A, ${c.ix(b)}) carries on from there.`,
      ['mh.check', 'mh.swap', 'mh.rec'],
      2,
      [mark(vid(x), 'active'), mark(vid(y), 'visit'), mark(heapEdgeId(b), 'active')],
      [ptr('i', p)],
      vars(b),
    );
    p = b;
  }
}

/** "A[8] holds the largest value" or "A[6..8] hold the 3 largest values, in order". */
function sortedPart(c: Sorter, from: number): string {
  const n = c.r.n;
  const k = n - from;
  return k === 1
    ? `${c.span(from, n - 1)} holds the largest value`
    : `${c.span(from, n - 1)} hold the ${k} largest values, in order`;
}

function* heapSort(c: Sorter): Gen {
  const { r } = c;
  const n = r.n;
  const start = [...r.a];

  // Phase 1: buildMaxHeap.
  const lastParent = Math.floor(n / 2) - 1;
  const leaves = Array.from({ length: n - lastParent - 1 }, (_, k) => lastParent + 1 + k);
  yield c.step(
    `Phase 1: turn A into a max-heap, in place. heapSize = ${n}. ${c.span(lastParent + 1, n - 1)} ${leaves.length === 1 ? 'is a leaf' : 'are leaves'}, and a leaf on its own is already a heap. So sift down the others, from A[${c.ix(lastParent)}] back to the root, A[${c.ix(0)}].`,
    ['build', 'bh.size'],
    2,
    leaves.map((p) => mark(r.id(p), 'visit')),
    [ptr('i', lastParent)],
    { i: c.ix(lastParent) },
  );
  for (let i = lastParent; i >= 0; i--) {
    const l = 2 * i + 1;
    const below =
      l + 1 < n
        ? 'The subtrees under it are heaps already'
        : `Its only child, A[${c.ix(l)}], is a leaf`;
    yield c.step(
      `i = ${c.ix(i)}: maxHeapify(A, ${c.ix(i)}) sifts ${r.v(i)} down. ${below}, so afterwards the whole subtree at A[${c.ix(i)}] is a heap.`,
      ['bh.loop', 'bh.call'],
      2,
      [mark(r.id(i), 'active')],
      [ptr('i', i)],
      { i: c.ix(i) },
    );
    yield* maxHeapify(
      c,
      i,
      i === 0
        ? {
            level: 1,
            say: () =>
              ` That ends maxHeapify(A, ${c.ix(0)}), the call for the root, so A is now a max-heap: every parent is at least as big as its children, and the largest value, ${r.v(0)}, is at the root. Building it took ${r.tally()}.`,
          }
        : { level: 2 },
    );
  }

  // Phase 2: move the largest value to the end, shrink the heap, fix the root.
  for (let L = n - 1; L >= 1; L--) {
    c.last = L;
    const top = r.a[0]!;
    const low = r.a[L]!;
    r.swap(0, L);
    r.count('swaps');
    yield c.step(
      `${L === n - 1 ? 'Phase 2: sort. ' : ''}The root, ${top.value}, is the largest value in the heap. Swap it with A[last] = A[${c.ix(L)}] = ${low.value}, the heap's last value.`,
      ['loop', 'swap'],
      2,
      [mark(vid(top), 'remove'), mark(vid(low), 'active')],
      [ptr('last', L)],
    );
    c.heapSize = L;
    r.done.add(L);
    if (L === 1) {
      yield c.step(
        `heapSize = 1: ${top.value} leaves the heap and is in its final place, A[${c.ix(1)}]. The one value left in the heap, ${r.v(0)}, is the smallest, so maxHeapify(A, ${c.ix(0)}) has nothing to do.`,
        ['shrink', 'heapify'],
        2,
        [mark(vid(low), 'found')],
        [ptr('last', L)],
      );
      break;
    }
    yield c.step(
      `heapSize = ${L}: ${top.value} leaves the heap and is in its final place, A[${c.ix(L)}]. The new root, ${low.value}, came from the bottom of the heap and is probably too small: sift it down.`,
      ['shrink', 'heapify'],
      2,
      [mark(vid(low), 'active')],
      [ptr('last', L)],
    );
    yield* maxHeapify(c, 0, {
      level: 1,
      say: () =>
        ` The heap, ${c.span(0, L - 1)}, is a max-heap again with ${r.v(0)} at the root, and ${sortedPart(c, L)}.`,
    });
  }

  c.last = -1;
  c.heapSize = 0;
  for (let k = 0; k < n; k++) r.done.add(k);
  yield c.step(
    `Sorted: ${r.a.map((x) => x.value).join(', ')}. That took ${r.tally()}.${stabilityNote(start, r.a)}`,
    [],
    1,
    [],
    [],
    { n },
  );
}

const sort: Op = {
  label: 'Sort',
  arity: 0,
  *run(s, _args, { settings }) {
    const c = new Sorter(s, settings);
    const { r } = c;
    if (r.n < 2) {
      for (let k = 0; k < r.n; k++) r.done.add(k);
      yield r.step({
        say: r.n === 1 ? 'A has one value, so it is already sorted.' : 'A is empty.',
        lines: ['sig'],
        level: 1,
        vars: { n: r.n },
        extra: { regions: doneRegions(r) },
      });
      return r.state();
    }
    yield* heapSort(c);
    return r.state();
  },
};

export const ops = {
  load: loadOp<HeapSortSettings>({ ready: 'Ready to sort.' }),
  sort,
};

const L = (id: string, indent: number, text: string, plain: string): PseudoLine => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(st: HeapSortSettings): PseudoBlock[] {
  const one = st.index !== 'zero';
  const root = one ? '1' : '0';
  const inHeap = (v: string) => (one ? `${v} ≤ heapSize` : `${v} < heapSize`);
  return [
    {
      op: 'sort',
      lines: [
        L('sig', 0, 'heapSort(A, n)', 'To heap sort the n values in A:'),
        L('build', 1, 'buildMaxHeap(A, n)', 'turn A into a max-heap, in place.'),
        L(
          'loop',
          1,
          one ? 'for last = n downto 2' : 'for last = n − 1 downto 1',
          'Then fill the slots from the back:',
        ),
        L('swap', 2, `swap A[${root}] and A[last]`, 'move the largest value, the root, there,'),
        L('shrink', 2, 'heapSize = heapSize − 1', 'take that slot out of the heap,'),
        L('heapify', 2, `maxHeapify(A, ${root})`, 'and sift the new root down.'),
        L('bh.sig', 0, 'buildMaxHeap(A, n)', 'To build a max-heap:'),
        L('bh.size', 1, 'heapSize = n', 'the heap starts as the whole array.'),
        L(
          'bh.loop',
          1,
          one ? 'for i = ⌊n/2⌋ downto 1' : 'for i = ⌊n/2⌋ − 1 downto 0',
          'From the last node with a child back to the root,',
        ),
        L('bh.call', 2, 'maxHeapify(A, i)', 'sift each value down.'),
        L('mh.sig', 0, 'maxHeapify(A, i)', 'To sift the value in A[i] down:'),
        L(
          'mh.lr',
          1,
          one ? 'l = 2i; r = 2i + 1' : 'l = 2i + 1; r = 2i + 2',
          'find its two children.',
        ),
        L(
          'mh.cmpL',
          1,
          `if ${inHeap('l')} and A[l] > A[i]`,
          'If the left child is in the heap and bigger,',
        ),
        L('mh.setL', 2, 'largest = l', 'it is the largest so far;'),
        L('mh.else', 1, 'else largest = i', 'otherwise A[i] is.'),
        L(
          'mh.cmpR',
          1,
          `if ${inHeap('r')} and A[r] > A[largest]`,
          'If the right child is in the heap and bigger still,',
        ),
        L('mh.setR', 2, 'largest = r', 'it is the largest.'),
        L('mh.check', 1, 'if largest ≠ i', 'If a child is bigger than A[i],'),
        L('mh.swap', 2, 'swap A[i] and A[largest]', 'swap the two'),
        L('mh.rec', 2, 'maxHeapify(A, largest)', 'and keep sifting down from there.'),
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
