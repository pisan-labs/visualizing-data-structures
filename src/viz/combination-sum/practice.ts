import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  candidates,
  defaults,
  listText,
  MAX_TREE,
  plan,
  plural,
  START_TARGET,
  type CNode,
  type CSExtra,
  type CSSettings,
  type CSState,
  type Reuse,
} from './model';

type Def = VizDef<CSState, CSSettings, CSExtra>;

const load = (vs: number[]): OpCall => ['load', vs.join(' ')];

/** A small puzzle whose tree stays readable and finds at least one combination. */
function puzzle(rng: Rng, reuse: Reuse): { values: number[]; target: number; nodes: CNode[] } {
  for (;;) {
    const n = rng.int(3, 4);
    const values = Array.from({ length: n }, () => rng.int(reuse === 'once' ? 1 : 2, 7));
    const target = rng.int(5, 11);
    const nodes = plan(candidates(values, reuse), target, reuse);
    if (nodes.length <= Math.min(MAX_TREE, 30) && nodes.some((x) => x.kind === 'leaf'))
      return { values, target, nodes };
  }
}

const reuseText = (reuse: Reuse) =>
  reuse === 'once' ? 'each candidate at most once' : 'each candidate as often as you like';

/** Our own problem statements, for "spot it". */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A shop sells boxes of 3, 5 and 8 pens. List every way to buy exactly 16 pens, ignoring the order of the boxes.',
    pattern: 'combination-sum',
    cue: ['list every way', 'exactly 16', 'ignoring the order'],
    why: 'Every combination is wanted, not a count, and a box size can be bought again. Sort the sizes, backtrack, and stop a loop at the first size bigger than what is left.',
    near: ['dp-grid-paths', 'two-pointers', 'state-space-bfs'],
    alsoFits: ['backtracking'],
  },
  {
    problem:
      'A bag holds coins, some of the same value. List every different set of coins from the bag that adds up to exactly 50 cents.',
    pattern: 'combination-sum',
    cue: ['every different set', 'some of the same value', 'exactly 50'],
    why: 'Each coin can be used once, and equal coins would list the same set twice. Sort, and at each depth try a value only once.',
    near: ['dp-bitmask', 'frequency-counting', 'top-k'],
    alsoFits: ['backtracking'],
  },
  {
    problem:
      'Choose distinct numbers from 1 to 9 so that exactly k of them add up to n. List every choice.',
    pattern: 'combination-sum',
    cue: ['list every choice', 'add up to n'],
    why: 'Backtrack over the sorted numbers, each once; prune when the next number is more than what is left, or when too few are left to choose.',
    near: ['two-pointers', 'sliding-window', 'bitmask'],
    alsoFits: ['backtracking'],
  },
  {
    problem:
      'A staircase has 7 steps, climbed 1, 2 or 3 at a time. List every sequence of climbs that reaches the top.',
    pattern: 'backtracking',
    cue: ['every sequence'],
    why: 'Climbing 1 then 2 differs from 2 then 1, so order matters: each step tries every size again, not only those after the last one chosen. That lists sequences, not combinations.',
    near: ['combination-sum', 'dp-grid-paths'],
  },
  {
    problem: 'List every order in which four runners could cross the finish line.',
    pattern: 'backtracking',
    cue: ['every order'],
    why: 'Order matters, so these are permutations, not combinations: pick any runner not yet placed, not only the ones after the last.',
    near: ['combination-sum', 'state-space-bfs'],
  },
  {
    problem: 'A sorted list of prices. Find two that add up to exactly x.',
    pattern: 'two-pointers',
    cue: ['sorted', 'two'],
    why: 'Exactly two values: one index at each end, moving inward, does it in one pass. No search tree is needed.',
    near: ['combination-sum', 'binary-search-answer'],
    alsoFits: ['binary-search'],
  },
];

