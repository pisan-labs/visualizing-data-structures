import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import cppSource from './code/cpp/bwt.hpp?raw';
import javaSource from './code/java/Bwt.java?raw';
import pythonSource from './code/python/bwt.py?raw';
import banana from './examples/banana.json';
import indexInstead from './examples/index-instead.json';
import invertBanana from './examples/invert-banana.json';
import oneLetter from './examples/one-letter.json';
import repeatsMakeRuns from './examples/repeats-make-runs.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  parseInput,
  pseudocode,
  type BwtExtra,
  type BwtSettings,
  type BwtState,
} from './model';
import { bwtPractice } from './practice';
import { view } from './view';

export const burrowsWheeler: VizDef<BwtState, BwtSettings, BwtExtra> = {
  id: 'burrows-wheeler',
  title: 'Burrows-Wheeler transform',
  family: 'Strings',
  blurb:
    'Sort every rotation of a word and keep only the last column. Equal letters bunch up, which compresses well, and the column alone is enough to get the word back.',
  settings: [
    {
      kind: 'choice',
      key: 'end',
      label: 'End of the word',
      options: [
        { value: 'sentinel', label: 'Append $, which sorts first' },
        { value: 'index', label: 'No marker: keep the row of the original' },
      ],
      help: 'Burrows and Wheeler kept the row number; most books now add the end marker.',
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
      placeholder: 'e.g. banana',
      maxLength: MAX_N + 4,
      sample: 'mississip',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'transform', label: 'Transform', usesInput: false },
      { op: 'invert', label: 'Invert', usesInput: false },
    ],
    random: {
      label: 'Random word',
      make: (rng) => [['load', randomWord(rng, rng.int(5, 8), 'abn')], ['transform']],
    },
    presets: [
      {
        label: 'Random letters a, b and n',
        make: (rng, n) => [['load', randomWord(rng, n, 'abn')]],
      },
      {
        label: 'A repeated word: abcabc…',
        make: (_rng, n) => [['load', 'abc'.repeat(n).slice(0, n)]],
      },
      {
        label: 'One letter repeated',
        make: (_rng, n) => [['load', 'a'.repeat(n)]],
      },
      {
        label: 'No repeats: abcdef…',
        make: (_rng, n) => [['load', 'abcdefghij'.slice(0, n)]],
      },
      {
        label: 'English-like: banana, bandana…',
        make: (rng, n) => [
          [
            'load',
            ['banana', 'bandana', 'cocoa', 'abracadab', 'mississip', 'tomorrow'].filter(
              (w) => w.length <= n,
            )[rng.int(0, 1)] ?? 'banana',
          ],
        ],
      },
    ],
    sizes: [6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'transform (sorting the rotations)',
      best: {
        cost: 'O(n log n)',
        why: 'Rotations that differ in their first characters: each comparison stops at once.',
        example: 'banana',
      },
      average: {
        cost: 'O(n log n)',
        why: 'On ordinary text, comparisons stop after a few characters.',
        example: 'banana',
      },
      worst: {
        cost: 'O(n² log n)',
        why: 'aaaa…: every comparison reads up to the $. Real tools build the suffix array instead, in O(n).',
        example: 'one-letter',
      },
      note: 'With $ the sorted rotations are the suffix array, so a linear-time suffix array construction gives the transform in O(n).',
    },
    {
      op: 'inverse (LF walk)',
      best: { cost: 'O(n)', why: 'Count the characters to get F, then one step per character.' },
      average: {
        cost: 'O(n)',
        why: 'Each step is a table lookup.',
        example: 'invert-banana',
      },
      worst: {
        cost: 'O(n)',
        why: 'The same: n steps whatever the text, plus O(σ) for the alphabet.',
        example: 'index-instead',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(burrowsWheeler, settings as BwtSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      const index = settings.end === 'index';
      for (const e of t.entries) {
        const st = e.end;
        if (e.call[0] === 'transform') {
          input.push(`${index ? 'bwtindex' : 'bwt'} ${st.text}`);
          expected.push(index ? `${st.l} ${st.index}` : st.l);
        } else if (e.call[0] === 'invert' && st.inv) {
          input.push(index ? `inverseindex ${st.inv.l} ${st.index}` : `inverse ${st.inv.l}`);
          expected.push(st.inv.out);
        }
      }
      return { input, expected };
    },
  },
  examples: [
    banana,
    invertBanana,
    repeatsMakeRuns,
    indexInstead,
    oneLetter,
  ] as unknown as SavedExample[],
  practice: bwtPractice(() => burrowsWheeler),
  preview: { example: 'banana', level: 3 },
};

export default burrowsWheeler;
