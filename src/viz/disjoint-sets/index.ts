import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/disjoint_sets.hpp?raw';
import javaSource from './code/java/DisjointSets.java?raw';
import pythonSource from './code/python/disjoint_sets.py?raw';
import chain from './examples/chain.json';
import compression from './examples/compression.json';
import halving from './examples/halving.json';
import rankKeepsShort from './examples/rank-keeps-short.json';
import sameSet from './examples/same-set.json';
import bySize from './examples/by-size.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_VALUE,
  ops,
  pseudocode,
  type DSExtra,
  type DSSettings,
  type DSState,
} from './model';
import { dsPractice } from './practice';
import { view } from './view';

export function parseElement(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type an element, a whole number such as 3.');
  if (!/^\d+$/.test(t) || Number(t) > MAX_VALUE)
    return new Error(`Elements are whole numbers from 0 to ${MAX_VALUE}.`);
  return Number(t);
}

const makeSets = (n: number): OpCall[] => [
  ['clear'],
  ...Array.from({ length: n }, (_, i) => ['makeset', i] as OpCall),
];

function shuffle<T>(rng: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Unions that join everything, in random order, each with a random partner already joined. */
export function randomUnions(rng: Rng, n: number, count = n - 1): OpCall[] {
  const order = shuffle(
    rng,
    Array.from({ length: n }, (_, i) => i),
  );
  const out: OpCall[] = [];
  for (let i = 1; i < n && out.length < count; i++)
    out.push(['union', order[i]!, order[rng.int(0, i - 1)]!]);
  return out;
}

/** union(0, 1), union(0, 2), ...: a chain of height n - 1 with naive union. */
export const chainUnions = (n: number): OpCall[] =>
  Array.from({ length: n - 1 }, (_, i) => ['union', 0, i + 1] as OpCall);

/** Pairs, then pairs of pairs: union by rank's tallest trees (height log n). */
export function pairUnions(n: number): OpCall[] {
  const out: OpCall[] = [];
  for (let gap = 1; gap < n; gap *= 2)
    for (let i = 0; i + gap < n; i += 2 * gap) out.push(['union', i, i + gap]);
  return out;
}

export const disjointSets: VizDef<DSState, DSSettings, DSExtra> = {
  id: 'disjoint-sets',
  title: 'Disjoint sets (union-find)',
  family: 'Graphs',
  blurb:
    'Keep elements in sets that never overlap: each set is a tree, find walks up to its root, and union links two roots.',
  settings: [
    {
      kind: 'choice',
      key: 'union',
      label: 'Union',
      options: [
        { value: 'rank', label: 'By rank (CLRS)' },
        { value: 'size', label: 'By size: smaller tree goes under' },
        { value: 'naive', label: 'Naive: first root under the second' },
      ],
      help: 'By rank and by size both keep trees short: height at most log₂ n. Naive union can build a chain.',
    },
    {
      kind: 'choice',
      key: 'path',
      label: 'Find',
      options: [
        { value: 'compress', label: 'Path compression (CLRS)' },
        { value: 'halve', label: 'Path halving: point at the grandparent' },
        { value: 'none', label: 'No compression: just walk up' },
      ],
      help: 'Compression and halving flatten the tree as a side effect of find, so later finds are quicker.',
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
      label: 'Element',
      placeholder: 'e.g. 3 or 1 2',
      maxLength: 60,
      sample: '3',
      parse: parseElement,
    },
    buttons: [
      { op: 'union', label: 'Union', usesInput: true, primary: true, args: ['x', 'y'] },
      { op: 'find', label: 'Find', usesInput: true },
      { op: 'makeset', label: 'Make set', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: {
      label: 'Random union',
      make: (rng) => [['union', rng.int(0, 7), rng.int(0, 7)]],
    },
    presets: [
      { label: 'Separate sets', make: (_rng, n) => makeSets(n) },
      {
        label: 'Random unions',
        make: (rng, n) => [...makeSets(n), ...randomUnions(rng, n, Math.ceil(n * 0.7))],
      },
      {
        label: 'Everything in one set',
        make: (rng, n) => [...makeSets(n), ...randomUnions(rng, n)],
      },
      {
        label: 'Pairs, then pairs of pairs (tallest by rank)',
        make: (_rng, n) => [...makeSets(n), ...pairUnions(n)],
      },
      {
        label: 'Chain (worst case for naive union), then find',
        make: (_rng, n) => [...makeSets(n), ...chainUnions(n), ['find', 0]],
      },
    ],
    sizes: [5, 8, 12, 16],
  },
  explain,
  complexity: [
    {
      op: 'make-set(x)',
      best: { cost: 'O(1)', why: 'One parent pointer and one rank.' },
      average: { cost: 'O(1)', why: 'Nothing else is touched.' },
      worst: { cost: 'O(1)', why: 'The same two assignments every time.' },
    },
    {
      op: 'find(x), by rank with path compression',
      best: {
        cost: 'O(1)',
        why: 'x is a root, or points straight at one.',
        example: 'compression',
      },
      average: {
        cost: 'O(α(n)) amortized',
        why: 'Compression flattens every path it walks, so a long walk pays for many short ones. α(n) is at most 4 for any n you will meet.',
        example: 'compression',
      },
      worst: {
        cost: 'O(log n)',
        why: 'By rank, a tree of height h has at least 2ʰ nodes, so one find walks at most log₂ n pointers.',
        example: 'rank-keeps-short',
      },
    },
    {
      op: 'find(x), naive union, no compression',
      best: { cost: 'O(1)', why: 'x is a root.' },
      average: {
        cost: 'O(n)',
        why: 'Naive links can stack the trees into tall chains, and nothing flattens them.',
        example: 'chain',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'A chain of n nodes: find at the bottom walks n − 1 pointers, every time.',
        example: 'chain',
      },
    },
    {
      op: 'union(x, y)',
      best: {
        cost: 'O(1)',
        why: 'x and y are roots: two finds of no steps, then one link.',
        example: 'by-size',
      },
      average: {
        cost: 'O(α(n)) amortized',
        why: 'Two finds and one O(1) link.',
        example: 'same-set',
      },
      worst: {
        cost: 'O(log n)',
        why: 'The two finds, by rank or by size, without the help of compression.',
        example: 'rank-keeps-short',
      },
      note: 'Any m operations on n elements take O(m α(n)) time with union by rank and path compression. CLRS proves it in its disjoint-sets chapter.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[]) => codeScript(calls),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    rankKeepsShort,
    chain,
    compression,
    halving,
    bySize,
    sameSet,
  ] as unknown as SavedExample[],
  practice: dsPractice(() => disjointSets),
};

/**
 * Driver protocol for the code tabs (which use union by rank with path compression):
 * "makeset x" and "clear" print nothing; "find x" prints the root; "union x y" prints the root
 * of the joined set, or "same" when x and y were together already; "parents" prints "x:p" for
 * every element in increasing order. Calls the page refuses (an element not in a set, a
 * duplicate make-set, more than 16 elements) are left out. The script ends with "parents".
 */
function codeScript(calls: OpCall[]) {
  const t = new Timeline(disjointSets, defaults, 1, calls);
  const input = ['clear', ...t.initial.state.elems.map((x) => `makeset ${x}`)];
  const expected: string[] = [];
  for (const e of t.entries) {
    const op = e.call[0];
    const last = e.steps.at(-1)!;
    if (op === 'clear') input.push('clear');
    else if (op === 'makeset') {
      if (last.lines.includes('m.p')) input.push(`makeset ${last.vars!.x}`);
    } else if (op === 'find') {
      if (last.vars?.root === undefined) continue;
      input.push(`find ${last.vars.x}`);
      expected.push(String(last.vars.root));
    } else if (op === 'union') {
      if (last.vars?.a === undefined) continue;
      input.push(`union ${last.vars.x} ${last.vars.y}`);
      expected.push(
        last.lines.length === 1 && last.lines[0] === 'u.same' ? 'same' : String(last.extra!.root),
      );
    }
  }
  const end = t.endState();
  input.push('parents');
  expected.push(end.elems.map((x) => `${x}:${end.p[x]}`).join(' '));
  return { input, expected };
}

export default disjointSets;
