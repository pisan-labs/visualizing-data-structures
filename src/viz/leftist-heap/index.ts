import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/leftist_heap.hpp?raw';
import javaSource from './code/java/LeftistHeap.java?raw';
import pythonSource from './code/python/leftist_heap.py?raw';
import explain from './explain.md?raw';
import deleteMinMerge from './examples/delete-min-merge.json';
import descendingChain from './examples/descending-chain.json';
import insertSwaps from './examples/insert-swaps.json';
import mergeTwoHeaps from './examples/merge-two-heaps.json';
import rankConvention from './examples/rank-convention.json';
import { init, parseMeldInput, type MeldExtra, type MeldState } from './meld';
import { meldCodeScript, meldPractice, meldPresets } from './meld-shared';
import {
  defaults,
  describe,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  type LeftistSettings,
} from './model';

export const leftistHeap: VizDef<MeldState, LeftistSettings, MeldExtra> = {
  id: 'leftist-heap',
  title: 'Leftist heap',
  family: 'Heaps and priority queues',
  blurb:
    'A min-heap built for merging: two heaps merge along their short right paths, and a child swap on the way back up keeps the right side short.',
  settings: [
    {
      kind: 'choice',
      key: 'npl',
      label: 'Null path length of an empty tree',
      options: [
        { value: '-1', label: 'npl(nil) = −1, so a leaf has 0 (Weiss)' },
        { value: '0', label: 'npl(nil) = 0, so a leaf has 1 (rank, s-value)' },
      ],
      help: 'Only the numbers change. The heap and every swap stay the same.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe,
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
  practice: meldPractice('leftist', () => leftistHeap),
  complexity: [
    {
      op: 'merge(h1, h2)',
      best: {
        cost: 'O(1)',
        why: 'One heap is empty, or its root wins and the other heap drops straight into an empty right spot.',
      },
      average: {
        cost: 'O(log n)',
        why: 'The merge only walks the two right paths, and each one is short.',
        example: 'merge-two-heaps',
      },
      worst: {
        cost: 'O(log n)',
        why: 'A right path with r nodes needs at least 2^r − 1 nodes in the tree, so it has at most log₂(n + 1) nodes. Two such paths, one step each.',
        example: 'merge-two-heaps',
      },
      note: 'The height can be n − 1 (insert keys in descending order). Only the right path is sure to be short, and the right path is all a merge walks.',
    },
    {
      op: 'insert(key)',
      best: {
        cost: 'O(1)',
        why: 'A new minimum wins at once; the whole old heap becomes its left child.',
        example: 'descending-chain',
      },
      average: { cost: 'O(log n)', why: 'A merge with a one-node heap: part of one right path.' },
      worst: {
        cost: 'O(log n)',
        why: 'A key bigger than everything on the right path walks all of it.',
        example: 'insert-swaps',
      },
    },
    {
      op: 'deleteMin()',
      best: {
        cost: 'O(1)',
        why: 'The root has no right child, so its left subtree is the answer.',
        example: 'descending-chain',
      },
      average: { cost: 'O(log n)', why: 'One merge of the two subtrees of the root.' },
      worst: {
        cost: 'O(log n)',
        why: 'The merge walks both right paths to the bottom.',
        example: 'delete-min-merge',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      meldCodeScript(
        leftistHeap as unknown as VizDef<MeldState, Settings, MeldExtra>,
        calls,
        settings,
      ),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    insertSwaps,
    mergeTwoHeaps,
    deleteMinMerge,
    descendingChain,
    rankConvention,
  ] as unknown as SavedExample[],
};

export default leftistHeap;
