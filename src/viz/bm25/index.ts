import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { round3 } from '../_lm/numbers';
import { CORPUS } from '../_lm/corpus';
import cppSource from './code/cpp/bm25.hpp?raw';
import javaSource from './code/java/Bm25.java?raw';
import pythonSource from './code/python/bm25.py?raw';
import catMat from './examples/cat-mat.json';
import everyDocument from './examples/every-document.json';
import lengthMatters from './examples/length-matters.json';
import neverNegative from './examples/never-negative.json';
import noMatch from './examples/no-match.json';
import onceIsEnough from './examples/once-is-enough.json';
import saturation from './examples/saturation.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_DOCS,
  ops,
  pseudocode,
  tokens,
  type BmExtra,
  type BmSettings,
  type BmState,
} from './model';
import { bm25Practice } from './practice';
import { view } from './view';

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** `n` sentences of the toy corpus, in a random order. */
export const corpusDocs = (rng: Rng, n: number) => shuffle(rng, CORPUS).slice(0, Math.min(MAX_DOCS, n));

/** One or two words from the documents, none of them "the" or "a". */
export function someQuery(rng: Rng, docs: readonly string[]): string {
  const words = [...new Set(docs.flatMap(tokens))].filter((w) => w !== 'the' && w !== 'a');
  return shuffle(rng, words).slice(0, rng.int(1, 2)).join(' ');
}

const run = (docs: string[], query: string): OpCall[] => [['clear'], ['add', docs.join('; ')], ['search', query]];
const preset = (label: string, make: (rng: Rng, n: number) => OpCall[]): Preset => ({ label, make });

