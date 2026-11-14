import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import { fmt } from '../_dp2/kit';
import {
  defaults,
  gridText,
  isWall,
  solveTable,
  sources,
  WALL,
  type GPExtra,
  type GPSettings,
  type GPState,
} from './model';

type Def = VizDef<GPState, GPSettings, GPExtra>;

/** A 3 x 4 grid with costs 1 to 6 and up to two walls, start and target open. */
function grid(rng: Rng, walls = 2): number[][] {
  const g = Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => rng.int(1, 6)));
  for (let k = 0; k < walls; k++) {
    const r = rng.int(0, 2);
    const c = rng.int(0, 3);
    if ((r === 0 && c === 0) || (r === 2 && c === 3)) continue;
    g[r]![c] = WALL;
  }
  return g;
}

/** How many cheapest paths reach each cell (0 where none does). */
function cheapestCount(g: number[][]): number {
  const M = solveTable(g, 'mincost');
  const R = g.length;
  const C = g[0]!.length;
  const N = M.map((row) => row.map(() => 0));
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      if (isWall(g, r, c) || M[r]![c] === Infinity) continue;
      if (r === 0 && c === 0) N[0]![0] = 1;
      else
        for (const [a, b] of sources(g, r, c))
          if (M[a]![b]! + g[r]![c]! === M[r]![c]) N[r]![c]! += N[a]![b]!;
    }
  return N[R - 1]![C - 1]!;
}

