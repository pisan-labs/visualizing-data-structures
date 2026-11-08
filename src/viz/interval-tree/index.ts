import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { treeHeight, treeSize } from '../_bst/tree-kit';
import cppSource from './code/cpp/interval_tree.hpp?raw';
import javaSource from './code/java/IntervalTree.java?raw';
import pythonSource from './code/python/interval_tree.py?raw';
import allOverlaps from './examples/all-overlaps.json';
import deleteFixesMax from './examples/delete-fixes-max.json';
import insertRaisesMax from './examples/insert-raises-max.json';
import noOverlap from './examples/no-overlap.json';
import overlapGoesLeft from './examples/overlap-goes-left.json';
import explain from './explain.md?raw';
import {
  MAX_END,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInterval,
  parseIntervalInput,
  pseudocode,
  type IntervalExtra,
  type IntervalSettings,
  type IntervalState,
} from './model';
import { intervalPractice } from './practice';
import { view } from './view';

/** n different intervals, each up to `width` long. */
export function randomIntervals(rng: Rng, n: number, width = 12): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  while (out.length < n) {
    const lo = rng.int(0, MAX_END - 1);
    const hi = Math.min(MAX_END, lo + rng.int(0, width));
    if (seen.has(`${lo},${hi}`)) continue;
    seen.add(`${lo},${hi}`);
    out.push([lo, hi]);
  }
  return out;
}

const ins = (xs: [number, number][]): OpCall[] => xs.map(([a, b]) => ['insert', `${a},${b}`]);

export const intervalTree: VizDef<IntervalState, IntervalSettings, IntervalExtra> = {
  id: 'interval-tree',
  title: 'Interval tree',
  family: 'Trees',
  blurb:
    'A binary search tree of intervals, keyed on the low ends, where each node also knows the largest high end below it. That one number lets an overlap search skip whole subtrees.',
  settings: [],
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
      label: 'Interval',
      placeholder: 'e.g. 15,23 (or one number for a point)',
      maxLength: 200,
      sample: '15,23',
      parse: parseIntervalInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'overlap', label: 'Find an overlap', usesInput: true },
      { op: 'all', label: 'Find all overlaps', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: {
      label: 'Insert random',
      make: (rng) => ins(randomIntervals(rng, 1)),
    },
    presets: [
      { label: 'Random intervals', make: (rng, n) => ins(randomIntervals(rng, n)) },
      {
        label: 'Sorted by low end (a chain)',
        make: (rng, n) => ins(randomIntervals(rng, n).sort((a, b) => a[0] - b[0] || a[1] - b[1])),
      },
      {
        label: 'Short intervals (few overlaps)',
        make: (rng, n) => ins(randomIntervals(rng, n, 3)),
      },
      {
        label: 'Long intervals (many overlaps)',
        make: (rng, n) => ins(randomIntervals(rng, n, 40)),
      },
      {
        label: 'Nested intervals',
        make: (rng, n) => {
          const mid = rng.int(30, 70);
          const out: [number, number][] = [];
          for (let k = 0; k < Math.min(n, 25); k++) out.push([mid - k * 2 - 1, mid + k * 2 + 1]);
          // Shuffle so the tree is not a chain.
          for (let i = out.length - 1; i > 0; i--) {
            const j = rng.int(0, i);
            [out[i], out[j]] = [out[j]!, out[i]!];
          }
          return ins(out.filter(([a, b]) => a >= 0 && b <= MAX_END));
        },
      },
    ],
    sizes: [6, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'overlap(i): find one',
      best: { cost: 'O(1)', why: 'The root overlaps i.' },
      average: {
        cost: 'O(h)',
        why: 'One path down: max tells the search which side can hold an overlap. On a balanced tree h = O(log n).',
        example: 'overlap-goes-left',
      },
      worst: {
        cost: 'O(n)',
        why: 'This page uses a plain BST, so sorted low ends make a chain. CLRS uses a red-black tree, which makes it O(log n).',
        example: 'no-overlap',
      },
    },
    {
      op: 'all(i): find all k overlaps',
      best: { cost: 'O(h)', why: 'Nothing overlaps, and max prunes every side branch.' },
      average: {
        cost: 'O(k log n) on a balanced tree',
        why: 'Each subtree visited either holds an overlap or is cut off one step in.',
        example: 'all-overlaps',
      },
      worst: { cost: 'O(n)', why: 'Every interval overlaps i, so every node is reported.' },
    },
    {
      op: 'insert(i)',
      best: { cost: 'O(1)', why: 'The tree is empty.' },
      average: {
        cost: 'O(h)',
        why: 'One walk down, raising max on the way: O(1) extra per node.',
        example: 'insert-raises-max',
      },
      worst: { cost: 'O(n)', why: 'A chain, on a plain BST.' },
    },
    {
      op: 'delete(i)',
      best: { cost: 'O(h)', why: 'Find it, splice it out, fix max up one path.' },
      average: {
        cost: 'O(h)',
        why: 'max is fixed only on the path from the lowest changed node to the root.',
        example: 'delete-fixes-max',
      },
      worst: { cost: 'O(n)', why: 'A chain, on a plain BST.' },
    },
  ],
  practice: intervalPractice(() => intervalTree),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as IntervalSettings),
  },
  examples: [
    insertRaisesMax,
    overlapGoesLeft,
    noOverlap,
    allOverlaps,
    deleteFixesMax,
  ] as unknown as SavedExample[],
  preview: { example: 'all-overlaps', level: 2, hide: ['nl-', 'bar-', 'qband'] },
};

