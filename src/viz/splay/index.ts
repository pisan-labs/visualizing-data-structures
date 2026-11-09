import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctKeys,
  inorderKeys,
  inserts,
  parseKey,
  preorderKeys,
  treeHeight,
  treeSize,
} from '../_bst/tree-kit';
import cppSource from './code/cpp/splay.hpp?raw';
import javaSource from './code/java/SplayTree.java?raw';
import pythonSource from './code/python/splay.py?raw';
import deleteBst from './examples/delete-bst.json';
import deleteJoin from './examples/delete-join.json';
import repeatedAccess from './examples/repeated-access.json';
import searchMiss from './examples/search-miss.json';
import zigZag from './examples/zig-zag.json';
import zigZig from './examples/zig-zig.json';
import zig from './examples/zig.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type SplayExtra,
  type SplaySettings,
  type SplayState,
} from './model';
import { splayPractice } from './practice';
import { view } from './view';

export const splayTree: VizDef<SplayState, SplaySettings, SplayExtra> = {
  id: 'splay',
  title: 'Splay tree',
  family: 'Trees',
  blurb:
    'A binary search tree that moves every key it touches to the root with zig, zig-zig and zig-zag steps, so keys you use often stay near the top.',
  settings: [
    {
      kind: 'choice',
      key: 'delete',
      label: 'Delete',
      options: [
        {
          value: 'join',
          label:
            'Splay the key to the root, remove it, then splay the largest key on its left up to join the two sides (Sleator and Tarjan)',
        },
        {
          value: 'bst',
          label: 'Delete as in a BST, then splay the parent of the removed node',
        },
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
      { op: 'search', label: 'Search', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false },
      { op: 'min', label: 'Min', usesInput: false, more: true },
      { op: 'max', label: 'Max', usesInput: false, more: true },
      { op: 'inorder', label: 'Inorder', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random order', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Sorted (makes a chain)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n))),
      },
      {
        label: 'Sorted, then search the deepest key',
        make: (rng, n) => {
          const keys = ascending(distinctKeys(rng, n));
          return [...inserts(keys), ['search', keys[0]!] as OpCall];
        },
      },
      {
        label: 'Sorted, then search every key in order',
        make: (rng, n) => {
          const keys = ascending(distinctKeys(rng, n));
          return [...inserts(keys), ...keys.map((k) => ['search', k] as OpCall)];
        },
      },
    ],
    sizes: [7, 15, 31],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: {
        cost: 'O(1)',
        why: 'k is already at the root, maybe because it was the last key used.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'Over a long run of operations, each one costs O(log n) on average, even though a single one can be slow.',
        example: 'repeated-access',
      },
      worst: {
        cost: 'O(n)',
        why: 'One search can walk a chain of n nodes, but its splay roughly halves the depth of that path, so it cannot happen again and again.',
        example: 'repeated-access',
      },
      note: 'Amortized: the total for m operations on n keys is O((m + n) log n).',
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'k belongs right next to the root, as when keys arrive in sorted order.',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'The walk down and the splay back up cost the same, and the splay pays for itself.',
      },
      worst: {
        cost: 'O(n)',
        why: 'A single insert can walk a long path, the same as a search.',
        example: 'zig-zig',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(1)', why: 'k is at the root and has no left subtree.' },
      average: {
        cost: 'O(log n) amortized',
        why: 'A splay to bring k up, and one more splay on the left side to join the two halves.',
        example: 'delete-join',
      },
      worst: { cost: 'O(n)', why: 'Either splay can start at the bottom of a long path.' },
    },
    {
      op: 'search, the same key again',
      best: { cost: 'O(1)', why: 'The last key used is at the root: one comparison.' },
      average: { cost: 'O(1)', why: 'It is still at the root.' },
      worst: { cost: 'O(1)', why: 'Nothing has moved it since.', example: 'zig' },
      note: 'Recently used keys stay near the top, which is why splay trees suit caches.',
    },
  ],
  practice: splayPractice(() => splayTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SplaySettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    zig,
    zigZig,
    zigZag,
    repeatedAccess,
    searchMiss,
    deleteJoin,
    deleteBst,
  ] as unknown as SavedExample[],
  opening: 'repeated-access',
  preview: { example: 'repeated-access' },
};

/**
 * Driver protocol for the code tabs. The code follows the default settings (delete by joining),
 * so the model runs with those too. Every operation that splays reports the rotations it made
 * and the tree in preorder afterwards.
 *   insert k | delete k  ->  "ok" | "duplicate" | "missing", then N, height, rotations, preorder
 *   search k             ->  "found" | "missing", then rotations, preorder
 *   min | max            ->  the key, rotations, preorder | "empty"
 *   inorder              ->  the keys | "empty"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: SplaySettings) {
  const t = new Timeline(splayTree, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const [op, raw] = e.call;
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const v = e.steps.at(-1)!.vars ?? {};
    let k = 0;
    if (raw !== undefined) {
      const parsed = parseKey(raw);
      if (parsed instanceof Error) return; // The model refuses it and changes nothing.
      k = parsed;
    }
    input.push(raw === undefined ? op : `${op} ${k}`);
    const s = e.end;
    const turns = s.rotations - before.rotations;
    const line = (...words: (string | number)[]) => [...words, ...preorderKeys(s)].join(' ');
    const had = inorderKeys(before).includes(k);
    switch (op) {
      case 'insert':
        expected.push(line(had ? 'duplicate' : 'ok', treeSize(s), treeHeight(s), turns));
        break;
      case 'delete':
        expected.push(line(had ? 'ok' : 'missing', treeSize(s), treeHeight(s), turns));
        break;
      case 'search':
        expected.push(line(v.found ? 'found' : 'missing', turns));
        break;
      case 'min':
      case 'max':
        expected.push(v.returned === 'nil' ? 'empty' : line(String(v.returned), turns));
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

export default splayTree;