export const bm25: VizDef<BmState, BmSettings, BmExtra> = {
  id: 'bm25',
  title: 'Inverted index and BM25',
  family: 'Retrieval and vector search',
  blurb:
    'Keyword search: an inverted index lists the documents each word is in; BM25 scores them by how rare the word is, how often it appears (with diminishing returns) and how long the document is. The best three come from a heap.',
  settings: [
    {
      kind: 'choice',
      key: 'k1',
      label: 'k₁, how fast repeats stop counting',
      options: [
        { value: '0', label: '0: only whether the word is there' },
        { value: '0.5', label: '0.5' },
        { value: '1.2', label: '1.2 (a common default)' },
        { value: '2', label: '2' },
        { value: '5', label: '5: repeats keep counting' },
      ],
      help: 'Robertson and Zaragoza (2009) report that k₁ from 1.2 to 2 works well in many collections.',
    },
    {
      kind: 'choice',
      key: 'b',
      label: 'b, how much length matters',
      options: [
        { value: '0', label: '0: ignore length' },
        { value: '0.5', label: '0.5' },
        { value: '0.75', label: '0.75 (a common default)' },
        { value: '1', label: '1: full length normalization' },
      ],
      help: 'A long document has more words of every kind; b decides how much its hits are discounted.',
    },
    {
      kind: 'choice',
      key: 'idf',
      label: 'IDF',
      options: [
        { value: 'rsj', label: 'ln((N − n + 0.5) / (n + 0.5)), as Robertson writes it' },
        { value: 'plus1', label: 'ln(1 + (N − n + 0.5) / (n + 0.5)), never negative (Lucene)' },
      ],
      help: 'In the first form a word in more than half the documents gets a negative weight. Lucene adds 1 inside the logarithm so every weight is positive.',
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
      label: 'Text',
      placeholder: 'a document to add (several: separate with ;), or words to search',
      maxLength: 200,
      sample: 'the cat sat on the mat',
      parse: (t) => (tokens(t).length ? t.trim() : new Error('Type some words.')),
    },
    buttons: [
      { op: 'add', label: 'Add', usesInput: true, primary: true },
      { op: 'search', label: 'Search', usesInput: true },
      { op: 'clear', label: 'Clear', usesInput: false, more: true },
    ],
    random: {
      label: 'Random documents',
      make: (rng) => {
        const docs = corpusDocs(rng, rng.int(4, 6));
        return run(docs, someQuery(rng, docs));
      },
    },
    presets: [
      preset('Sentences from the toy corpus', (rng, n) => {
        const docs = corpusDocs(rng, n);
        return run(docs, someQuery(rng, docs));
      }),
      preset('One word repeated (saturation)', (rng, n) =>
        run(
          Array.from({ length: n }, (_, i) => (i % 2 ? `the dog ${'cat '.repeat(i).trim()}` : `the dog sat`)),
          'cat',
        ),
      ),
      preset('Short and long documents', (rng, n) =>
        run(
          Array.from({ length: n }, (_, i) =>
            ['the cat', 'the cat sat on the mat', 'a cat', 'the old cat ran under the big tree', 'cat', 'the dog and the cat'][i % 6]!,
          ),
          'cat',
        ),
      ),
      preset('A word in every document', (rng, n) => run(corpusDocs(rng, n), 'the')),
      preset('A query that matches nothing', (rng, n) => run(corpusDocs(rng, n), 'zebra')),
    ],
    sizes: [4, 5, 6],
  },
  explain,
  complexity: [
    {
      op: 'Add a document of L words',
      best: { cost: 'Θ(L)', why: 'Count the words, then one hash probe and one append per term.', example: 'cat-mat' },
      average: { cost: 'Θ(L)', why: 'Postings go on the end: documents arrive in order.', example: 'saturation' },
      worst: { cost: 'Θ(L)', why: 'Expected time: a hash table with a bad hash could be slower.', example: 'length-matters' },
    },
    {
      op: 'Search for q words',
      best: { cost: 'Θ(q)', why: 'No query word is in the index: q probes and nothing to score.', example: 'no-match' },
      average: {
        cost: 'Θ(q + P + R log k)',
        why: 'P postings on the query words’ lists; R documents met, each offered to a heap of k.',
        example: 'cat-mat',
      },
      worst: {
        cost: 'Θ(q·N + N log k)',
        why: 'A word in every document puts every document on every list.',
        example: 'every-document',
      },
      note: 'Without an index, every query reads every word of every document.',
    },
    {
      op: 'Keep the best k of R scores',
      best: { cost: 'Θ(R)', why: 'After the heap fills, a weak score needs one comparison.', example: 'cat-mat' },
      average: { cost: 'Θ(R log k)', why: 'A newcomer that gets in sifts down at most log k levels.', example: 'saturation' },
      worst: { cost: 'Θ(R log k)', why: 'Scores that rise as you go: every one gets in.', example: 'length-matters' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BmSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    catMat,
    everyDocument,
    neverNegative,
    saturation,
    onceIsEnough,
    lengthMatters,
    noMatch,
  ] as unknown as SavedExample[],
  practice: bm25Practice(() => bm25),
  preview: { example: 'cat-mat', level: 2 },
  opening: 'cat-mat',
};

/**
 * Driver protocol for the code tabs. "add <words>" indexes a document (no output); "clear"
 * starts again; "search <k1> <b> rsj|plus1 <words>" prints the best three as "d<id> <score>"
 * pairs, best first, three decimals, or "none".
 */
function codeScript(calls: OpCall[], settings: BmSettings) {
  const t = new Timeline(bm25, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  let prev = t.initial.state;
  for (const e of t.entries) {
    const [op] = e.call;
    const end = e.end;
    if (end === prev) continue;
    if (op === 'clear') input.push('clear');
    if (op === 'add') for (const d of end.docs.slice(prev.docs.length)) input.push(`add ${d.words.join(' ')}`);
    if (op === 'search' && end.last) {
      input.push(`search ${settings.k1} ${settings.b} ${settings.idf} ${end.last.query.join(' ')}`);
      expected.push(end.last.top.length ? end.last.top.map((k) => `d${k.doc} ${round3(k.score)}`).join(' ') : 'none');
    }
    prev = end;
  }
  return { input, expected };
}

export default bm25;
