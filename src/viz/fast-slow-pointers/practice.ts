import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { arrows, ordinal } from '../_lists2/kit';
import { distinct } from '../_lists/practice-util';
import { defaults, type FSExtra, type FSSettings, type FSState, type Middle } from './model';

type Def = VizDef<FSState, FSSettings, FSExtra>;

const build = (vs: number[]): OpCall => ['build', vs.join(' ')];

/**
 * Our own problem statements, for "spot it": three for this page's pattern, and some that look
 * alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A playlist is stored as a singly linked list and nobody knows how long it is. In one walk down the list, return the song in the middle.',
    pattern: 'fast-slow-pointers',
    cue: ['the middle', 'one walk', 'nobody knows how long'],
    why: 'Move one pointer one node at a time and another two. When the fast one runs out of list, the slow one has gone half as far.',
    near: ['two-pointers', 'binary-search', 'floyd-cycle'],
  },
  {
    problem:
      'A printer queue is a singly linked list. Return the job that is 3 places from the end, walking the list only once.',
    pattern: 'fast-slow-pointers',
    cue: ['3 places from the end', 'walking the list only once'],
    why: 'Send one pointer 3 nodes ahead, then move both together. The gap stays 3, so when the front one falls off the end, the back one is 3 from the end.',
    near: ['two-pointers', 'sliding-window', 'monotonic-queue'],
  },
  {
    problem:
      'Does a singly linked list of digits read the same forwards and backwards? You may use only a few extra variables, not an array.',
    pattern: 'fast-slow-pointers',
    cue: ['same forwards and backwards', 'singly linked', 'not an array'],
    why: 'Find the middle with slow and fast, turn the second half around in place, and compare the halves from the outside in. Then turn it back.',
    near: ['two-pointers', 'reverse-k-group', 'monotonic-stack'],
  },
  {
    problem:
      'Each node of a list may have been given a wrong next pointer that points back to an earlier node. Does following next from the head ever end?',
    pattern: 'floyd-cycle',
    cue: ['points back to an earlier node', 'ever end'],
    why: 'A loop never reaches null, so counting the length never stops. The tortoise and the hare meet inside a loop, and the hare reaches null when there is none.',
    near: ['two-pointers', 'disjoint-sets', 'topo-indegree'],
    alsoFits: ['fast-slow-pointers'],
  },
  {
    problem:
      'An array of prices is sorted from low to high. Find two prices that add up to exactly the money you have.',
    pattern: 'two-pointers',
    cue: ['sorted', 'two prices', 'add up to exactly'],
    why: 'An array can be walked from both ends. Start one index at each end and move the one that makes the sum closer.',
    near: ['fast-slow-pointers', 'sliding-window'],
    alsoFits: ['binary-search'],
  },
  {
    problem:
      'Two singly linked lists of order numbers are each in increasing order. Combine them into one increasing list without making new nodes.',
    pattern: 'merge-sorted-lists',
    cue: ['each in increasing order', 'combine them', 'without making new nodes'],
    why: 'Look at the two front nodes, link the smaller one onto the result, and move on in that list. A dummy head saves a special case for the first node.',
    near: ['fast-slow-pointers', 'two-pointers'],
  },
  {
    problem:
      'Rotate a singly linked list to the right by k places: the last k nodes move to the front, in order.',
    pattern: 'fast-slow-pointers',
    cue: ['the last k nodes', 'singly linked'],
    why: 'The cut is just before the k-th node from the end. A gap of k finds it in one walk; then relink three pointers.',
    near: ['reverse-k-group', 'sliding-window', 'two-pointers'],
  },
];

/** The middle setting's loop, for prompts. */
const loopText = (m: Middle) =>
  m === 'first' ? '`while fast.next and fast.next.next`' : '`while fast and fast.next`';

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function fastSlowPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: FSSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const lastVars = (t: Timeline<FSState, FSSettings, FSExtra>) =>
    t.entries.at(-1)!.steps.at(-1)!.vars ?? {};

  return [
    {
      id: 'slow-stops',
      title: 'Where does slow stop?',
      make(rng: Rng) {
        const n = rng.int(4, 9);
        const vs = distinct(rng, n, 1, 99);
        const middle: Middle = n % 2 === 0 && rng.int(0, 2) === 0 ? 'first' : 'second';
        const settings: FSSettings = { ...defaults, middle };
        const t = run([build(vs), ['middle']], settings);
        const v = lastVars(t);
        const value = Number(v.middle);
        const i = Number(v.index);
        return {
          prompt: `slow and fast start at the head; each round slow moves one node and fast two, ${loopText(middle)}. At which value does slow stop? The list has ${n} nodes.`,
          setup: [build(vs)],
          settings,
          answer: { kind: 'number', value },
          explain: `slow moves ${i} ${i === 1 ? 'time' : 'times'} while fast moves ${2 * i} nodes, so it stops at index ${i}: ${value}. ${n % 2 === 0 ? `With ${n} nodes there are two middles, ${vs[n / 2 - 1]} and ${vs[n / 2]}; this loop stops at the ${middle}.` : `With ${n} nodes there is one middle.`}`,
          watch: [['middle']],
        };
      },
    },
    {
      id: 'kth',
      title: 'The k-th from the end',
      make(rng: Rng) {
        const n = rng.int(5, 9);
        const vs = distinct(rng, n, 1, 99);
        const k = rng.int(1, n);
        const t = run([build(vs), ['kth', k]]);
        const value = Number(lastVars(t).value);
        return {
          prompt: `fast goes ${k} ${k === 1 ? 'node' : 'nodes'} ahead of slow; then both move one node at a time until fast is null. Which value is slow on: the ${ordinal(k)} node from the end?`,
          setup: [build(vs)],
          answer: { kind: 'number', value },
          explain: `With a gap of ${k}, slow is ${k} behind null when fast falls off the end. Counting back from the end of ${arrows(vs)}: the ${ordinal(k)} is ${value}, at index ${n - k}.`,
          watch: [['kth', k]],
        };
      },
    },
    spotItKind({
      page: 'fast-slow-pointers',
      rows: SPOT_ROWS,
      watch: [['middle']],
    }),
  ];
}
