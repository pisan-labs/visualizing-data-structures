import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import cppSource from './code/cpp/suffix_tree.hpp?raw';
import javaSource from './code/java/SuffixTree.java?raw';
import pythonSource from './code/python/suffix_tree.py?raw';
import allDifferent from './examples/all-different.json';
import allSame from './examples/all-same.json';
import banana from './examples/banana.json';
import countAna from './examples/count-ana.json';
import mississippi from './examples/mississippi.json';
import notThere from './examples/not-there.json';
import ukkonenBanana from './examples/ukkonen-banana.json';
import explain from './explain.md?raw';
import {
  bracket,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  parseInput,
  pseudocode,
  type StExtra,
  type StSettings,
  type StState,
} from './model';
import { suffixTreePractice } from './practice';
import { view } from './view';

const WORDS = ['BANANA', 'MISSISSIPPI', 'ABRACADABRA', 'ACGTACGTTA', 'ABAABAAB', 'PAPAYA'];

type R = { int(lo: number, hi: number): number };
function word(rng: R, n: number, letters: string): string {
  return Array.from({ length: n }, () => letters[rng.int(0, letters.length - 1)]).join('');
}

export const suffixTree: VizDef<StState, StSettings, StExtra> = {
  id: 'suffix-tree',
  title: 'Suffix tree',
  family: 'Strings',
  blurb:
    'Every suffix of a text in one compressed trie: find a pattern in time proportional to its length, count how often it occurs, and read off the longest repeat.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Build by',
      options: [
        { value: 'naive', label: 'Inserting each suffix into a compressed trie' },
        { value: 'ukkonen', label: "Ukkonen's online algorithm (active point, suffix links)" },
      ],
      help: 'Both build the same tree. Inserting suffixes is O(n²) and easy to follow; Ukkonen reads the text once, left to right, in O(n).',
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
      placeholder: 'e.g. BANANA or ANA',
      maxLength: 16,
      sample: 'ANA',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build', usesInput: false },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'count', label: 'Count', usesInput: true },
      { op: 'repeat', label: 'Longest repeat', usesInput: false },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['load', word(rng, rng.int(5, 9), 'ABN')], ['build']],
    },
    presets: [
      {
        label: 'A word with repeats',
        make: (rng, size) => [
          ['load', WORDS[rng.int(0, WORDS.length - 1)]!.slice(0, size + 2)],
          ['build'],
        ],
      },
      {
        label: 'Random letters A and B',
        make: (rng, size) => [['load', word(rng, size, 'AB')], ['build']],
      },
      {
        label: 'All different (fewest nodes)',
        make: (_rng, size) => [['load', 'ABCDEFGHIJKL'.slice(0, size)], ['build']],
      },
      {
        label: 'One letter repeated (deepest tree)',
        make: (_rng, size) => [['load', 'A'.repeat(size)], ['build']],
      },
      {
        label: 'Then count and find the repeat',
        make: (rng, size) => {
          const t = word(rng, size + 1, 'ABN');
          return [['load', t], ['build'], ['count', t.slice(1, 3)], ['repeat']];
        },
      },
    ],
    sizes: [5, 7, 10],
  },
  explain,
  complexity: [
    {
      op: 'Build by inserting suffixes',
      best: {
        cost: 'O(n)',
        why: 'All letters different: each suffix leaves the root at once, one comparison each.',
        example: 'all-different',
      },
      average: {
        cost: 'O(n log n)',
        why: 'In random text the walk for a suffix is about log n characters long before it leaves.',
        example: 'banana',
      },
      worst: {
        cost: 'O(n²)',
        why: 'AAAA…: suffix i walks n - i characters before it splits off.',
        example: 'all-same',
      },
    },
    {
      op: "Build by Ukkonen's algorithm",
      best: {
        cost: 'O(n)',
        why: 'One phase per character and at most one new leaf per suffix.',
        example: 'ukkonen-banana',
      },
      average: {
        cost: 'O(n)',
        why: 'Suffix links skip the walk from the root; the active point moves O(n) in all.',
        example: 'ukkonen-banana',
      },
      worst: {
        cost: 'O(n)',
        why: 'Even AAAA… does O(n) extensions in total, for a fixed alphabet.',
        example: 'all-same',
      },
      note: 'Space is O(n) for both: 2n + 1 nodes at most, and each edge stores two numbers, not its text.',
    },
    {
      op: 'search(P), |P| = m, k occurrences',
      best: {
        cost: 'O(1)',
        why: 'No edge out of the root starts with P[0].',
        example: 'not-there',
      },
      average: {
        cost: 'O(m + k)',
        why: 'Walk m characters down, then list the k leaves below.',
        example: 'banana',
      },
      worst: {
        cost: 'O(m + k)',
        why: 'The walk never looks at more than m characters, however long T is.',
        example: 'mississippi',
      },
    },
    {
      op: 'count(P)',
      best: { cost: 'O(1)', why: 'P falls off the tree at the root: count 0.', example: 'not-there' },
      average: {
        cost: 'O(m + k)',
        why: 'The walk, then one visit per leaf below (the subtree has fewer than 2k nodes).',
        example: 'count-ana',
      },
      worst: {
        cost: 'O(m + k)',
        why: 'A leaf count stored in every node during the build cuts it to O(m).',
        example: 'all-same',
      },
    },
    {
      op: 'Longest repeated substring',
      best: { cost: 'O(n)', why: 'Only the root is internal: nothing repeats.', example: 'all-different' },
      average: {
        cost: 'O(n)',
        why: 'One traversal, carrying the depth down from the parent.',
        example: 'mississippi',
      },
      worst: { cost: 'O(n)', why: 'There are at most n internal nodes to visit.', example: 'all-same' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as StSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    banana,
    countAna,
    mississippi,
    ukkonenBanana,
    allSame,
    allDifferent,
    notThere,
  ] as unknown as SavedExample[],
  practice: suffixTreePractice(() => suffixTree),
};

/**
 * Driver protocol for the code tabs, one line per operation that gives an answer:
 * "build T" prints the tree as nested edge labels, children in order ($ first), such as
 * ($ A($ NA($ NA$)) BANANA$ NA($ NA$)); "search T P" prints the positions where P occurs,
 * in increasing order, or "none"; "count T P" prints how often P occurs; "repeat T" prints the
 * longest repeated substring (the first in sorted order when several tie), or "none".
 */
function codeScript(calls: OpCall[], settings: StSettings) {
  const t = new Timeline(suffixTree, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const s = e.end;
    const [op, arg] = e.call;
    const last = e.steps.at(-1)!;
    if (!s.tree) continue;
    if (op === 'build') {
      input.push(`build ${s.text}`);
      expected.push(bracket(s));
    } else if (op === 'search' && last.vars?.found !== undefined) {
      input.push(`search ${s.text} ${String(arg)}`);
      expected.push(String(last.vars.found));
    } else if (op === 'count' && last.vars?.count !== undefined) {
      input.push(`count ${s.text} ${String(arg)}`);
      expected.push(String(last.vars.count));
    } else if (op === 'repeat') {
      input.push(`repeat ${s.text}`);
      expected.push(String(last.vars!.repeat));
    }
  }
  return { input, expected };
}

export default suffixTree;
