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
import cppSource from './code/cpp/trie.hpp?raw';
import javaSource from './code/java/Trie.java?raw';
import pythonSource from './code/python/trie.py?raw';
import deletePrefixWord from './examples/delete-prefix-word.json';
import deletePrunes from './examples/delete-prunes.json';
import lazyDelete from './examples/lazy-delete.json';
import noSharedPrefixes from './examples/no-shared-prefixes.json';
import prefixWord from './examples/prefix-word.json';
import searchMiss from './examples/search-miss.json';
import sharedPrefixes from './examples/shared-prefixes.json';
import startsWithExample from './examples/starts-with.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type TrieExtra,
  type TrieSettings,
  type TrieState,
} from './model';
import { triePractice } from './practice';
import { view } from './view';

export const trie: VizDef<TrieState, TrieSettings, TrieExtra> = {
  id: 'trie',
  title: 'Trie',
  family: 'Strings',
  blurb:
    'A tree of letters: words that share a prefix share a path, so insert, search, delete and prefix queries cost one step per letter.',
  settings: [
    {
      kind: 'choice',
      key: 'delete',
      label: 'Delete',
      options: [
        { value: 'prune', label: 'Unmark the word, then remove nodes that lead nowhere' },
        { value: 'lazy', label: 'Only unmark the word (lazy)' },
      ],
      help: 'A lazy delete is one step, but the nodes it leaves behind still take space.',
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
        label: 'The same words in sorted order (same trie)',
        make: (rng, n) => inserts(sharedWords(rng, n).sort()),
      },
      {
        label: 'No shared prefixes (the most nodes)',
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
        why: 'The root has no edge for the first letter, so the search stops at once.',
        example: 'search-miss',
      },
      average: {
        cost: 'O(m)',
        why: 'One step per letter of w, however many words the trie holds.',
        example: 'shared-prefixes',
      },
      worst: {
        cost: 'O(m)',
        why: 'A hit, or a word that is only a prefix, walks all m letters.',
        example: 'search-miss',
      },
      note: 'm is the length of w. Finding a child is one step with an array of 26 children, and up to 26 steps in a sorted list: a constant either way.',
    },
    {
      op: 'insert(w)',
      best: {
        cost: 'O(m)',
        why: 'Even a word already in the trie walks all m letters before it says so.',
        example: 'prefix-word',
      },
      average: {
        cost: 'O(m)',
        why: 'Each letter follows an edge or makes one: one step either way.',
        example: 'shared-prefixes',
      },
      worst: {
        cost: 'O(m)',
        why: 'No prefix is shared, so every letter gets a new node.',
        example: 'no-shared-prefixes',
      },
    },
    {
      op: 'delete(w)',
      best: {
        cost: 'O(1)',
        why: 'The root has no edge for the first letter: w is not there.',
      },
      average: {
        cost: 'O(m)',
        why: 'Walk down m letters, then remove at most m nodes on the way back up.',
        example: 'delete-prunes',
      },
      worst: {
        cost: 'O(m)',
        why: 'w shares nothing with the other words, so all m of its nodes go.',
        example: 'delete-prunes',
      },
    },
    {
      op: 'startsWith(p)',
      best: {
        cost: 'O(1)',
        why: 'The root has no edge for the first letter: nothing starts with p.',
      },
      average: {
        cost: 'O(|p| + k)',
        why: 'Walk down p, then visit the k nodes below it once each.',
        example: 'starts-with',
      },
      worst: {
        cost: 'O(|p| + N)',
        why: 'Every word starts with p, so the walk visits the whole trie.',
        example: 'starts-with',
      },
      note: 'N is the total number of letters in all the words. Space: one node per distinct prefix, at most N + 1 nodes.',
    },
  ],
  practice: triePractice(() => trie),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as TrieSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    sharedPrefixes,
    prefixWord,
    searchMiss,
    startsWithExample,
    deletePrunes,
    deletePrefixWord,
    noSharedPrefixes,
    lazyDelete,
  ] as unknown as SavedExample[],
  preview: { example: 'shared-prefixes', level: 2 },
};

/**
 * Driver protocol for the code tabs. The code prunes on delete, as the default setting does, so
 * the model runs with that setting too.
 *   insert w | delete w  ->  "ok <words> <nodes>" | "duplicate" / "missing"
 *   search w             ->  "found" | "missing"
 *   startswith p         ->  the words, in order | "none"
 *   clear                ->  "ok"
 */
function codeScript(calls: OpCall[], settings: TrieSettings) {
  const same: TrieSettings = { ...settings, delete: 'prune' };
  const t = new Timeline(trie, same, 1, calls);
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
      const miss = lines.has('del.miss') || lines.has('del.miss2');
      expected.push(miss ? 'missing' : `ok ${v.words} ${v.nodes}`);
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

export default trie;
