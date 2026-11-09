import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  ascending,
  distinctKeys,
  inserts,
  parseKey,
  treeSize,
  zigzagOrderOf,
} from '../_bst/tree-kit';
import cppSource from './code/cpp/aa_tree.hpp?raw';
import javaSource from './code/java/AATree.java?raw';
import pythonSource from './code/python/aa_tree.py?raw';
import deleteInner from './examples/delete-inner.json';
import deleteLowers from './examples/delete-lowers-levels.json';
import fallingSkews from './examples/falling-skews.json';
import redBlackView from './examples/red-black-view.json';
import risingSplits from './examples/rising-splits.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type AAExtra,
  type AASettings,
  type AAState,
} from './model';
import { aaPractice } from './practice';
import { view } from './view';

export const aaTree: VizDef<AAState, AASettings, AAExtra> = {
  id: 'aa-tree',
  title: 'AA tree',
  family: 'Trees',
  blurb:
    'A red-black tree with the cases cut down: levels instead of colors, red links only on the right, and two small fixes, skew and split.',
  settings: [
    {
      kind: 'choice',
      key: 'draw',
      label: 'Drawing',
      options: [
        { value: 'levels', label: 'By level: horizontal links lie flat' },
        { value: 'redblack', label: 'As a red-black tree: horizontal children are red' },
      ],
      help: 'The same tree either way. A node on its parent’s level is a red node.',
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
        label: 'Rising keys (splits)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n))),
      },
      {
        label: 'Falling keys (skews, then splits)',
        make: (rng, n) => inserts(ascending(distinctKeys(rng, n)).reverse()),
      },
      {
        label: 'Zigzag keys',
        make: (rng, n) => inserts(zigzagOrderOf(ascending(distinctKeys(rng, n)))),
      },
      {
        label: 'Insert, then delete some',
        make: (rng, n) => {
          const keys = distinctKeys(rng, n);
          return [
            ...inserts(keys),
            ...keys.slice(0, Math.ceil(n / 3)).map((k) => ['delete', k] as OpCall),
          ];
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
        why: 'The levels keep the tree within about twice the height of a perfect tree.',
        example: 'rising-splits',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The level rules are the red-black rules, so the height is at most about 2 log₂ n.',
        example: 'falling-skews',
      },
    },
    {
      op: 'insert(k)',
      best: { cost: 'O(log n)', why: 'One walk down and back up, with no skews or splits.' },
      average: {
        cost: 'O(log n)',
        why: 'A skew and a split at most per level on the way up, each O(1).',
        example: 'rising-splits',
      },
      worst: {
        cost: 'O(log n)',
        why: 'Splits can ripple all the way to the root, one per level.',
        example: 'falling-skews',
      },
    },
    {
      op: 'delete(k)',
      best: { cost: 'O(log n)', why: 'Find k and a leaf neighbor; no levels change.' },
      average: {
        cost: 'O(log n)',
        why: 'At each node on the way up: lower a level, three skews and two splits, each O(1).',
        example: 'delete-lowers-levels',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The fixes can reach the root, still a constant amount of work per level.',
        example: 'delete-inner',
      },
    },
  ],
  practice: aaPractice(() => aaTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as AASettings),
  },
  examples: [
    risingSplits,
    fallingSkews,
    deleteLowers,
    deleteInner,
    redBlackView,
  ] as unknown as SavedExample[],
  opening: 'rising-splits',
  preview: { example: 'rising-splits', level: 2 },
};

/**
 * Driver protocol for the code tabs.
 *   insert k | delete k  ->  "ok <N> <skews> <splits> <key:level in preorder>" | "duplicate" | "missing"
 *   search k             ->  "found" | "missing"
 *   inorder              ->  the keys | "empty"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: AASettings) {
  const t = new Timeline(aaTree, { ...settings, ...defaults }, 1, calls);
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
    const shape = () => {
      const out: string[] = [];
      const walk = (u: number | null) => {
        if (u === null) return;
        const n = s.nodes[u]!;
        out.push(`${n.key}:${n.level}`);
        walk(n.left);
        walk(n.right);
      };
      walk(s.root);
      return out;
    };
    const ok = () =>
      ['ok', treeSize(s), s.skews - before.skews, s.splits - before.splits, ...shape()].join(' ');
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

export default aaTree;
