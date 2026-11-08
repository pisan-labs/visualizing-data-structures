import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { parseWord } from '../_dp/kit';
import cppSource from './code/cpp/palindrome.hpp?raw';
import javaSource from './code/java/Palindrome.java?raw';
import pythonSource from './code/python/palindrome.py?raw';
import allDifferent from './examples/all-different.json';
import byLength from './examples/by-length.json';
import evenLength from './examples/even-length.json';
import lengthSeven from './examples/length-seven.json';
import tieLeft from './examples/tie-left.json';
import wholeWord from './examples/whole-word.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LEN,
  ops,
  pseudocode,
  type PalExtra,
  type PalSettings,
  type PalState,
} from './model';
import { palPractice, randomWord } from './practice';
import { view } from './view';

const solve = (w: string): OpCall[] => [['load', w], ['fill'], ['trace']];

export const dpPalindrome: VizDef<PalState, PalSettings, PalExtra> = {
  id: 'dp-palindrome',
  title: 'Longest palindromic subsequence',
  family: 'Dynamic programming',
  blurb:
    'The longest subsequence that reads the same both ways, from a table over every piece of the string, filled by length.',
  settings: [
    {
      kind: 'choice',
      key: 'tie',
      label: 'When dropping either end loses nothing',
      options: [
        { value: 'down', label: 'Drop the left end (move down)' },
        { value: 'left', label: 'Drop the right end (move left)' },
      ],
      help: 'The numbers stay the same. The walk back can find a different palindrome of the same length.',
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
      label: 'String',
      placeholder: 'e.g. BBABCBCAB',
      maxLength: MAX_LEN + 4,
      sample: 'BBABCBCAB',
      parse: parseWord(MAX_LEN),
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'fill', label: 'Fill the table', usesInput: false },
      { op: 'trace', label: 'Trace back', usesInput: false },
      { op: 'diagonal', label: 'Fill one length', usesInput: false, more: true },
    ],
    random: { label: 'Random string', make: (rng) => solve(randomWord(rng, rng.int(5, 9))) },
    presets: [
      {
        label: 'Random, three letters',
        make: (rng, size) => solve(randomWord(rng, Math.min(size, MAX_LEN))),
      },
      {
        label: 'Random, many letters (short answer)',
        make: (rng, size) => solve(randomWord(rng, Math.min(size, MAX_LEN), 'ABCDEFGHIJ')),
      },
      {
        label: 'A palindrome already (the whole string)',
        make: (rng, size) => {
          const half = randomWord(rng, Math.ceil(Math.min(size, MAX_LEN) / 2), 'ABCD');
          const rev = [...half].reverse().join('');
          return solve(half + (Math.min(size, MAX_LEN) % 2 ? rev.slice(1) : rev));
        },
      },
      {
        label: 'One letter repeated',
        make: (_rng, size) => solve('A'.repeat(Math.min(size, MAX_LEN))),
      },
    ],
    sizes: [5, 7, 10],
  },
  explain,
  complexity: [
    {
      op: 'fill the table',
      best: {
        cost: 'Θ(n²)',
        why: 'Every piece s[i..j] gets a cell, even for a palindrome.',
        example: 'whole-word',
      },
      average: {
        cost: 'Θ(n²)',
        why: 'n(n + 1)/2 cells, each O(1).',
        example: 'length-seven',
      },
      worst: {
        cost: 'Θ(n²)',
        why: 'The same for every string of length n.',
        example: 'all-different',
      },
      note: 'Space Θ(n²), or Θ(n) for the length alone, keeping two diagonals. As LCS with the reverse it is also Θ(n²).',
    },
    {
      op: 'trace back',
      best: { cost: 'O(n)', why: 'A palindrome: two characters per step.', example: 'whole-word' },
      average: { cost: 'O(n)', why: 'Each step moves at least one pointer in.' },
      worst: { cost: 'O(n)', why: 'n − 1 steps that drop one end each.', example: 'all-different' },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as PalSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    lengthSeven,
    wholeWord,
    allDifferent,
    tieLeft,
    byLength,
    evenLength,
  ] as unknown as SavedExample[],
  practice: palPractice(() => dpPalindrome),
  preview: { example: 'length-seven', level: 2 },
};

/**
 * Driver protocol for the code tabs: "length s" prints the length (after Fill the table);
 * "palindrome s" prints the length and the palindrome the walk finds (after Trace back). The
 * code drops the left end on ties, the default, so the expected output comes from a run with it.
 */
function codeScript(calls: OpCall[], settings: PalSettings) {
  const t = new Timeline(dpPalindrome, { ...settings, tie: 'down' }, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const vars = e.steps.at(-1)!.vars ?? {};
    if (e.call[0] === 'fill' && vars.length !== undefined) {
      input.push(`length ${e.end.s}`);
      expected.push(String(vars.length));
    } else if (e.call[0] === 'trace' && vars.palindrome !== undefined) {
      input.push(`palindrome ${e.end.s}`);
      expected.push(`${String(vars.length)} ${String(vars.palindrome)}`);
    }
  }
  return { input, expected };
}

export default dpPalindrome;
