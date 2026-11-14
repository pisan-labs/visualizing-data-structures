import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  formatLists,
  listName,
  type MergeExtra,
  type MergeSettings,
  type MergeState,
} from './model';

type Def = VizDef<MergeState, MergeSettings, MergeExtra>;

const load = (lists: number[][]): OpCall => ['load', formatLists(lists)];

/** k sorted lists of distinct values from 1 to 40, 2 to 4 values each. */
function someLists(rng: Rng, k: number): number[][] {
  const pool = Array.from({ length: 40 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  let at = 0;
  return Array.from({ length: k }, () => {
    const len = rng.int(2, 3);
    const l = pool.slice(at, at + len).sort((x, y) => x - y);
    at += len;
    return l;
  });
}

/**
 * Our own problem statements, for "spot it": some that call for a heap of heads, and some that
 * look alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Five sorted files of customer ids are too big to load at once. Write one sorted file with all of them.',
    pattern: 'k-way-merge',
    cue: ['five sorted files', 'too big to load at once', 'one sorted file'],
    why: 'Keep only the five current heads in a min-heap: the root is the next id to write, and its file supplies the next head.',
    near: ['top-k', 'merge-intervals', 'two-heaps-median'],
    alsoFits: ['merge-sorted-lists'],
  },
  {
    problem:
      'Eight shops each list their prices from lowest to highest. Find the 10 lowest prices across all the shops.',
    pattern: 'k-way-merge',
    cue: ['each list', 'from lowest to highest', 'across all'],
    why: 'The lists are already sorted, so a heap of the eight heads hands out the lowest prices in order; stop after 10.',
    near: ['two-heaps-median', 'binary-search'],
    alsoFits: ['top-k'],
  },
  {
    problem:
      'In a grid of numbers, every row is sorted from left to right. Find the 7th smallest number in the grid.',
    pattern: 'k-way-merge',
    cue: ['every row is sorted', '7th smallest'],
    why: 'Each row is a sorted list: put the first of each row in a min-heap and take the root 7 times.',
    near: ['two-heaps-median', 'matrix-traversal'],
    alsoFits: ['binary-search-answer', 'top-k'],
  },
  {
    problem:
      'Three sensors each record events in time order. Produce one record of all the events in time order.',
    pattern: 'k-way-merge',
    cue: ['each record events in time order', 'one record'],
    why: 'Several sorted streams into one: a heap of the three next events picks the earliest, again and again.',
    near: ['top-k', 'sweep-line'],
    alsoFits: ['merge-sorted-lists'],
  },
  {
    problem:
      'An unsorted list of a million exam scores. Report the 10 highest scores.',
    pattern: 'top-k',
    cue: ['unsorted', 'the 10 highest'],
    why: 'One list, not sorted: keep a min-heap of the 10 best so far and let each score challenge its root.',
    near: ['k-way-merge', 'two-heaps-median'],
  },
  {
    problem:
      'Readings arrive from a sensor one at a time. After each reading, report the median of all readings so far.',
    pattern: 'two-heaps-median',
    cue: ['one at a time', 'after each reading', 'the median'],
    why: 'A max-heap of the low half and a min-heap of the high half keep the middle at their tops.',
    near: ['k-way-merge', 'top-k'],
  },
  {
    problem:
      'A list of meetings, each with a start and an end time. Combine the ones that overlap and report the busy stretches.',
    pattern: 'merge-intervals',
    cue: ['start and an end time', 'combine the ones that overlap'],
    why: 'Intervals, not values: sort by start and extend the current stretch while the next meeting overlaps it.',
    near: ['k-way-merge', 'top-k'],
    alsoFits: ['sweep-line'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function mergePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: MergeSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  /** The pattern's steps on these lists, and the last step after m values went out. */
  function after(lists: number[][], m: number) {
    const steps = run([load(lists), ['merge']]).entries.at(-1)!.steps;
    const settled = steps.filter((s) => s.extra?.out?.length === m && s.level < 3).at(-1)!;
    return { steps, settled };
  }

  return [
    {
      id: 'next-out',
      title: 'The next value out',
      make(rng) {
        const lists = someLists(rng, rng.int(3, 4));
        const n = lists.flat().length;
        const m = rng.int(2, n - 2);
        const { settled } = after(lists, m);
        const root = settled.extra!.heap![0]!;
        const out = settled.extra!.out!.map((x) => x.key);
        return {
          prompt: `Merge these lists with a heap of heads. After ${m} values have gone out (${out.join(' ')}), which value goes out next?`,
          setup: [load(lists)],
          answer: { kind: 'number', value: root.key },
          explain: `After ${out.join(' ')}, the heap holds each list’s first value not yet taken: ${settled
            .extra!.heap!.map((x) => `${x.key} (${listName(x.src ?? 0)})`)
            .join(', ')}. The root, ${root.key} from ${listName(root.src ?? 0)}, is the smallest of them, so it goes out next.`,
          watch: [['merge']],
        };
      },
    },
    {
      id: 'heap-after',
      title: 'The heap after a step',
      make(rng) {
        const lists = someLists(rng, rng.int(3, 4));
        const n = lists.flat().length;
        const m = rng.int(1, n - 3);
        const { settled } = after(lists, m);
        const heap = settled.extra!.heap!;
        return {
          prompt: `Merge these lists with a heap of heads (a min-heap; equal values never occur here). After ${m} ${m === 1 ? 'value has' : 'values have'} gone out and the heap has settled, what does it hold? Type its array from the root on, level by level.`,
          setup: [load(lists)],
          answer: { kind: 'sequence', value: heap.map((x) => String(x.key)) },
          explain: `The heap holds one value from each list that still has any: ${heap
            .map((x) => `${x.key} (${listName(x.src ?? 0)})`)
            .join(', ')}, root first. Each time the root went out, its list’s next value took the root’s place and sank below any smaller child.`,
          watch: [['merge']],
        };
      },
    },
    spotItKind({ page: 'k-way-merge', rows: SPOT_ROWS, watch: [['merge']] }),
  ];
}