/** Practice questions. Every answer comes from running the model. */
export function combinationPractice(def: () => Def): PracticeKind[] {
  const run = (values: number[], target: number, reuse: Reuse) =>
    new Timeline(def(), { ...defaults, reuse }, 1, [load(values), ['search', target]]);
  const pick = (rng: Rng): Reuse => (rng.int(0, 2) ? 'again' : 'once');

  return [
    {
      id: 'next-branch',
      title: 'The next branch',
      make(rng) {
        const reuse = pick(rng);
        let { values, target, nodes } = puzzle(rng, reuse);
        // A call that returns, then its parent goes on: the question is what comes next.
        let calls = nodes.filter((x) => x.parent !== null && (x.kind === 'call' || x.kind === 'leaf' || x.kind === 'dead'));
        while (calls.length === 0) {
          ({ values, target, nodes } = puzzle(rng, reuse));
          calls = nodes.filter((x) => x.parent !== null && (x.kind === 'call' || x.kind === 'leaf' || x.kind === 'dead'));
        }
        const x = calls[rng.int(0, calls.length - 1)]!;
        const parent = nodes[x.parent!]!;
        const c = candidates(values, reuse);
        const siblings = nodes.filter((y) => y.parent === parent.id);
        const next = siblings[siblings.indexOf(x) + 1];
        const v = c[x.i]!;
        const after = x.i + 1 < c.length ? c[x.i + 1]! : undefined;
        const options = [
          after === undefined ? 'Try the next candidate' : `Add ${after}: search with ${parent.left - after} left`,
          after === undefined ? 'Skip the next candidate' : `Skip ${after}: it is the same value as ${v}`,
          after === undefined ? 'Stop: the next candidate is too big' : `Stop the loop: ${after} is more than the ${parent.left} left`,
          'Return: no candidates are left to try',
        ];
        const correct = !next
          ? 3
          : next.kind === 'dup'
            ? 1
            : next.kind === 'pruned'
              ? 2
              : 0;
        const why = !next
          ? `${v} was the last candidate, so the call with ${listText(parent.chosen)} returns.`
          : next.kind === 'dup'
            ? `The next candidate, ${after}, equals ${v}, which was just tried at this depth: it would find the same combinations.`
            : next.kind === 'pruned'
              ? `${after} is more than the ${parent.left} left, and the candidates are sorted, so no later one fits either.`
              : `${after} is at most the ${parent.left} left, so the loop adds it and searches with ${parent.left - after!} left.`;
        return {
          prompt: `Sorted backtracking with ${reuseText(reuse)}, target ${target}. The call with chosen = ${listText(parent.chosen)} (${parent.left} left) has just come back from adding ${v}. What does it do next?`,
          setup: [load(values)],
          settings: { ...defaults, reuse },
          answer: { kind: 'choice', options, correct },
          explain: `The sorted candidates are ${c.join(', ')}. ${why}`,
          watch: [['search', target]],
        };
      },
    },
    {
      id: 'count',
      title: 'How many combinations?',
      make(rng) {
        const reuse = pick(rng);
        const { values, target } = puzzle(rng, reuse);
        const t = run(values, target, reuse);
        const last = t.entries[1]!.steps.at(-1)!;
        const found = last.extra!.found;
        return {
          prompt: `How many different combinations of the candidates add up to ${target}, using ${reuseText(reuse)}? Order does not matter: [2, 3] and [3, 2] are one combination.`,
          setup: [load(values)],
          settings: { ...defaults, reuse },
          answer: { kind: 'number', value: Number(last.vars?.found) },
          explain: `${plural(found.length, 'combination')}: ${found.map(listText).join(', ')}.${reuse === 'once' && new Set(values).size < values.length ? ' Equal candidates count once at each depth, so no combination is listed twice.' : ''}`,
          watch: [['search', target]],
        };
      },
    },
    spotItKind({ page: 'combination-sum', rows: SPOT_ROWS, watch: [['search', START_TARGET]] }),
  ];
}
