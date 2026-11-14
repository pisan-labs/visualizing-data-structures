import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import { parseValuesOrK, readK, readValues } from '../_lists2/kit';
import cppSource from './code/cpp/reverse_k.hpp?raw';
import javaSource from './code/java/ReverseK.java?raw';
import pythonSource from './code/python/reverse_k.py?raw';
import copyToArray from './examples/copy-to-array.json';
import exactMultiple from './examples/exact-multiple.json';
import groupsOfThree from './examples/groups-of-three.json';
import kLongerThanList from './examples/k-longer-than-list.json';
import shortGroupReversed from './examples/short-group-reversed.json';
import wholeList from './examples/whole-list.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_K,
  MAX_N,
  ops,
  pseudocode,
  values,
  type RKExtra,
  type RKSettings,
  type RKState,
} from './model';
import { reverseKPractice } from './practice';
import { view } from './view';

const build = (vs: number[]): OpCall => ['build', vs.join(' ')];
const between = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 99));
const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const presets: Preset[] = [
  {
    label: 'Groups of 3, one short group',
    make: (_rng, n) => [build(upTo(n % 3 ? n : n + 1 > MAX_N ? n - 1 : n + 1)), ['reverse', 3]],
  },
  { label: 'Groups of 2 (swap neighbours)', make: (_rng, n) => [build(upTo(n)), ['reverse', 2]] },
  { label: 'k = n: the whole list', make: (_rng, n) => [build(upTo(n)), ['reverse', n]] },
  { label: 'k longer than the list', make: (_rng, n) => [build(upTo(n)), ['reverse', n + 1]] },
  { label: 'k = 1: nothing changes', make: (rng, n) => [build(between(rng, n)), ['reverse', 1]] },
  {
    label: 'Random values, random k',
    make: (rng, n) => [build(between(rng, n)), ['reverse', rng.int(2, Math.max(2, n - 1))]],
  },
];

export const reverseKGroup: VizDef<RKState, RKSettings, RKExtra> = {
  id: 'reverse-k-group',
  title: 'Reverse a list in groups of k',
  family: 'Linked list tricks',
  blurb:
    'Turn a singly linked list around k nodes at a time, in place: a dummy head, the node before each group, and three pointers to flip its links. The nodes move and no value is copied, against copying to an array.',
  settings: [
    approachSetting({
      pattern: 'Relink in place, O(1) space',
      naive: 'Copy to an array, reverse there, write back',
    }),
    {
      kind: 'choice',
      key: 'rest',
      label: 'A last group shorter than k',
      options: [
        { value: 'keep', label: 'Stays as it is' },
        { value: 'reverse', label: 'Is reversed too' },
      ],
      help: 'Problems differ here. With "stays", groups of 3 make 1 2 3 4 5 6 7 8 into 3 2 1 6 5 4 7 8; with "reversed", into 3 2 1 6 5 4 8 7.',
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
      label: 'k, or values',
      placeholder: 'e.g. 3, or 1 2 3 4 5 to build',
      maxLength: 60,
      sample: '3',
      parse: (token) => parseValuesOrK(token, MAX_N),
    },
    buttons: [
      { op: 'reverse', label: 'Reverse in groups', usesInput: true, primary: true },
      { op: 'build', label: 'Build', usesInput: true },
    ],
    random: {
      label: 'Random list',
      make: (rng) => [build(between(rng, rng.int(5, MAX_N)))],
    },
    presets,
    sizes: [5, 7, 8, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'reverse in groups, relinking',
      best: {
        cost: 'O(n)',
        why: 'k longer than the list: one walk finds too few nodes and nothing is relinked.',
        example: 'k-longer-than-list',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Each node is walked twice (finding kth, then turning it) and relinked once.',
        example: 'groups-of-three',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'k = n is one group: the whole list turned around.',
        example: 'whole-list',
      },
      note: 'Extra space O(1): the dummy and six pointers, whatever n and k are.',
    },
    {
      op: 'copy to an array, reverse, write back',
      best: {
        cost: 'Θ(n)',
        why: 'The values are copied out and back even when nothing changes.',
        example: 'copy-to-array',
      },
      average: {
        cost: 'Θ(n)',
        why: 'n copies out, about n swaps’ worth of copies, n copies back.',
        example: 'copy-to-array',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'The same: the array always holds every value, n cells of extra space.',
        example: 'copy-to-array',
      },
      note: 'Both are Θ(n) time. The pattern saves the array, and the nodes move with their values.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RKSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    groupsOfThree,
    shortGroupReversed,
    exactMultiple,
    wholeList,
    kLongerThanList,
    copyToArray,
  ] as unknown as SavedExample[],
  practice: reverseKPractice(() => reverseKGroup),
  preview: { example: 'groups-of-three', level: 2 },
};

/**
 * Driver protocol for the code tabs: "build v1 v2 ..." prints nothing; "reverse k" (or
 * "reverse k all", which reverses a short last group too) reverses the list in groups of k
 * and prints it.
 */
function codeScript(calls: OpCall[], settings: RKSettings) {
  const t = new Timeline(reverseKGroup, settings, 1, calls);
  const input = [`build ${values(t.initial.state).join(' ')}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'build') {
      if (typeof readValues(arg, MAX_N) !== 'string')
        input.push(`build ${values(e.end).join(' ')}`);
    } else if (op === 'reverse' && typeof readK(arg, MAX_K) === 'number') {
      input.push(`reverse ${readK(arg, MAX_K)}${settings.rest === 'reverse' ? ' all' : ''}`);
      expected.push(values(e.end).join(' '));
    }
  }
  return { input, expected };
}

export default reverseKGroup;
