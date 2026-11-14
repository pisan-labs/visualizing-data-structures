import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { andList } from '../_arr1/kit';
import {
  defaults,
  signature,
  type FExtra,
  type FSettings,
  type FState,
  type GroupExtra,
  type UniqueExtra,
} from './model';

type Def = VizDef<FState, FSettings, FExtra>;

const load = (ws: string[]): OpCall => ['load', ws.join(' ')];

/** Sets of anagrams, common English words. */
export const ANAGRAM_SETS: readonly (readonly string[])[] = [
  ['night', 'thing'],
  ['tops', 'spot', 'pots', 'stop', 'post'],
  ['below', 'elbow'],
  ['listen', 'silent', 'enlist', 'tinsel'],
  ['stone', 'notes', 'onset', 'tones'],
  ['heart', 'earth', 'hater'],
  ['angel', 'glean', 'angle'],
  ['dusty', 'study'],
  ['lemon', 'melon'],
  ['races', 'cares', 'acres', 'scare'],
  ['evil', 'live', 'vile', 'veil'],
  ['meat', 'team', 'mate', 'tame'],
  ['chin', 'inch'],
  ['parts', 'strap', 'traps'],
  ['dairy', 'diary'],
  ['loop', 'pool', 'polo'],
];

function shuffle<T>(rng: Rng, xs: readonly T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Six to eight words from two to four anagram sets, a set sometimes down to one word. */
function wordList(rng: Rng): string[] {
  const sets = shuffle(rng, ANAGRAM_SETS).slice(0, rng.int(2, 4));
  const words = sets.flatMap((set) => shuffle(rng, set).slice(0, rng.int(1, Math.min(3, set.length))));
  return shuffle(rng, words).slice(0, 8);
}

/** A string of 6 to 10 letters from a few letters, so most of them repeat. */
function letters(rng: Rng): string {
  const pool = shuffle(rng, [...'abcdeklmnorst']).slice(0, rng.int(3, 5));
  return Array.from({ length: rng.int(6, 10) }, () => pool[rng.int(0, pool.length - 1)]!).join('');
}

/**
 * Our own problem statements, for "spot it": four that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Two passwords have the same length. Can the second be made by rearranging the letters of the first?',
    pattern: 'frequency-counting',
    cue: ['rearranging the letters'],
    why: 'Rearranging keeps how many times each letter appears and nothing else: compare the two words’ letter counts.',
    near: ['two-pointers', 'sliding-window', 'trie'],
  },
  {
    problem:
      'A warehouse labels its boxes with codes of letters. Put together the codes that use exactly the same letters, in any order.',
    pattern: 'frequency-counting',
    cue: ['exactly the same letters, in any order'],
    why: 'Give each code a key that ignores the order, its letter counts, and group the codes by key in a hash map.',
    near: ['trie', 'merge-intervals', 'two-pointers'],
  },
  {
    problem: 'In a long log of user ids, find the first id that appears only once.',
    pattern: 'frequency-counting',
    cue: ['first', 'appears only once'],
    why: 'Count every id in one pass, then a second pass stops at the first id whose count is 1. Rescanning the log for each id is O(n²).',
    near: ['sliding-window', 'two-pointers', 'lru-cache'],
  },
  {
    problem: 'Can the letters of a word be rearranged to read the same forwards and backwards?',
    pattern: 'frequency-counting',
    cue: ['the letters of a word be rearranged'],
    why: 'Any order is allowed, so only the counts matter: a palindrome can be made when at most one letter has an odd count.',
    near: ['two-pointers', 'sliding-window'],
  },
  {
    problem: 'Does a sentence read the same forwards and backwards, ignoring spaces?',
    pattern: 'two-pointers',
    cue: ['read the same forwards and backwards'],
    why: 'The order is fixed, so counts are not enough: move one pointer in from each end and compare.',
    near: ['frequency-counting', 'sliding-window'],
  },
  {
    problem:
      'Find every place in a long text where some rearrangement of the word “stone” begins.',
    pattern: 'sliding-window',
    cue: ['every place in a long text', 'some rearrangement'],
    why: 'A window as long as the word slides along the text, keeping its letter counts: one letter comes in and one goes out at each step, and a match is equal counts.',
    near: ['two-pointers', 'trie'],
    alsoFits: ['frequency-counting'],
  },
  {
    problem: 'Given a dictionary, list every word that starts with the letters typed so far.',
    pattern: 'trie',
    cue: 'starts with the letters typed so far',
    why: 'Order matters and the question is about prefixes: walk a trie down the typed letters.',
    near: ['frequency-counting', 'sliding-window'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function frequencyPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: FSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const lastExtra = (t: Timeline<FState, FSettings, FExtra>) => t.entries.at(-1)!.steps.at(-1)!.extra!;

  return [
    {
      id: 'signature',
      title: 'A word’s signature',
      make(rng) {
        const pool = ANAGRAM_SETS.flat().filter((w) => w !== 'loop');
        const w = pool[rng.int(0, pool.length - 1)]!;
        const t = run([load([w]), ['group']]);
        const key = (lastExtra(t) as GroupExtra).keys[0]!;
        const parts = key.match(/[a-z]\d+/g)!;
        return {
          prompt: `What is the count signature of “${w}”? Type each letter that appears with its count, in alphabetical order, as for “loop”: l1 o2 p1.`,
          setup: [load([w])],
          answer: { kind: 'sequence', value: parts },
          explain: `Count each letter of “${w}” once: ${andList(parts)}. Every anagram of “${w}” has the same counts, so the same signature; the order of the letters is gone.`,
          watch: [['group']],
        };
      },
    },
    {
      id: 'groups',
      title: 'How many groups?',
      make(rng) {
        const ws = wordList(rng);
        const t = run([load(ws), ['group']]);
        const map = (lastExtra(t) as GroupExtra).map;
        return {
          prompt: 'Group these words by anagram (the same letters, the same number of times). How many groups are there?',
          setup: [load(ws)],
          answer: { kind: 'number', value: map.length },
          explain: `Words with the same signature go together: ${map
            .map((m) => m.words.map((i) => ws[i]).join(' '))
            .join('; ')}. That is ${map.length} ${map.length === 1 ? 'group' : 'groups'}; a word with no anagram here is a group of its own.`,
          watch: [['group']],
        };
      },
    },
    {
      id: 'unique',
      title: 'The first unique letter',
      make(rng) {
        const w = letters(rng);
        const t = run([['unique', w]]);
        const e = lastExtra(t) as UniqueExtra;
        const at = e.answer!;
        const counts = signature(w).match(/[a-z]\d+/g)!;
        return {
          prompt: `In the string “${w}”, what is the index of the first letter that appears only once? Indices start at 0; type −1 if every letter repeats.`,
          setup: [],
          answer: { kind: 'number', value: at },
          explain: `Count every letter first: ${andList(counts)}. Then go through the string again: ${
            at >= 0
              ? `the first letter with count 1 is “${w[at]}”, at index ${at}.`
              : 'no letter has count 1, so the answer is −1.'
          }`,
          watch: [['unique', w]],
        };
      },
    },
    spotItKind({ page: 'frequency-counting', rows: SPOT_ROWS, watch: [['group']] }),
  ];
}
