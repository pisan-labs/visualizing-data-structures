import type { Rng } from '../../engine/rng';
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
  type Token,
} from './model';
import { view } from './view';

/** Accept a level-order list and hand the operation its canonical text. */
export function parseList(text: string): Value | Error {
  const tokens = parseLevelOrder(text);
  return tokens instanceof Error ? tokens : formatLevelOrder(tokens);
}

type Shape = { left: Shape | null; right: Shape | null };

/** Level-order list of a shape, numbering the nodes 1, 2, 3, ... level by level. */
function shapeToList(root: Shape | null): string {
  if (!root) return '_';
  const out: Token[] = [];
  const queue: (Shape | null)[] = [root];
  let n = 0;
  while (queue.length) {
    const x = queue.shift()!;
    if (!x) {
      out.push(null);
      continue;
    }
    out.push(++n);
    queue.push(x.left, x.right);
  }
  while (out[out.length - 1] === null) out.pop();
  return formatLevelOrder(out);
}

const leaf = (): Shape => ({ left: null, right: null });

/** A random shape: each new node takes a random free child spot. */
export function randomShape(rng: Rng, n: number): Shape | null {
  if (n <= 0) return null;
  const root = leaf();
  const spots: [Shape, 'left' | 'right'][] = [
    [root, 'left'],
    [root, 'right'],
  ];
  for (let k = 1; k < n; k++) {
    const [parent, side] = spots.splice(rng.int(0, spots.length - 1), 1)[0]!;
    const child = leaf();
    parent[side] = child;
    spots.push([child, 'left'], [child, 'right']);
  }
  return root;
}

/** A random full tree (every node has 0 or 2 children) with n nodes, n odd. */
function fullShape(rng: Rng, n: number): Shape {
  const root = leaf();
  const leaves = [root];
  for (let count = 1; count + 2 <= n; count += 2) {
    const x = leaves.splice(rng.int(0, leaves.length - 1), 1)[0]!;
    x.left = leaf();
    x.right = leaf();
    leaves.push(x.left, x.right);
  }
  return root;
}

function completeList(n: number): string {
  return Array.from({ length: n }, (_, i) => i + 1).join(' ');
}

function skewedList(n: number): string {
  const out: string[] = ['1'];
  for (let k = 2; k <= n; k++) out.push(String(k), '_');
  if (out[out.length - 1] === '_') out.pop();
  return out.join(' ');
}

/** A random shape with random distinct values, for practice. */
function randomTreeList(rng: Rng, n: number): string {
  const values: number[] = [];
  while (values.length < n) {
    const v = rng.int(1, 99);
    if (!values.includes(v)) values.push(v);
  }
  let k = 0;
  return shapeToList(randomShape(rng, n))
    .split(' ')
    .map((t) => (t === '_' ? t : String(values[k++])))
    .join(' ');
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
