import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { choice } from '../_lists/practice-util';
import { DUMMY } from './model';
import { defaults, formatLists, NAMES, type MExtra, type MSettings, type MState } from './model';

type Def = VizDef<MState, MSettings, MExtra>;

const build = (lists: number[][]): OpCall => ['build', formatLists(lists)];

/** A sorted list of n small values, so ties happen. */
const sorted = (rng: Rng, n: number, hi = 20) =>
  Array.from({ length: n }, () => rng.int(1, hi)).sort((x, y) => x - y);

/**
 * Our own problem statements, for "spot it": three for this page's pattern, and some that look
 * alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Two singly linked lists of timestamps are each oldest first. Combine them into one list, oldest first, using the nodes you already have.',
    pattern: 'merge-sorted-lists',
    cue: ['each oldest first', 'combine them into one list', 'the nodes you already have'],
    why: 'Both lists are sorted, so the next node of the result is always one of the two fronts. Link the older one after a tail pointer and move on in its list.',
    near: ['two-pointers', 'merge-intervals', 'sweep-line'],
    alsoFits: ['k-way-merge'],
  },
  {
    problem:
      'Eight servers each keep a log sorted by time, as a linked list. Produce one log sorted by time.',
    pattern: 'merge-sorted-lists',
    cue: ['eight', 'each keep a log sorted', 'one log'],
    why: 'Merge them in pairs: four merges, then two, then one. Every entry takes part in three merges, log2 8, instead of up to seven when merging one at a time.',
    near: ['top-k', 'two-pointers', 'sweep-line'],
    alsoFits: ['k-way-merge'],
  },
  {
    problem:
      'Sort a singly linked list of n numbers in O(n log n) time, without copying them into an array.',
    pattern: 'merge-sorted-lists',
    cue: ['sort a singly linked list', 'without copying them into an array'],
    why: 'Merge sort suits lists: split at the middle (slow and fast pointers), sort each half, and merge the two sorted halves by relinking.',
    near: ['two-heaps-median', 'cyclic-sort', 'top-k'],
    alsoFits: ['fast-slow-pointers'],
  },
  {
    problem:
      'A calendar holds meetings as (start, end) pairs, some overlapping. Replace every group of overlapping meetings with one meeting that covers it.',
    pattern: 'merge-intervals',
    cue: ['(start, end) pairs', 'overlapping', 'one meeting that covers it'],
    why: 'Sort by start, then extend the current meeting while the next one starts before it ends. Merging here means joining overlaps, not interleaving sorted lists.',
    near: ['merge-sorted-lists', 'sweep-line'],
  },
  {
    problem:
      'Two arrays of customer ids, each sorted. List the ids that appear in both, in one pass.',
    pattern: 'two-pointers',
    cue: ['each sorted', 'appear in both', 'one pass'],
    why: 'One index in each array: equal ids go to the answer and both move; otherwise move the smaller one. The walk is the merge’s, but nothing is linked.',
    near: ['merge-sorted-lists', 'sliding-window'],
    alsoFits: ['binary-search'],
  },
  {
    problem:
      'A singly linked list of song titles. Without counting it first, return the title in the middle.',
    pattern: 'fast-slow-pointers',
    cue: ['without counting it first', 'the middle'],
    why: 'One pointer moves one node at a time and another two; when the fast one runs out, the slow one is halfway.',
    near: ['merge-sorted-lists', 'two-pointers'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function mergePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: MSettings = defaults) =>
    new Timeline(def(), settings, 1, ops);
  const mergeSteps = (lists: number[][], settings: MSettings = defaults) =>
    run([build(lists), ['merge']], settings).entries.at(-1)!.steps;

  return [
    {
      id: 'next-taken',
      title: 'Which node is linked next?',
      make(rng: Rng) {
        const lists = [sorted(rng, rng.int(3, 5)), sorted(rng, rng.int(3, 5))];
        const steps = mergeSteps(lists);
        const takes = steps.filter((s) => s.lines.includes('takeA') || s.lines.includes('takeB'));
        // Mostly in the middle of the merge; now and then just as one list runs out.
        const t = rng.int(0, 4) === 0 ? takes.length : rng.int(1, Math.max(1, takes.length - 1));
        const before = t === 0 ? steps.find((s) => s.lines.includes('init'))! : takes[t - 1]!;
        const a = before.vars?.a;
        const b = before.vars?.b;
        const rest = (name: string) => `Nothing to compare: the rest of ${name} is linked at once`;
        const options = [
          a === null ? rest('B') : `${a} from A`,
          b === null ? rest('A') : `${b} from B`,
          rest('A'),
          rest('B'),
        ];
        const next = takes[t];
        const right = next
          ? `${next.lines.includes('takeA') ? a : b} from ${next.lines.includes('takeA') ? 'A' : 'B'}`
          : rest(a === null ? 'B' : 'A');
        const taken = takes.slice(0, t).map((s) => s.extra!.out!.at(-1)!);
        const value = (u: number) => steps.at(-1)!.state.nodes.find((n) => n.uid === u)!.value;
        return {
          prompt: `Merge A and B with a dummy head. The first ${t} ${t === 1 ? 'node is' : 'nodes are'} linked already${t ? ` (${taken.map(value).join(', ')})` : ''}, so a is on ${a ?? 'null'} and b on ${b ?? 'null'}. What happens next?`,
          setup: [build(lists)],
          answer: choice(rng, right, options),
          explain: next
            ? a === b
              ? `a and b are both ${a}. On a tie the merge takes from a (a.value <= b.value), so the ${a} from A goes first and equal values keep their order.`
              : `The smaller front goes next: ${Math.min(Number(a), Number(b))}, from ${Number(a) < Number(b) ? 'A' : 'B'}.`
            : `${a === null ? 'A' : 'B'} is used up. The rest of ${a === null ? 'B' : 'A'} is already sorted, so one link, tail.next = ${a === null ? 'b' : 'a'}, finishes the merge.`,
          watch: [['merge']],
        };
      },
    },
    {
      id: 'comparisons',
      title: 'How many comparisons?',
      make(rng: Rng) {
        const lists = [sorted(rng, rng.int(2, 5), 30), sorted(rng, rng.int(2, 5), 30)];
        const steps = mergeSteps(lists);
        const c = Number(steps.at(-1)!.vars?.comparisons);
        const total = lists[0]!.length + lists[1]!.length;
        return {
          prompt: 'How many comparisons does merging A and B with a dummy head make?',
          setup: [build(lists)],
          answer: { kind: 'number', value: c },
          explain: `One comparison per node taken while both lists still have nodes. After ${c}, one list is used up and the rest of the other is linked at once. At most ${total} − 1 = ${total - 1}; here ${c}.`,
          watch: [['merge']],
        };
      },
    },
    {
      id: 'after-round',
      title: 'After one round of pairs',
      make(rng: Rng) {
        const k = rng.int(3, 4);
        const lists = Array.from({ length: k }, () => sorted(rng, rng.int(1, 3), 40));
        const steps = mergeSteps(lists);
        const done = steps.find((s) => s.lines.includes('ret'))!;
        const values = new Map(done.state.nodes.map((n) => [n.uid, n.value]));
        const merged = done.extra!.rows[0]!.filter((u) => u !== null && u !== DUMMY);
        const value = merged.map((u) => String(values.get(u!)));
        return {
          prompt: `Merge these ${k} lists in pairs. When the first pair, A and B, is merged, what does A hold? Type its values in order.`,
          setup: [build(lists)],
          answer: { kind: 'sequence', value },
          explain: `Round 1 merges A with B${k === 4 ? ' and C with D' : ', and C waits for round 2'}. A with B gives ${value.join(', ')}: their values in order, ${NAMES.slice(0, 2).join(' and ')}’s nodes relinked.`,
          watch: [['merge']],
        };
      },
    },
    spotItKind({ page: 'merge-sorted-lists', rows: SPOT_ROWS, watch: [['merge']] }),
  ];
}
