import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import cppSource from './code/cpp/reverse.hpp?raw';
import javaSource from './code/java/Reverse.java?raw';
import pythonSource from './code/python/reverse.py?raw';
import evenLength from './examples/even-length.json';
import longest from './examples/longest.json';
import oneCharacter from './examples/one-character.json';
import palindrome from './examples/palindrome.json';
import restFirst from './examples/rest-first.json';
import swapEnds from './examples/swap-ends.json';
import explain from './explain.md?raw';
import {
  cleanText,
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  MAX_LENGTH,
  ops,
  pseudocode,
  type RevSettings,
  type RevState,
} from './model';
import { reversePractice } from './practice';
import { view } from './view';

/** Letters and digits, kept as a string (so "007" stays "007"). */
export function parseText(token: string): Value | Error {
  const t = token.trim();
  if (!t) return new Error('Type a word first.');
  if (t.length > MAX_LENGTH) return new Error(`Keep it to ${MAX_LENGTH} characters.`);
  if (cleanText(t) === null) return new Error('Use letters and digits only.');
  return t;
}

const WORDS: Record<number, string> = { 3: 'CAT', 5: 'STACK', 8: 'STRESSED' };
const PALINDROMES: Record<number, string> = { 3: 'WOW', 5: 'LEVEL', 8: 'RACECAR' };

export const reverseString: VizDef<RevState, RevSettings, undefined> = {
  id: 'reverse-string',
  title: 'Reversing a string',
  family: 'Recursion',
  blurb:
    'Reverse a string with recursion: build it from the reversed rest, or swap the ends in place.',
  settings: [
    {
      kind: 'choice',
      key: 'variant',
      label: 'How each call works',
      options: [
        { value: 'rest', label: 'Reverse the rest, then add the first character' },
        { value: 'swap', label: 'Swap the two ends, then reverse the inside (in place)' },
      ],
      help: 'The first builds a new string in every call. The second changes an array of characters in place and needs half as many calls.',
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
      placeholder: `e.g. STACK (up to ${MAX_LENGTH} characters)`,
      maxLength: 60,
      sample: 'STACK',
      parse: parseText,
    },
    buttons: [
      { op: 'reverse', label: 'Reverse', usesInput: true, primary: true, bulk: true },
      { op: 'load', label: 'Load without reversing', usesInput: true, more: true },
    ],
    random: {
      label: 'Random word',
      make: (rng) => [['reverse', ['CODE', 'STACK', 'FRAME', 'RECURSE'][rng.int(0, 3)]!]],
    },
    presets: [
      { label: 'A word', make: (_rng, size) => [['reverse', WORDS[size] ?? 'STACK']] },
      { label: 'A palindrome', make: (_rng, size) => [['reverse', PALINDROMES[size] ?? 'LEVEL']] },
      {
        label: 'Random letters',
        make: (rng, size) => [
          [
            'reverse',
            Array.from({ length: size }, () => String.fromCharCode(65 + rng.int(0, 25))).join(''),
          ],
        ],
      },
      { label: 'The base case: one character', make: () => [['reverse', 'A']] },
    ],
    sizes: [3, 5, 8],
  },
  explain,
  complexity: [
    {
      op: 'reverse(s), rest first: time',
      best: {
        cost: 'O(1)',
        why: 'One character is the base case: one call.',
        example: 'one-character',
      },
      average: {
        cost: 'O(n²)',
        why: 'n calls, and each one copies its part of the string twice: once for s[1..], once for the concatenation.',
        example: 'rest-first',
      },
      worst: {
        cost: 'O(n²)',
        why: 'Each kind of copy adds up to n + (n - 1) + ... + 1, about n²/2 characters.',
        example: 'longest',
      },
      note: 'Counting characters copied. Building strings with + makes the quadratic cost easy to miss.',
    },
    {
      op: 'reverse(s), rest first: stack depth',
      best: { cost: 'O(1)', why: 'The base case needs one frame.', example: 'one-character' },
      average: {
        cost: 'O(n)',
        why: 'One frame per character, all waiting at once.',
        example: 'rest-first',
      },
      worst: { cost: 'O(n)', why: 'n frames for n characters.', example: 'longest' },
    },
    {
      op: 'reverse(A, i, j), swapping the ends: time',
      best: { cost: 'O(1)', why: 'With i >= j there is nothing to swap.' },
      average: {
        cost: 'O(n)',
        why: 'About n / 2 swaps, each O(1), and no copying.',
        example: 'swap-ends',
      },
      worst: {
        cost: 'O(n)',
        why: 'Still one swap per pair of characters.',
        example: 'even-length',
      },
    },
    {
      op: 'reverse(A, i, j), swapping the ends: stack depth',
      best: { cost: 'O(1)', why: 'A single character is one call.' },
      average: {
        cost: 'O(n)',
        why: 'About n / 2 frames. The call is a tail call, but Python and Java keep every frame.',
        example: 'swap-ends',
      },
      worst: {
        cost: 'O(n)',
        why: 'n / 2 + 1 frames.',
        example: 'palindrome',
      },
      note: 'A loop with two indices does the same swaps in O(1) space.',
    },
  ],
  practice: reversePractice(() => reverseString),
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as RevSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    restFirst,
    swapEnds,
    oneCharacter,
    evenLength,
    palindrome,
    longest,
  ] as unknown as SavedExample[],
};

/**
 * Driver protocol for the code tabs: "reverse s" (rest first) or "swap s" (in place) prints the
 * reversed string. Loads and rejected calls print nothing, so they are left out.
 */
function codeScript(calls: OpCall[], settings: RevSettings) {
  const t = new Timeline(reverseString, settings, 1, calls);
  const op = settings.variant === 'rest' ? 'reverse' : 'swap';
  const input: string[] = [];
  const expected: string[] = [];
  t.entries.forEach((e) => {
    const result = e.steps[e.steps.length - 1]!.vars?.result;
    if (e.call[0] !== 'reverse' || typeof result !== 'string') return;
    input.push(`${op} ${String(e.call[1]).trim()}`);
    expected.push(result);
  });
  return { input, expected };
}

export default reverseString;
