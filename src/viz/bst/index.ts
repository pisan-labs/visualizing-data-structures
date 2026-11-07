import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/bst.hpp?raw';
import javaSource from './code/java/BST.java?raw';
import pythonSource from './code/python/bst.py?raw';
import explain from './explain.md?raw';
import balancedOrder from './examples/balanced-order.json';
import deleteLeaf from './examples/delete-leaf.json';
import deleteOneChild from './examples/delete-one-child.json';
import deletePredecessor from './examples/delete-predecessor.json';
import deleteTwoChildren from './examples/delete-two-children.json';
import duplicates from './examples/duplicates.json';
import keyValue from './examples/key-value.json';
import lowerBound from './examples/lower-bound.json';
import searchMiss from './examples/search-miss.json';
import selectRank from './examples/select-rank.json';
import sortedChain from './examples/sorted-chain.json';
import successorClimb from './examples/successor-climb.json';
import zigzag from './examples/zigzag.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseKeyArg,
  pseudocode,
  type BSTExtra,
  type BSTSettings,
  type BSTState,
} from './model';
import { bstPractice } from './practice';
import { view } from './view';

/** "42" stays a number; "42=apple" stays a pair for insert to split. */
export function parseKeyInput(token: string): Value | Error {
  const a = parseKeyArg(token);
  if (a instanceof Error) return a;
  return a.value === null ? a.key : `${a.key}=${a.value}`;
}

/** n distinct keys from 1 to 99 (or more when n is large). */
function distinctKeys(rng: Rng, n: number): number[] {
  const hi = Math.max(99, 3 * n);
  const keys = new Set<number>();
  while (keys.size < n) keys.add(rng.int(1, hi));
  return [...keys];
}

/** Medians first, level by level: inserting sorted keys in this order gives a balanced tree. */
export function balancedOrderOf(sorted: number[]): number[] {
  const out: number[] = [];
  const queue: [number, number][] = [[0, sorted.length - 1]];
  while (queue.length) {
    const [lo, hi] = queue.shift()!;
    if (lo > hi) continue;
    const mid = Math.floor((lo + hi) / 2);
    out.push(sorted[mid]!);
    queue.push([lo, mid - 1], [mid + 1, hi]);
  }
  return out;
}

/** Smallest, largest, second smallest, second largest...: every new key sits between the last two. */
export function zigzagOrderOf(sorted: number[]): number[] {
  const out: number[] = [];
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    out.push(sorted[lo++]!);
    if (lo <= hi) out.push(sorted[hi--]!);
  }
  return out;
}

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);
const ascending = (keys: number[]) => [...keys].sort((a, b) => a - b);

