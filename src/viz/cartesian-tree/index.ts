import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { preorderKeys } from '../_bst/tree-kit';
import cppSource from './code/cpp/cartesian_tree.hpp?raw';
import javaSource from './code/java/CartesianTree.java?raw';
import pythonSource from './code/python/cartesian_tree.py?raw';
import buildRightSpine from './examples/build-right-spine.json';
import maxOnTop from './examples/max-on-top.json';
import newMinimum from './examples/new-minimum.json';
import rangeMinimum from './examples/range-minimum.json';
import sortedChain from './examples/sorted-chain.json';
import explain from './explain.md?raw';
import {
  MAX_LENGTH,
  MAX_VALUE,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseValue,
  pseudocode,
  type CartesianExtra,
  type CartesianSettings,
  type CartesianState,
} from './model';
import { cartesianPractice } from './practice';
import { view } from './view';

const appends = (xs: number[]): OpCall[] => xs.map((x) => ['append', x] as OpCall);
const values = (rng: Rng, n: number) =>
  Array.from({ length: Math.min(n, MAX_LENGTH) }, () => rng.int(1, MAX_VALUE));
const distinctValues = (rng: Rng, n: number) => {
  const set = new Set<number>();
  while (set.size < Math.min(n, MAX_LENGTH)) set.add(rng.int(1, MAX_VALUE));
  return [...set];
};

export const cartesianTree: VizDef<CartesianState, CartesianSettings, CartesianExtra> = {
  id: 'cartesian-tree',
  title: 'Cartesian tree',
  family: 'Trees',
  blurb:
    'A tree built from an array: a heap by value, and read left to right it gives back the array. A stack builds it in O(n), and a range minimum is a common ancestor.',
  settings: [
    {
      kind: 'choice',
      key: 'heap',
      label: 'Heap order',
      options: [
        { value: 'min', label: 'Smallest value on top (range minimum)' },
        { value: 'max', label: 'Largest value on top (range maximum)' },
      ],
      help: 'Equal values keep the earlier one higher.',
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
      label: 'Value',
      placeholder: 'e.g. 5 2 8 6, or two indexes',
      maxLength: 200,
      sample: '42',
      parse: parseValue,
    },
    buttons: [
      { op: 'append', label: 'Append', usesInput: true, bulk: true, primary: true },
      {
        op: 'rmq',
        label: 'Range minimum',
        usesInput: true,
        args: ['a first index', 'a last index'],
      },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Append random', make: (rng) => [['append', rng.int(1, MAX_VALUE)]] },
    presets: [
      { label: 'Random values', make: (rng, n) => appends(distinctValues(rng, n)) },
      {
        label: 'Sorted, rising (no pops, a chain)',
        make: (rng, n) => appends(distinctValues(rng, n).sort((a, b) => a - b)),
      },
      {
        label: 'Sorted, falling (each append pops one)',
        make: (rng, n) => appends(distinctValues(rng, n).sort((a, b) => b - a)),
      },
      {
        label: 'Valley: falling, then rising',
        make: (rng, n) => {
          const xs = distinctValues(rng, n).sort((a, b) => a - b);
          const left = xs.filter((_, i) => i % 2 === 0).reverse();
          const right = xs.filter((_, i) => i % 2 === 1);
          return appends([...left, ...right]);
        },
      },
      { label: 'Duplicates', make: (rng, n) => appends(values(rng, n).map((x) => (x % 4) + 1)) },
      {
        label: 'Rising, then a new minimum (pops all)',
        make: (rng, n) => {
          const xs = distinctValues(rng, Math.max(2, n)).sort((a, b) => a - b);
          return appends([...xs.slice(1), xs[0]!]);
        },
      },
    ],
    sizes: [6, 9, 12],
  },
  explain,
  complexity: [
    {
      op: 'build from n values',
      best: {
        cost: 'O(n)',
        why: 'Rising values: every append compares once and pops nothing.',
        example: 'sorted-chain',
      },
      average: {
        cost: 'O(n)',
        why: 'Each value is pushed once and popped at most once, so all the pops together number fewer than n.',
        example: 'build-right-spine',
      },
      worst: {
        cost: 'O(n)',
        why: 'Even when one append pops the whole stack, those nodes were pushed by earlier appends and never come back.',
        example: 'new-minimum',
      },
    },
    {
      op: 'append(x)',
      best: { cost: 'O(1)', why: 'x is not smaller than the top of the stack: no pops.' },
      average: {
        cost: 'O(1) amortized',
        why: 'n appends make fewer than n pops in all.',
        example: 'build-right-spine',
      },
      worst: {
        cost: 'O(n)',
        why: 'A new minimum pops the whole right spine.',
        example: 'new-minimum',
      },
    },
    {
      op: 'rmq(i, j) by walking down',
      best: { cost: 'O(1)', why: 'The root is inside the range: it is the answer.' },
      average: {
        cost: 'O(log n) expected',
        why: 'For values in random order the tree is a random BST shape, with depth about 2 ln n.',
        example: 'range-minimum',
      },
      worst: {
        cost: 'O(n)',
        why: 'Sorted values make a chain, and the walk goes down it.',
        example: 'sorted-chain',
      },
      note: 'With an O(1) lowest-common-ancestor structure on top, every query takes O(1).',
    },
  ],
  practice: cartesianPractice(() => cartesianTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as CartesianSettings),
  },
  examples: [
    buildRightSpine,
    newMinimum,
    rangeMinimum,
    sortedChain,
    maxOnTop,
  ] as unknown as SavedExample[],
  preview: { example: 'build-right-spine', level: 2 },
};

/**
 * Driver protocol for the code tabs (smallest value on top).
 *   append x  ->  "ok <pops> <values in preorder>"
 *   rmq i j   ->  "<index> <value> <nodes visited>" | "bad"
 *   clear     ->  "ok"
 */
function codeScript(calls: OpCall[], settings: CartesianSettings) {
  const t = new Timeline(cartesianTree, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const s = e.end;
    const v = e.steps.at(-1)!.vars ?? {};
    const [op, a, b] = e.call;
    if (op === 'append') {
      const x = parseValue(a!);
      if (x instanceof Error) return;
      // A full array refuses the value and changes nothing; the code has no such limit.
      if (s.order.length === before.order.length) return;
      input.push(`append ${x}`);
      expected.push(['ok', s.pops - before.pops, ...preorderKeys(s)].join(' '));
    } else if (op === 'rmq') {
      const ok = /^\d+$/.test(String(a).trim()) && /^\d+$/.test(String(b).trim());
      if (!ok) return;
      input.push(`rmq ${Number(a)} ${Number(b)}`);
      expected.push(v.index === undefined ? 'bad' : `${v.index} ${v.min} ${v.visited}`);
    } else {
      input.push(op);
      expected.push('ok');
    }
  });
  return { input, expected };
}

export default cartesianTree;