/**
 * Driver protocol for the code tabs.
 *   insert lo hi | delete lo hi  ->  "ok <N> <height> <lo,hi,max in preorder>" | "duplicate" | "missing"
 *   overlap lo hi                ->  "<lo,hi> <nodes visited>" | "none <nodes visited>"
 *   all lo hi                    ->  "<count> <lo,hi in the order found> visited <n>"
 *   clear                        ->  "ok"
 */
function codeScript(calls: OpCall[], settings: IntervalSettings) {
  const t = new Timeline(intervalTree, { ...settings, ...defaults }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e, i) => {
    const before = i === 0 ? t.initial.state : t.entries[i - 1]!.end;
    const s = e.end;
    const last = e.steps.at(-1)!;
    const [op, raw] = e.call;
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
      return;
    }
    const a = parseInterval(raw!);
    if (a instanceof Error) return;
    input.push(`${op} ${a[0]} ${a[1]}`);
    const shape = () => {
      const out: string[] = [];
      const walk = (u: number | null) => {
        if (u === null) return;
        const n = s.nodes[u]!;
        out.push(`${n.lo},${n.hi},${n.max}`);
        walk(n.left);
        walk(n.right);
      };
      walk(s.root);
      return out;
    };
    const ok = () => ['ok', treeSize(s), treeHeight(s), ...shape()].join(' ');
    const ex = last.extra ?? {};
    const visited = (ex.path ?? []).length;
    switch (op) {
      case 'insert':
        expected.push(treeSize(s) > treeSize(before) ? ok() : 'duplicate');
        break;
      case 'delete':
        expected.push(treeSize(s) < treeSize(before) ? ok() : 'missing');
        break;
      case 'overlap': {
        const f = ex.found?.[0];
        expected.push(
          f === undefined ? `none ${visited}` : `${s.nodes[f]!.lo},${s.nodes[f]!.hi} ${visited}`,
        );
        break;
      }
      case 'all': {
        const found = (ex.found ?? []).map((u) => `${s.nodes[u]!.lo},${s.nodes[u]!.hi}`);
        expected.push([found.length, ...found, 'visited', visited].join(' '));
        break;
      }
    }
  });
  return { input, expected };
}

export default intervalTree;