export const bst: VizDef<BSTState, BSTSettings, BSTExtra> = {
  id: 'bst',
  title: 'Binary search tree',
  family: 'Trees',
  blurb:
    'Insert, delete and search, plus min, max, successor, select, rank and lower bound, all by comparing keys on one path down.',
  settings: [
    {
      kind: 'choice',
      key: 'delete',
      label: 'Deleting a node with two children',
      options: [
        { value: 'successor', label: 'Replace it with its successor (CLRS)' },
        { value: 'predecessor', label: 'Replace it with its predecessor' },
      ],
      help: 'The successor is the smallest key in the right subtree. The predecessor is the largest key in the left subtree.',
    },
    {
      kind: 'choice',
      key: 'dupes',
      label: 'Inserting a key that is already there',
      options: [
        { value: 'reject', label: 'Reject it' },
        { value: 'count', label: 'Count it (each node keeps a count)' },
      ],
      help: 'In key-value mode an existing key always gets its value replaced instead.',
    },
    {
      kind: 'choice',
      key: 'mode',
      label: 'What the tree stores',
      options: [
        { value: 'keys', label: 'Keys only (a set)' },
        { value: 'pairs', label: 'Key-value pairs (a map): insert 42=apple' },
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
      placeholder: 'e.g. 42, 50 30 70, or 42=apple',
      maxLength: 160,
      sample: '50',
      parse: parseKeyInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'min', label: 'Min', usesInput: false },
      { op: 'max', label: 'Max', usesInput: false },
      { op: 'predecessor', label: 'Predecessor', usesInput: true, more: true },
      { op: 'successor', label: 'Successor', usesInput: true, more: true },
      { op: 'select', label: 'Select k-th', usesInput: true, more: true },
      { op: 'rank', label: 'Rank', usesInput: true, more: true },
      { op: 'lowerbound', label: 'Lower bound', usesInput: true, more: true },
      { op: 'inorder', label: 'Inorder', usesInput: false, more: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random order', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Sorted (a chain to the right)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n))),
      },
      {
        label: 'Reverse sorted (a chain to the left)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n)).reverse()),
      },
      {
        label: 'Balanced (medians first)',
        make: (rng, n) => inserts(balancedOrderOf(ascending(distinctKeys(rng, n)))),
      },
      {
        label: 'Zigzag',
        make: (rng, n) => inserts(zigzagOrderOf(ascending(distinctKeys(rng, n)))),
      },
    ],
    sizes: [7, 15, 31],
  },
  explain,
  practice: bstPractice(() => bst),
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is at the root: one comparison.',
        example: 'search-miss',
      },
      average: {
        cost: 'O(log n)',
        why: 'Keys inserted in random order give a tree of height O(log n), and search walks one path.',
        example: 'balanced-order',
      },
      worst: {
        cost: 'O(n)',
        why: 'Sorted input builds a chain; finding the last key visits every node.',
        example: 'sorted-chain',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'The tree is empty, or k goes right under the root.',
        example: 'balanced-order',
      },
      average: {
        cost: 'O(log n)',
        why: 'One path down to an empty spot, and random trees are short.',
      },
      worst: {
        cost: 'O(n)',
        why: 'Each new key in sorted order walks the whole chain before it lands.',
        example: 'sorted-chain',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(1)',
        why: 'k is the root and it has at most one child: one transplant.',
      },
      average: {
        cost: 'O(log n)',
        why: 'Find z, maybe walk down to its successor, then move a few pointers.',
        example: 'delete-two-children',
      },
      worst: {
        cost: 'O(n)',
        why: 'On a chain the key, or its successor, can be n levels down.',
        example: 'zigzag',
      },
    },
    {
      op: 'min() / max()',
      best: {
        cost: 'O(1)',
        why: 'The root has no left child, so it is the minimum.',
        example: 'sorted-chain',
      },
      average: { cost: 'O(log n)', why: 'One walk down the left (or right) spine.' },
      worst: {
        cost: 'O(n)',
        why: 'In a chain to the right, max walks every node.',
        example: 'sorted-chain',
      },
    },
    {
      op: 'select(i)',
      best: {
        cost: 'O(1)',
        why: 'i is exactly size(root.left) + 1: the root is the answer.',
        example: 'select-rank',
      },
      average: {
        cost: 'O(log n)',
        why: 'Each step goes one level down, using the stored subtree sizes.',
        example: 'select-rank',
      },
      worst: {
        cost: 'O(n)',
        why: 'On a chain, selecting the largest key walks the whole chain.',
        example: 'sorted-chain',
      },
      note: 'Without stored subtree sizes, select would need an O(n) inorder walk.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BSTSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    deleteLeaf,
    deleteOneChild,
    deleteTwoChildren,
    deletePredecessor,
    sortedChain,
    balancedOrder,
    zigzag,
    searchMiss,
    successorClimb,
    selectRank,
    lowerBound,
    duplicates,
    keyValue,
  ] as unknown as SavedExample[],
  preview: { example: 'balanced-order', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (successor,
 * duplicates rejected, keys only), so the model runs with those too and values are dropped.
 *   insert k | delete k      ->  "ok <N> <height>"  |  "duplicate" / "missing"
 *   search k                 ->  "found" | "missing"
 *   min | max                ->  the key | "empty"
 *   predecessor k | successor k  ->  the key | "none" | "missing"
 *   select i                 ->  the key | "none"
 *   rank k                   ->  the rank | "missing"
 *   lowerbound k             ->  the key | "none"
 *   inorder                  ->  the keys | "empty"
 *   clear                    ->  "ok"
 */
function codeScript(calls: OpCall[], settings: BSTSettings) {
  const same: BSTSettings = { ...settings, delete: 'successor', dupes: 'reject', mode: 'keys' };
  const t = new Timeline(bst, same, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, raw] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const lines = new Set(last.lines);
    const v = last.vars ?? {};
    let arg = '';
    if (raw !== undefined) {
      const a = parseKeyArg(raw);
      if (a instanceof Error) return; // The model rejects it and changes nothing.
      arg = ` ${a.key}`;
    }
    input.push(`${op}${arg}`);
    const value = v.returned;
    switch (op) {
      case 'insert':
        expected.push(lines.has('ins.dup') ? 'duplicate' : `ok ${v.N} ${v.height}`);
        break;
      case 'delete':
        expected.push(lines.has('del.missing') ? 'missing' : `ok ${v.N} ${v.height}`);
        break;
      case 'search':
        expected.push(v.found ? 'found' : 'missing');
        break;
      case 'min':
      case 'max':
        expected.push(value === 'nil' ? 'empty' : String(value));
        break;
      case 'predecessor':
      case 'successor':
        expected.push(
          lines.has('succ.missing') || lines.has('pred.missing')
            ? 'missing'
            : value === 'nil'
              ? 'none'
              : String(value),
        );
        break;
      case 'select':
      case 'lowerbound':
        expected.push(value === 'nil' ? 'none' : String(value));
        break;
      case 'rank':
        expected.push(value === 'nil' ? 'missing' : String(value));
        break;
      case 'inorder':
        expected.push(String(v.output || 'empty'));
        break;
      default:
        expected.push('ok');
    }
  });
  return { input, expected };
}

export default bst;
