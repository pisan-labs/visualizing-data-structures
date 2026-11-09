import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctKeys,
  inserts,
  parseKey,
  preorderKeys,
  treeHeight,
  treeSize,
  zigzagOrderOf,
} from '../_bst/tree-kit';
import cppSource from './code/cpp/scapegoat.hpp?raw';
import javaSource from './code/java/ScapegoatTree.java?raw';
import pythonSource from './code/python/scapegoat.py?raw';
import alphaThreeQuarters from './examples/alpha-three-quarters.json';
import deleteRebuildAll from './examples/delete-rebuild-all.json';
import randomStaysLow from './examples/random-stays-low.json';
import scapegoatHalfway from './examples/scapegoat-halfway.json';
import sortedRebuilds from './examples/sorted-rebuilds.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type ScapegoatExtra,
  type ScapegoatSettings,
  type ScapegoatState,
} from './model';
import { scapegoatPractice } from './practice';
import { view } from './view';

export const scapegoatTree: VizDef<ScapegoatState, ScapegoatSettings, ScapegoatExtra> = {
  id: 'scapegoat-tree',
  title: 'Scapegoat tree',
  family: 'Trees',
  blurb:
    'A binary search tree that never rotates. When a new key lands too deep, it blames an ancestor, the scapegoat, and rebuilds that subtree perfectly balanced.',
  settings: [
    {
      kind: 'choice',
      key: 'alpha',
      label: 'Balance factor α',
      options: [
        { value: '0.6', label: 'α = 0.6 (strict: low trees, more rebuilds)' },
        { value: '2/3', label: 'α = 2/3' },
        { value: '0.75', label: 'α = 0.75 (loose: taller trees, fewer rebuilds)' },
      ],
      help: 'A child may hold at most α of its parent’s subtree, and no node may sit deeper than log base 1/α of N.',
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
      placeholder: 'e.g. 42, or 10 20 30',
      maxLength: 200,
      sample: '50',
      parse: parseKey,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
      { op: 'inorder', label: 'Inorder', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Sorted keys (rebuilds keep it low)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n))),
      },
      {
        label: 'Zigzag keys',
        make: (rng, n) => inserts(zigzagOrderOf(ascending(distinctKeys(rng, n)))),
      },
      {
        label: 'Insert, then delete half (a full rebuild)',
        make: (rng, n) => {
          const keys = distinctKeys(rng, n);
          const gone = keys.slice(0, Math.ceil(n / 2));
          return [...inserts(keys), ...gone.map((k) => ['delete', k] as OpCall)];
        },
      },
    ],
    sizes: [7, 10, 15],
  },
  explain,
  complexity: [
    {
      op: 'search(k)',
      best: { cost: 'O(1)', why: 'k is at the root.' },
      average: {
        cost: 'O(log n)',
        why: 'Inserts keep every node within depth log base 1/α of n.',
        example: 'random-stays-low',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The depth limit holds after every insert; deletes trigger a full rebuild before the tree gets too sparse.',
        example: 'sorted-rebuilds',
      },
    },
    {
      op: 'insert(k)',
      best: {
        cost: 'O(log n)',
        why: 'One walk down; the new node is within the limit, so nothing else happens.',
        example: 'random-stays-low',
      },
      average: {
        cost: 'O(log n) amortized',
        why: 'A rebuild of a subtree of size m costs O(m), but it takes about m inserts to unbalance that subtree again.',
        example: 'sorted-rebuilds',
      },
      worst: {
        cost: 'O(n)',
        why: 'The scapegoat can be the root, and then the whole tree is rebuilt.',
        example: 'scapegoat-halfway',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(log n)', why: 'A BST delete, and N stays above α × max N.' },
      average: {
        cost: 'O(log n) amortized',
        why: 'A full rebuild happens only after a constant fraction of the nodes has been deleted.',
        example: 'delete-rebuild-all',
      },
      worst: {
        cost: 'O(n)',
        why: 'This delete is the one that rebuilds the whole tree.',
        example: 'delete-rebuild-all',
      },
    },
  ],
  practice: scapegoatPractice(() => scapegoatTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as ScapegoatSettings),
  },
  examples: [
    sortedRebuilds,
    scapegoatHalfway,
    deleteRebuildAll,
    randomStaysLow,
    alphaThreeQuarters,
  ] as unknown as SavedExample[],
  opening: 'sorted-rebuilds',
  preview: { example: 'sorted-rebuilds' },
};

/**
 * Driver protocol for the code tabs (α = 2/3).
 *   insert k | delete k  ->  "ok <N> <height> <rebuilds> <keys in preorder>" | "duplicate" | "missing"
 *   search k             ->  "found" | "missing"
 *   inorder              ->  the keys | "empty"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: ScapegoatSettings) {
  const t = new Timeline(scapegoatTree, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const s = e.end;
    const v = e.steps.at(-1)!.vars ?? {};
    const [op, raw] = e.call;
    let k = 0;
    if (raw !== undefined) {
      const key = parseKey(raw);
      if (key instanceof Error) return;
      k = key;
    }
    const ok = () =>
      ['ok', treeSize(s), treeHeight(s), s.rebuilds - before.rebuilds, ...preorderKeys(s)].join(
        ' ',
      );
    switch (op) {
      case 'insert':
        input.push(`insert ${k}`);
        expected.push(treeSize(s) > treeSize(before) ? ok() : 'duplicate');
        break;
      case 'delete':
        input.push(`delete ${k}`);
        expected.push(treeSize(s) < treeSize(before) ? ok() : 'missing');
        break;
      case 'search':
        input.push(`search ${k}`);
        expected.push(v.found ? 'found' : 'missing');
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

export default scapegoatTree;
