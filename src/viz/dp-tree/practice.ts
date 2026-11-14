import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { randomShape, shapeToList } from '../binary-tree/shapes';
import {
  defaults,
  START,
  type TreeExtra,
  type TreeSettings,
  type TreeState,
  type TreeStep,
} from './model';

type Def = VizDef<TreeState, TreeSettings, TreeExtra>;

/** A random tree of n nodes in level order, with values from lo to hi. */
export function randomTree(rng: Rng, n: number, lo = 1, hi = 9): string {
  return shapeToList(randomShape(rng, n))
    .split(' ')
    .map((t) => (t === '_' ? t : String(rng.int(lo, hi))))
    .join(' ');
}

/**
 * Our own problem statements, for "spot it": some call for DP on a tree, and some look alike
 * and call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'An org chart: every person has a cheer score and at most two direct reports. Invite people for the most total cheer, but never invite someone together with their direct boss.',
    pattern: 'dp-tree',
    cue: ['org chart', 'never invite someone together with their direct boss'],
    why: 'The chart is a tree and the rule only links a node to its parent, so each person needs two answers for their part of the chart: with them invited and without. Children first, then the parent.',
    near: ['backtracking', 'dp-state-machine', 'dp-grid-paths'],
  },
  {
    problem:
      'Lookout towers are joined by trails with no loops. Each tower has a view score. Staff some towers, never two at the ends of the same trail, for the highest total score.',
    pattern: 'dp-tree',
    cue: ['trails with no loops', 'never two at the ends of the same trail'],
    why: 'No loops means a tree. Hang it from any tower: each tower keeps the best for its branch when it is staffed and when it is not.',
    near: ['state-space-bfs', 'disjoint-sets', 'backtracking'],
  },
  {
    problem:
      'Rooms in a building are linked by doors so that there is one way between any two rooms. Put a guard in some rooms so that every door has a guard on at least one side, using as few guards as possible.',
    pattern: 'dp-tree',
    cue: ['one way between any two rooms', 'every door has a guard on at least one side'],
    why: 'One way between any two rooms is a tree. Each room keeps the fewest guards for its part of the building with a guard in it and without; a door to an unguarded child forces a guard in the parent.',
    near: ['state-space-bfs', 'disjoint-sets', 'backtracking'],
  },
  {
    problem:
      'Seats in one row at a concert each have a view score. Book seats for the most total score, but never two seats side by side.',
    pattern: 'dp-state-machine',
    cue: ['in one row', 'never two seats side by side'],
    why: 'A row is a chain, so two states per seat are enough: the best so far with this seat booked and without it, carried from left to right. A chain is also a tree, so DP on trees works too.',
    near: ['sliding-window', 'kadane', 'two-pointers'],
    alsoFits: ['dp-tree'],
  },
  {
    problem:
      'Give each of four people one of four jobs. A table says what each person would charge for each job. What is the cheapest total?',
    pattern: 'dp-bitmask',
    cue: ['each of four people one of four jobs', 'cheapest total'],
    why: 'What matters is which jobs are taken, not the order: a DP over the 16 subsets of jobs, not over a tree.',
    near: ['dp-tree', 'backtracking', 'top-k'],
  },
  {
    problem:
      'A city map has a few hundred streets that cross each other and loop around. Find the fewest streets to walk from home to the library.',
    pattern: 'state-space-bfs',
    cue: ['cross each other and loop around', 'fewest streets'],
    why: 'Loops mean a graph, not a tree, and fewest steps means breadth-first search.',
    near: ['dp-tree', 'dp-grid-paths'],
    alsoFits: ['dijkstra'],
  },
  {
    problem:
      'A family tree, each person with an age. For every person, what is the oldest age among them and everyone descended from them?',
    pattern: 'dp-tree',
    cue: ['for every person', 'everyone descended from them'],
    why: 'A person’s answer comes from their children’s answers: one value per node, computed from the leaves up in a post-order walk.',
    near: ['top-k', 'two-heaps-median', 'state-space-bfs'],
  },
];

/** Practice questions. Every answer comes from running the model. */
export function treePractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), { ...defaults }, 1, ops);
  const solveSteps = (list: string): TreeStep[] =>
    run([['build', list], ['solve']]).entries.at(-1)!.steps;

  return [
    {
      id: 'pair',
      title: 'A node’s two values',
      make(rng) {
        // A tree with at least two inner nodes, so the question is not always about the root.
        let list = randomTree(rng, rng.int(5, 7));
        let steps = solveSteps(list);
        for (let k = 0; k < 20; k++) {
          const inner = steps.filter((s) => s.lines.includes('p.left')).length;
          if (inner >= 2) break;
          list = randomTree(rng, rng.int(5, 7));
          steps = solveSteps(list);
        }
        const inner = steps.filter((s) => s.lines.includes('p.left'));
        const at = inner[rng.int(0, inner.length - 1)]!;
        const name = String(at.vars?.node);
        return {
          prompt: `Each node gets two values: take, the best total in its subtree with the node chosen, and skip, the best with it left out (no chosen node may be the parent of another). What are take and skip for node ${name}? Type take first, then skip.`,
          setup: [['build', list]],
          answer: { kind: 'sequence', value: [String(at.vars?.take), String(at.vars?.skip)] },
          explain: at.say,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'best',
      title: 'The best total',
      make(rng) {
        const list = randomTree(rng, rng.int(5, 8));
        const last = solveSteps(list).at(-1)!;
        return {
          prompt:
            'Choose nodes for the largest total, but never a node together with its parent. What is the best total?',
          setup: [['build', list]],
          answer: { kind: 'number', value: Number(last.vars?.best) },
          explain: last.say,
          watch: [['solve']],
        };
      },
    },
    spotItKind({
      page: 'dp-tree',
      rows: SPOT_ROWS,
      setup: [['build', START]],
      watch: [['solve']],
    }),
  ];
}
