import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import type { Rng } from '../../engine/rng';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/frequency.hpp?raw';
import javaSource from './code/java/Frequency.java?raw';
import pythonSource from './code/python/frequency.py?raw';
import countSignatures from './examples/count-signatures.json';
import firstUnique from './examples/first-unique.json';
import longAnagrams from './examples/long-anagrams.json';
import noUniqueLetter from './examples/no-unique-letter.json';
import rescan from './examples/rescan.json';
import sortedLetters from './examples/sorted-letters.json';
import uniqueFirstLetter from './examples/unique-first-letter.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  readList,
  readWord,
  type FExtra,
  type FSettings,
  type FState,
  type GroupExtra,
} from './model';
import { ANAGRAM_SETS, frequencyPractice } from './practice';
import { view } from './view';

const load = (ws: string[]): OpCall => ['load', ws.join(' ')];

function pick<T>(rng: Rng, xs: readonly T[]): T {
  return xs[rng.int(0, xs.length - 1)]!;
}

/** n words from `sets` sets of anagrams, as evenly as the sets allow. */
function fromSets(rng: Rng, n: number, sets: number): string[] {
  const chosen: string[][] = [];
  const pool = [...ANAGRAM_SETS];
  for (let k = 0; k < sets && pool.length; k++) chosen.push([...pool.splice(rng.int(0, pool.length - 1), 1)[0]!]);
  const out: string[] = [];
  for (let k = 0; out.length < n && k < 40; k++) {
    const set = chosen[k % chosen.length]!;
    if (set.length) out.push(set.splice(rng.int(0, set.length - 1), 1)[0]!);
  }
  return out;
}

const shuffled = (rng: Rng, xs: string[]) => {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
};

const presets: Preset[] = [
  {
    label: 'Random anagram groups',
    make: (rng, n) => [load(shuffled(rng, fromSets(rng, n, 3))), ['group']],
  },
  {
    label: 'One big group (all anagrams)',
    make: (rng, n) => [load(fromSets(rng, Math.min(n, 5), 1)), ['group']],
  },
  {
    label: 'No two are anagrams',
    make: (rng, n) => [load(fromSets(rng, n, n)), ['group']],
  },
  {
    label: 'First unique letter, after some repeats',
    make: (rng) => [['unique', pick(rng, ['abracadabra', 'statistics', 'doodle', 'level'])]],
  },
  {
    label: 'First unique letter, at the start (rescanning wins)',
    make: (rng) => [['unique', pick(rng, ['banana', 'python', 'kitten', 'zebra'])]],
  },
  {
    label: 'No unique letter',
    make: (rng) => [['unique', pick(rng, ['teammate', 'hannah', 'deed', 'intestines'])]],
  },
];

export const frequencyCounting: VizDef<FState, FSettings, FExtra> = {
  id: 'frequency-counting',
  title: 'Frequency counting (anagrams)',
  family: 'Array and string tricks',
  blurb:
    'Count how often each letter appears instead of sorting or rescanning: anagrams share their 26 letter counts, so a hash map of counts groups them, and one counting pass finds the first letter that appears once in O(n) instead of O(n²).',
  settings: [
    approachSetting({
      pattern: 'Count each letter (26 counts)',
      naive: 'Sort the letters, or rescan the word',
      help: 'Grouping: a key of 26 counts against the sorted letters. First unique letter: one counting pass against rescanning the word for every letter. Both give the same answer; watch the work counters, or use Compare.',
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
      label: 'Words, or one word',
      placeholder: 'e.g. tops spot pots, or level',
      maxLength: 100,
      sample: 'level',
      parse: parseInput,
    },
    buttons: [
      { op: 'group', label: 'Group anagrams', usesInput: false },
      { op: 'unique', label: 'First unique letter', usesInput: true },
      { op: 'load', label: 'Load', usesInput: true, primary: true },
    ],
    random: {
      label: 'Random words',
      make: (rng) => [load(shuffled(rng, fromSets(rng, 7, 3))), ['group']],
    },
    presets,
    sizes: [4, 6, 8],
  },
  explain,
  complexity: [
    {
      op: 'group n words of k letters, 26 counts',
      best: {
        cost: 'Θ(n(k + 26))',
        why: 'Each word: k counts and 26 reads to make its key, then one lookup.',
        example: 'count-signatures',
      },
      average: { cost: 'Θ(nk)', why: 'The 26 is a constant: O(k) per word, whatever its letters.' },
      worst: {
        cost: 'Θ(nk)',
        why: 'Expected, with a hash map; long words are where it beats sorting.',
        example: 'long-anagrams',
      },
      note: 'On the short words here, sorting takes fewer steps: 26 reads per key is a lot for 5 letters.',
    },
    {
      op: 'group n words of k letters, sorted letters',
      best: {
        cost: 'Θ(nk log k)',
        why: 'A merge sort of each word’s letters, then one lookup.',
        example: 'sorted-letters',
      },
      average: { cost: 'Θ(nk log k)', why: 'The sort does about k log k comparisons per word.' },
      worst: { cost: 'Θ(nk log k)', why: 'The same: no word is cheaper to sort than another of its length.' },
    },
    {
      op: 'first unique letter, count then scan',
      best: {
        cost: 'Θ(n)',
        why: 'The counting pass reads every letter, even when the first is unique.',
        example: 'unique-first-letter',
      },
      average: { cost: 'Θ(n)', why: 'Two passes at most: n counts, then up to n reads.', example: 'first-unique' },
      worst: {
        cost: 'Θ(n)',
        why: 'No letter is unique: 2n counts, and the answer is −1.',
        example: 'no-unique-letter',
      },
    },
    {
      op: 'first unique letter, rescan',
      best: {
        cost: 'Θ(n)',
        why: 'The first letter is unique: one scan of n comparisons, and it wins.',
        example: 'unique-first-letter',
      },
      average: { cost: 'Θ(n²)', why: 'n comparisons for every position it checks.', example: 'rescan' },
      worst: {
        cost: 'Θ(n²)',
        why: 'No letter is unique: n positions of n comparisons each.',
        example: 'no-unique-letter',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(frequencyCounting, settings as FSettings, 1, calls);
      const input = [`load ${t.initial.state.words.join(' ')}`];
      const expected: string[] = [];
      for (const e of t.entries) {
        const [name, arg] = e.call;
        const last = e.steps.at(-1)!;
        if (name === 'load') {
          if (typeof readList(arg) !== 'string') input.push(`load ${e.end.words.join(' ')}`);
        } else if (name === 'group' && last.extra?.kind === 'group') {
          input.push('group');
          const x = last.extra as GroupExtra;
          expected.push(x.map.map((m) => m.words.map((i) => e.end.words[i]).join(',')).join(' '));
        } else if (name === 'unique' && typeof readWord(arg) === 'string') {
          input.push(`unique ${readWord(arg)}`);
          expected.push(String(last.vars?.answer));
        }
      }
      return { input, expected };
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    countSignatures,
    sortedLetters,
    longAnagrams,
    firstUnique,
    rescan,
    noUniqueLetter,
    uniqueFirstLetter,
  ] as unknown as SavedExample[],
  practice: frequencyPractice(() => frequencyCounting),
  preview: { example: 'count-signatures', level: 2 },
};

export default frequencyCounting;
