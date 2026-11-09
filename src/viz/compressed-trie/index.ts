import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  chainWords,
  inserts,
  lonerWords,
  parseWordInput,
  randomWords,
  readWord,
  sharedWords,
} from '../_trie/words';
import cppSource from './code/cpp/radix_tree.hpp?raw';
import javaSource from './code/java/RadixTree.java?raw';
import pythonSource from './code/python/radix_tree.py?raw';
import deleteMerges from './examples/delete-merges.json';
import deletePrefixMerges from './examples/delete-prefix-merges.json';
import extendPath from './examples/extend-path.json';
import longWords from './examples/long-words.json';
import prefixInsideEdge from './examples/prefix-inside-edge.json';
import searchMiss from './examples/search-miss.json';
import splitEdge from './examples/split-edge.json';
import wordEndsInEdge from './examples/word-ends-in-edge.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type RadixExtra,
  type RadixSettings,
  type RadixState,
} from './model';
import { radixPractice } from './practice';
import { view } from './view';

export const compressedTrie: VizDef<RadixState, RadixSettings, RadixExtra> = {
  id: 'compressed-trie',
  title: 'Compressed trie',
  family: 'Strings',
  blurb:
    'A trie whose edges hold strings: a node only where paths branch or a word ends. Insert splits an edge, delete merges one back.',
  settings: [],
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
      label: 'Word',
      placeholder: 'e.g. cart, or car cat dog',
      maxLength: 120,
      sample: 'car',
      parse: parseWordInput,
    },
    buttons: [
      { op: 'insert', label: 'Insert', usesInput: true, bulk: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'startsWith', label: 'Starts with', usesInput: true },
      { op: 'delete', label: 'Delete', usesInput: true, bulk: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    presets: [
      { label: 'Words that share prefixes', make: (rng, n) => inserts(sharedWords(rng, n)) },
      {
        label: 'No shared prefixes (one edge per word)',
        make: (rng, n) => inserts(lonerWords(rng, n)),
      },
      {
        label: 'Each word a prefix of the next',
        make: (_rng, n) => inserts(chainWords(Math.min(n, 7))),
      },
      { label: 'Random strings of a, b and c', make: (rng, n) => inserts(randomWords(rng, n)) },
    ],
    sizes: [5, 8, 12],
  },
  explain,
  complexity: [
    {
      op: 'search(w)',
      best: {
        cost: 'O(1)',
        why: 'No edge from the root starts with the first letter.',
        example: 'search-miss',
      },
      average: {
        cost: 'O(m)',
        why: 'Each letter of w is compared once, on whichever edge it falls.',
        example: 'search-miss',
      },
      worst: {
        cost: 'O(m)',
        why: 'A hit compares all m letters, the same as in a plain trie.',
        example: 'long-words',
      },
      note: 'm is the length of w. The walk visits fewer nodes than in a plain trie, but it still reads every letter.',
    },
    {
      op: 'insert(w)',
      best: {
        cost: 'O(m)',
        why: 'Even a new leaf right under the root stores all m letters on its edge.',
        example: 'long-words',
      },
      average: {
        cost: 'O(m)',
        why: 'Compare the letters down the path, then split at most one edge.',
        example: 'split-edge',
      },
      worst: {
        cost: 'O(m)',
        why: 'Compare all m letters, then split one edge: O(1) when edges hold positions into the words, not copies of the letters.',
        example: 'word-ends-in-edge',
      },
    },
    {
      op: 'delete(w)',
      best: {
        cost: 'O(1)',
        why: 'No edge from the root starts with the first letter: w is not there.',
      },
      average: {
        cost: 'O(m)',
        why: 'Find w, clear its mark, then remove one leaf or merge one pair of edges.',
        example: 'delete-merges',
      },
      worst: {
        cost: 'O(m)',
        why: 'Find w in m letters, then join one pair of edges: O(1) when edges hold positions into the words, not copies of the letters.',
        example: 'delete-prefix-merges',
      },
    },
    {
      op: 'startsWith(p)',
      best: {
        cost: 'O(1)',
        why: 'No edge from the root starts with the first letter of p.',
      },
      average: {
        cost: 'O(|p| + k)',
        why: 'Walk down p, then visit the k nodes below it.',
        example: 'prefix-inside-edge',
      },
      worst: {
        cost: 'O(|p| + n)',
        why: 'Every word starts with p, so the walk visits all the nodes.',
        example: 'prefix-inside-edge',
      },
      note: 'With n words there are at most 2n nodes, however long the words are: every node other than the root ends a word or has two or more children.',
    },
  ],
  practice: radixPractice(() => compressedTrie),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    splitEdge,
    extendPath,
    wordEndsInEdge,
    searchMiss,
    prefixInsideEdge,
    deleteMerges,
    deletePrefixMerges,
    longWords,
  ] as unknown as SavedExample[],
  opening: 'long-words',
  preview: { example: 'long-words', level: 2 },
};

/**
 * Driver protocol for the code tabs:
 *   insert w | delete w  ->  "ok <words> <nodes>" | "duplicate" / "missing"
 *   search w             ->  "found" | "missing"
 *   startswith p         ->  the words, in order | "none"
 *   clear                ->  "ok"
 * The node count is the same for every correct compressed trie: its shape follows from its
 * words.
 */
function codeScript(calls: OpCall[], settings: Settings) {
  const t = new Timeline(compressedTrie, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const [op, raw] = e.call;
    const last = e.steps.at(-1)!;
    const v = last.vars ?? {};
    const lines = new Set(last.lines);
    if (op === 'clear') {
      input.push('clear');
      expected.push('ok');
      continue;
    }
    const w = readWord(raw);
    if (w instanceof Error) continue; // The model refuses it and changes nothing.
    if (op === 'insert') {
      input.push(`insert ${w}`);
      expected.push(lines.has('ins.dup') ? 'duplicate' : `ok ${v.words} ${v.nodes}`);
    } else if (op === 'delete') {
      input.push(`delete ${w}`);
      expected.push(lines.has('del.miss') ? 'missing' : `ok ${v.words} ${v.nodes}`);
    } else if (op === 'search') {
      input.push(`search ${w}`);
      expected.push(v.found ? 'found' : 'missing');
    } else if (op === 'startsWith') {
      input.push(`startswith ${w}`);
      expected.push(String(v.returned));
    }
  }
  return { input, expected };
}

export default compressedTrie;
