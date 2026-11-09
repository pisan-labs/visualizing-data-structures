import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/binary_tree.hpp?raw';
import javaSource from './code/java/BinaryTree.java?raw';
import pythonSource from './code/python/binary_tree.py?raw';
import explain from './explain.md?raw';
import buildGaps from './examples/build-gaps.json';
import callStack from './examples/call-stack.json';
import explicitStack from './examples/explicit-stack.json';
import fourOrders from './examples/four-orders.json';
import levelQueue from './examples/level-queue.json';
import postorderIterative from './examples/postorder-iterative.json';
import skewedDepth from './examples/skewed-depth.json';
import widestLevel from './examples/widest-level.json';
import {
  defaults,
  describe,
  formatLevelOrder,
  init,
  initialSay,
  initialVars,
  MAX_NODES,
  ops,
  parseLevelOrder,
  pseudocode,
  type BTExtra,
  type BTSettings,
  type BTState,
} from './model';
import { binaryTreePractice } from './practice';
import {
  completeList,
  fullShape,
  randomShape,
  randomTreeList,
  shapeToList,
  skewedList,
} from './shapes';
import { view } from './view';

/** Accept a level-order list and hand the operation its canonical text. */
export function parseList(text: string): Value | Error {
  const tokens = parseLevelOrder(text);
  return tokens instanceof Error ? tokens : formatLevelOrder(tokens);
}

const size = (n: number) => Math.max(1, Math.min(n, MAX_NODES));

export const binaryTree: VizDef<BTState, BTSettings, BTExtra> = {
  id: 'binary-tree',
  title: 'Binary tree and traversals',
  family: 'Trees',
  blurb:
    'Build a binary tree from a level-order list, then walk it in preorder, inorder, postorder and level order.',
  settings: [
    {
      kind: 'choice',
      key: 'mode',
      label: 'Preorder, inorder and postorder',
      options: [
        { value: 'recursive', label: 'Recursive (the call stack keeps track)' },
        { value: 'iterative', label: 'Iterative (an explicit stack keeps track)' },
      ],
      help: 'Both visit the nodes in the same order. Level order always uses a queue.',
    },
    { kind: 'boolean', key: 'nulls', label: 'Draw empty children (nil) as small squares' },
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
      label: 'Level order',
      placeholder: 'e.g. 1 2 3 _ 5',
      maxLength: 200,
      sample: '1 2 3 4 5 _ 6',
      parse: parseList,
    },
    buttons: [
      { op: 'build', label: 'Build', usesInput: true, primary: true },
      { op: 'preorder', label: 'Preorder', usesInput: false },
      { op: 'inorder', label: 'Inorder', usesInput: false },
      { op: 'postorder', label: 'Postorder', usesInput: false },
      { op: 'levelorder', label: 'Level order', usesInput: false },
    ],
    random: {
      label: 'Random tree',
      make: (rng) => [['build', randomTreeList(rng, rng.int(5, 12))]],
    },
    presets: [
      { label: 'Complete', make: (_rng, n) => [['build', completeList(size(n))]] },
      {
        label: 'Full',
        make: (rng, n) => [['build', shapeToList(fullShape(rng, size(n) | 1))]],
      },
      { label: 'Skewed', make: (_rng, n) => [['build', skewedList(size(n))]] },
      {
        label: 'Random shape',
        make: (rng, n) => [['build', shapeToList(randomShape(rng, size(n)))]],
      },
    ],
    sizes: [7, 15, 31],
  },
  explain,
  practice: binaryTreePractice(() => binaryTree),
  complexity: [
    {
      op: 'preorder, inorder, postorder',
      best: {
        cost: 'O(n)',
        why: 'Every node is visited once, whatever the shape.',
        example: 'four-orders',
      },
      average: { cost: 'O(n)', why: 'Each node costs one visit and two calls, one per child.' },
      worst: {
        cost: 'O(n)',
        why: 'A chain still has n nodes and n + 1 empty children to check.',
        example: 'skewed-depth',
      },
      note: 'Each call on an empty child costs O(1); there are n + 1 of them.',
    },
    {
      op: 'stack depth (extra space)',
      best: {
        cost: 'O(log n)',
        why: 'A complete tree is about log₂ n levels deep, and the stack holds one path.',
        example: 'call-stack',
      },
      average: { cost: 'O(h)', why: 'One frame per level of the path being walked: the height h.' },
      worst: {
        cost: 'O(n)',
        why: 'In a chain the path is the whole tree, so the stack holds every node.',
        example: 'skewed-depth',
      },
      note: 'The same for the call stack (recursive) and an explicit stack (iterative).',
    },
    {
      op: 'levelorder()',
      best: { cost: 'O(n)', why: 'Every node enters and leaves the queue once.' },
      average: { cost: 'O(n)', why: 'Each dequeue does O(1) work plus up to two enqueues.' },
      worst: { cost: 'O(n)', why: 'Same work for any shape.', example: 'level-queue' },
    },
    {
      op: 'queue length (extra space)',
      best: {
        cost: 'O(1)',
        why: 'In a chain each level has one node, so the queue never holds more than one.',
        example: 'skewed-depth',
      },
      average: { cost: 'O(w)', why: 'The queue holds about one level: the width w of the tree.' },
      worst: {
        cost: 'O(n)',
        why: 'The last level of a complete tree holds about half of the nodes.',
        example: 'widest-level',
      },
    },
    {
      op: 'build(list)',
      best: { cost: 'O(n)', why: 'One pass over the list.', example: 'build-gaps' },
      average: { cost: 'O(n)', why: 'Each node enters and leaves the queue once.' },
      worst: { cost: 'O(n)', why: 'A list with gaps is still read once, left to right.' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BTSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    fourOrders,
    buildGaps,
    callStack,
    explicitStack,
    postorderIterative,
    levelQueue,
    skewedDepth,
    widestLevel,
  ] as unknown as SavedExample[],
  opening: 'four-orders',
  preview: { example: 'four-orders' },
};

/**
 * Driver protocol for the code tabs: one operation per line.
 *   build <values, _ for a gap>  ->  "<size> <height>"
 *   preorder | inorder | postorder | levelorder  ->  the values in order, or "empty"
 * A list the model rejects leaves the tree alone, so it is not sent to the driver.
 */
function codeScript(calls: OpCall[], settings: BTSettings) {
  const t = new Timeline(binaryTree, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, arg] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    if (op === 'build') {
      const tokens = parseLevelOrder(arg!);
      if (tokens instanceof Error) return;
      input.push(`build ${formatLevelOrder(tokens)}`);
      expected.push(`${last.vars?.size} ${last.vars?.height}`);
      return;
    }
    input.push(op);
    expected.push(String(last.vars?.output || 'empty'));
  });
  return { input, expected };
}

export default binaryTree;
