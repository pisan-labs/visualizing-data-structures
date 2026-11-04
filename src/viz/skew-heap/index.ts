import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  init,
  meldDescribe,
  meldInitialVars,
  meldOps,
  meldPseudocode,
  parseMeldInput,
  type MeldExtra,
  type MeldSettings,
  type MeldState,
} from '../leftist-heap/meld';
import { meldCodeScript, meldPractice, meldPresets } from '../leftist-heap/meld-shared';
import { meldView } from '../leftist-heap/meld-view';
import cppSource from './code/cpp/skew_heap.hpp?raw';
import javaSource from './code/java/SkewHeap.java?raw';
import pythonSource from './code/python/skew_heap.py?raw';
import explain from './explain.md?raw';
import deleteMinMerge from './examples/delete-min-merge.json';
import insertSwapsAll from './examples/insert-swaps-all.json';
import longRightPath from './examples/long-right-path.json';
import mergeTwoHeaps from './examples/merge-two-heaps.json';

export const skewHeap: VizDef<MeldState, MeldSettings, MeldExtra> = {
  id: 'skew-heap',
  title: 'Skew heap',
  family: 'Heaps and priority queues',
  blurb:
    'A leftist heap without the bookkeeping: merge along the right paths and swap the children of every node on the way, always. O(log n) amortized.',
  settings: [],
  defaults: {},
  init,
  initialSay: () =>
    'An empty skew heap: a min-heap that merges like a leftist heap but keeps no npl. Every node on the merge path swaps its children, always. Insert some keys, or merge in a second heap.',
  initialVars: (s, settings) => meldInitialVars('skew', s, settings),
  ops: meldOps('skew'),
  pseudocode: (settings) => meldPseudocode('skew', settings),
  view: meldView('skew'),
  describe: (s, settings) => meldDescribe('skew', s, settings),
  controls: {
    input: {
      label: 'Key',
      placeholder: 'e.g. 42, or a list to merge: 5 3 8',
      maxLength: 120,
      sample: '42',
      parse: parseMeldInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'deletemin', label: 'Delete min', usesInput: false },
      { op: 'merge', label: 'Merge with', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: meldPresets(),
    sizes: [7, 10, 15],
  },
  explain,
  practice: meldPractice('skew', () => skewHeap),
  complexity: [
    {
      op: 'merge(h1, h2)',
      best: {
        cost: 'O(1)',
        why: 'One heap is empty, or the winner has no right child: one call and one swap.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'Over any sequence of operations, each merge costs O(log n) on average: a long merge path swaps its heavy nodes to the left, and later merges are cheap.',
        example: 'long-right-path',
      },
      worst: {
        cost: 'O(n)',
        why: 'One merge can walk a right path that has grown to n nodes. It cannot happen often: the swaps shorten that path.',
        example: 'long-right-path',
      },
      note: 'Amortized means a bound on the total. A sequence of m operations on heaps of up to n keys costs O(m log n), however unlucky one operation is.',
    },
    {
      op: 'insert(key)',
      best: {
        cost: 'O(1)',
        why: 'A new minimum wins at once; the old heap becomes its left child.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'An insert is a merge with a one-node heap.',
        example: 'insert-swaps-all',
      },
      worst: {
        cost: 'O(n)',
        why: 'A key bigger than everything walks the whole right path, however long it is.',
        example: 'long-right-path',
      },
    },
    {
      op: 'deleteMin()',
      best: {
        cost: 'O(1)',
        why: 'The root has no right child, so its left subtree is the answer.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'One merge of the two subtrees of the root.',
        example: 'delete-min-merge',
      },
      worst: {
        cost: 'O(n)',
        why: 'The two right paths can both be long, until a merge swaps them away.',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => meldCodeScript(skewHeap, calls, settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    insertSwapsAll,
    longRightPath,
    mergeTwoHeaps,
    deleteMinMerge,
  ] as unknown as SavedExample[],
};

export default skewHeap;