/**
 * Our own problem statements, for "spot it": three that call for this pattern, and some that
 * look alike and call for another.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A forklift crosses a warehouse floor, moving only east or south, and some squares hold shelves. How many different routes take it from the northwest corner to the loading dock in the southeast corner?',
    pattern: 'dp-grid-paths',
    cue: ['only east or south', 'how many different routes'],
    why: 'Moves that only go right or down never come back to a square, so the routes into a square are the routes into the square above plus those into the square to its left.',
    near: ['state-space-bfs', 'backtracking', 'combination-sum'],
  },
  {
    problem:
      'Each square of a field charges a toll. Walking only right or down, what is the cheapest way from the top left corner to the bottom right?',
    pattern: 'dp-grid-paths',
    cue: ['only right or down', 'the cheapest way'],
    why: 'The cheapest way into a square is its toll plus the cheaper of the ways into the square above and the square to its left: one pass over the field.',
    near: ['state-space-bfs', 'binary-search-answer'],
    alsoFits: ['dijkstra'],
  },
  {
    problem:
      'Coins lie on some squares of a board. A collector starts at the top left and steps right or down to the bottom right, picking up every coin it lands on. What is the most it can collect?',
    pattern: 'dp-grid-paths',
    cue: ['steps right or down', 'the most it can collect'],
    why: 'The same table with max instead of min: the best haul into a square is its coins plus the better of the hauls above and to the left.',
    near: ['backtracking', 'top-k', 'sliding-window'],
  },
  {
    problem:
      'A city map is a grid of blocks with a travel time on each; you may walk in any of the four directions. What is the fastest way from your door to the station?',
    pattern: 'dijkstra',
    cue: ['any of the four directions', 'a travel time on each'],
    why: 'Moving in four directions can come back to a block, so no order fills the table once. With weights on the blocks, take the closest unfinished block first.',
    near: ['dp-grid-paths', 'state-space-bfs'],
  },
  {
    problem:
      'Print every route from the top left to the bottom right of a small grid, moving right or down, so that a tester can check each one.',
    pattern: 'backtracking',
    cue: ['print every route'],
    why: 'Listing routes is not counting them: there can be exponentially many, and the only way to print each is to walk each, undoing the last move and trying the next.',
    near: ['dp-grid-paths', 'state-space-bfs'],
  },
  {
    problem:
      'A maze of open and blocked squares. Moving one square at a time in any direction, what is the fewest number of moves from the entrance to the exit?',
    pattern: 'state-space-bfs',
    cue: ['fewest number of moves', 'in any direction'],
    why: 'Every move costs the same, so a breadth-first search reaches each square first by a shortest route. A right-or-down table would miss routes that go up or left.',
    near: ['dp-grid-paths', 'backtracking'],
    alsoFits: ['dijkstra'],
  },
  {
    problem:
      'A map marks every square as forest or field. How many separate patches of forest does it show?',
    pattern: 'disjoint-sets',
    cue: ['how many separate patches'],
    why: 'Patches are connected groups of squares: join each forest square with its forest neighbours and count the groups. No path is being counted or priced.',
    near: ['dp-grid-paths', 'matrix-traversal'],
    alsoFits: ['state-space-bfs'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function gridPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[], settings: GPSettings) => new Timeline(def(), settings, 1, ops);

  return [
    {
      id: 'cell',
      title: 'What goes in this cell?',
      make(rng) {
        const settings: GPSettings = { ...defaults, problem: rng.int(0, 1) ? 'mincost' : 'count' };
        const count = settings.problem === 'count';
        const g = grid(rng);
        const setup: OpCall[] = [['load', gridText(g)]];
        const T = run([...setup, ['solve']], settings).endState().T;
        // An open cell in the lower right part, so it is made from others.
        const open: [number, number][] = [];
        for (let r = 1; r < 3; r++)
          for (let c = 1; c < 4; c++)
            if (!isWall(g, r, c) && T[r]![c] !== Infinity) open.push([r, c]);
        const [r, c] = open.length ? open[rng.int(0, open.length - 1)]! : [2, 3];
        const value = T[r]![c]!;
        const src = sources(g, r, c);
        const name = count ? 'P' : 'M';
        const parts = src.map(([a, b]) => `${name}[${a}][${b}] = ${fmt(T[a]![b]!)}`);
        return {
          prompt: count
            ? `Moving only right or down from (0, 0), with # for a wall: how many paths reach cell (${r}, ${c})? That is P[${r}][${c}].`
            : `Moving only right or down from (0, 0) and paying the cost of every cell entered (the start included), with # for a wall: what is the cheapest way into cell (${r}, ${c})? That is M[${r}][${c}].`,
          setup,
          settings,
          answer: { kind: 'number', value },
          explain: count
            ? `P[${r}][${c}] adds the paths from above and from the left${parts.length ? `: ${parts.join(' and ')}` : ''}, so ${value}.`
            : `M[${r}][${c}] is the cell’s cost, ${g[r]![c]}, plus the cheaper way in${parts.length ? `: ${parts.join(' or ')}` : ''}, so ${value}.`,
          watch: [['solve']],
        };
      },
    },
    {
      id: 'path',
      title: 'Which path is cheapest?',
      make(rng) {
        const settings: GPSettings = { ...defaults, problem: 'mincost' };
        let g = grid(rng, 1);
        for (let tries = 0; tries < 50 && cheapestCount(g) !== 1; tries++) g = grid(rng, 1);
        const setup: OpCall[] = [['load', gridText(g)]];
        const end = run([...setup, ['solve'], ['trace']], settings)
          .entries.at(-1)!
          .steps.at(-1)!;
        const path = String(end.vars?.path ?? '');
        const cost = Number(end.vars?.cost);
        return {
          prompt:
            'Each cell’s digit is its cost; # is a wall. Moving only right or down from the top left to the bottom right, type the cheapest path as moves, such as D R R D (D is down, R is right).',
          setup,
          settings,
          answer: { kind: 'sequence', value: path.split(' ').filter(Boolean) },
          explain: `Fill M row by row: each cell is its cost plus the cheaper of the cells above and to its left. The target gets M = ${cost}. Walking back to the cheaper neighbour each time and reading it forward gives ${path}.`,
          watch: [['solve'], ['trace']],
        };
      },
    },
    {
      id: 'calls',
      title: 'How often does plain recursion ask?',
      make(rng) {
        const settings: GPSettings = { ...defaults, approach: 'naive', problem: 'count' };
        const g = grid(rng, rng.int(0, 1));
        const setup: OpCall[] = [['load', gridText(g)]];
        const last = run([...setup, ['solve']], settings)
          .entries.at(-1)!
          .steps.at(-1)!;
        const calls = last.extra!.calls!;
        const picks: [number, number][] = [];
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++) if (calls[r]![c]! > 0) picks.push([r, c]);
        const [r, c] = picks.length ? picks[rng.int(0, picks.length - 1)]! : [0, 0];
        const k = calls[r]![c]!;
        return {
          prompt: `Plain recursion counts the paths with paths(2, 3), which calls paths on the cell above and the cell to the left (open cells only), and so on, storing nothing. How many times is paths(${r}, ${c}) called?`,
          setup,
          settings,
          answer: { kind: 'number', value: k },
          explain: `Every path from (${r}, ${c}) to the target is one chain of calls that reaches it, so it is called once per such path: ${k === 1 ? 'once' : `${k} times`}. The table works it out once.`,
          watch: [['solve']],
        };
      },
    },
    spotItKind({ page: 'dp-grid-paths', rows: SPOT_ROWS, watch: [['solve']] }),
  ];
}
