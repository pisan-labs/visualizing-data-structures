import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/rope.hpp?raw';
import javaSource from './code/java/Rope.java?raw';
import pythonSource from './code/python/rope.py?raw';
import explain from './explain.md?raw';
import concatCheap from './examples/concat-cheap.json';
import deleteRange from './examples/delete-range.json';
import indexWeights from './examples/index-weights.json';
import insertMiddle from './examples/insert-middle.json';
import splitTwo from './examples/split-two.json';
import totalLengths from './examples/total-lengths.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LEN,
  ops,
  parseIndex,
  parseText,
  pseudocode,
  type RopeExtra,
  type RopeSettings,
  type RopeState,
} from './model';
import { ropePractice } from './practice';
import { view } from './view';

/** Whole numbers stay numbers (indices); anything else is text. */
export function parseRopeInput(token: string): Value | Error {
  if (token.length === 0) return new Error('Type an index or some text first.');
  if (/^-?\d+$/.test(token.trim())) return Number(token.trim());
  const t = parseText(token);
  return t;
}

const WORDS = ['data', 'tree', 'rope', 'node', 'leaf', 'text', 'edit', 'undo', 'redo'];
const randomText = (rng: Rng, n: number) => {
  const out: string[] = [];
  while (out.join(' ').length < n) out.push(WORDS[rng.int(0, WORDS.length - 1)]!);
  return out.join(' ').slice(0, Math.min(n, MAX_LEN));
};

