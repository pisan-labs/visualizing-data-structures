import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/dary_heap.hpp?raw';
import javaSource from './code/java/DaryHeap.java?raw';
import pythonSource from './code/python/dary_heap.py?raw';
import explain from './explain.md?raw';
import buildBottomUp from './examples/build-bottom-up.json';
import decreaseKey from './examples/decrease-key.json';
import extractCosts from './examples/extract-costs-d.json';
import fourChildren from './examples/four-children.json';
import insertClimbs from './examples/insert-climbs.json';
import {
  arity,
  CAPACITY,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseIndex,
  parseKey,
  parseKeyList,
  pseudocode,
  type DHeapExtra,
  type DHeapSettings,
  type DHeapState,
} from './model';
import { dAryPractice } from './practice';
import { view } from './view';

/** One key stays a number; a list of keys (for build) becomes its canonical text. */
export function parseDHeapInput(token: string): Value | Error {
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

export const dAryHeap: VizDef<DHeapState, DHeapSettings, DHeapExtra> = {
  id: 'd-ary-heap',
  title: 'd-ary heap',
  family: 'Heaps and priority queues',
  blurb:
    'A heap with d children per node, in one array: inserts get cheaper as d grows, extracts get costlier, and decrease-key climbs fewer levels.',
  settings: [
    {
      kind: 'number',
      key: 'd',
      label: 'Children per node (d)',
      min: 2,
      max: 5,
      help: 'd = 2 is the binary heap. Try the same keys with d = 2 and d = 4 and compare the comparisons.',
    },
    {
      kind: 'choice',
      key: 'order',
      label: 'Which key is on top',
      options: [
        { value: 'max', label: 'The largest (max-heap, CLRS)' },
        { value: 'min', label: 'The smallest (min-heap, as in Dijkstra)' },
      ],
    },
    {
      kind: 'choice',
      key: 'index',
      label: 'Array indexing',
      options: [
        { value: 'one', label: 'From 1: parent(i) = ⌊(i − 2)/d⌋ + 1 (CLRS)' },
        { value: 'zero', label: 'From 0: parent(i) = ⌊(i − 1)/d⌋' },
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
      parse: parseDHeapInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'extract', label: 'Extract', usesInput: false },
      {
        op: 'update',
        label: 'Update key',
        usesInput: true,
        args: ['an index', 'a new key'],
      },
      { op: 'build', label: 'Build heap', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => buildOf(distinctKeys(rng, n)) },
      {
        label: 'Ascending inserts',
        make: (rng, n) => asc(distinctKeys(rng, n)).map((k) => ['insert', k] as OpCall),
      },
      {
        label: 'Descending inserts',
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
        label: 'Random, then extract twice',
        make: (rng, n) => [...buildOf(distinctKeys(rng, n)), ['extract'], ['extract']],
      },
    ],
    sizes: [7, 10, 13],
  },
  explain,
  practice: dAryPractice(() => dAryHeap),
  complexity: [
    {
      op: 'insert(key)',
      best: { cost: 'O(1)', why: 'The new leaf already fits under its parent: one comparison.' },
      average: {
        cost: 'O(1)',
        why: 'Most nodes are near the bottom, so a random key climbs only a level or two.',
      },
      worst: {
        cost: 'O(log_d n)',
        why: 'A key that beats everything climbs to the root: one comparison per level, and there are only log_d n levels.',
        example: 'insert-climbs',
      },
    },
    {
      op: 'extract()',
      best: {
        cost: 'O(d)',
        why: 'The key moved to the root already beats its d children: d comparisons and it stays.',
      },
      average: {
        cost: 'O(d log_d n)',
        why: 'The key moved up comes from the bottom, so it usually sinks most of the way back.',
        example: 'extract-costs-d',
      },
      worst: {
        cost: 'O(d log_d n)',
        why: 'Up to d comparisons on each of log_d n levels: larger d means fewer levels but more work per level.',
        example: 'extract-costs-d',
      },
    },
    {
      op: 'updateKey(i, key) toward the top (decrease-key in a min-heap)',
      best: { cost: 'O(1)', why: 'The new key still fits under its parent.' },
      average: { cost: 'O(log_d n)', why: 'The key climbs part of one path.' },
      worst: {
        cost: 'O(log_d n)',
        why: 'From a leaf to the root, one comparison per level: this is why Dijkstra likes a large d.',
        example: 'decrease-key',
      },
    },
    {
      op: 'build(list)',
      best: { cost: 'O(n)', why: 'The list is already a heap: every sift-down stops at once.' },
      average: { cost: 'O(n)', why: 'Most keys are leaves or near the bottom and barely move.' },
      worst: {
        cost: 'O(n)',
        why: 'The sift-down heights add up to less than n, as for a binary heap.',
        example: 'build-bottom-up',
      },
      note: `Space: one array of capacity ${CAPACITY}. The children of a node sit side by side, which is kind to the cache.`,
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as DHeapSettings),
  },
  examples: [
    insertClimbs,
    extractCosts,
    decreaseKey,
    fourChildren,
    buildBottomUp,
  ] as unknown as SavedExample[],
  opening: 'build-bottom-up',
  preview: { example: 'build-bottom-up', level: 2 },
};

function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  switch (op) {
    case 'insert':
      return bad(args[0], parseKey);
    case 'build':
      return bad(args[0], parseKeyList);
    case 'update':
      return bad(args[0], parseIndex) || bad(args[1], parseKey);
    default:
      return false;
  }
}

/**
 * Driver protocol for the code tabs. The code is a max-heap indexed from 1 (the defaults) with
 * any d, so the model runs with those settings and the example's d.
 *   new <d> <capacity>
 *   insert k        ->  n afterwards | "overflow"
 *   extract         ->  the key | "empty"
 *   build k1 k2 ... ->  n
 *   update i k      ->  "ok" | "invalid"
 *   clear           ->  "ok"
 */
function codeScript(calls: OpCall[], settings: DHeapSettings) {
  const same: DHeapSettings = { ...settings, order: 'max', index: 'one' };
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(dAryHeap, same, 1, kept);
  const input = [`new ${arity(same)} ${CAPACITY}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    const refused = last.marks.some((m) => m.role === 'error');
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    switch (op) {
      case 'insert':
        expected.push(refused ? 'overflow' : String(v.N));
        break;
      case 'extract':
        expected.push(v.returned === undefined ? 'empty' : String(v.returned));
        break;
      case 'build':
        expected.push(String(v.N));
        break;
      case 'update':
        expected.push(refused ? 'invalid' : 'ok');
        break;
      default:
        expected.push('ok');
    }
  });
  return { input, expected };
}

export default dAryHeap;
