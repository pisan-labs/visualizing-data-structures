import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { plantedText, randomWord } from '../_strings/kit';
import cppSource from './code/cpp/z_algorithm.hpp?raw';
import javaSource from './code/java/ZAlgorithm.java?raw';
import pythonSource from './code/python/z_algorithm.py?raw';
import allSame from './examples/all-same.json';
import boxCopies from './examples/box-copies.json';
import findPattern from './examples/find-pattern.json';
import naiveWorst from './examples/naive-worst.json';
import noMatch from './examples/no-match.json';
import oneAtATime from './examples/one-at-a-time.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_S,
  ops,
  parseInput,
  pseudocode,
  type ZExtra,
  type ZSettings,
  type ZState,
} from './model';
import { zPractice } from './practice';
import { view } from './view';

const load = (text: string, pattern: string): OpCall => ['load', `${text} / ${pattern}`];

export const zAlgorithm: VizDef<ZState, ZSettings, ZExtra> = {
  id: 'z-algorithm',
  title: 'Z-algorithm',
  family: 'Strings',
  blurb:
    'For every position, how far does the string match its own start? A box of what is already known makes it linear, and P$T turns it into a pattern matcher.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Compute Z',
      options: [
        { value: 'box', label: 'With the box [l, r] (the Z-algorithm)' },
        { value: 'naive', label: 'From scratch at every position' },
      ],
      help: 'Turn the box off to count what it saves.',
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
      label: 'Text / pattern, or one word',
      placeholder: 'e.g. ABAABAABAB / ABAB',
      maxLength: MAX_S + 8,
      sample: 'ABRACADABRA / ABRA',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build Z', usesInput: false },
      { op: 'next', label: 'Next position', usesInput: false, more: true },
    ],
    random: {
      label: 'Random text',
      make: (rng) => {
        const p = randomWord(rng, rng.int(2, 4), 'AB');
        return [load(plantedText(rng, 12, p, 'AB'), p), ['build']];
      },
    },
    presets: [
      {
        label: 'Random letters A and B',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(2, 4), 'AB');
          return [load(plantedText(rng, Math.min(n, MAX_S - 1 - p.length), p, 'AB'), p)];
        },
      },
      {
        label: 'Random DNA (A, C, G, T)',
        make: (rng, n) => {
          const p = randomWord(rng, 3, 'ACGT');
          return [load(plantedText(rng, Math.min(n, MAX_S - 4), p, 'ACGT'), p)];
        },
      },
      {
        label: 'One letter repeated (the box’s best case, brute force’s worst)',
        make: (_rng, n) => [['load', 'A'.repeat(Math.min(n, MAX_S))]],
      },
      {
        label: 'A repeating word: ABCABC…',
        make: (_rng, n) => [['load', 'ABC'.repeat(n).slice(0, Math.min(n, MAX_S))]],
      },
      {
        label: 'No repeats: every Z is 0',
        make: (_rng, n) => [['load', 'ABCDEFGHIJKLMNOPQRST'.slice(0, Math.min(n, MAX_S))]],
      },
    ],
    sizes: [8, 12, 15],
  },
  explain,
  complexity: [
    {
      op: 'build Z (with the box)',
      best: {
        cost: 'O(n)',
        why: 'No repeats: every position makes one failed comparison, n − 1 in all.',
      },
      average: {
        cost: 'O(n)',
        why: 'Every successful comparison moves r right, and each position fails at most once.',
        example: 'find-pattern',
      },
      worst: {
        cost: 'O(n)',
        why: 'r moves right at most n times, so fewer than 2n comparisons, even on AAAA…',
        example: 'all-same',
      },
      note: 'Space: O(n) for Z.',
    },
    {
      op: 'build Z (from scratch)',
      best: { cost: 'O(n)', why: 'No repeats: one comparison per position.' },
      average: {
        cost: 'O(n)',
        why: 'On random text over a few letters, matches with the prefix are short.',
      },
      worst: {
        cost: 'O(n²)',
        why: 'AAAA…: position i compares n − i characters, about n²/2 in all.',
        example: 'naive-worst',
      },
    },
    {
      op: 'search(T, P) via P$T',
      best: { cost: 'O(n + m)', why: 'Z on a string of n + m + 1 characters.' },
      average: {
        cost: 'O(n + m)',
        why: 'The same: one linear pass, whatever the text.',
        example: 'no-match',
      },
      worst: {
        cost: 'O(n + m)',
        why: 'The $ stops every match at m, so values never cross from P into T.',
        example: 'find-pattern',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(zAlgorithm, settings as ZSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const st = e.end;
        if (e.call[0] === 'load' || st.i < st.s.length || st.i === 0) continue;
        if (st.pattern !== null && st.text !== null) {
          input.push(`search ${st.text} ${st.pattern}`);
          expected.push(st.found.length ? st.found.join(' ') : 'none');
        } else {
          input.push(`zarray ${st.s}`);
          expected.push(st.z.map((v) => v ?? 0).join(' '));
        }
      }
      return { input, expected };
    },
  },
  examples: [
    findPattern,
    boxCopies,
    allSame,
    naiveWorst,
    noMatch,
    oneAtATime,
  ] as unknown as SavedExample[],
  practice: zPractice(() => zAlgorithm),
  preview: { example: 'find-pattern', level: 2 },
};

export default zAlgorithm;
