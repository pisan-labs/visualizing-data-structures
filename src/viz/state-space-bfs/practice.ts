import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  pathOf,
  search,
  START_TARGET,
  type SSExtra,
  type SSSettings,
  type SSState,
} from './model';

type Def = VizDef<SSState, SSSettings, SSExtra>;

const load = (xs: string[]): OpCall => ['load', xs.join(' ')];
const two = (n: number) => String(n).padStart(2, '0');

/** A 2-wheel lock with a few barred combinations near the start, and a goal it can reach. */
function lockPuzzle(rng: Rng, lo: number, hi: number): { barred: string[]; goal: string } {
  for (;;) {
    const barred = new Set<string>();
    const count = rng.int(2, 4);
    while (barred.size < count) {
      const c = `${[0, 1, 2, 9, 8][rng.int(0, 4)]}${[0, 1, 2, 9, 8][rng.int(0, 4)]}`;
      if (c !== '00') barred.add(c);
    }
    const goal = two(rng.int(1, 99));
    if (barred.has(goal)) continue;
    const s: SSState = { wheels: 2, barred: [...barred], words: ['aa', 'ab'] };
    const r = search(s, 'lock', goal, 'pattern');
    if (r.distance >= lo && r.distance <= hi) return { barred: [...barred], goal };
  }
}

/** Our own problem statements, for "spot it". */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'Eight numbered tiles sit in a 3 × 3 frame with one gap; a move slides a tile next to the gap into it. What is the fewest moves to put the tiles in order?',
    pattern: 'state-space-bfs',
    cue: ['fewest moves', 'a move slides a tile'],
    why: 'Each arrangement is a state and each slide an edge. There are far too many arrangements to build the graph, so make a state’s moves when it leaves the queue, and keep a visited set.',
    near: ['backtracking', 'dp-grid-paths', 'dijkstra'],
  },
  {
    problem:
      'Two jugs hold 3 and 5 litres. You may fill one, empty one, or pour one into the other until it is full or empty. What is the fewest steps to have exactly 4 litres in a jug?',
    pattern: 'state-space-bfs',
    cue: ['fewest steps', 'fill, empty or pour'],
    why: 'A state is how much each jug holds; each action is a move to another state, all costing one step. BFS from (0, 0) finds the fewest.',
    near: ['dp-state-machine', 'backtracking', 'binary-search-answer'],
  },
  {
    problem:
      'A gene is a string of 8 letters from A, C, G and T. A mutation changes one letter, and only strings in a given bank are allowed. What is the fewest mutations from one gene to another?',
    pattern: 'state-space-bfs',
    cue: ['fewest mutations', 'changes one letter', 'only strings in a given bank'],
    why: 'The same shape as changing words: each string is a state, its neighbours are the one-letter changes that are in the bank.',
    near: ['trie', 'frequency-counting', 'dp-grid-paths'],
  },
  {
    problem:
      'A knight stands on a chessboard. What is the fewest knight moves to reach a given square?',
    pattern: 'state-space-bfs',
    cue: ['fewest knight moves'],
    why: 'Squares are states and the eight knight jumps make the neighbours on the fly. Every move costs the same, so BFS layers are the answer.',
    near: ['dp-grid-paths', 'dijkstra', 'backtracking'],
  },
  {
    problem:
      'A road map gives the driving time of each road. What is the quickest route from one town to another?',
    pattern: 'dijkstra',
    cue: ['driving time of each road', 'quickest'],
    why: 'The roads have different weights, so the fewest roads is not the quickest route. BFS counts moves; Dijkstra adds up weights.',
    near: ['state-space-bfs', 'dp-grid-paths'],
  },
  {
    problem:
      'List every way to place 4 rooks on a 4 × 4 board so that no two share a row or a column.',
    pattern: 'backtracking',
    cue: ['list every way'],
    why: 'It asks for every arrangement, not the fewest moves to one. Place a rook a row at a time and undo it to try the next square.',
    near: ['state-space-bfs', 'combination-sum'],
  },
  {
    problem:
      'Courses have rules of the form “take this one before that one”. Find an order that keeps every rule.',
    pattern: 'topo-indegree',
    cue: ['before', 'an order that keeps every rule'],
    why: 'An order of a graph’s vertices that respects its edges is a topological sort; there is no distance to find.',
    near: ['state-space-bfs', 'disjoint-sets'],
  },
];

/** Practice questions. Every answer comes from running the model. */
export function stateBfsPractice(def: () => Def): PracticeKind[] {
  const run = (barred: string[], goal: string) =>
    new Timeline(def(), defaults, 1, [load(barred), ['search', goal]]);

  return [
    {
      id: 'distance',
      title: 'The distance',
      make(rng) {
        const { barred, goal } = lockPuzzle(rng, 2, 5);
        const t = run(barred, goal);
        const last = t.entries[1]!.steps.at(-1)!;
        const distance = Number(last.vars?.distance);
        const e = last.extra!;
        const path = pathOf(e.entries, e.goal!).map((u) => e.entries[u]!.state);
        return {
          prompt: `A lock with 2 wheels starts at 00. A move turns one wheel up or down by one (9 and 0 are next to each other). It must never show ${barred.join(', ')}. What is the fewest moves to reach ${goal}?`,
          setup: [load(barred)],
          answer: { kind: 'number', value: distance },
          explain: `BFS finds ${goal} in layer ${distance}: ${path.join(' → ')}. Every state in an earlier layer was reached in fewer moves, and none of them was ${goal}.`,
          watch: [['search', goal]],
        };
      },
    },
    {
      id: 'next-layer',
      title: 'The next layer',
      make(rng) {
        const { barred, goal } = lockPuzzle(rng, 3, 6);
        const d = rng.int(1, 2);
        const t = run(barred, goal);
        const e = t.entries[1]!.steps.at(-1)!.extra!;
        const layer = e.entries.filter((x) => x.d === d).map((x) => x.state);
        const before = e.entries.filter((x) => x.d === d - 1).map((x) => x.state);
        return {
          prompt: `A lock with 2 wheels starts at 00 and must never show ${barred.join(', ')}. BFS makes each state's moves in this order: first wheel up, first wheel down, second wheel up, second wheel down. ${d === 1 ? 'Which states make up layer 1 (one move away)' : `Layer 1 is ${before.join(', ')}. Which states make up layer 2`}, in the order BFS finds them?`,
          setup: [load(barred)],
          answer: { kind: 'sequence', value: layer },
          explain: `Take ${d === 1 ? '00' : `the states of layer 1 in turn (${before.join(', ')})`} and make their moves in order, skipping barred combinations and states already visited: ${layer.join(', ')}.`,
          watch: [['search', goal]],
        };
      },
    },
    spotItKind({ page: 'state-space-bfs', rows: SPOT_ROWS, watch: [['search', START_TARGET]] }),
  ];
}
