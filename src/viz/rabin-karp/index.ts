import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import {
  driverScript,
  loadCall,
  MAX_PATTERN,
  MAX_TEXT,
  parseInput,
  plantedText,
  randomWord,
  type MatchExtra,
  type MatchState,
} from '../_strings/kit';
import { describeMatch } from '../_strings/view';
import cppSource from './code/cpp/rabin_karp.hpp?raw';
import javaSource from './code/java/RabinKarp.java?raw';
import pythonSource from './code/python/rabin_karp.py?raw';
import biggerQ from './examples/bigger-q.json';
import digits from './examples/digits.json';
import everyShift from './examples/every-shift.json';
import needsDigits from './examples/needs-digits.json';
import noMatch from './examples/no-match.json';
import spuriousHit from './examples/spurious-hit.json';
import explain from './explain.md?raw';
import { defaults, init, initialSay, initialVars, ops, pseudocode, type RkSettings } from './model';
import { rkPractice } from './practice';
import { view } from './view';

export const rabinKarp: VizDef<MatchState<null>, RkSettings, MatchExtra> = {
  id: 'rabin-karp',
  title: 'Rabin-Karp',
  family: 'Strings',
  blurb:
    'Compare a rolling hash of each window with the hash of the pattern, and check the characters only when they agree.',
  settings: [
    {
      kind: 'choice',
      key: 'radix',
      label: 'Radix d',
      options: [
        { value: 'auto', label: 'Automatic: 10 for digits, 256 for other text (CLRS)' },
        { value: '10', label: 'd = 10: each character is a decimal digit' },
        { value: '256', label: 'd = 256: each character is its character code' },
      ],
      help: 'The hash reads a window as a number in radix d.',
    },
    {
      kind: 'number',
      key: 'q',
      label: 'Modulus q',
      min: 2,
      max: 997,
      help: 'Hashes are remainders mod q. A small q, such as 13, makes spurious hits common; a bigger prime makes them rare.',
    },
  ],
  defaults,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  view,
  describe: describeMatch,
  controls: {
    input: {
      label: 'Text / pattern',
      placeholder: 'e.g. 31415926535 / 5926',
      maxLength: MAX_TEXT + MAX_PATTERN + 8,
      sample: '31415926535 / 5926',
      parse: parseInput,
    },
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'search', label: 'Search', usesInput: false },
      { op: 'next', label: 'Next window', usesInput: false, more: true },
    ],
    random: {
      label: 'Random digits',
      make: (rng) => {
        const p = randomWord(rng, rng.int(3, 4), '0123456789');
        return [loadCall(plantedText(rng, 16, p, '0123456789'), p), ['search']];
      },
    },
    presets: [
      {
        label: 'Random digits',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(3, 4), '0123456789');
          return [loadCall(plantedText(rng, n, p, '0123456789'), p)];
        },
      },
      {
        label: 'Few digits (more hits)',
        make: (rng, n) => {
          const p = randomWord(rng, 3, '012');
          return [loadCall(plantedText(rng, n, p, '012'), p)];
        },
      },
      {
        label: 'Random letters A to D',
        make: (rng, n) => {
          const p = randomWord(rng, rng.int(3, 5), 'ABCD');
          return [loadCall(plantedText(rng, n, p, 'ABCD'), p)];
        },
      },
      {
        label: 'A hit at every shift: AAA… and AAA',
        make: (_rng, n) => [loadCall('A'.repeat(n), 'AAA')],
      },
    ],
    sizes: [12, 16, 20, 24],
  },
  explain,
  complexity: [
    {
      op: 'hash P and the first window (preprocessing)',
      best: {
        cost: 'O(m)',
        why: "Horner's rule: one multiply, add and mod per character of P and of the first window.",
      },
      average: { cost: 'O(m)', why: 'The same m steps for every input.', example: 'digits' },
      worst: {
        cost: 'O(m)',
        why: 'h = d^(m − 1) mod q takes m − 1 more multiplications, or O(log m) by repeated squaring.',
      },
    },
    {
      op: 'search(T, P), every match',
      best: {
        cost: 'O(n)',
        why: 'No hits: each window costs one hash check and one O(1) roll.',
        example: 'bigger-q',
      },
      average: {
        cost: 'O(n + m·v)',
        why: 'v real matches cost m comparisons each; with a big prime q, spurious hits are rare (about n/q of them).',
        example: 'spurious-hit',
      },
      worst: {
        cost: 'O(mn)',
        why: 'Every window is a hit: a match at every shift, or a q so small that most windows collide. Each hit costs up to m comparisons.',
        example: 'every-shift',
      },
      note: 'Real code uses a big prime q that keeps d·q within a machine word, so spurious hits almost never happen.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => {
      const t = new Timeline(rabinKarp, settings as RkSettings, 1, calls);
      return driverScript(t.entries, t.initial.state);
    },
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    spuriousHit,
    digits,
    biggerQ,
    noMatch,
    everyShift,
    needsDigits,
  ] as unknown as SavedExample[],
  practice: rkPractice(() => rabinKarp),
};

export default rabinKarp;
