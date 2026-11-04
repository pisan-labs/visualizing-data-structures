import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/fibonacci_heap.hpp?raw';
import javaSource from './code/java/FibonacciHeap.java?raw';
import pythonSource from './code/python/fibonacci_heap.py?raw';
import explain from './explain.md?raw';
import cascadingCut from './examples/cascading-cut.json';
import deleteNode from './examples/delete-node.json';
import lazyInserts from './examples/lazy-inserts.json';
import pointersView from './examples/pointers-view.json';
import unionLazy from './examples/union-lazy.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseFibInput,
  pseudocode,
  type FibExtra,
  type FibSettings,
  type FibState,
} from './model';
import { fibonacciPractice } from './practice';
import { view } from './view';

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);
const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);

export const fibonacciHeap: VizDef<FibState, FibSettings, FibExtra> = {
  id: 'fibonacci-heap',
  title: 'Fibonacci heap',
  family: 'Heaps and priority queues',
  blurb:
    'A lazy heap: insert, union and decrease-key in O(1) amortized, with the tidying left to extractMin. Marks, cuts and cascading cuts keep the trees bushy.',
  settings: [
    {
      kind: 'choice',
      key: 'view',
      label: 'Draw the trees',
      options: [
        { value: 'logical', label: 'As trees (logical view)' },
        { value: 'internal', label: 'As pointers: child and sibling lists (internal view)' },
      ],
      help: 'Every sibling list, and the root list, is a circular doubly linked list. The drawing shows the wrap-around for the root list.',
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
      placeholder: 'e.g. 42, or a list to unite: 5 3 8',
      maxLength: 120,
      sample: '42',
      parse: parseFibInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'findmin', label: 'Minimum', usesInput: false },
      { op: 'deletemin', label: 'Extract min', usesInput: false },
      {
        op: 'decrease',
        label: 'Decrease key',
        usesInput: true,
        args: ['a key', 'its new, smaller key'],
      },
      { op: 'union', label: 'Union with', usesInput: true, more: true },
      { op: 'delete', label: 'Delete', usesInput: true, more: true },
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
        label: 'Random, then extract min',
        make: (rng, n) => [...inserts(distinct(rng, n)), ['deletemin']],
      },
    ],
    sizes: [7, 10, 15],
  },
  explain,
  practice: fibonacciPractice(() => fibonacciHeap),
  complexity: [
    {
      op: 'insert(key)',
      best: { cost: 'O(1)', why: 'Add one root to the list and compare with H.min.' },
      average: {
        cost: 'O(1)',
        why: 'Nothing else happens, ever: the heap does no linking until extractMin.',
        example: 'lazy-inserts',
      },
      worst: { cost: 'O(1)', why: 'The same few pointer changes. Φ goes up by 1, one new tree.' },
    },
    {
      op: 'union(H1, H2)',
      best: { cost: 'O(1)', why: 'Splice two circular lists and keep the smaller minimum.' },
      average: {
        cost: 'O(1)',
        why: 'Φ does not change: the trees and marks are the same.',
        example: 'union-lazy',
      },
      worst: { cost: 'O(1)', why: 'Splicing is four pointer changes, whatever the sizes.' },
    },
    {
      op: 'extractMin()',
      best: {
        cost: 'O(log n)',
        why: 'Even a tidy heap has its minimum’s children to move and a table to fill.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'Consolidate does one link per tree beyond the first of each degree, and every link removes a tree, paid for by Φ. What is left is at most D(n) + 1 trees.',
        example: 'lazy-inserts',
      },
      worst: {
        cost: 'O(n)',
        why: 'After n lazy inserts, the first extractMin consolidates n − 1 one-node trees.',
        example: 'lazy-inserts',
      },
      note: 'D(n) ≤ ⌊log_φ n⌋, about 1.44 log₂ n: a node of degree k has at least F(k + 2) descendants, a Fibonacci number. That is where the name comes from.',
    },
    {
      op: 'decreaseKey(x, k)',
      best: { cost: 'O(1)', why: 'The new key still fits under its parent: nothing is cut.' },
      average: {
        cost: 'O(1) amortized',
        why: 'Each cascading cut unmarks a node, which pays 2 units of Φ for the cut and for the new tree.',
        example: 'cascading-cut',
      },
      worst: {
        cost: 'O(n)',
        why: 'A long line of marked ancestors are all cut at once; each was paid for when it was marked.',
        example: 'cascading-cut',
      },
    },
    {
      op: 'delete(x)',
      best: { cost: 'O(log n)', why: 'An extractMin is part of it.' },
      average: {
        cost: 'O(log n) amortized',
        why: 'decreaseKey to −∞ is O(1) amortized, then one extractMin.',
        example: 'delete-node',
      },
      worst: { cost: 'O(n)', why: 'Whatever the extractMin at its end costs.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FibSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lazyInserts,
    cascadingCut,
    unionLazy,
    deleteNode,
    pointersView,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs. The code prints only what every correct implementation
 * agrees on: sizes and keys. Calls the model refuses because it cannot read them, or because
 * the heap would outgrow what this page draws, are left out of the script.
 *   insert k          ->  n afterwards
 *   findmin           ->  the key | "empty"
 *   deletemin         ->  the key | "empty"
 *   union k1 k2 ...   ->  n afterwards (the second heap is built by inserting k1, k2, ...)
 *   decrease k k2     ->  "ok" | "missing" (no node holds k) | "bigger" (k2 > k)
 *   delete k          ->  "ok" | "missing"
 *   clear             ->  "ok"
 */
function codeScript(calls: OpCall[], settings: FibSettings) {
  const t = new Timeline(fibonacciHeap, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    let result: string;
    if (op === 'decrease' && last.lines.includes('dk.err')) result = 'bigger';
    else if ((op === 'decrease' || op === 'delete') && last.say.includes('no node holds'))
      result = 'missing';
    else if (last.marks.some((m) => m.id === 'arg-box')) return;
    else if (op === 'findmin' || op === 'deletemin')
      result = v.returned === undefined ? 'empty' : String(v.returned);
    else if (op === 'insert' || op === 'union') result = String(v.N);
    else result = 'ok';
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    expected.push(result);
  });
  return { input, expected };
}

export default fibonacciHeap;
