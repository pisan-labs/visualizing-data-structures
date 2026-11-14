import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import { parseValuesOrK, readValues } from '../_lists2/kit';
import cppSource from './code/cpp/fast_slow.hpp?raw';
import javaSource from './code/java/FastSlow.java?raw';
import pythonSource from './code/python/fast_slow.py?raw';
import countFirst from './examples/count-first.json';
import firstOfTwo from './examples/first-of-two.json';
import gapOfK from './examples/gap-of-k.json';
import kTooBig from './examples/k-too-big.json';
import notAPalindrome from './examples/not-a-palindrome.json';
import oddMiddle from './examples/odd-middle.json';
import oneNode from './examples/one-node.json';
import palindromeArray from './examples/palindrome-array.json';
import palindromeInPlace from './examples/palindrome-in-place.json';
import twoMiddles from './examples/two-middles.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  pseudocode,
  values,
  type FSExtra,
  type FSSettings,
  type FSState,
} from './model';
import { fastSlowPractice } from './practice';
import { view } from './view';

const build = (vs: number[]): OpCall => ['build', vs.join(' ')];
const between = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.int(1, 99));

/** A palindrome of n values: the first half, then the same half mirrored. */
function mirrored(rng: Rng, n: number): number[] {
  const half = Array.from({ length: Math.ceil(n / 2) }, () => rng.int(1, 9));
  return [...half, ...half.slice(0, Math.floor(n / 2)).reverse()];
}

const presets: Preset[] = [
  { label: 'Random, then the middle', make: (rng, n) => [build(between(rng, n)), ['middle']] },
  {
    label: 'An even count: two middles',
    make: (rng, n) => [build(between(rng, n % 2 ? n + 1 : n)), ['middle']],
  },
  {
    label: 'Random, the 2nd from the end',
    make: (rng, n) => [build(between(rng, n)), ['kth', 2]],
  },
  { label: 'k is the whole length', make: (rng, n) => [build(between(rng, n)), ['kth', n]] },
  {
    label: 'k longer than the list',
    make: (rng, n) => [build(between(rng, n)), ['kth', n + 1]],
  },
  { label: 'A palindrome', make: (rng, n) => [build(mirrored(rng, n)), ['palindrome']] },
  {
    label: 'Almost a palindrome (one value off)',
    make: (rng, n) => {
      const vs = mirrored(rng, n);
      vs[n - 2] = vs[n - 2]! === 9 ? 1 : vs[n - 2]! + 1;
      return [build(vs), ['palindrome']];
    },
  },
  { label: 'One node', make: (rng) => [build([rng.int(1, 99)]), ['middle'], ['palindrome']] },
];

