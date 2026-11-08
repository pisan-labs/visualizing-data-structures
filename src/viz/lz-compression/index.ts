import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import cppSource from './code/cpp/lz.hpp?raw';
import javaSource from './code/java/Lz.java?raw';
import pythonSource from './code/python/lz.py?raw';
import lz77Decode from './examples/lz77-decode.json';
import lz77Encode from './examples/lz77-encode.json';
import lzwGrows from './examples/lzw-grows.json';
import noRepeats from './examples/no-repeats.json';
import overlapCopy from './examples/overlap-copy.json';
import smallWindow from './examples/small-window.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_TEXT,
  ops,
  parseInput,
  pseudocode,
  tripleText,
  type LzExtra,
  type LzSettings,
  type LzState,
} from './model';
import { lzPractice } from './practice';
import { view } from './view';

export const lzCompression: VizDef<LzState, LzSettings, LzExtra> = {
  id: 'lz-compression',
  title: 'LZ77 and LZW compression',
  family: 'Strings',
  blurb:
    'Replace repeats with references: LZ77 points back into a sliding window, LZW builds a dictionary of strings as it reads. Both decoders need nothing but the output.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Method',
      options: [
        { value: 'lz77', label: 'LZ77: (offset, length, next) into a sliding window' },
        { value: 'lzw', label: 'LZW: codes from a growing dictionary' },
      ],
    },
    {
      kind: 'number',
      key: 'window',
      label: 'LZ77 window (how far back)',
      min: 1,
      max: 16,
      help: 'Real tools use thousands of characters; small windows show what a window misses.',
    },
    {
      kind: 'number',
      key: 'lookahead',
      label: 'LZ77 lookahead (longest copy)',
      min: 1,
      max: 12,
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
      placeholder: 'e.g. abababcababc',
      maxLength: MAX_TEXT + 4,
      sample: 'abracadabra',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'encode', label: 'Encode', usesInput: false },
      { op: 'decode', label: 'Decode', usesInput: false },
    ],
    random: {
      label: 'Random text',
      make: (rng) => [['load', randomWord(rng, rng.int(8, 14), 'ab')], ['encode']],
    },
    presets: [
      {
        label: 'Random letters a and b',
        make: (rng, n) => [['load', randomWord(rng, n, 'ab')]],
      },
      {
        label: 'A repeated word: abcabc…',
        make: (_rng, n) => [['load', 'abc'.repeat(n).slice(0, n)]],
      },
      {
        label: 'One letter repeated (the best case)',
        make: (_rng, n) => [['load', 'a'.repeat(n)]],
      },
      {
        label: 'No repeats (the worst case)',
        make: (_rng, n) => [['load', 'abcdefghijklmnopqrst'.slice(0, n)]],
      },
      {
        label: 'Random DNA (A, C, G, T)',
        make: (rng, n) => [['load', randomWord(rng, n, 'ACGT')]],
      },
    ],
    sizes: [10, 14, 20],
  },
  explain,
  complexity: [
    {
      op: 'LZ77 encode (window W, lookahead A)',
      best: {
        cost: 'O(n)',
        why: 'One long match covers most of the text, so few positions are searched.',
        example: 'overlap-copy',
      },
      average: {
        cost: 'O(n·W·A)',
        why: 'Each position tries W starts, each up to A characters. Real encoders use hash chains to try only promising starts.',
        example: 'lz77-encode',
      },
      worst: {
        cost: 'O(n·W·A)',
        why: 'Near misses everywhere: every start matches A − 1 characters and then fails.',
        example: 'small-window',
      },
      note: 'Decoding is O(n): every character is copied or read once. That is why LZ77 formats (gzip, zip, PNG) decode so fast.',
    },
    {
      op: 'LZW encode',
      best: { cost: 'O(n)', why: 'One dictionary lookup per character, with a hash table or a trie.' },
      average: {
        cost: 'O(n)',
        why: 'The same: each character extends w once.',
        example: 'lzw-grows',
      },
      worst: {
        cost: 'O(n)',
        why: 'Still one lookup per character; only the dictionary memory grows.',
        example: 'lzw-grows',
      },
    },
    {
      op: 'compressed size',
      best: {
        cost: 'O(log n) tokens',
        why: 'LZ77 on aaaa… with an unlimited lookahead: one copy covers the rest.',
        example: 'overlap-copy',
      },
      average: {
        cost: 'depends on repeats',
        why: 'Text with many repeats shrinks; random data barely does.',
        example: 'lz77-encode',
      },
      worst: {
        cost: 'larger than n',
        why: 'No repeats: every character costs a whole token.',
        example: 'no-repeats',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const s = settings as LzSettings;
      const t = new Timeline(lzCompression, s, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      const lz = s.method === 'lz77';
      for (const e of t.entries) {
        const st = e.end;
        if (e.call[0] === 'encode') {
          input.push(lz ? `lz77 ${s.window} ${s.lookahead} ${st.text}` : `lzw ${st.text}`);
          expected.push(lz ? st.triples.map(tripleText).join(' ') : st.codes.map((c) => c.code).join(' '));
        } else if (e.call[0] === 'decode') {
          input.push(
            lz ? `unlz77 ${st.triples.map(tripleText).join(' ')}` : `unlzw ${st.codes.map((c) => c.code).join(' ')}`,
          );
          expected.push(st.out);
        }
      }
      return { input, expected };
    },
  },
  examples: [
    lz77Encode,
    lz77Decode,
    overlapCopy,
    lzwGrows,
    noRepeats,
    smallWindow,
  ] as unknown as SavedExample[],
  practice: lzPractice(() => lzCompression),
  preview: { example: 'lz77-encode', level: 2 },
};

export default lzCompression;
