import type { PracticeKind, Settings } from '../../engine/types';
import {
  counter,
  distinct,
  list,
  load,
  milestones,
  stepsOf,
  twinKind,
  valuesAt,
  type ArrayDef,
} from '../_sorting/practice';

/** The page's indexing, chosen at random so learners meet both. */
const numbering = (zero: boolean): Settings => ({ index: zero ? 'zero' : 'one' });
const children = (s: Settings) => (s.index === 'zero' ? '2i + 1 and 2i + 2' : '2i and 2i + 1');

/**
 * Practice questions for heap sort. Every answer comes from running the model: the first
 * milestone of a sort is the end of buildMaxHeap, and each later one ends a sift-down.
 */
export function heapSortPractice(def: () => ArrayDef): PracticeKind[] {
  /** The array after the build and after each sift-down of phase 2. */
  const stages = (settings: Settings, values: number[]) =>
    milestones(stepsOf(def(), settings, [load(values), ['sort']]));

  return [
    {
      id: 'build',
      title: 'The array after buildMaxHeap',
      make(rng) {
        const settings = numbering(rng.int(0, 1) === 1);
        const values = distinct(rng, rng.int(5, 7));
        const after = valuesAt(stages(settings, values)[0]!);
        const n = values.length;
        return {
          prompt: `Phase 1 of heap sort turns A into a max-heap: maxHeapify on every node with a child, from the last one back to the root (the children of i are ${children(settings)}). Type A after phase 1.`,
          setup: [load(values)],
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `There ${Math.floor(n / 2) === 1 ? 'is 1 node' : `are ${Math.floor(n / 2)} nodes`} with a child. Sifting each one down, last first, leaves ${list(after)}: every parent is at least as big as its children.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'build-swaps',
      title: 'How many swaps to build the heap?',
      make(rng) {
        const values = distinct(rng, rng.int(6, 9));
        const built = stages({}, values)[0]!;
        const swaps = counter(built, 'swaps');
        return {
          prompt: `How many swaps does buildMaxHeap make on these ${values.length} values? Count every swap inside every maxHeapify call.`,
          setup: [load(values)],
          answer: { kind: 'number', value: swaps },
          explain: `${swaps === 0 ? 'None: every parent is already at least as big as its children.' : `${swaps}: a value moves down one level per swap, until neither child is bigger.`} The heap it builds is ${list(valuesAt(built))}.`,
          watch: [['sort']],
        };
      },
    },
    {
      id: 'first-pass',
      title: 'The array after the first swap and sift-down',
      make(rng) {
        const settings = numbering(rng.int(0, 1) === 1);
        // Start from a max-heap, so the question is about phase 2 alone.
        const heap = valuesAt(stages(settings, distinct(rng, rng.int(5, 7)))[0]!).map(Number);
        const [built, first] = stages(settings, heap);
        const after = valuesAt(first!);
        // One swap sends the root to the end; the rest are the new root's sift-down.
        const sank = counter(first!, 'swaps') - counter(built!, 'swaps') - 1;
        const root = settings.index === 'zero' ? 'A[0]' : 'A[1]';
        return {
          prompt: `A is already a max-heap. Heap sort swaps the root, ${root}, with the last value, takes that slot out of the heap and sifts the new root down. Type A after that.`,
          setup: [load(heap)],
          settings,
          answer: { kind: 'sequence', value: after },
          explain: `${heap[0]} goes to the end, where it stays. ${heap[heap.length - 1]} becomes the root and sinks ${sank === 1 ? 'one level' : `${sank} levels`}, swapping with the larger child each time. A is ${list(after)}.`,
          watch: [['sort']],
        };
      },
    },
    twinKind(def, {
      name: 'Heap sort',
      // The prompt names 0-based slots.
      settings: () => ({ index: 'zero' }),
      why: (kept) =>
        kept
          ? 'This time the swaps happened to leave them in order. Other inputs swap them: heap sort is not stable.'
          : 'The long swaps from the root to the end jump values over each other. Heap sort is not stable.',
    }),
  ];
}
