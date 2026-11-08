import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { randomWord } from '../_strings/kit';
import cppSource from './code/cpp/manacher.hpp?raw';
import javaSource from './code/java/Manacher.java?raw';
import pythonSource from './code/python/manacher.py?raw';
import allSame from './examples/all-same.json';
import evenCenter from './examples/even-center.json';
import longOdd from './examples/long-odd.json';
import naiveWorst from './examples/naive-worst.json';
import noRepeats from './examples/no-repeats.json';
import oneAtATime from './examples/one-at-a-time.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_N,
  ops,
  palindromeOf,
  parseInput,
  pseudocode,
  type ManacherExtra,
  type ManacherSettings,
  type ManacherState,
} from './model';
import { manacherPractice } from './practice';
import { view } from './view';

const mirrorWord = (half: string, odd: string) => half + odd + [...half].reverse().join('');

export const manacher: VizDef<ManacherState, ManacherSettings, ManacherExtra> = {
  id: 'manacher',
  title: 'Manacher (longest palindrome)',
  family: 'Strings',
  blurb:
    'The longest palindromic substring in linear time: separators give every palindrome a center, and a mirror reuses what the palindromes found so far already say.',
  settings: [
    {
      kind: 'choice',
      key: 'method',
      label: 'Find each radius',
      options: [
        { value: 'mirror', label: 'Reuse the mirror inside [C, R] (Manacher)' },
        { value: 'naive', label: 'Expand every center from scratch' },
      ],
      help: 'Turn the mirror off to count what it saves.',
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
      placeholder: 'e.g. abacabad',
      maxLength: MAX_N + 4,
      sample: 'racecar',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'build', label: 'Build P', usesInput: false },
      { op: 'next', label: 'Next center', usesInput: false, more: true },
    ],
    random: {
      label: 'Random word',
      make: (rng) => [['load', randomWord(rng, rng.int(6, MAX_N), 'ab')], ['build']],
    },
    presets: [
      {
        label: 'Random letters a and b',
        make: (rng, n) => [['load', randomWord(rng, n, 'ab')]],
      },
      {
        label: 'A palindrome hidden in random letters',
        make: (rng, n) => {
          const pal = mirrorWord(randomWord(rng, Math.floor((n - 2) / 2), 'abc'), 'x');
          const w = (randomWord(rng, 1, 'abc') + pal + randomWord(rng, n, 'abc')).slice(0, n);
          return [['load', w]];
        },
      },
      {
        label: 'One letter repeated (the mirror’s best case)',
        make: (_rng, n) => [['load', 'a'.repeat(n)]],
      },
      {
        label: 'An even palindrome: abccba…',
        make: (_rng, n) => [['load', mirrorWord('abcde'.slice(0, Math.floor(n / 2)), '')]],
      },
      {
        label: 'No repeats: abcdef…',
        make: (_rng, n) => [['load', 'abcdefghij'.slice(0, n)]],
      },
    ],
    sizes: [6, 8, 10],
  },
  explain,
  complexity: [
    {
      op: 'longest palindrome (Manacher)',
      best: {
        cost: 'O(n)',
        why: 'No repeats: each center makes one or two comparisons.',
        example: 'no-repeats',
      },
      average: {
        cost: 'O(n)',
        why: 'Every successful comparison moves R right; each center fails at most once.',
        example: 'long-odd',
      },
      worst: {
        cost: 'O(n)',
        why: 'R moves right at most 2n + 1 times, so under 2N comparisons even on aaaa…',
        example: 'all-same',
      },
      note: 'Space: O(n) for T and P.',
    },
    {
      op: 'longest palindrome (expand every center)',
      best: { cost: 'O(n)', why: 'No repeats: every center stops almost at once.' },
      average: {
        cost: 'O(n)',
        why: 'On random letters, palindromes are short, so expansions stop early.',
      },
      worst: {
        cost: 'O(n²)',
        why: 'aaaa…: every center expands to the nearer end of the word.',
        example: 'naive-worst',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(manacher, settings as ManacherSettings, 1, calls);
      const input: string[] = [];
      const expected: string[] = [];
      for (const e of t.entries) {
        const st = e.end;
        if (e.call[0] === 'load' || st.i < st.t.length) continue;
        input.push(`radii ${st.s}`, `longest ${st.s}`);
        expected.push(st.p.map((v) => v ?? 0).join(' '), palindromeOf(st.s, st.best));
      }
      return { input, expected };
    },
  },
  examples: [
    longOdd,
    evenCenter,
    allSame,
    naiveWorst,
    noRepeats,
    oneAtATime,
  ] as unknown as SavedExample[],
  practice: manacherPractice(() => manacher),
  preview: { example: 'long-odd', level: 2 },
};

export default manacher;
