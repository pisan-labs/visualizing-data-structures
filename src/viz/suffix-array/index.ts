import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/suffix_array.hpp?raw';
import javaSource from './code/java/SuffixArray.java?raw';
import pythonSource from './code/python/suffix_array.py?raw';
import allSame from './examples/all-same.json';
import banana from './examples/banana.json';
import distinct from './examples/distinct.json';
import insertionSort from './examples/insertion-sort.json';
import mississippi from './examples/mississippi.json';
import notThere from './examples/not-there.json';
import searchAna from './examples/search-ana.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  longestRepeat,
  ops,
  parseInput,
  pseudocode,
  type SuffixExtra,
  type SuffixSettings,
  type SuffixState,
} from './model';
import { suffixPractice } from './practice';
import { view } from './view';

const WORDS = ['BANANA', 'MISSISSIPPI', 'ABRACADABRA', 'ACGTACGTTA', 'ABAABAAB', 'PAPAYA'];

export const suffixArray: VizDef<SuffixState, SuffixSettings, SuffixExtra> = {
  id: 'suffix-array',
  title: 'Suffix array and LCP',
  family: 'Strings',
  blurb:
    'Sort every suffix of a text, find the longest common prefix of neighbours, then search for a pattern by binary search and read off the longest repeat.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Build by',
      options: [
        { value: 'doubling', label: 'Prefix doubling: sort by pairs of ranks' },
        { value: 'naive', label: 'Comparing suffixes directly (insertion sort)' },
      ],
      help: 'Both give the same suffix array. Doubling sorts 1, 2, 4, 8... characters at a time; direct comparison can look at a whole suffix for each comparison.',
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
      label: 'Text or pattern',
      placeholder: 'e.g. BANANA',
      maxLength: 16,
      sample: 'ANA',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'repeat', label: 'Longest repeat', usesInput: false },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['load', word(rng, rng.int(6, 12), 'ABN')], ['build']],
    },
    presets: [
      {
        label: 'A word with repeats',
        make: (rng, size) => [
          ['load', WORDS[rng.int(0, WORDS.length - 1)]!.slice(0, size + 4)],
          ['build'],
        ],
      },
      {
        label: 'Random letters A and B',
        make: (rng, size) => [['load', word(rng, size, 'AB')], ['build']],
      },
      {
        label: 'All different (best case)',
        make: (_rng, size) => [['load', 'ABCDEFGHIJKLMNOP'.slice(0, size)], ['build']],
      },
      {
        label: 'One letter repeated (worst case)',
        make: (_rng, size) => [['load', 'A'.repeat(size)], ['build']],
      },
      {
        label: 'Then search and find the repeat',
        make: (rng, size) => {
          const t = word(rng, size + 2, 'ABN');
          return [['load', t], ['build'], ['search', t.slice(1, 3)], ['repeat']];
        },
      },
    ],
    sizes: [6, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'Build by prefix doubling',
      best: {
        cost: 'O(n log n)',
        why: 'Every first character differs: one sort by character and no rounds.',
        example: 'distinct',
      },
      average: {
        cost: 'O(n log² n)',
        why: 'About log n rounds, each a comparison sort of n pairs.',
        example: 'banana',
      },
      worst: {
        cost: 'O(n log² n)',
        why: 'One letter repeated needs every round: k = 1, 2, 4... up to n.',
        example: 'all-same',
      },
      note: 'Sorting the pairs with radix sort instead brings it to O(n log n).',
    },
    {
      op: 'Build by comparing suffixes (insertion sort)',
      best: {
        cost: 'O(n)',
        why: 'Suffixes already in order (ABCDEF): each insert takes one comparison, settled at the first character.',
      },
      average: {
        cost: 'O(n²)',
        why: 'About n²/4 comparisons, each settled in a character or two.',
        example: 'insertion-sort',
      },
      worst: {
        cost: 'O(n³)',
        why: 'AAAA…: every suffix moves to the top, and each comparison reads it all.',
        example: 'all-same',
      },
    },
    {
      op: 'LCP by Kasai',
      best: {
        cost: 'O(n)',
        why: 'Every LCP is 0: one character compared per row.',
        example: 'distinct',
      },
      average: {
        cost: 'O(n)',
        why: 'h drops by at most 1 per position, so it rises at most 2n times in all.',
        example: 'mississippi',
      },
      worst: {
        cost: 'O(n)',
        why: 'Even AAAA…, with large LCPs, reuses h instead of comparing again.',
        example: 'all-same',
      },
    },
    {
      op: 'search(P), |P| = m',
      best: {
        cost: 'O(log n)',
        why: 'Each probe differs from P at the first character.',
        example: 'not-there',
      },
      average: {
        cost: 'O(m log n)',
        why: 'Two binary searches, each probe comparing up to m characters.',
        example: 'search-ana',
      },
      worst: {
        cost: 'O(m log n)',
        why: 'Probes that match most of P, as in a text of one letter.',
        example: 'all-same',
      },
      note: 'Listing the k occurrences adds O(k). With the LCP array the search can drop to O(m + log n).',
    },
    {
      op: 'Longest repeated substring',
      best: { cost: 'O(n)', why: 'One scan of LCP for its largest value.', example: 'distinct' },
      average: { cost: 'O(n)', why: 'The same scan, whatever the text.', example: 'mississippi' },
      worst: { cost: 'O(n)', why: 'No more than n - 1 values to look at.', example: 'all-same' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as SuffixSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    banana,
    searchAna,
    mississippi,
    insertionSort,
    allSame,
    distinct,
    notThere,
  ] as unknown as SavedExample[],
  practice: suffixPractice(() => suffixArray),
  preview: { example: 'banana', level: 2 },
};

function word(rng: { int(lo: number, hi: number): number }, n: number, letters: string): string {
  return Array.from({ length: n }, () => letters[rng.int(0, letters.length - 1)]).join('');
}

/**
 * Driver protocol for the code tabs, one line per operation that gives an answer:
 * "build T" prints "<SA> | <LCP>"; "search T P" prints the positions where P occurs, in
 * increasing order, or "none"; "repeat T" prints the longest repeated substring (the first in
 * sorted order when several tie), or "none".
 */
function codeScript(calls: OpCall[], settings: SuffixSettings) {
  const t = new Timeline(suffixArray, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const s = e.end;
    const [op, arg] = e.call;
    if (op === 'build') {
      input.push(`build ${s.text}`);
      expected.push(`${s.sa!.join(' ')} | ${s.lcp!.join(' ')}`);
    } else if (op === 'search' && s.sa) {
      const last = e.steps.at(-1)!;
      if (!last.lines.includes('s.ret')) continue;
      input.push(`search ${s.text} ${String(arg)}`);
      expected.push(String(last.vars!.found));
    } else if (op === 'repeat') {
      const { row, len } = longestRepeat(s);
      input.push(`repeat ${s.text}`);
      expected.push(len ? s.text.slice(s.sa![row]!, s.sa![row]! + len) : 'none');
    }
  }
  return { input, expected };
}

export default suffixArray;
