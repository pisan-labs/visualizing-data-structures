import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/binomial_queue.hpp?raw';
import javaSource from './code/java/BinomialQueue.java?raw';
import pythonSource from './code/python/binomial_queue.py?raw';
import explain from './explain.md?raw';
import decreaseBubble from './examples/decrease-bubble.json';
import deleteMinChildren from './examples/delete-min-children.json';
import insertCarries from './examples/insert-carries.json';
import pointersView from './examples/pointers-view.json';
import unionBinary from './examples/union-binary.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseQueueInput,
  pseudocode,
  type BinExtra,
  type BinSettings,
  type BinState,
} from './model';
import { binomialPractice } from './practice';
import { view } from './view';

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);
const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);

export const binomialQueue: VizDef<BinState, BinSettings, BinExtra> = {
  id: 'binomial-queue',
  title: 'Binomial queue',
  family: 'Heaps and priority queues',
  blurb:
    'A min-heap kept as a list of binomial trees, one for each 1 bit of n. Union is binary addition: two trees of the same size link into one, a carry.',
  settings: [
    {
      kind: 'choice',
      key: 'view',
      label: 'Draw the trees',
      options: [
        { value: 'logical', label: 'As trees (logical view)' },
        { value: 'internal', label: 'As pointers: leftmost child, next sibling (internal view)' },
      ],
      help: 'The internal view shows the fields CLRS keeps in every node: child, sibling and degree.',
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
      parse: parseQueueInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'findmin', label: 'Find min', usesInput: false },
      { op: 'deletemin', label: 'Delete min', usesInput: false },
      { op: 'merge', label: 'Merge with', usesInput: true },
      {
        op: 'decrease',
        label: 'Decrease key',
        usesInput: true,
        args: ['a key', 'its new, smaller key'],
        more: true,
      },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinct(rng, n)) },
      { label: 'Ascending', make: (rng, n) => inserts(asc(distinct(rng, n))) },
      { label: 'Descending', make: (rng, n) => inserts(asc(distinct(rng, n)).reverse()) },
      {
        label: 'Many duplicates',
        make: (rng, n) => inserts(Array.from({ length: n }, () => 10 * rng.int(1, 4))),
      },
      {
        label: 'Two queues, merged',
        make: (rng, n) => {
          const keys = distinct(rng, n);
          const half = Math.ceil(n / 2);
          return [...inserts(keys.slice(0, half)), ['merge', keys.slice(half).join(' ')]];
        },
      },
    ],
    sizes: [7, 10, 15],
  },
  explain,
  practice: binomialPractice(() => binomialQueue),
  complexity: [
    {
      op: 'insert(key)',
      best: {
        cost: 'O(1)',
        why: 'n is even, so there is no B₀ yet: the new node just joins the root list.',
      },
      average: {
        cost: 'O(1) amortized',
        why: 'Like counting in binary: over n inserts, the carries add up to fewer than n links.',
        example: 'insert-carries',
      },
      worst: {
        cost: 'O(log n)',
        why: 'n = 2^k − 1, all 1 bits: the carry ripples through every tree, k links.',
        example: 'insert-carries',
      },
    },
    {
      op: 'union(H1, H2)',
      best: { cost: 'O(1)', why: 'One queue is empty.' },
      average: {
        cost: 'O(log n)',
        why: 'Each root list has at most ⌊log₂ n⌋ + 1 trees, and each step of the walk links or moves on.',
        example: 'union-binary',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Carries at every digit still mean one link per digit.',
        example: 'union-binary',
      },
    },
    {
      op: 'findMin()',
      best: { cost: 'O(1)', why: 'n is a power of 2: one tree, one root to look at.' },
      average: {
        cost: 'O(log n)',
        why: 'The minimum is one of the roots, and there is one root per 1 bit of n.',
      },
      worst: { cost: 'O(log n)', why: 'n = 2^k − 1: k roots to compare.' },
      note: 'Keeping a pointer to the smallest root makes findMin O(1), at the price of updating it in every operation.',
    },
    {
      op: 'extractMin()',
      best: { cost: 'O(log n)', why: 'Scanning the roots alone costs one comparison per tree.' },
      average: {
        cost: 'O(log n)',
        why: 'Find the smallest root, then one union with its children.',
        example: 'delete-min-children',
      },
      worst: {
        cost: 'O(log n)',
        why: 'A B_k has k children, and k ≤ log₂ n; the union is O(log n) too.',
        example: 'delete-min-children',
      },
    },
    {
      op: 'decreaseKey(x, k)',
      best: { cost: 'O(1)', why: 'The new key is still no smaller than its parent.' },
      average: { cost: 'O(log n)', why: 'The key moves up one level per exchange.' },
      worst: {
        cost: 'O(log n)',
        why: 'A B_k has height k, and k ≤ log₂ n: from a leaf to the root.',
        example: 'decrease-bubble',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BinSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    insertCarries,
    unionBinary,
    deleteMinChildren,
    decreaseBubble,
    pointersView,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs. The code prints only what every correct implementation
 * agrees on: sizes and keys. Calls the model refuses because it cannot read them, or because
 * the queue would outgrow what this page draws, are left out of the script.
 *   insert k          ->  n afterwards
 *   findmin           ->  the key | "empty"
 *   deletemin         ->  the key | "empty"
 *   merge k1 k2 ...   ->  n afterwards (the second queue is built by inserting k1, k2, ...)
 *   decrease k k2     ->  "ok" | "missing" (no node holds k) | "bigger" (k2 > k)
 *   clear             ->  "ok"
 */
function codeScript(calls: OpCall[], settings: BinSettings) {
  const t = new Timeline(binomialQueue, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    let result: string;
    if (op === 'decrease' && last.lines.includes('dk.err')) result = 'bigger';
    else if (op === 'decrease' && last.say.includes('no node holds')) result = 'missing';
    else if (last.marks.some((m) => m.id === 'arg-box')) return;
    else if (op === 'findmin' || op === 'deletemin')
      result = v.returned === undefined ? 'empty' : String(v.returned);
    else if (op === 'insert' || op === 'merge') result = String(v.N);
    else result = 'ok';
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    expected.push(result);
  });
  return { input, expected };
}

export default binomialQueue;
