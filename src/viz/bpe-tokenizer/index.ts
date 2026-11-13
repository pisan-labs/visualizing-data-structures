import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { corpusWords } from '../_lm/corpus';
import { CORPUS_TEXT, parseInput, readWord } from '../_tokenize/text';
import cppSource from './code/cpp/bpe.hpp?raw';
import javaSource from './code/java/Bpe.java?raw';
import pythonSource from './code/python/bpe.py?raw';
import bytes from './examples/bytes.json';
import noEndMarker from './examples/no-end-marker.json';
import orderMatters from './examples/order-matters.json';
import overlap from './examples/overlap.json';
import suffixes from './examples/suffixes.json';
import tieBreak from './examples/tie-break.json';
import toyCorpus from './examples/toy-corpus.json';
import unknownLetter from './examples/unknown-letter.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  splitWord,
  type BpeExtra,
  type BpeSettings,
  type BpeState,
} from './model';
import { bpePractice } from './practice';
import { view } from './view';

/** Words of the toy corpus, each once. */
const CORPUS_WORDS = [...new Set(corpusWords())];

/** `size` different words from the toy corpus, each 1 to 6 times: "cat*3 walked*2 the". */
export function randomText(rng: Rng, size: number): string {
  const pool = [...CORPUS_WORDS];
  const n = Math.max(1, Math.min(size, pool.length));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    out.push(c > 1 ? `${w}*${c}` : w);
  }
  return out.join(' ');
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** Words that share nothing much: random letters, each word once. */
function strangers(rng: Rng, size: number): string {
  return Array.from({ length: Math.max(2, Math.min(size, 12)) }, () =>
    Array.from({ length: rng.int(3, 6) }, () => LETTERS[rng.int(0, 25)]).join(''),
  ).join(' ');
}

const trained = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size): OpCall[] => [['load', make(rng, size)], ['train']],
});

export const bpe: VizDef<BpeState, BpeSettings, BpeExtra> = {
  id: 'bpe-tokenizer',
  title: 'Byte-pair encoding (BPE)',
  family: 'Tokenization',
  blurb:
    'Start from characters, merge the most frequent pair of neighbours into a new token, and repeat: the tokenizer of GPT and most language models.',
  settings: [
    {
      kind: 'number',
      key: 'merges',
      label: 'Merges to learn (Train)',
      min: 1,
      max: 30,
      help: 'Each merge adds one token to the vocabulary. Real tokenizers learn tens of thousands.',
    },
    {
      kind: 'boolean',
      key: 'eow',
      label: 'End-of-word marker _',
      help: 'SLP3 ends every word with _, so a token at the end of a word differs from the same letters inside one. GPT-2 has no marker; it keeps the space before a word instead.',
    },
    {
      kind: 'choice',
      key: 'tie',
      label: 'Tie between equal counts',
      options: [
        { value: 'first', label: 'The pair met first in the text' },
        { value: 'alpha', label: 'The alphabetically first pair' },
      ],
      help: 'Papers rarely say. Sennrich et al.’s reference code takes the first pair it met; the choice can change every later merge.',
    },
    {
      kind: 'choice',
      key: 'base',
      label: 'Start from',
      options: [
        { value: 'chars', label: 'Characters' },
        { value: 'bytes', label: 'UTF-8 bytes (as GPT-2)' },
      ],
      help: 'With characters, a letter never seen in training has no token. With bytes, the 256 bytes cover every text, and an accented letter starts as two bytes.',
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
      label: 'Word or text',
      placeholder: 'e.g. walking, or a text to learn from',
      maxLength: 400,
      sample: 'the cat is walking',
      parse: parseInput,
    },
    buttons: [
      { op: 'encode', label: 'Encode', usesInput: true, primary: true, bulk: true },
      { op: 'load', label: 'Load text', usesInput: true },
      { op: 'train', label: 'Train', usesInput: false },
      { op: 'merge', label: 'One merge', usesInput: false },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['load', randomText(rng, rng.int(4, 10))], ['train']],
    },
    presets: [
      trained('The toy corpus', () => CORPUS_TEXT),
      trained('Random words from the corpus', randomText),
      trained(
        'Shared suffixes (low, lower, newest...)',
        () => 'low*5 lowest*2 newer*6 wider*3 new*2',
      ),
      trained('Accented letters', () => 'café*3 thé*2 été*2 bébé crème*2 tête'),
      trained('One word, many times', () => 'banana*4'),
      trained('Words that share nothing', strangers),
    ],
    sizes: [5, 10, 20],
  },
  explain,
  complexity: [
    {
      op: 'Count the pairs (one round)',
      best: {
        cost: 'Θ(S)',
        why: 'One look at each neighbour pair of each different word; S is their symbols in all.',
        example: 'overlap',
      },
      average: {
        cost: 'Θ(S)',
        why: 'A word that occurs 29 times is still read once: its count is a weight.',
        example: 'toy-corpus',
      },
      worst: {
        cost: 'Θ(S)',
        why: 'Every round as drawn here counts every pair again.',
        example: 'toy-corpus',
      },
    },
    {
      op: 'Train: k merges',
      best: {
        cost: 'Θ(S)',
        why: 'Every word becomes one token early and training stops.',
        example: 'overlap',
      },
      average: {
        cost: 'Θ(k · S)',
        why: 'k rounds, each a count and a pass to merge.',
        example: 'toy-corpus',
      },
      worst: {
        cost: 'Θ(k · S)',
        why: 'Real trainers update only the words that held the merged pair, and keep the counts in a heap.',
        example: 'suffixes',
      },
    },
    {
      op: 'Encode a word of n symbols',
      best: {
        cost: 'Θ(k)',
        why: 'A one-letter word: k merges tried, none applies.',
        example: 'unknown-letter',
      },
      average: {
        cost: 'Θ(k · n)',
        why: 'Each of the k merges scans the word once.',
        example: 'toy-corpus',
      },
      worst: {
        cost: 'Θ(k · n)',
        why: 'Fast encoders look only at the pairs in the word, by merge rank: O(n log n) with a heap.',
        example: 'order-matters',
      },
      note: 'k is in the tens of thousands for a real model, so the heap version is what libraries use.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as BpeSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    toyCorpus,
    suffixes,
    tieBreak,
    orderMatters,
    unknownLetter,
    bytes,
    noEndMarker,
    overlap,
  ] as unknown as SavedExample[],
  practice: bpePractice(() => bpe),
  preview: { example: 'suffixes', level: 2, hide: ['pairs', 'pr-', 'vocab', 'vb-', 'vm-'] },
  opening: 'toy-corpus',
};

