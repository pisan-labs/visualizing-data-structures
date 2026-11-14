import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/randomized_set.hpp?raw';
import javaSource from './code/java/RandomizedSet.java?raw';
import pythonSource from './code/python/randomized_set.py?raw';
import drawsFollowTheArray from './examples/draws-follow-the-array.json';
import duplicatesRefused from './examples/duplicates-refused.json';
import orderIsNotKept from './examples/order-is-not-kept.json';
import removeMissing from './examples/remove-missing.json';
import removeTheLast from './examples/remove-the-last.json';
import scanToFind from './examples/scan-to-find.json';
import swapWithLast from './examples/swap-with-last.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_SIZE,
  ops,
  parseInput,
  pseudocode,
  type RSExtra,
  type RSSettings,
  type RSState,
} from './model';
import { randomizedSetPractice } from './practice';
import { view } from './view';

const ins = (v: number): OpCall => ['insert', v];
const rem = (v: number): OpCall => ['remove', v];

function distinct(rng: Rng, n: number): number[] {
  const out = new Set<number>();
  while (out.size < n) out.add(rng.int(1, 99));
  return [...out];
}

const presets: Preset[] = [
  {
    label: 'Random values, then a random pick',
    make: (rng, n) => [...distinct(rng, n).map(ins), ['random']],
  },
  {
    label: 'Remove from the middle: the last value moves',
    make: (rng, n) => {
      const vs = distinct(rng, n);
      return [...vs.map(ins), rem(vs[Math.floor(n / 2)]!), ['random']];
    },
  },
  {
    label: 'Remove the last each time: nothing moves',
    make: (rng, n) => {
      const vs = distinct(rng, n);
      return [
        ...vs.map(ins),
        ...[...vs]
          .reverse()
          .slice(0, Math.ceil(n / 2))
          .map(rem),
      ];
    },
  },
  {
    label: 'Remove from the front: the order scrambles',
    make: (rng, n) => {
      const vs = distinct(rng, n);
      return [...vs.map(ins), ...vs.slice(0, Math.ceil(n / 2)).map(rem)];
    },
  },
  {
    label: 'Duplicates: every value twice',
    make: (rng, n) => {
      const vs = distinct(rng, Math.ceil(n / 2));
      return [...vs.map(ins), ...vs.map(ins)];
    },
  },
  {
    label: 'Remove values that are not there (worst for the scan)',
    make: (rng, n) => {
      const vs = distinct(rng, n);
      const missing = [...new Set(Array.from({ length: 3 }, () => rng.int(1, 99)))].filter(
        (v) => !vs.includes(v),
      );
      return [...vs.map(ins), ...(missing.length ? missing : [0]).map(rem)];
    },
  },
  {
    label: 'Draw at random again and again',
    make: (rng, n) => [
      ...distinct(rng, n).map(ins),
      ...Array.from({ length: 4 }, () => ['random'] as OpCall),
    ],
  },
];

export const randomizedSet: VizDef<RSState, RSSettings, RSExtra> = {
  id: 'randomized-set',
  title: 'Randomized set (random pick in O(1))',
  family: 'Design a data structure',
  blurb:
    'A set with insert, remove and a random element, all O(1): the values in an array, so a random index picks one, and a hash map from each value to its index, so remove can fill the hole with the last value. Against the array alone, which scans.',
  settings: [
    approachSetting({
      pattern: 'An array plus a map from value to index, O(1)',
      naive: 'The array alone, scanning to find, O(n)',
      help: 'Both keep the same array, so they give the same answers. comparisons and lookups count over all the operations so far; naive total and pattern total say what each design has cost.',
    }),
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
      label: 'Value',
      placeholder: 'e.g. 7, or 4 7 2 9',
      maxLength: 60,
      sample: '5',
      parse: parseInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'remove', label: 'Remove', usesInput: true, bulk: true },
      { op: 'random', label: 'Random', usesInput: false },
    ],
    random: { label: 'Insert random', make: (rng) => [ins(rng.int(1, 99))] },
    presets,
    sizes: [4, 6, MAX_SIZE],
  },
  explain,
  complexity: [
    {
      op: 'insert(x), with the map',
      best: {
        cost: 'O(1)',
        why: 'A duplicate costs one lookup and nothing else.',
        example: 'duplicates-refused',
      },
      average: {
        cost: 'O(1) expected',
        why: 'One lookup, one map write, one append.',
        example: 'swap-with-last',
      },
      worst: {
        cost: 'O(n)',
        why: 'Only when the hash map is unlucky (keys that collide) or has to grow; amortized and expected, it stays O(1).',
      },
    },
    {
      op: 'remove(x), with the map',
      best: {
        cost: 'O(1)',
        why: 'A missing value costs one lookup.',
        example: 'remove-missing',
      },
      average: {
        cost: 'O(1) expected',
        why: 'Three lookups and one move of the last value, wherever x is.',
        example: 'swap-with-last',
      },
      worst: {
        cost: 'O(1) expected',
        why: 'Nothing shifts, so removing A[0] costs the same as removing the last.',
        example: 'order-is-not-kept',
      },
    },
    {
      op: 'random()',
      best: { cost: 'O(1)', why: 'One random index, one read.', example: 'draws-follow-the-array' },
      average: { cost: 'O(1)', why: 'The same, however many values there are.' },
      worst: {
        cost: 'O(1)',
        why: 'A hash set alone would be O(n) here: it has no index to jump to.',
      },
      note: 'Each value comes back with chance 1/n, because each index is equally likely.',
    },
    {
      op: 'insert and remove, the array alone',
      best: {
        cost: 'O(1)',
        why: 'remove(x) when x is A[0]: one comparison.',
      },
      average: { cost: 'Θ(n)', why: 'About n/2 comparisons to find a value that is there.' },
      worst: {
        cost: 'Θ(n)',
        why: 'A new value or a missing one: all n compared.',
        example: 'scan-to-find',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(randomizedSet, settings as RSSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const v = e.steps.at(-1)!.vars ?? {};
        const op = e.call[0];
        if (op === 'random') {
          input.push(v.i === undefined ? 'random' : `random ${v.i}`);
          expected.push(v.returned === undefined ? 'empty' : String(v.returned));
        } else if (v.x !== undefined) {
          input.push(`${op} ${v.x}`);
          expected.push(String(v.returned));
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    swapWithLast,
    scanToFind,
    removeTheLast,
    orderIsNotKept,
    duplicatesRefused,
    removeMissing,
    drawsFollowTheArray,
  ] as unknown as SavedExample[],
  practice: randomizedSetPractice(() => randomizedSet),
  preview: { example: 'swap-with-last', level: 2 },
};

export default randomizedSet;
