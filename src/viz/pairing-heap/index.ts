import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/pairing_heap.hpp?raw';
import javaSource from './code/java/PairingHeap.java?raw';
import pythonSource from './code/python/pairing_heap.py?raw';
import explain from './explain.md?raw';
import decreaseByCut from './examples/decrease-by-cut.json';
import flatRoot from './examples/flat-root.json';
import meldTwo from './examples/meld-two.json';
import multipass from './examples/multipass.json';
import twoPass from './examples/two-pass-delete.json';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseKey,
  parseKeyList,
  pseudocode,
  type PairExtra,
  type PairSettings,
  type PairState,
} from './model';
import { pairingPractice } from './practice';
import { view } from './view';

/** One key stays a number; a list of keys (for meld) becomes its canonical text. */
export function parsePairInput(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a key first.');
  if (/[\s,]/.test(t)) {
    const keys = parseKeyList(t);
    return keys instanceof Error ? keys : keys.join(' ');
  }
  return parseKey(t);
}

function distinctKeys(rng: Rng, n: number): number[] {
  const keys = new Set<number>();
  while (keys.size < n) keys.add(rng.int(1, 99));
  return [...keys];
}

const asc = (keys: number[]) => [...keys].sort((a, b) => a - b);
const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const pairingHeap: VizDef<PairState, PairSettings, PairExtra> = {
  id: 'pairing-heap',
  title: 'Pairing heap',
  family: 'Heaps and priority queues',
  blurb:
    'A multiway tree in heap order: insert, meld and decrease-key are a single link, and deleteMin pairs up the root’s children in two passes.',
  settings: [
    {
      kind: 'choice',
      key: 'pass',
      label: 'deleteMin pairing',
      options: [
        {
          value: 'two-pass',
          label: 'Two passes: pair left to right, meld right to left (standard)',
        },
        { value: 'multipass', label: 'Multipass: meld the first two, put the result at the back' },
      ],
      help: 'Fredman, Sedgewick, Sleator and Tarjan studied both. Two-pass is the one everybody uses.',
    },
    {
      kind: 'choice',
      key: 'draw',
      label: 'Draw the nodes',
      options: [
        { value: 'tree', label: 'As a tree: each node with all its children' },
        { value: 'pointers', label: 'As stored: first child and next sibling' },
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
  describe: (s) => describe(s),
  controls: {
    input: {
      label: 'Key',
      placeholder: 'e.g. 42, or a list: 5 3 8 1',
      maxLength: 120,
      sample: '42',
      parse: parsePairInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'deleteMin', label: 'Delete min', usesInput: false },
      {
        op: 'decrease',
        label: 'Decrease key',
        usesInput: true,
        args: ['a key in the heap', 'a smaller key'],
      },
      { op: 'meld', label: 'Meld with', usesInput: true, more: true },
      { op: 'clear', label: 'Clear', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      {
        label: 'Ascending (flat root)',
        make: (rng, n) => inserts(asc(distinctKeys(rng, n))),
      },
      {
        label: 'Descending (a chain)',
        make: (rng, n) => inserts(asc(distinctKeys(rng, n)).reverse()),
      },
      {
        label: 'Random, then delete min',
        make: (rng, n) => [...inserts(distinctKeys(rng, n)), ['deleteMin']],
      },
      {
        label: 'Many duplicates',
        make: (rng, n) => inserts(Array.from({ length: n }, () => 10 * rng.int(1, 4))),
      },
    ],
    sizes: [6, 9, 12],
  },
  explain,
  practice: pairingPractice(() => pairingHeap),
  complexity: [
    {
      op: 'insert(key)',
      best: {
        cost: 'O(1)',
        why: 'One comparison and one link with the root.',
        example: 'flat-root',
      },
      average: { cost: 'O(1)', why: 'Always the same single link.' },
      worst: { cost: 'O(1)', why: 'Nothing is walked: the new node only meets the root.' },
    },
    {
      op: 'meld(H, H2)',
      best: { cost: 'O(1)', why: 'Compare the two roots, link the loser under the winner.' },
      average: { cost: 'O(1)', why: 'The size of the heaps does not matter.' },
      worst: { cost: 'O(1)', why: 'Still one comparison.', example: 'meld-two' },
    },
    {
      op: 'deleteMin()',
      best: { cost: 'O(1)', why: 'The root had one child: nothing to pair.' },
      average: {
        cost: 'O(log n) amortized',
        why: 'The two passes halve the number of trees and leave a root with few children.',
        example: 'two-pass-delete',
      },
      worst: {
        cost: 'O(n)',
        why: 'After n inserts in ascending order the root has n − 1 children, and one deleteMin links them all. The bound is amortized.',
        example: 'flat-root',
      },
    },
    {
      op: 'decreaseKey(x, k)',
      best: { cost: 'O(1)', why: 'x is the root: write the key and stop.' },
      average: {
        cost: 'o(log n) amortized',
        why: 'One cut and one link now; the exact amortized bound is still an open question, somewhere between O(log log n) and O(2^(2√(log log n))).',
        example: 'decrease-by-cut',
      },
      worst: { cost: 'O(1) actual', why: 'One cut and one link, then pay later in deleteMin.' },
      note: 'Space: two pointers and a key per node (first child, next sibling), plus a back pointer to make the cut O(1).',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PairSettings),
  },
  examples: [twoPass, flatRoot, decreaseByCut, meldTwo, multipass] as unknown as SavedExample[],
  preview: { example: 'two-pass-delete', level: 2 },
};

function unreadable([op, ...args]: OpCall): boolean {
  const bad = (v: Value | undefined, f: (v: Value) => unknown) =>
    v === undefined || f(v) instanceof Error;
  if (op === 'insert') return bad(args[0], parseKey);
  if (op === 'meld') return bad(args[0], parseKeyList);
  if (op === 'decrease') return bad(args[0], parseKey) || bad(args[1], parseKey);
  return false;
}

/**
 * Driver protocol for the code tabs (two-pass pairing, the default):
 *   insert k        ->  n afterwards | "full" (the page draws at most 31 keys)
 *   deleteMin       ->  the key | "empty"
 *   decrease x k    ->  "ok" | "missing" (no key x) | "larger" (k > x)
 *   meld k1 k2 ...  ->  n afterwards | "full"
 *   clear           ->  "ok"
 */
function codeScript(calls: OpCall[], settings: PairSettings) {
  const same: PairSettings = { ...settings, pass: 'two-pass' };
  const kept = calls.filter((c) => !unreadable(c));
  const t = new Timeline(pairingHeap, same, 1, kept);
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, ...args] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    const refused = last.marks.some((m) => m.role === 'error');
    input.push([op, ...args.map((a) => String(a).trim())].join(' '));
    if (op === 'insert' || op === 'meld') expected.push(refused ? 'full' : String(v.N));
    else if (op === 'deleteMin')
      expected.push(v.returned === undefined ? 'empty' : String(v.returned));
    else if (op === 'decrease')
      expected.push(!refused ? 'ok' : last.lines.includes('dec.check') ? 'larger' : 'missing');
    else expected.push('ok');
  });
  return { input, expected };
}

export default pairingHeap;
