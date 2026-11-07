import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/avl.hpp?raw';
import javaSource from './code/java/AVLTree.java?raw';
import pythonSource from './code/python/avl.py?raw';
import deleteCascade from './examples/delete-cascade.json';
import deleteLevelChild from './examples/delete-level-child.json';
import deletePredecessor from './examples/delete-predecessor.json';
import llCase from './examples/ll-case.json';
import lrCase from './examples/lr-case.json';
import rlCase from './examples/rl-case.json';
import rrCase from './examples/rr-case.json';
import sortedInput from './examples/sorted-input.json';
import sparsest from './examples/sparsest.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type AVLExtra,
  type AVLSettings,
  type AVLState,
} from './model';
import { avlPractice } from './practice';
import {
  ascending,
  distinctKeys,
  inserts,
  parseKey,
  preorderKeys,
  treeHeight,
  treeSize,
  zigzagOrderOf,
} from './tree-kit';
import { view } from './view';

/** Nodes in the sparsest AVL tree of height h: N(h) = N(h-1) + N(h-2) + 1. */
export function fibNodes(h: number): number {
  return h < 0 ? 0 : h === 0 ? 1 : fibNodes(h - 1) + fibNodes(h - 2) + 1;
}

/**
 * The keys of the sparsest AVL tree that fits in n keys (a Fibonacci tree: the left subtree one
 * level taller than the right at every node), in level order. Inserting them in this order
 * builds that tree without a single rotation.
 */
export function sparsestOrder(sorted: number[]): number[] {
  let h = 0;
  while (fibNodes(h + 1) <= sorted.length) h++;
  type T = { key: number; left: T | null; right: T | null } | null;
  let next = 0;
  // Fill the shape inorder so the keys come out in sorted order.
  const build = (height: number): T => {
    if (height < 0) return null;
    const left = build(height - 1);
    const key = sorted[next++]!;
    const right = build(height - 2);
    return { key, left, right };
  };
  const root = build(h);
  const out: number[] = [];
  const queue: T[] = [root];
  while (queue.length) {
    const t = queue.shift()!;
    if (!t) continue;
    out.push(t.key);
    queue.push(t.left, t.right);
  }
  return out;
}

