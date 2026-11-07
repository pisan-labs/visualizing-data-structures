import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { ascending, distinctKeys, treeHeight, treeSize } from '../avl/tree-kit';
import cppSource from './code/cpp/treap.hpp?raw';
import javaSource from './code/java/Treap.java?raw';
import pythonSource from './code/python/treap.py?raw';
import chainPriorities from './examples/chain-priorities.json';
import deleteRotateDown from './examples/delete-rotate-down.json';
import insertRotateUp from './examples/insert-rotate-up.json';
import maxHeap from './examples/max-heap.json';
import sortedKeys from './examples/sorted-keys.json';
import typedPriorities from './examples/typed-priorities.json';
import explain from './explain.md?raw';
import {
  MAX_PRIORITY,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseTreapArg,
  parseTreapInput,
  pseudocode,
  type TreapExtra,
  type TreapSettings,
  type TreapState,
} from './model';
import { treapPractice } from './practice';
import { view } from './view';

/** Inserts with explicit priorities, so presets work whether priorities are random or typed. */
const withPriorities = (keys: number[], priorities: number[]): OpCall[] =>
  keys.map((k, i) => ['insert', `${k}:${priorities[i]}`] as OpCall);

const randomPriorities = (rng: Rng, n: number) =>
  Array.from({ length: n }, () => rng.int(1, MAX_PRIORITY));

/** n distinct priorities, smallest first. */
function risingPriorities(rng: Rng, n: number): number[] {
  const set = new Set<number>();
  while (set.size < Math.min(n, MAX_PRIORITY)) set.add(rng.int(1, MAX_PRIORITY));
  return ascending([...set]);
}

export const treap: VizDef<TreapState, TreapSettings, TreapExtra> = {
  id: 'treap',
  title: 'Treap',
  family: 'Trees',
  blurb:
    'A binary search tree by keys and a heap by random priorities at the same time. Rotations restore the heap order, and random priorities keep the tree shallow.',
  settings: [
    {
      kind: 'choice',
      key: 'heap',
      label: 'Heap order',
      options: [
        { value: 'min', label: 'Smaller priorities sit higher (CLRS)' },
        { value: 'max', label: 'Larger priorities sit higher' },
      ],
    },
    {
      kind: 'choice',
      key: 'priority',
      label: 'Priorities',
      options: [
        { value: 'random', label: 'Random, from the seeded generator (type 50:7 to choose one)' },
        { value: 'typed', label: 'Typed by hand: every insert needs one, as in 50:7' },
      ],
      help: 'Typed priorities make an exercise come out the same for everyone.',
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
      placeholder: 'e.g. 42, or 42:7 for priority 7',
      maxLength: 200,
      sample: '50:20',
      parse: parseTreapInput,
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
    random: {
      label: 'Insert random',
      make: (rng) => [['insert', `${rng.int(1, 99)}:${rng.int(1, MAX_PRIORITY)}`]],
    },
    presets: [
      {
        label: 'Random keys',
        make: (rng, n) => withPriorities(distinctKeys(rng, n), randomPriorities(rng, n)),
      },
      {
        label: 'Sorted keys (still shallow)',
        make: (rng, n) => withPriorities(ascending(distinctKeys(rng, n)), randomPriorities(rng, n)),
      },
      {
        label: 'Sorted keys and priorities (a chain)',
        make: (rng, n) => {
          const p = risingPriorities(rng, n);
          return withPriorities(ascending(distinctKeys(rng, p.length)), p);
        },
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
        cost: 'O(log n) expected',
        why: 'With random priorities the tree has the shape of a BST built from a random insertion order, whatever order the keys came in.',
        example: 'sorted-keys',
      },
      worst: {
        cost: 'O(n)',
        why: 'Priorities that rise with the keys build a chain. Random priorities make that very unlikely.',
        example: 'chain-priorities',
      },
    },
    {
      op: 'insert(k)',
      best: { cost: 'O(1)', why: 'The tree is empty, or k belongs right under the root.' },
      average: {
        cost: 'O(log n) expected',
        why: 'One walk down, then a few rotations back up.',
        example: 'insert-rotate-up',
      },
      worst: {
        cost: 'O(n)',
        why: 'A chain-shaped treap, from bad priorities.',
        example: 'chain-priorities',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'k is the root and has at most one child.' },
      average: {
        cost: 'O(log n) expected',
        why: 'Find k, then rotate it down until it has at most one child.',
        example: 'delete-rotate-down',
      },
      worst: { cost: 'O(n)', why: 'The same chain as for search.' },
    },
    {
      op: 'rotations per insert',
      best: { cost: '0', why: "The new key's priority already belongs below its parent's." },
      average: {
        cost: 'fewer than 2 expected',
        why: 'A new leaf usually stops after a rotation or two; CLRS works this out in a problem on treaps.',
        example: 'insert-rotate-up',
      },
      worst: {
        cost: 'O(n)',
        why: 'The new key has the top priority and starts at the bottom of a chain.',
      },
    },
  ],
  practice: treapPractice(() => treap),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TreapSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    insertRotateUp,
    deleteRotateDown,
    sortedKeys,
    chainPriorities,
    typedPriorities,
    maxHeap,
  ] as unknown as SavedExample[],
  preview: { example: 'sorted-keys' },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (smaller priorities
 * sit higher). Random priorities come from the model's seeded generator, so each insert passes
 * the priority the model used.
 *   insert k p  ->  "ok <N> <height> <rotations> <key:priority in preorder>" | "duplicate"
 *   delete k    ->  "ok <N> <height> <rotations> <key:priority in preorder>" | "missing"
 *   search k    ->  "found" | "missing"
 *   min | max   ->  the key | "empty"
 *   inorder     ->  the keys | "empty"
 *   clear       ->  "ok"
 */
function codeScript(calls: OpCall[], settings: TreapSettings) {
  const t = new Timeline(treap, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, raw] = e.call;
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const s = e.end;
    const v = e.steps.at(-1)!.vars ?? {};
    let k = 0;
    if (raw !== undefined) {
      const a = parseTreapArg(raw);
      if (a instanceof Error) return; // The model refuses it and changes nothing.
      k = a.key;
    }
    const grew = treeSize(s) > treeSize(before);
    const shrank = treeSize(s) < treeSize(before);
    const shape = () => {
      const out: string[] = [];
      const walk = (u: number | null) => {
        if (u === null) return;
        const n = s.nodes[u]!;
        out.push(`${n.key}:${n.priority}`);
        walk(n.left);
        walk(n.right);
      };
      walk(s.root);
      return out;
    };
    const ok = () =>
      ['ok', treeSize(s), treeHeight(s), s.rotations - before.rotations, ...shape()].join(' ');
    switch (op) {
      case 'insert': {
        // With the default settings an insert is only refused when k is already there.
        const node = Object.values(s.nodes).find((n) => n.key === k);
        input.push(`insert ${k} ${node?.priority ?? 0}`);
        expected.push(grew ? ok() : 'duplicate');
        break;
      }
      case 'delete':
        input.push(`delete ${k}`);
        expected.push(shrank ? ok() : 'missing');
        break;
      case 'search':
        input.push(`search ${k}`);
        expected.push(v.found ? 'found' : 'missing');
        break;
      case 'min':
      case 'max':
        input.push(op);
        expected.push(v.returned === 'nil' ? 'empty' : String(v.returned));
        break;
      case 'inorder':
        input.push(op);
        expected.push(String(v.output || 'empty'));
        break;
      default:
        input.push(op);
        expected.push('ok');
    }
  });
  return { input, expected };
}

export default treap;
