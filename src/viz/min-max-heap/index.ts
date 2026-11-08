import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/min_max_heap.hpp?raw';
import javaSource from './code/java/MinMaxHeap.java?raw';
import pythonSource from './code/python/min_max_heap.py?raw';
import explain from './explain.md?raw';
import bothEnds from './examples/both-ends.json';
import buildBottomUp from './examples/build-bottom-up.json';
import grandparentClimb from './examples/grandparent-climb.json';
import maxMin from './examples/max-min.json';
import trickleFix from './examples/trickle-fix.json';
import {
  CAPACITY,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseKey,
  parseKeyList,
  pseudocode,
  type MMExtra,
  type MMSettings,
  type MMState,
} from './model';
import { minMaxPractice } from './practice';
import { view } from './view';

export function parseMMInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  if (/[\s,]/.test(t)) {
    const keys = parseKeyList(t);
    return keys instanceof Error ? keys : keys.join(' ');
  }
  return parseKey(t);
}

function distinctKeys(rng: Rng, n: number): number[] {
  const keys = new Set<number>();
  while (keys.size < n) keys.add(rng.int(1, 99));
  return [...keys];
}

const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);
const buildOf = (keys: number[]): OpCall[] => [['build', keys.join(' ')]];

export const minMaxHeap: VizDef<MMState, MMSettings, MMExtra> = {
  id: 'min-max-heap',
  title: 'Min-max heap',
  family: 'Heaps and priority queues',
  blurb:
    'A heap whose levels alternate min and max, so both the smallest and the largest key are a step from the root, and both come out in O(log n).',
  settings: [
    {
      kind: 'choice',
      key: 'root',
      label: 'The root level',
      options: [
        { value: 'min', label: 'Min: a min-max heap (Atkinson et al.)' },
        { value: 'max', label: 'Max: a max-min heap' },
      ],
      help: 'The two are mirror images: every min and max in the code swaps.',
    },
    {
      kind: 'choice',
      key: 'index',
      label: 'Array indexing',
      options: [
        { value: 'one', label: 'From 1: parent(i) = ⌊i/2⌋' },
        { value: 'zero', label: 'From 0: parent(i) = ⌊(i − 1)/2⌋' },
      ],
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
      placeholder: 'e.g. 42, or a list: 5 3 8 1',
      maxLength: 160,
      sample: '42',
      parse: parseMMInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'extractMin', label: 'Extract min', usesInput: false },
      { op: 'extractMax', label: 'Extract max', usesInput: false },
      { op: 'build', label: 'Build heap', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => buildOf(distinctKeys(rng, n)) },
      {
        label: 'Random, one insert at a time',
        make: (rng, n) => distinctKeys(rng, n).map((k) => ['insert', k] as OpCall),
      },
      {
        label: 'Ascending, one insert at a time',
        make: (rng, n) => asc(distinctKeys(rng, n)).map((k) => ['insert', k] as OpCall),
      },
      {
        label: 'Descending, one insert at a time',
        make: (rng, n) =>
          asc(distinctKeys(rng, n))
            .reverse()
            .map((k) => ['insert', k] as OpCall),
      },
      {
        label: 'Many duplicates',
        make: (rng, n) => buildOf(Array.from({ length: n }, () => 10 * rng.int(1, 4))),
      },
      {
        label: 'Random, then take from both ends',
        make: (rng, n) => [...buildOf(distinctKeys(rng, n)), ['extractMin'], ['extractMax']],
      },
    ],
    sizes: [7, 10, 15],
  },
  explain,
  practice: minMaxPractice(() => minMaxHeap),
  complexity: [
    {
      op: 'findMin() and findMax()',
      best: { cost: 'O(1)', why: 'One is the root; the other is one of its two children.' },
      average: { cost: 'O(1)', why: 'At most one comparison.' },
      worst: { cost: 'O(1)', why: 'Still at most one comparison, however big the heap.' },
    },
    {
      op: 'insert(key)',
      best: { cost: 'O(1)', why: 'One comparison with the parent and one with the grandparent.' },
      average: { cost: 'O(1)', why: 'Like a binary heap, a random key rarely climbs far.' },
      worst: {
        cost: 'O(log n)',
        why: 'After the parent, it only meets grandparents: about (log₂ n)/2 comparisons.',
        example: 'grandparent-climb',
      },
    },
    {
      op: 'extractMin() and extractMax()',
      best: { cost: 'O(1)', why: 'The moved key already fits: one round of looking below.' },
      average: {
        cost: 'O(log n)',
        why: 'The key moved up comes from the bottom and trickles most of the way back.',
        example: 'both-ends',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Each round jumps two levels and looks at up to six keys: about 3 log₂ n comparisons.',
        example: 'trickle-fix',
      },
    },
    {
      op: 'build(list)',
      best: { cost: 'O(n)', why: 'Already a min-max heap: every trickle-down stops at once.' },
      average: { cost: 'O(n)', why: 'As for a binary heap, most keys sit near the bottom.' },
      worst: {
        cost: 'O(n)',
        why: 'The heights add up to less than n, the same argument as for a binary heap.',
        example: 'build-bottom-up',
      },
      note: `Space: one array of capacity ${CAPACITY}, nothing else. A double-ended priority queue for the price of one heap.`,
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as MMSettings),
  },
  examples: [
    bothEnds,
    grandparentClimb,
    trickleFix,
    buildBottomUp,
    maxMin,
  ] as unknown as SavedExample[],
  preview: { example: 'build-bottom-up', level: 2 },
};

function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  if (op === 'insert') return bad(args[0], parseKey);
  if (op === 'build') return bad(args[0], parseKeyList);
  return false;
}

/**
 * Driver protocol for the code tabs (a min-max heap indexed from 1, the defaults):
 *   new <capacity>
 *   insert k        ->  n afterwards | "overflow"
 *   extractMin      ->  the key | "empty"
 *   extractMax      ->  the key | "empty"
 *   build k1 k2 ... ->  n
 *   clear           ->  "ok"
 */
function codeScript(calls: OpCall[], settings: MMSettings) {
  const same: MMSettings = { ...settings, root: 'min', index: 'one' };
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(minMaxHeap, same, 1, kept);
  const input = [`new ${CAPACITY}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    if (op === 'insert')
      expected.push(last.marks.some((m) => m.role === 'error') ? 'overflow' : String(v.N));
    else if (op === 'extractMin' || op === 'extractMax')
      expected.push(v.returned === undefined ? 'empty' : String(v.returned));
    else if (op === 'build') expected.push(String(v.N));
    else expected.push('ok');
  });
  return { input, expected };
}

export default minMaxHeap;
