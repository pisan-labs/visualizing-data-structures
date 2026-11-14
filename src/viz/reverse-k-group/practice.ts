import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { distinct } from '../_lists/practice-util';
import {
  defaults,
  DUMMY,
  groups,
  START_K,
  type Rest,
  type RKExtra,
  type RKSettings,
  type RKState,
} from './model';

type Def = VizDef<RKState, RKSettings, RKExtra>;

const build = (vs: number[]): OpCall => ['build', vs.join(' ')];
const shown = (gs: number[][]) => gs.map((g) => `[${g.join(' ')}]`).join(' ');

/**
 * Our own problem statements, for "spot it": three for this page's pattern, and some that look
 * alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A singly linked list of n parcels. Turn each block of 4 consecutive nodes around, leave a shorter last block as it is, and do not copy any values.',
    pattern: 'reverse-k-group',
    cue: ['each block of 4 consecutive nodes', 'turn around', 'do not copy any values'],
    why: 'Find each block’s last node, turn its next pointers around with prev, cur and nxt, and link it in after the node before the block. A dummy head gives the first block a node before it.',
    near: ['two-pointers', 'sliding-window', 'fast-slow-pointers'],
  },
  {
    problem:
      'Swap every two neighbouring nodes of a singly linked list (the first with the second, the third with the fourth, …) by changing links, not values.',
    pattern: 'reverse-k-group',
    cue: ['every two neighbouring nodes', 'changing links, not values'],
    why: 'Swapping neighbours is reversing in groups of 2. The same before, kth and after pointers work; only k changes.',
    near: ['two-pointers', 'cyclic-sort', 'merge-sorted-lists'],
  },
  {
    problem:
      'In a singly linked list, reverse only the nodes from position 3 to position 7, in place, and leave the rest where it is.',
    pattern: 'reverse-k-group',
    cue: ['reverse only the nodes from position 3 to position 7', 'in place'],
    why: 'One group: walk to the node before position 3, turn the five nodes around with prev starting at the node after position 7, and link them in.',
    near: ['two-pointers', 'sliding-window', 'fast-slow-pointers'],
  },
  {
    problem:
      'A singly linked list of letters. Does it read the same forwards and backwards? Use only a few extra variables.',
    pattern: 'fast-slow-pointers',
    cue: ['same forwards and backwards', 'only a few extra variables'],
    why: 'Find the middle with slow and fast pointers, reverse the second half, and compare the halves. The reversal is one group, but finding the middle is the trick.',
    near: ['reverse-k-group', 'two-pointers'],
  },
  {
    problem: 'An array of numbers: reverse it in place, the first with the last, and so on.',
    pattern: 'two-pointers',
    cue: ['an array', 'the first with the last'],
    why: 'An array can be walked from both ends: swap a[i] and a[j] and move both inward. A list cannot walk backwards; an array can.',
    near: ['reverse-k-group', 'sliding-window'],
  },
  {
    problem:
      'Two singly linked lists, each sorted. Combine them into one sorted list by relinking their nodes.',
    pattern: 'merge-sorted-lists',
    cue: ['each sorted', 'combine them into one sorted list'],
    why: 'Compare the two fronts, link the smaller one after a tail pointer, and move on in its list.',
    near: ['reverse-k-group', 'two-pointers'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function reverseKPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: RKSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'after-one',
      title: 'The list after one group',
      make(rng: Rng) {
        const n = rng.int(5, 9);
        const vs = distinct(rng, n, 1, 99);
        const k = rng.int(2, Math.min(4, n - 1));
        const steps = run([build(vs), ['reverse', k]]).entries.at(-1)!.steps;
        const linked = steps.find((s) => s.lines.includes('next'))!;
        const value = linked.state.nodes
          .filter((x) => x.uid !== DUMMY)
          .map((x) => String(x.value));
        return {
          prompt: `Reverse this list in groups of k = ${k}. What does the list read once the first group is turned around and linked in? Type the values from the head.`,
          setup: [build(vs)],
          answer: { kind: 'sequence', value },
          explain: `The first group is ${shown(groups(vs, k).slice(0, 1))}. Turned around it reads ${[...vs.slice(0, k)].reverse().join(' ')}, and its new last node, ${vs[0]}, points at the rest: ${value.join(' ')}.`,
          watch: [['reverse', k]],
        };
      },
    },
    {
      id: 'head-after',
      title: 'The head after every group',
      make(rng: Rng) {
        const n = rng.int(4, 9);
        const vs = distinct(rng, n, 1, 99);
        const k = rng.int(0, 4) === 0 ? n + rng.int(1, 2) : rng.int(2, n);
        const rest: Rest = rng.int(0, 1) ? 'reverse' : 'keep';
        const settings: RKSettings = { ...defaults, rest };
        const t = run([build(vs), ['reverse', k]], settings);
        const end = t.endState();
        const head = end.nodes.find((x) => x.uid === end.head)!.value;
        const gs = groups(vs, k);
        const restText =
          rest === 'reverse'
            ? 'A short last group is reversed too.'
            : 'A last group shorter than k stays as it is.';
        return {
          prompt: `Reverse this list in groups of k = ${k}. ${restText} Which value is at the head at the end?`,
          setup: [build(vs)],
          settings,
          answer: { kind: 'number', value: head },
          explain:
            k > n
              ? `k = ${k} is longer than the list, so the only group is short. ${rest === 'reverse' ? `It is reversed: the old last value, ${head}, comes first.` : `It stays as it is: ${head} is still first.`}`
              : `The groups are ${shown(gs)}. The first group is whole, so its last value, ${head}, comes first.`,
          watch: [['reverse', k]],
        };
      },
    },
    spotItKind({ page: 'reverse-k-group', rows: SPOT_ROWS, watch: [['reverse', START_K]] }),
  ];
}
