import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/bitmask.hpp?raw';
import javaSource from './code/java/Bitmask.java?raw';
import pythonSource from './code/python/bitmask.py?raw';
import allSubsets from './examples/all-subsets.json';
import emptySet from './examples/empty-set.json';
import lowestBit from './examples/lowest-bit.json';
import popcountAllOnes from './examples/popcount-all-ones.json';
import popcountOneBit from './examples/popcount-one-bit.json';
import scanEveryBit from './examples/scan-every-bit.json';
import setClearToggle from './examples/set-clear-toggle.json';
import submasks from './examples/submasks.json';
import explain from './explain.md?raw';
import {
  MAX_WIDTH,
  MIN_WIDTH,
  defaults,
  describe,
  full,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BitExtra,
  type BitSettings,
  type BitState,
} from './model';
import { bitmaskPractice } from './practice';
import { view } from './view';

/** A whole number, in decimal or as 0b followed by bits. */
export function parseBits(token: string): Value | Error {
  const t = token.trim().toLowerCase();
  if (!t) return new Error('Type a number first.');
  if (/^0b[01]{1,10}$/.test(t)) return parseInt(t.slice(2), 2);
  if (!/^\d+$/.test(t))
    return new Error('Type a whole number such as 37, or bits such as 0b100101.');
  const v = Number(t);
  if (v > full(MAX_WIDTH)) return new Error(`Keep numbers to ${full(MAX_WIDTH)} or less.`);
  return v;
}

export const bitmask: VizDef<BitState, BitSettings, BitExtra> = {
  id: 'bitmask',
  title: 'Bitmasks and subsets',
  family: 'Foundations',
  blurb:
    'One integer as a set of bits: set, clear, toggle and test a bit, find the lowest one, count them, and walk every subset.',
  settings: [
    { kind: 'number', key: 'width', label: 'Bits in x', min: MIN_WIDTH, max: MAX_WIDTH },
    {
      kind: 'choice',
      key: 'popcount',
      label: 'Count bits by',
      options: [
        { value: 'kernighan', label: 'Clearing the lowest 1: x & (x - 1)' },
        { value: 'scan', label: 'Testing every bit' },
      ],
      help: 'The first loop runs once per set bit; the scan runs once per bit, set or not.',
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
      label: 'Number or bit position',
      placeholder: 'e.g. 37, 0b100101, or 3',
      maxLength: 12,
      sample: '3',
      parse: parseBits,
    },
    buttons: [
      { op: 'load', label: 'Set x to', usesInput: true, primary: true },
      { op: 'set', label: 'Set bit', usesInput: true },
      { op: 'clear', label: 'Clear bit', usesInput: true },
      { op: 'toggle', label: 'Toggle bit', usesInput: true },
      { op: 'test', label: 'Test bit', usesInput: true, more: true },
      { op: 'lowbit', label: 'x & -x', usesInput: false, more: true },
      { op: 'popcount', label: 'Count bits', usesInput: false, more: true },
      { op: 'subsets', label: 'All subsets of n', usesInput: true, more: true },
      { op: 'submasks', label: 'Submasks of x', usesInput: false, more: true },
    ],
    random: {
      label: 'Random x',
      make: (rng) => [['load', rng.int(0, full(defaults.width))]],
    },
    presets: [
      {
        label: 'Random bits',
        make: (rng, size, s) => [['load', rng.int(0, full(Math.min(size, Number(s?.width ?? 8))))]],
      },
      {
        label: 'Lowest n bits set',
        make: (_rng, size, s) => [['load', full(Math.min(size, Number(s?.width ?? 8)))]],
      },
      {
        label: 'One bit only',
        make: (rng, size, s) => [
          ['load', 1 << rng.int(0, Math.min(size, Number(s?.width ?? 8)) - 1)],
        ],
      },
      {
        label: 'Every other bit',
        make: (_rng, size, s) => {
          const w = Math.min(size, Number(s?.width ?? 8));
          let x = 0;
          for (let i = 0; i < w; i += 2) x |= 1 << i;
          return [['load', x]];
        },
      },
      { label: 'Empty set', make: () => [['load', 0]] },
    ],
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'set, clear, toggle or test bit i',
      best: { cost: 'O(1)', why: 'One shift and one OR, AND or XOR.', example: 'set-clear-toggle' },
      average: { cost: 'O(1)', why: 'The processor does all the bits of a word at once.' },
      worst: {
        cost: 'O(1)',
        why: 'Same two operations for any i, as long as x fits in a machine word.',
      },
    },
    {
      op: 'lowest set bit: x & -x',
      best: { cost: 'O(1)', why: 'A negate and an AND.', example: 'lowest-bit' },
      average: { cost: 'O(1)', why: 'No loop: the carry of + 1 does the searching.' },
      worst: { cost: 'O(1)', why: 'x = 0 gives 0, still two operations.', example: 'empty-set' },
    },
    {
      op: 'popcount with x & (x - 1)',
      best: {
        cost: 'O(1)',
        why: 'One set bit: one pass of the loop.',
        example: 'popcount-one-bit',
      },
      average: { cost: 'O(k)', why: 'One pass per set bit, k of them.' },
      worst: {
        cost: 'O(w)',
        why: 'All w bits set: w passes, the same as a scan.',
        example: 'popcount-all-ones',
      },
      note: 'A scan is Θ(w) every time (example: scan-every-bit). Most processors also have a one-instruction popcount.',
    },
    {
      op: 'every subset of n items',
      best: { cost: 'Θ(2ⁿ)', why: 'Each of the 2ⁿ masks is visited once.', example: 'all-subsets' },
      average: { cost: 'Θ(2ⁿ)', why: 'One increment per subset; reading a subset out adds n.' },
      worst: { cost: 'Θ(2ⁿ)', why: 'One more item doubles the count.', example: 'all-subsets' },
    },
    {
      op: 'every submask of x',
      best: { cost: 'O(1)', why: 'x = 0 has one submask, itself.', example: 'empty-set' },
      average: {
        cost: 'Θ(2ᵏ)',
        why: 'k set bits give 2ᵏ submasks, each reached in O(1).',
        example: 'submasks',
      },
      worst: {
        cost: 'Θ(2ʷ)',
        why: 'Every bit set: every number below 2ʷ is a submask.',
      },
      note: 'Over all masks x of n bits, the submasks add up to 3ⁿ: each bit is out of x, in x but not sub, or in both.',
    },
  ],
  practice: bitmaskPractice(() => bitmask),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BitSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    setClearToggle,
    lowestBit,
    popcountOneBit,
    popcountAllOnes,
    scanEveryBit,
    allSubsets,
    submasks,
    emptySet,
  ] as unknown as SavedExample[],
  preview: { example: 'set-clear-toggle', level: 2 },
};

/**
 * Driver protocol for the code tabs: one operation per line, as the model's calls ("load 37",
 * "set 3", "lowbit", "subsets 3"...). Changes print the new x, tests and counts print the
 * answer, and listings print the masks separated by spaces. Calls the model turned down (a bit
 * outside x, too many submasks to list) are left out.
 */
function codeScript(calls: OpCall[], settings: BitSettings) {
  const t = new Timeline(bitmask, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const last = e.steps.at(-1)!;
    if (last.lines.length === 0) continue;
    const [op, ...args] = e.call;
    input.push([op, ...args.map((a) => String(Number(a)))].join(' '));
    if (op === 'subsets' || op === 'submasks') expected.push(e.end.list.join(' '));
    else if (last.vars?.returned !== undefined) expected.push(String(last.vars.returned));
    else expected.push(String(e.end.x));
  }
  return { input, expected };
}

export default bitmask;