export const fastSlowPointers: VizDef<FSState, FSSettings, FSExtra> = {
  id: 'fast-slow-pointers',
  title: 'Fast and slow pointers',
  family: 'Linked list tricks',
  blurb:
    'Two pointers on one singly linked list: one moves twice as fast, or starts k nodes ahead. One walk finds the middle or the k-th node from the end, and checks for a palindrome in O(1) space, where the naive way counts the length first or copies to an array.',
  settings: [
    approachSetting({
      pattern: 'Two pointers in one walk',
      naive: 'Count the length first, or copy to an array',
      help: 'Both give the same answer. The pattern does about the same number of hops: it saves a walk, and for the palindrome the array. Compare with this same page to run the two side by side.',
    }),
    {
      kind: 'choice',
      key: 'middle',
      label: 'Of two middles',
      options: [
        { value: 'second', label: 'The second (while fast and fast.next)' },
        { value: 'first', label: 'The first (while fast.next and fast.next.next)' },
      ],
      help: 'A list with an even count has two middles. The loop condition decides which one slow stops at.',
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
      placeholder: 'e.g. 2, or 1 2 3 2 1 to build',
      maxLength: 60,
      sample: '2',
      parse: (token) => parseValuesOrK(token, MAX_N),
    },
    buttons: [
      { op: 'middle', label: 'Find middle', usesInput: false, primary: true },
      { op: 'kth', label: 'k-th from end', usesInput: true },
      { op: 'palindrome', label: 'Palindrome?', usesInput: false },
      { op: 'build', label: 'Build', usesInput: true },
    ],
    random: {
      label: 'Random list',
      make: (rng) => [build(between(rng, rng.int(4, MAX_N)))],
    },
    presets,
    sizes: [5, 6, 8, MAX_N],
  },
  explain,
  complexity: [
    {
      op: 'middle, slow and fast',
      best: {
        cost: 'O(1)',
        why: 'One node: fast has no next, so slow stays at the head.',
        example: 'one-node',
      },
      average: {
        cost: 'Θ(n)',
        why: 'n / 2 rounds of three hops: 9 hops for 7 nodes, in one walk.',
        example: 'odd-middle',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'Every list is walked to its end by fast.',
        example: 'two-middles',
      },
      note: 'Counting first is Θ(n) too, about 1.5n hops in two walks. The pattern saves a walk, not much work.',
    },
    {
      op: 'k-th from the end',
      best: {
        cost: 'O(k)',
        why: 'A list shorter than k: fast runs out while making the gap.',
        example: 'k-too-big',
      },
      average: {
        cost: 'Θ(n)',
        why: 'k hops for the gap, then 2(n − k) for both: 2n − k, exactly what counting first takes.',
        example: 'gap-of-k',
      },
      worst: { cost: 'Θ(n)', why: 'k = 1: fast walks the whole list, slow nearly all of it.' },
    },
    {
      op: 'palindrome, reverse half in place',
      best: {
        cost: 'Θ(n)',
        why: 'Even when the ends differ, finding the middle and turning the half around (and back) takes Θ(n).',
        example: 'not-a-palindrome',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Middle, reverse, compare, restore: each about n / 2 nodes.',
        example: 'palindrome-in-place',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'A palindrome: every pair is compared.',
        example: 'palindrome-in-place',
      },
    },
    {
      op: 'palindrome, extra space',
      best: {
        cost: 'O(1)',
        why: 'Reversing in place needs a few pointers, whatever n is.',
        example: 'palindrome-in-place',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Copying to an array needs n cells.',
        example: 'palindrome-array',
      },
      worst: {
        cost: 'Θ(n)',
        why: 'The array holds every value, even when the first pair already differs.',
        example: 'palindrome-array',
      },
      note: 'Best is the pattern, average and worst the copy. Both take Θ(n) time.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as FSSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    oddMiddle,
    twoMiddles,
    firstOfTwo,
    countFirst,
    gapOfK,
    kTooBig,
    palindromeInPlace,
    notAPalindrome,
    palindromeArray,
    oneNode,
  ] as unknown as SavedExample[],
  practice: fastSlowPractice(() => fastSlowPointers),
  preview: { example: 'palindrome-in-place', level: 2 },
};

/**
 * Driver protocol for the code tabs: "build v1 v2 ..." prints nothing; "middle" (or "middle
 * first") prints the middle value; "kth k" prints the value or "none"; "palindrome" prints true
 * or false, and the "list" after it checks that the list was put back.
 */
function codeScript(calls: OpCall[], settings: FSSettings) {
  const t = new Timeline(fastSlowPointers, settings, 1, calls);
  const input = [`build ${values(t.initial.state).join(' ')}`];
  const expected: string[] = [];
  for (const e of t.entries) {
    const v = e.steps.at(-1)!.vars ?? {};
    const [op, arg] = e.call;
    if (op === 'build') {
      if (typeof readValues(arg, MAX_N) !== 'string') input.push(`build ${values(e.end).join(' ')}`);
    } else if (op === 'middle') {
      input.push(settings.middle === 'first' ? 'middle first' : 'middle');
      expected.push(String(v.middle));
    } else if (op === 'kth' && v.k !== undefined) {
      input.push(`kth ${v.k}`);
      expected.push(v.found ? String(v.value) : 'none');
    } else if (op === 'palindrome') {
      input.push('palindrome', 'list');
      expected.push(String(v.palindrome), values(e.end).join(' '));
    }
  }
  return { input, expected };
}

export default fastSlowPointers;