export const rope: VizDef<RopeState, RopeSettings, RopeExtra> = {
  id: 'rope',
  title: 'Rope',
  family: 'Trees',
  blurb:
    'A string kept as a binary tree of short pieces: index by weights, concat with one new node, and split or edit the middle without copying the rest.',
  settings: [
    { kind: 'number', key: 'leaf', label: 'Longest leaf when building', min: 2, max: 6 },
    {
      kind: 'choice',
      key: 'weight',
      label: 'What a node stores',
      options: [
        { value: 'left', label: 'Its weight: the length of its left subtree (the usual rope)' },
        { value: 'total', label: 'The length of its own subtree' },
      ],
      help: 'Either works. With weights, index compares i with the node itself; with lengths, with its left child.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: (s) => describe(s),
  controls: {
    input: {
      label: 'Text or index',
      placeholder: 'e.g. hello world, or 5',
      maxLength: MAX_LEN,
      sample: 'hello',
      parse: parseRopeInput,
    },
    buttons: [
      { op: 'load', label: 'Build', usesInput: true, primary: true },
      { op: 'index', label: 'Index', usesInput: true },
      { op: 'append', label: 'Append', usesInput: true },
      { op: 'insert', label: 'Insert text', usesInput: true, args: ['an index', 'some text'] },
      { op: 'delete', label: 'Delete text', usesInput: true, args: ['an index', 'a length'] },
      { op: 'split', label: 'Split at', usesInput: true, more: true },
      { op: 'join', label: 'Join R2', usesInput: false, more: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Build random text', make: (rng) => [['load', randomText(rng, 20)]] },
    presets: [
      { label: 'Random words', make: (rng, n) => [['load', randomText(rng, n)]] },
      {
        label: 'Built by appends (a lopsided tree)',
        make: (rng, n) =>
          Array.from({ length: Math.max(2, Math.round(n / 4)) }, () => [
            'append',
            WORDS[rng.int(0, WORDS.length - 1)]!,
          ]),
      },
      {
        label: 'Random words, then an edit in the middle',
        make: (rng, n) => {
          const t = randomText(rng, n);
          return [
            ['load', t],
            ['insert', Math.floor(t.length / 2), 'XY'],
          ];
        },
      },
      {
        label: 'Random words, then split in half',
        make: (rng, n) => {
          const t = randomText(rng, Math.max(n, 4));
          return [
            ['load', t],
            ['split', Math.floor(t.length / 2)],
          ];
        },
      },
    ],
    sizes: [12, 20, 28],
  },
  explain,
  practice: ropePractice(() => rope),
  complexity: [
    {
      op: 'index(i)',
      best: { cost: 'O(1)', why: 'The rope is a single leaf.' },
      average: {
        cost: 'O(log n)',
        why: 'One node per level of a balanced rope; a flat string does it in O(1).',
        example: 'index-weights',
      },
      worst: {
        cost: 'O(n)',
        why: 'A rope built by many appends with no rebalancing is a long path.',
        example: 'concat-cheap',
      },
    },
    {
      op: 'concat(a, b) / append(text)',
      best: {
        cost: 'O(1)',
        why: 'One new node on top; nothing is copied.',
        example: 'concat-cheap',
      },
      average: { cost: 'O(1)', why: 'Still one node. (A flat string copies both, O(n).)' },
      worst: {
        cost: 'O(1)',
        why: 'O(log n) if the rope rebalances afterwards, as real ropes do.',
      },
    },
    {
      op: 'split(i)',
      best: { cost: 'O(1)', why: 'The cut falls between the root’s subtrees.' },
      average: {
        cost: 'O(log n)',
        why: 'One walk down, cutting at most one leaf and making a node per level.',
        example: 'split-two',
      },
      worst: { cost: 'O(height)', why: 'The walk is as long as the tree is tall.' },
    },
    {
      op: 'insert(i, text) / delete(i, len)',
      best: { cost: 'O(1)', why: 'At the ends, where the cut is between subtrees.' },
      average: {
        cost: 'O(log n)',
        why: 'One or two splits and two concats. A flat string moves everything after i: O(n).',
        example: 'insert-middle',
      },
      worst: {
        cost: 'O(height)',
        why: 'Each split walks the height of the tree.',
        example: 'delete-range',
      },
      note: 'Space: O(n) characters plus a node per leaf and per join. Old versions can share subtrees, which is how editors keep undo cheap.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RopeSettings),
  },
  examples: [
    indexWeights,
    concatCheap,
    splitTwo,
    insertMiddle,
    deleteRange,
    totalLengths,
  ] as unknown as SavedExample[],
  preview: { example: 'insert-middle', level: 2 },
};

/** Calls whose arguments the model cannot read (refused before it looks at the rope). */
function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  switch (op) {
    case 'load':
    case 'append':
      return bad(args[0], parseText) || String(args[0]) !== String(args[0]).trim();
    case 'index':
    case 'split':
      return bad(args[0], parseIndex);
    case 'insert':
      return bad(args[0], parseIndex) || bad(args[1], parseText) || /\s/.test(String(args[1]));
    case 'delete':
      return bad(args[0], parseIndex) || bad(args[1], parseIndex);
    default:
      return false;
  }
}

/**
 * Driver protocol for the code tabs. build and append take the rest of the line, spaces and all;
 * insert's text has no spaces (the page's input splits its two arguments on spaces).
 *   new L            leaf size for build
 *   build text       ->  length
 *   index i          ->  the character in quotes | "invalid"
 *   append text      ->  length | "invalid"
 *   insert i text    ->  length | "invalid"
 *   delete i len     ->  length | "invalid"
 *   split i          ->  "len(R) len(R2)" | "invalid"
 *   join             ->  length | "none"
 *   clear            ->  "ok"
 */
function codeScript(calls: OpCall[], settings: RopeSettings) {
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(rope, settings, 1, kept);
  const input = [`new ${settings.leaf}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const refused = last.marks.some((m) => m.role === 'error');
    const end = e.end;
    const len = (u: number | null) => (u === null ? 0 : end.nodes[u]!.len);
    input.push([op === 'load' ? 'build' : op, ...args.map((a) => String(a))].join(' '));
    if (op === 'index') expected.push(refused ? 'invalid' : `"${String(last.vars?.returned)}"`);
    else if (op === 'split')
      expected.push(refused ? 'invalid' : `${len(end.root)} ${len(end.other)}`);
    else if (op === 'join')
      expected.push(last.lines.includes('jn.sig') ? 'none' : String(len(end.root)));
    else if (op === 'clear') expected.push('ok');
    else expected.push(refused ? 'invalid' : String(len(end.root)));
  });
  return { input, expected };
}

export default rope;
