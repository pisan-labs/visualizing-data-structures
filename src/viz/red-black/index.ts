import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctKeys,
  inserts,
  parseKey,
  treeHeight,
  treeSize,
  zigzagOrderOf,
} from '../_bst/tree-kit';
import cppSource from './code/cpp/red_black.hpp?raw';
import javaSource from './code/java/RedBlackTree.java?raw';
import pythonSource from './code/python/red_black.py?raw';
import deleteCase1 from './examples/delete-case-1.json';
import deleteCase2 from './examples/delete-case-2.json';
import deleteCase3 from './examples/delete-case-3.json';
import deleteCase4 from './examples/delete-case-4.json';
import deleteRed from './examples/delete-red.json';
import deleteThreeRotations from './examples/delete-three-rotations.json';
import insertAllCases from './examples/insert-all-cases.json';
import insertCase1 from './examples/insert-case-1.json';
import insertCase2 from './examples/insert-case-2.json';
import insertCase3 from './examples/insert-case-3.json';
import sortedInput from './examples/sorted-input.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  treeBlackHeight,
  type RBExtra,
  type RBSettings,
  type RBState,
} from './model';
import { redBlackPractice } from './practice';
import { view } from './view';

export const redBlack: VizDef<RBState, RBSettings, RBExtra> = {
  id: 'red-black',
  title: 'Red-black tree',
  family: 'Trees',
  blurb:
    'A binary search tree that colors every node red or black and keeps every path to a leaf at the same number of black nodes, following CLRS.',
  settings: [
    {
      kind: 'boolean',
      key: 'nils',
      label: 'Draw the NIL leaves',
      help: 'CLRS treats every missing child as a black leaf called NIL.',
    },
    { kind: 'boolean', key: 'bh', label: "Show each node's black-height" },
    {
      kind: 'choice',
      key: 'delete',
      label: 'Deleting a node with two children',
      options: [
        { value: 'successor', label: 'Replace it with its successor (CLRS)' },
        { value: 'predecessor', label: 'Replace it with its predecessor' },
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
        label: 'Zigzag (case 2 rotations)',
        make: (rng, n) => inserts(zigzagOrderOf(ascending(distinctKeys(rng, n)))),
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
        why: 'One comparison per level, and the height is at most 2 log₂(n + 1).',
        example: 'sorted-input',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The longest path is at most twice the shortest, so no path gets longer than 2 log₂(n + 1).',
        example: 'sorted-input',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(log n)',
        why: 'A new key always goes to the bottom, then the fixup may stop at once because the parent is black.',
        example: 'insert-case-1',
      },
      average: {
        cost: 'O(log n)',
        why: 'One walk down, and on average only a few fixup steps.',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Case 1 can recolor its way up the tree two levels at a time; cases 2 and 3 end the loop.',
        example: 'insert-all-cases',
      },
    },
    {
      op: 'delete(k)',
      best: {
        cost: 'O(log n)',
        why: 'Finding the key, or its successor, walks down the tree, even when a red node leaves and nothing needs fixing.',
        example: 'delete-red',
      },
      average: { cost: 'O(log n)', why: 'One walk down, then a fixup that usually ends quickly.' },
      worst: {
        cost: 'O(log n)',
        why: 'Case 2 can pass the extra black up the tree one level at a time.',
        example: 'delete-case-2',
      },
    },
    {
      op: 'rotations per insert',
      best: {
        cost: '0',
        why: 'The parent is black, or case 1 recolors and nothing rotates.',
        example: 'insert-case-1',
      },
      average: { cost: 'O(1)', why: 'Never more than two.' },
      worst: {
        cost: '2',
        why: 'Case 2 rotates once and case 3 once more, and then the loop ends.',
        example: 'insert-case-2',
      },
    },
    {
      op: 'rotations per delete',
      best: {
        cost: '0',
        why: 'A red node leaves, or case 2 only recolors.',
        example: 'delete-red',
      },
      average: { cost: 'O(1)', why: 'Never more than three.' },
      worst: {
        cost: '3',
        why: 'Case 1, then case 3, then case 4: one rotation each, and case 4 ends the loop.',
        example: 'delete-three-rotations',
      },
      note: 'Fewer rotations than an AVL delete, which can rotate at every level.',
    },
  ],
  practice: redBlackPractice(() => redBlack),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RBSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    insertCase1,
    insertCase2,
    insertCase3,
    insertAllCases,
    sortedInput,
    deleteRed,
    deleteCase1,
    deleteCase2,
    deleteCase3,
    deleteCase4,
    deleteThreeRotations,
  ] as unknown as SavedExample[],
  opening: 'sorted-input',
  preview: { example: 'sorted-input' },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (the successor
 * replaces a deleted node with two children), so the model runs with those too.
 *   insert k | delete k  ->  "ok <N> <height> <black-height> <rotations in this operation>
 *                             <keys in preorder, each followed by R or B>" | "duplicate" | "missing"
 *   search k             ->  "found" | "missing"
 *   min | max            ->  the key | "empty"
 *   inorder              ->  the keys | "empty"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: RBSettings) {
  const t = new Timeline(redBlack, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, raw] = e.call;
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const last = e.steps.at(-1)!;
    const v = last.vars ?? {};
    let arg = '';
    if (raw !== undefined) {
      const k = parseKey(raw);
      if (k instanceof Error) return; // The model refuses it and changes nothing.
      arg = ` ${k}`;
    }
    input.push(`${op}${arg}`);
    switch (op) {
      case 'insert':
      case 'delete': {
        const changed = treeSize(e.end) !== treeSize(before);
        if (!changed) {
          expected.push(op === 'insert' ? 'duplicate' : 'missing');
          break;
        }
        const s = e.end;
        const shape: string[] = [];
        const walk = (u: number | null) => {
          if (u === null) return;
          const n = s.nodes[u]!;
          shape.push(`${n.key}${n.color === 'red' ? 'R' : 'B'}`);
          walk(n.left);
          walk(n.right);
        };
        walk(s.root);
        expected.push(
          [
            'ok',
            treeSize(s),
            treeHeight(s),
            treeBlackHeight(s),
            s.rotations - before.rotations,
            ...shape,
          ].join(' '),
        );
        break;
      }
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

export default redBlack;
