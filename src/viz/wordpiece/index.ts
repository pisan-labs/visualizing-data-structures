import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, VizDef } from '../../engine/types';
import { corpusWords } from '../_lm/corpus';
import { CORPUS_TEXT, MAX_LEN, parseInput, readWord } from '../_tokenize/text';
import cppSource from './code/cpp/wordpiece.hpp?raw';
import javaSource from './code/java/WordPiece.java?raw';
import pythonSource from './code/python/wordpiece.py?raw';
import backOff from './examples/back-off.json';
import commonWord from './examples/common-word.json';
import loop from './examples/loop.json';
import scoreVsCount from './examples/score-vs-count.json';
import suffixes from './examples/suffixes.json';
import tooLong from './examples/too-long.json';
import toyCorpus from './examples/toy-corpus.json';
import unknownWord from './examples/unknown-word.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type WpExtra,
  type WpSettings,
  type WpState,
} from './model';
import { wordpiecePractice } from './practice';
import { view } from './view';

const CORPUS_WORDS = [...new Set(corpusWords())];

/** `size` different words from the toy corpus, each 1 to 6 times. */
function randomText(rng: Rng, size: number): string {
  const pool = [...CORPUS_WORDS];
  return Array.from({ length: Math.max(1, Math.min(size, pool.length)) }, () => {
    const w = pool.splice(rng.int(0, pool.length - 1), 1)[0]!;
    const c = rng.int(1, 6);
    return c > 1 ? `${w}*${c}` : w;
  }).join(' ');
}

const trained = (label: string, make: (rng: Rng, size: number) => string): Preset => ({
  label,
  make: (rng, size): OpCall[] => [['load', make(rng, size)], ['train']],
});

export const wordpiece: VizDef<WpState, WpSettings, WpExtra> = {
  id: 'wordpiece',
  title: 'WordPiece tokenizer',
  family: 'Tokenization',
  blurb:
    'BERT’s tokenizer: take the longest piece of the vocabulary that fits, mark the pieces inside a word with ##, and give up with [UNK] when nothing fits.',
  settings: [
    {
      kind: 'number',
      key: 'merges',
      label: 'Merges to learn (Train)',
      min: 1,
      max: 30,
      help: 'Each merge adds one piece to the vocabulary. BERT’s vocabulary has about 30 000.',
    },
    {
      kind: 'number',
      key: 'maxLen',
      label: 'Longest word (longer is [UNK])',
      min: 3,
      max: MAX_LEN,
      help: 'BERT gives up on words over 100 characters. Here words have at most 12 letters.',
    },
    {
      kind: 'boolean',
      key: 'trie',
      label: 'Walk a trie of the vocabulary',
      help: 'On: one walk down a trie finds the longest piece. Off: BERT’s loop, which looks up the rest of the word, then one letter shorter, and so on. Both find the same pieces.',
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
      trained('Shared suffixes (low, lower, newest...)', () => 'low*5 lowest*2 newer*6 wider*3 new*2'),
      trained('A common word and rare ones', () => 'the*12 then*2 hug*3 pug*2 hugs'),
      trained('One word, many times', () => 'banana*4'),
    ],
    sizes: [5, 10, 20],
  },
  explain,
  complexity: [
    {
      op: 'Encode a word of n letters (trie)',
      best: {
        cost: 'Θ(n)',
        why: 'Each walk stops at the letter where the piece ends.',
        example: 'toy-corpus',
      },
      average: {
        cost: 'Θ(n)',
        why: 'Pieces are short, so a walk rarely passes the end of its piece.',
        example: 'common-word',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'A walk can run far past the last ring and back off, piece after piece. Fast WordPiece (2021) adds failure links, as in Aho-Corasick, to get Θ(n).',
        example: 'back-off',
      },
    },
    {
      op: 'Encode a word of n letters (BERT’s loop)',
      best: {
        cost: 'Θ(n)',
        why: 'The whole word is a piece: one lookup, hashing n letters.',
        example: 'loop',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'Each piece tries every shorter ending first.',
        example: 'loop',
      },
      worst: {
        cost: 'Θ(n³)',
        why: 'n pieces of one letter, each after up to n lookups of up to n letters.',
        example: 'loop',
      },
      note: 'Counting letters hashed. BERT caps a word at 100 characters, so n stays small.',
    },
    {
      op: 'Train: k merges',
      best: {
        cost: 'Θ(S)',
        why: 'Every word becomes one piece early and training stops; S is the letters of the different words.',
        example: 'score-vs-count',
      },
      average: {
        cost: 'Θ(k · S)',
        why: 'Each round counts the pieces and pairs again and merges once.',
        example: 'toy-corpus',
      },
      worst: {
        cost: 'Θ(k · S)',
        why: 'The same as BPE: only the score differs.',
        example: 'toy-corpus',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as WpSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    toyCorpus,
    scoreVsCount,
    suffixes,
    commonWord,
    unknownWord,
    backOff,
    tooLong,
    loop,
  ] as unknown as SavedExample[],
  practice: wordpiecePractice(() => wordpiece),
  preview: { example: 'toy-corpus', level: 2, hide: ['done', 'er-', 'enc', 'wl-', 'pieces', 'pc-'] },
  opening: 'toy-corpus',
};

const mergeLine = (ms: readonly { a: string; b: string }[]) =>
  ms.length ? ms.map((m) => `${m.a}+${m.b}`).join(' ') : 'none';

/**
 * Driver protocol for the code tabs. "reset", then "word <count> <letters>" per training word
 * (letters separated by spaces); neither prints. "train <k>" and "merge" print the merges as a+b
 * (or "none"); "encode <max length> <letters>" prints the pieces, or [UNK].
 */
function codeScript(calls: OpCall[], settings: WpSettings) {
  const t = new Timeline(wordpiece, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  const send = (s: WpState) =>
    input.push('reset', ...s.rows.map((r) => `word ${r.count} ${[...r.word].join(' ')}`));
  let prev = t.initial.state;
  send(prev);
  for (const e of t.entries) {
    const [op, arg] = e.call;
    if (op === 'load' && e.end !== prev) send(e.end);
    else if (op === 'train') {
      input.push(`train ${settings.merges}`);
      expected.push(mergeLine(e.end.merges));
    } else if (op === 'merge') {
      input.push('merge');
      expected.push(mergeLine(e.end.merges.slice(prev.merges.length)));
    } else if (op === 'encode') {
      const word = readWord(arg);
      if (!(word instanceof Error)) {
        input.push(`encode ${settings.maxLen} ${[...word].join(' ')}`);
        expected.push(e.end.encodings.at(-1)!.pieces.join(' '));
      }
    }
    prev = e.end;
  }
  return { input, expected };
}

export default wordpiece;
