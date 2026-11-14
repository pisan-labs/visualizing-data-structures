import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { andList } from '../_dp/kit';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { popcountOf } from '../bitmask/model';
import {
  bits,
  defaults,
  START,
  tableText,
  worker,
  type AssignExtra,
  type AssignSettings,
  type AssignState,
} from './model';

type Def = VizDef<AssignState, AssignSettings, AssignExtra>;

/** An n x n table of costs from lo to hi. */
export function randomCosts(rng: Rng, n: number, lo = 1, hi = 9): number[][] {
  return Array.from({ length: n }, () => Array.from({ length: n }, () => rng.int(lo, hi)));
}

/** Every order's total, to check that a table's cheapest total is reached one way only. */
function totalsOfOrders(cost: number[][]): number[] {
  const n = cost.length;
  const out: number[] = [];
  const go = (w: number, used: number, total: number) => {
    if (w === n) {
      out.push(total);
      return;
    }
    for (let t = 0; t < n; t++)
      if (!((used >> t) & 1)) go(w + 1, used | (1 << t), total + cost[w]![t]!);
  };
  go(0, 0, 0);
  return out;
}

/** A random table whose cheapest assignment is the only one at that total. */
export function uniqueCosts(rng: Rng, n: number): number[][] {
  let cost = randomCosts(rng, n);
  for (let k = 0; k < 50; k++) {
    const all = totalsOfOrders(cost);
    const best = Math.min(...all);
    if (all.filter((t) => t === best).length === 1) break;
    cost = randomCosts(rng, n);
  }
  return cost;
}

/**
 * Our own problem statements, for "spot it": some call for a DP over subsets, and some look
 * alike and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Four friends split four chores, one chore each. A table says how long each friend takes for each chore. What is the least total time?',
    pattern: 'dp-bitmask',
    cue: ['one chore each', 'how long each friend takes for each chore', 'least total time'],
    why: 'Only which chores are taken matters, not who took them in which order: f over the 16 subsets of chores, the bit count saying whose turn it is.',
    near: ['backtracking', 'top-k', 'dp-grid-paths'],
  },
  {
    problem:
      'A van leaves the depot, visits each of 9 addresses once and comes back. Distances between all pairs are known. Find the shortest round trip.',
    pattern: 'dp-bitmask',
    cue: ['each of 9 addresses once', 'shortest round trip'],
    why: 'The state is the set of addresses visited so far plus where the van is now: 2⁹ × 9 states instead of 9! orders.',
    near: ['dijkstra', 'state-space-bfs', 'backtracking'],
  },
  {
    problem:
      'A project needs 6 skills. Each of 15 candidates has some of them. What is the smallest team that has every skill?',
    pattern: 'dp-bitmask',
    cue: ['needs 6 skills', 'has some of them', 'smallest team'],
    why: 'A set of skills is a 6-bit mask: f[mask] is the smallest team covering mask, and each candidate ORs in their skills. 64 states, whatever the number of candidates.',
    near: ['backtracking', 'frequency-counting', 'sliding-window'],
  },
  {
    problem:
      'A maze has 4 keys lying around. Find the fewest moves from the entrance to the exit that picks up all 4 keys.',
    pattern: 'state-space-bfs',
    cue: ['fewest moves', 'picks up all 4 keys'],
    why: 'Fewest moves calls for breadth-first search, over states that are a position plus the keys held so far (a 4-bit mask). The mask is part of the state, but the search is BFS.',
    near: ['dp-bitmask', 'dp-grid-paths', 'backtracking'],
  },
  {
    problem: 'Print every way to give 4 jobs to 4 people, one job each.',
    pattern: 'backtracking',
    cue: 'print every way',
    why: 'Listing every way means producing all n! of them; a DP shares work only when you want the best or the count, not the list.',
    near: ['dp-bitmask', 'combination-sum'],
  },
  {
    problem:
      'An org chart: every person has a cheer score. Invite people for the most cheer, never someone together with their direct boss.',
    pattern: 'dp-tree',
    cue: ['org chart', 'never someone together with their direct boss'],
    why: 'The structure is a tree and the rule links a node to its parent: two values per node, from the leaves up. No subsets needed.',
    near: ['dp-bitmask', 'backtracking', 'state-space-bfs'],
  },
  {
    problem:
      'Eight courses, and some must be taken before others. Give one order to take all of them.',
    pattern: 'topo-indegree',
    cue: ['must be taken before others', 'one order'],
    why: 'Any order that respects the rules will do, so take a course whose prerequisites are done, again and again: a topological sort, not a search over subsets.',
    near: ['dp-bitmask', 'backtracking', 'state-space-bfs'],
  },
];

/** Practice questions. Every answer comes from running the model. */
export function assignPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);

  return [
    {
      id: 'mask-value',
      title: 'A mask’s value',
      make(rng) {
        const n = rng.int(3, 4);
        const cost = randomCosts(rng, n);
        const setup: OpCall[] = [['load', tableText(cost)]];
        const steps = run([...setup, ['solve']]).entries.at(-1)!.steps;
        const candidates = Array.from({ length: 1 << n }, (_, m) => m).filter(
          (m) => popcountOf(m) >= 2,
        );
        const mask = candidates[rng.int(0, candidates.length - 1)]!;
        const b = bits(mask, n);
        const tries = steps.filter(
          (s) => s.lines.includes('d.try') && s.vars?.mask === b && s.extra?.mask === mask,
        );
        const value = Number(tries.at(-1)!.vars?.['f[mask]']);
        const k = popcountOf(mask);
        const w = worker(k - 1);
        const parts = tries.map((s) => {
          const t = Number(s.vars?.task);
          const prev = bits(mask ^ (1 << t), n);
          return `task ${t}: f[${prev}] + ${cost[k - 1]![t]} = ${s.vars?.try}`;
        });
        return {
          prompt: `f[mask] is the cheapest way to give the tasks in mask (bit t is task t, task 0 on the right) to the first workers, one task each: a mask with k bits goes to workers A onward, k of them. What is f[${b}]?`,
          setup,
          answer: { kind: 'number', value },
          explain: `${b} has ${k} tasks, so they go to ${andList([...'ABCD'.slice(0, k)])}, and ${w} takes one of them last. Try each: ${parts.join('; ')}. The cheapest is ${value}.`,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'assignment',
      title: 'The cheapest assignment',
      make(rng) {
        const n = rng.int(3, 4);
        const cost = uniqueCosts(rng, n);
        const setup: OpCall[] = [['load', tableText(cost)]];
        const t = run([...setup, ['solve']]);
        const end = t.endState();
        const last = t.entries.at(-1)!.steps.at(-1)!;
        return {
          prompt: `Give each worker one task, each task to one worker, for the smallest total cost. Type the task of each worker, ${worker(0)} first.`,
          setup,
          answer: { kind: 'sequence', value: end.tasks!.map(String) },
          explain: last.say,
          watch: [['solve']],
        };
      },
    },
    spotItKind({
      page: 'dp-bitmask',
      rows: SPOT_ROWS,
      setup: [['load', START]],
      watch: [['solve']],
    }),
  ];
}
