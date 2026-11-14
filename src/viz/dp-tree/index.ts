import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import type { Token } from '../binary-tree/model';
import { completeList, randomShape, shapeToList, skewedList } from '../binary-tree/shapes';
import cppSource from './code/cpp/tree_choice.hpp?raw';
import javaSource from './code/java/TreeChoice.java?raw';
import pythonSource from './code/python/tree_choice.py?raw';
import aTie from './examples/a-tie.json';
import everySubset from './examples/every-subset.json';
import mixedLevels from './examples/mixed-levels.json';
import oneNode from './examples/one-node.json';
import tenNodes from './examples/ten-nodes.json';
import twoInARow from './examples/two-in-a-row.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  listOf,
  MAX_NODES,
  ops,
  preorder,
  pseudocode,
  readTree,
  treeOf,
  type TreeExtra,
  type TreeSettings,
  type TreeState,
} from './model';
import { randomTree, treePractice } from './practice';
import { view } from './view';

/** The input box: a level-order list of values, handed on in its canonical text. */
export function parseTree(text: string): Value | Error {
  const tokens = readTree(text);
  return typeof tokens === 'string' ? new Error(tokens) : listOf(treeOf(tokens));
}

const size = (n: number) => Math.max(1, Math.min(n, MAX_NODES));
const solve = (list: string): OpCall[] => [['build', list], ['solve']];

/** The numbers of a shape's list replaced by values. */
const withValues = (list: string, value: (k: number) => number) => {
  let k = 0;
  return list
    .split(' ')
    .map((t) => (t === '_' ? t : String(value(k++))))
    .join(' ');
};

const presets: Preset[] = [
  { label: 'Random tree', make: (rng, n) => solve(randomTree(rng, size(n), 1, 20)) },
  {
    label: 'Complete tree',
    make: (rng, n) => solve(withValues(completeList(size(n)), () => rng.int(1, 20))),
  },
  {
    label: 'A chain (one child each)',
    make: (rng, n) => solve(withValues(skewedList(size(n)), () => rng.int(1, 9))),
  },
  {
    label: 'Heavy leaves, light inner nodes',
    make: (rng, n) => {
      const list = shapeToList(randomShape(rng, size(n)));
      const nodes = treeOf(readTree(list) as Token[]);
      const leaf = nodes.map((v) => v.left === null && v.right === null);
      return solve(withValues(list, (k) => (leaf[k] ? rng.int(10, 20) : rng.int(1, 3))));
    },
  },
  {
    label: 'Every node the same value',
    make: (rng, n) => solve(withValues(shapeToList(randomShape(rng, size(n))), () => 5)),
  },
  { label: 'Neither level wins', make: () => solve('4 9 2 1 3 6 4') },
];

export const dpTree: VizDef<TreeState, TreeSettings, TreeExtra> = {
  id: 'dp-tree',
  title: 'DP on trees',
  family: 'DP patterns',
  blurb:
    'Choose nodes of a tree for the largest total, never a node with its parent: two values per node, take it or skip it, filled from the leaves up in one post-order walk. n calls against an exponential number for trying every allowed subset.',
  settings: [
    approachSetting({
      pattern: 'Two values per node, from the leaves up, O(n)',
      naive: 'Try every allowed subset, exponential',
    }),
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
      label: 'Tree (level order)',
      placeholder: 'e.g. 4 9 2 1 3 6 4, _ for a gap',
      maxLength: 80,
      sample: '4 9 2 1 3 6 4',
      parse: parseTree,
    },
    buttons: [
      { op: 'solve', label: 'Best total', usesInput: false, primary: true },
      { op: 'build', label: 'Build', usesInput: true },
    ],
    random: {
      label: 'Random tree',
      make: (rng) => solve(randomTree(rng, rng.int(5, 8), 1, 20)),
    },
    presets,
    sizes: [5, 7, MAX_NODES],
  },
  explain,
  complexity: [
    {
      op: 'best total, two values per node',
      best: {
        cost: 'Θ(n)',
        why: 'One call per node, whatever the values: a single node is one call.',
        example: 'one-node',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Each call adds a few numbers from its children’s two values.',
        example: 'mixed-levels',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Ten nodes, ten calls, against 437 for trying every allowed subset.',
        example: 'ten-nodes',
      },
      note: 'Reading the chosen nodes back down from the root is one more pass, O(n).',
    },
    {
      op: 'best total, every allowed subset',
      best: {
        cost: 'Θ(φⁿ), φ ≈ 1.62',
        why: 'Even a chain has Fibonacci-many allowed subsets: 4 nodes, 8 subsets, 19 calls.',
        example: 'two-in-a-row',
      },
      average: {
        cost: 'exponential',
        why: 'Seven nodes in three levels: 41 subsets and 97 calls.',
        example: 'every-subset',
      },
      worst: {
        cost: 'O(2ⁿ)',
        why: 'At most 2ⁿ subsets, and bushier trees allow more of them: ten nodes in four levels take 437 calls.',
        example: 'ten-nodes',
      },
      note: 'Listing all 2ⁿ subsets and checking each one would be worse still: this recursion never builds a subset that breaks the rule.',
    },
    {
      op: 'extra space',
      best: {
        cost: 'O(log n)',
        why: 'A bushy tree is about log₂ n levels deep, and the stack holds one path.',
        example: 'mixed-levels',
      },
      average: { cost: 'O(h)', why: 'One frame per level: the tree’s height h.' },
      worst: {
        cost: 'O(n)',
        why: 'A chain is n levels deep. Keeping every node’s two values also takes O(n).',
        example: 'two-in-a-row',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(dpTree, settings as TreeSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        if (e.call[0] !== 'solve' || e.end.best === null) continue;
        const nodes = e.end.nodes;
        const chosen = new Set(e.end.chosen ?? []);
        const values = preorder(nodes)
          .filter((u) => chosen.has(u))
          .map((u) => nodes[u]!.value);
        input.push(`best ${listOf(nodes)}`);
        expected.push([e.end.best, ...values].join(' '));
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    mixedLevels,
    everySubset,
    twoInARow,
    aTie,
    oneNode,
    tenNodes,
  ] as unknown as SavedExample[],
  practice: treePractice(() => dpTree),
  preview: { example: 'mixed-levels', level: 2, hide: ['legend-'] },
};

export default dpTree;