export const avl: VizDef<AVLState, AVLSettings, AVLExtra> = {
  id: 'avl',
  title: 'AVL tree',
  family: 'Trees',
  blurb:
    'A binary search tree that keeps the two subtrees of every node within one level of each other, with rotations named LL, RR, LR and RL.',
  settings: [
    {
      kind: 'choice',
      key: 'delete',
      label: 'Deleting a node with two children',
      options: [
        { value: 'successor', label: 'Replace it with its successor (CLRS)' },
        { value: 'predecessor', label: 'Replace it with its predecessor' },
      ],
    },
    {
      kind: 'choice',
      key: 'show',
      label: 'Next to each node',
      options: [
        { value: 'both', label: 'Height and balance factor' },
        { value: 'height', label: 'Height only' },
        { value: 'balance', label: 'Balance factor only' },
      ],
    },
    {
      kind: 'choice',
      key: 'bf',
      label: 'Balance factor',
      options: [
        { value: 'left', label: 'Left height − right height (+2 means too tall on the left)' },
        { value: 'right', label: 'Right height − left height (+2 means too tall on the right)' },
      ],
      help: 'Textbooks use both. Only the sign changes; the rotations are the same.',
    },
    {
      kind: 'choice',
      key: 'leaf',
      label: 'Height of a leaf',
      options: [
        { value: 'zero', label: '0: count edges (CLRS); an empty tree has height −1' },
        { value: 'one', label: '1: count nodes; an empty tree has height 0' },
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
      placeholder: 'e.g. 42, or 10 20 30 40',
      maxLength: 160,
      sample: '50',
      parse: parseKey,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
      { op: 'min', label: 'Min', usesInput: false, more: true },
      { op: 'max', label: 'Max', usesInput: false, more: true },
      { op: 'inorder', label: 'Inorder', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random order', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Sorted (a BST would be a chain)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n))),
      },
      {
        label: 'Reverse sorted',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n)).reverse()),
      },
      {
        label: 'Zigzag (double rotations)',
        make: (rng, n) => inserts(zigzagOrderOf(ascending(distinctKeys(rng, n)))),
      },
      {
        label: 'Sparsest for its height',
        make: (rng, n) => inserts(sparsestOrder(ascending(distinctKeys(rng, n)))),
      },
    ],
    sizes: [7, 15, 31],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: { cost: 'O(1)', why: 'k is at the root: one comparison.' },
      average: {
        cost: 'O(log n)',
        why: 'One comparison per level, and an AVL tree with n keys is never taller than about 1.44 log₂ n.',
        example: 'sorted-input',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Even the sparsest AVL tree, the tallest one for its size, has height O(log n).',
        example: 'sparsest',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(log n)',
        why: 'A new key always goes to the bottom, and no leaf of an AVL tree is closer to the root than about half its height.',
        example: 'sorted-input',
      },
      average: {
        cost: 'O(log n)',
        why: 'One walk down, then a walk back up that stops early once a height stays the same.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Down to the bottom and all the way back up, with one single or double rotation on the way.',
        example: 'lr-case',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(log n)',
        why: 'Finding the key, or its successor, means walking to the bottom of the tree.',
      },
      average: { cost: 'O(log n)', why: 'Down to the node, then back up, fixing heights.' },
      worst: {
        cost: 'O(log n)',
        why: 'The walk back up may rotate at every level, but each rotation is O(1).',
        example: 'delete-cascade',
      },
    },
    {
      op: 'rotations per insert',
      best: {
        cost: '0',
        why: 'Every node on the way up stays within one level, for example when the new leaf fills the empty side of a node.',
        example: 'sorted-input',
      },
      average: {
        cost: 'O(1)',
        why: 'Never more than two: one fix restores the old height of the subtree.',
      },
      worst: {
        cost: '2',
        why: 'An LR or RL case: a double rotation, and then the walk stops.',
        example: 'lr-case',
      },
    },
    {
      op: 'rotations per delete',
      best: {
        cost: '0',
        why: 'Removing the key leaves every node within one level of balance.',
      },
      average: {
        cost: 'O(1)',
        why: 'Most deletes need no rotation or one; long chains of rotations need a sparse tree.',
        example: 'delete-level-child',
      },
      worst: {
        cost: 'O(log n)',
        why: 'A rotation can leave its subtree one level shorter, which unbalances the next node up.',
        example: 'delete-cascade',
      },
    },
  ],
  practice: avlPractice(() => avl),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as AVLSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    llCase,
    rrCase,
    lrCase,
    rlCase,
    sortedInput,
    sparsest,
    deleteCascade,
    deleteLevelChild,
    deletePredecessor,
  ] as unknown as SavedExample[],
  preview: { example: 'sorted-input', hide: ['arg-box'] },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (the successor
 * replaces a deleted node with two children), so the model runs with those too.
 *   insert k | delete k  ->  "ok <N> <height> <rotations in this operation> <keys in preorder>"
 *                            | "duplicate" | "missing"
 *   search k             ->  "found" | "missing"
 *   min | max            ->  the key | "empty"
 *   inorder              ->  the keys | "empty"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: AVLSettings) {
  const t = new Timeline(avl, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, raw] = e.call;
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const lines = new Set(e.steps.at(-1)!.lines);
    const v = e.steps.at(-1)!.vars ?? {};
    let arg = '';
    if (raw !== undefined) {
      const k = parseKey(raw);
      if (k instanceof Error) return; // The model refuses it and changes nothing.
      arg = ` ${k}`;
    }
    input.push(`${op}${arg}`);
    switch (op) {
      case 'insert':
      case 'delete':
        if (lines.has('ins.dup')) expected.push('duplicate');
        else if (lines.has('del.missing')) expected.push('missing');
        else
          expected.push(
            [
              'ok',
              treeSize(e.end),
              treeHeight(e.end),
              e.end.rotations - before.rotations,
              ...preorderKeys(e.end),
            ].join(' '),
          );
        break;
      case 'search':
        expected.push(v.found ? 'found' : 'missing');
        break;
      case 'min':
      case 'max':
        expected.push(v.returned === 'nil' ? 'empty' : String(v.returned));
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

export default avl;
