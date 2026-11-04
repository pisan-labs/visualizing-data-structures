import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { distinctKeys, parseNumberInput, readNumber } from '../hash-chaining/hashing';
import cppSource from './code/cpp/resizing_table.hpp?raw';
import javaSource from './code/java/ResizingTable.java?raw';
import pythonSource from './code/python/resizing_table.py?raw';
import amortized from './examples/amortized.json';
import doubling from './examples/doubling.json';
import growPrime from './examples/grow-prime.json';
import halfFull from './examples/half-full.json';
import thresholdOne from './examples/threshold-one.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RehashExtra,
  type RehashSettings,
  type RehashState,
} from './model';
import { rehashPractice } from './practice';
import { view } from './view';

const inserts = (keys: number[]): OpCall[] => keys.map((k) => ['insert', k] as OpCall);

export const hashRehash: VizDef<RehashState, RehashSettings, RehashExtra> = {
  id: 'hash-rehash',
  title: 'Rehashing and load factor',
  family: 'Hashing and maps',
  blurb:
    'A hash table that grows. When one more key would push the load factor past a threshold, it allocates a bigger table and moves every key; the cost counters show why that is still O(1) per insert on average.',
  settings: [
    {
      kind: 'choice',
      key: 'threshold',
      label: 'Grow when α would pass',
      options: [
        { value: '0.5', label: '0.5' },
        { value: '0.75', label: '0.75 (Java’s HashMap)' },
        { value: '1.0', label: '1.0: only when full (CLRS dynamic tables)' },
      ],
    },
    {
      kind: 'choice',
      key: 'grow',
      label: 'New size',
      options: [
        { value: 'prime', label: 'The first prime at least twice as big' },
        { value: 'double', label: 'Exactly twice as big' },
      ],
      help: 'Doubling keeps the size a power of 2 if it starts as one; with h(k) = k mod m that uses only the low bits of k.',
    },
    { kind: 'number', key: 'm0', label: 'Starting size', min: 2, max: 13 },
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
      placeholder: 'e.g. 42 or 1 2 3 4 5',
      maxLength: 160,
      sample: '42',
      parse: parseNumberInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: { label: 'Insert random', make: (rng) => [['insert', rng.int(1, 99)]] },
    presets: [
      { label: 'Random keys', make: (rng, n) => inserts(distinctKeys(rng, n)) },
      { label: 'All colliding keys', make: (_rng, n) => [['fill', 'collide', n]] },
      {
        label: 'Sequential keys',
        make: (rng, n) => {
          const start = rng.int(1, 60);
          return inserts(Array.from({ length: n }, (_, i) => start + i));
        },
      },
    ],
    sizes: [4, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'insert(k)',
      best: {
        cost: 'O(1)',
        why: 'No rehash: one probe sequence and one store.',
        example: 'amortized',
      },
      average: {
        cost: 'O(1) amortized',
        why: 'A rehash of n keys follows about n cheap inserts, so its cost spreads to O(1) each.',
        example: 'amortized',
      },
      worst: {
        cost: 'O(n)',
        why: 'This insert triggers a rehash and moves every key.',
        example: 'grow-prime',
      },
      note: 'Growing by a constant factor is essential. Growing by a constant amount (say 10 slots) makes the rehashes O(n) apart in time but O(n) each, so n inserts cost O(n²).',
    },
    {
      op: 'search(k)',
      best: { cost: 'O(1)', why: 'The home slot holds k or is empty.', example: 'amortized' },
      average: {
        cost: 'O(1)',
        why: 'α never passes the threshold, so probe sequences stay short.',
        example: 'half-full',
      },
      worst: {
        cost: 'O(n)',
        why: 'All keys collide into one long run of slots.',
        example: 'threshold-one',
      },
    },
    {
      op: 'rehash',
      best: {
        cost: 'O(n + m)',
        why: 'Every slot of the old table is read and every key moves once.',
        example: 'grow-prime',
      },
      average: {
        cost: 'O(n + m)',
        why: 'Each key is placed with a short probe in the bigger, emptier table.',
        example: 'grow-prime',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Keys that collide in the new table too probe longer and longer runs.',
        example: 'doubling',
      },
    },
  ],
  practice: rehashPractice(() => hashRehash),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RehashSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [growPrime, amortized, doubling, thresholdOne, halfFull] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs. The code follows the default policy (grow past 0.75 to
 * the next prime at least twice as big), so the model runs with that and the same start size:
 *   new m0
 *   insert k  ->  "added <m> <cost>" | "present <m>"
 *   search k  ->  "found <slot>" | "missing"
 *   clear     ->  "ok"
 *   print     ->  every slot (its key, or -), then " | " and the total cost so far
 * Keys the model rejects are left out: the model changes nothing.
 */
function codeScript(calls: OpCall[], settings: RehashSettings) {
  const same: RehashSettings = { ...defaults, m0: settings.m0 };
  const usable = calls.filter(([op, raw]) => {
    if (op === 'clear') return true;
    if (op !== 'insert' && op !== 'search') return false;
    return !(readNumber(raw!) instanceof Error);
  });
  const t = new Timeline(hashRehash, same, 1, usable);
  const input = [`new ${same.m0}`];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const [op, raw] = e.call;
    const last = e.steps[e.steps.length - 1]!;
    const v = last.vars ?? {};
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
      return;
    }
    input.push(`${op} ${readNumber(raw!)}`);
    if (op === 'insert') {
      const m = e.end.table.m;
      expected.push(last.lines.includes('ins.dup') ? `present ${m}` : `added ${m} ${v.cost}`);
    } else {
      expected.push(v.found ? `found ${slotOf(e.end, raw!)}` : 'missing');
    }
  });
  const end = t.endState();
  input.push('print');
  expected.push(
    `${end.table.slots.map((c) => (c ? String(c.key) : '-')).join(' ')} | ${end.total}`,
  );
  return { input, expected };
}

function slotOf(s: RehashState, raw: string | number): number {
  return s.table.slots.findIndex((c) => c?.key === readNumber(raw));
}

export default hashRehash;