/** What the byte base knows besides the letters' bytes: every byte a word can hold. */
const BYTE_SYMBOLS = [
  ...'abcdefghijklmnopqrstuvwxyz',
  ...Array.from({ length: 128 }, (_, i) => `<${(i + 128).toString(16).toUpperCase()}>`),
  '_',
];

const mergeLine = (ms: readonly { a: string; b: string }[]) =>
  ms.length ? ms.map((m) => `${m.a}+${m.b}`).join(' ') : 'none';

/**
 * Driver protocol for the code tabs. "reset", then "word <count> <tokens>" per training word
 * (already split, so the code tabs need not know the base or the marker) and, with bytes,
 * "known <symbols>"; none print. "train <k> first|alpha" and "merge first|alpha" print the
 * merges as a+b (or "none"); "encode <tokens>" prints the word's tokens.
 */
function codeScript(calls: OpCall[], settings: BpeSettings) {
  const t = new Timeline(bpe, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const send = (s: BpeState) => {
    input.push(
      'reset',
      ...s.rows.map((r) => `word ${r.count} ${r.pieces.map((p) => p.t).join(' ')}`),
    );
    if (settings.base === 'bytes') input.push(`known ${BYTE_SYMBOLS.join(' ')}`);
  };
  let prev = t.initial.state;
  send(prev);
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'load' && e.end !== prev) send(e.end);
    else if (op === 'train') {
      input.push(`train ${settings.merges} ${settings.tie}`);
      expected.push(mergeLine(e.end.merges));
    } else if (op === 'merge') {
      input.push(`merge ${settings.tie}`);
      expected.push(mergeLine(e.end.merges.slice(prev.merges.length)));
    } else if (op === 'encode') {
      const word = readWord(arg);
      if (!(word instanceof Error)) {
        input.push(`encode ${splitWord(word, settings).join(' ')}`);
        expected.push(
          e.end.encodings
            .at(-1)!
            .pieces.map((p) => p.t)
            .join(' '),
        );
      }
    }
    prev = e.end;
  }
  return { input, expected };
}

export default bpe;
