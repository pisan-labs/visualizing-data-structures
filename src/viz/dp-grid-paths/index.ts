import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, Preset, SavedExample, Settings, Value, VizDef } from '../../engine/types';
import { approachSetting } from '../_patterns/kit';
import cppSource from './code/cpp/grid_paths.hpp?raw';
import javaSource from './code/java/GridPaths.java?raw';
import pythonSource from './code/python/grid_paths.py?raw';
import cheapStepTrap from './examples/cheap-step-trap.json';
import cheapestPath from './examples/cheapest-path.json';
import countWithWalls from './examples/count-with-walls.json';
import memoOnce from './examples/memo-once.json';
import noWayThrough from './examples/no-way-through.json';
import oneRow from './examples/one-row.json';
import openGrid from './examples/open-grid.json';
import recursionRepeats from './examples/recursion-repeats.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  gridText,
  init,
  initialSay,
  initialVars,
  MAX_COLS,
  MAX_ROWS,
  ops,
  pseudocode,
  readGrid,
  WALL,
  type GPExtra,
  type GPSettings,
  type GPState,
} from './model';
import { gridPractice } from './practice';
import { view } from './view';

/** The input box holds a grid: rows split by /, one character per cell. */
export function parseGrid(text: string): Value | Error {
  const grid = readGrid(text);
  return typeof grid === 'string' ? new Error(grid) : gridText(grid);
}

/** A grid of `rows` rows (one more column than rows, at most MAX_COLS). */
function randomGrid(
  rng: Rng,
  rows: number,
  o: { walls?: number; costs?: [number, number]; cols?: number } = {},
): number[][] {
  const R = Math.max(1, Math.min(MAX_ROWS, rows));
  const C = o.cols ?? Math.min(MAX_COLS, R + 1);
  const [lo, hi] = o.costs ?? [1, 9];
  const grid = Array.from({ length: R }, () => Array.from({ length: C }, () => rng.int(lo, hi)));
  const walls = o.walls ?? 0;
  for (let k = 0; k < walls; k++) {
    const r = rng.int(0, R - 1);
    const c = rng.int(0, C - 1);
    if ((r === 0 && c === 0) || (r === R - 1 && c === C - 1)) continue;
    grid[r]![c] = WALL;
  }
  return grid;
}

const solveIt = (grid: number[][], settings?: Settings): OpCall[] => [
  ['load', gridText(grid)],
  ['solve'],
  ...(settings?.problem === 'mincost' ? [['trace'] as OpCall] : []),
];

const presets: Preset[] = [
  {
    label: 'Random costs, a few walls',
    make: (rng, n, s) => solveIt(randomGrid(rng, n, { walls: Math.max(1, n - 1) }), s),
  },
  {
    label: 'Open grid (the most paths)',
    make: (rng, n, s) => solveIt(randomGrid(rng, n), s),
  },
  {
    label: 'All costs 1 (every path ties)',
    make: (rng, n, s) => solveIt(randomGrid(rng, n, { costs: [1, 1] }), s),
  },
  {
    label: 'A wall line with one gap',
    make: (rng, n, s) => {
      const g = randomGrid(rng, Math.max(3, n));
      const r = Math.floor(g.length / 2);
      const gap = rng.int(0, g[0]!.length - 1);
      g[r] = g[r]!.map((v, c) => (c === gap ? v : WALL));
      return solveIt(g, s);
    },
  },
  {
    label: 'Walls cut off the target (no path)',
    make: (rng, n, s) => {
      const g = randomGrid(rng, Math.max(2, n));
      const R = g.length;
      const C = g[0]!.length;
      g[R - 2]![C - 1] = WALL;
      g[R - 1]![C - 2] = WALL;
      return solveIt(g, s);
    },
  },
  {
    label: 'One row (one path, the fewest calls)',
    make: (rng, n, s) => solveIt(randomGrid(rng, 1, { cols: Math.min(MAX_COLS, n + 1) }), s),
  },
];

export const dpGridPaths: VizDef<GPState, GPSettings, GPExtra> = {
  id: 'dp-grid-paths',
  title: 'DP: paths on a grid',
  family: 'DP patterns',
  blurb:
    'Count the paths across a grid with walls, moving only right or down, or find the cheapest one: each cell from the cell above and the cell to its left, then the path traced back. A table of R × C cells against plain recursion that solves a cell once for every path from it to the target.',
  settings: [
    approachSetting({
      pattern: 'The table, O(R × C)',
      naive: 'Plain recursion, exponential',
    }),
    {
      kind: 'choice',
      key: 'problem',
      label: 'Problem',
      options: [
        { value: 'count', label: 'How many paths reach the target' },
        { value: 'mincost', label: 'The cheapest path (each cell has a cost)' },
      ],
      help: 'Both move only right or down from the top left to the bottom right; # is a wall. The cheapest path pays every cell it enters, the start included.',
    },
    {
      kind: 'choice',
      key: 'fill',
      label: 'Table',
      options: [
        { value: 'bottomup', label: 'Bottom-up: row by row' },
        { value: 'memo', label: 'Top-down: recursion with a memo' },
      ],
      help: 'With Approach set to the table. Top-down is the plain recursion plus a memo: it fills only the cells the target needs, in the order the calls finish.',
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
      label: 'Grid',
      placeholder: 'rows split by /, e.g. 131/1#1/421',
      maxLength: 60,
      sample: '131/1#1/421',
      parse: parseGrid,
    },
    buttons: [
      { op: 'solve', label: 'Solve', usesInput: false },
      { op: 'trace', label: 'Trace the path', usesInput: false },
      { op: 'load', label: 'Load grid', usesInput: true, primary: true },
    ],
    random: {
      label: 'Random grid',
      make: (rng) => solveIt(randomGrid(rng, rng.int(3, 4), { walls: 2 })),
    },
    presets,
    sizes: [2, 3, 4, 5],
  },
  explain,
  complexity: [
    {
      op: 'solve, bottom-up table',
      best: {
        cost: 'Θ(RC)',
        why: 'Every cell is filled once, walls included, whatever the grid.',
        example: 'count-with-walls',
      },
      average: {
        cost: 'Θ(RC)',
        why: 'Each cell reads two neighbours: one addition, or one min and one addition.',
        example: 'cheapest-path',
      },
      worst: {
        cost: 'Θ(RC)',
        why: 'An open 4 × 5 grid: 20 cells, against 125 calls of plain recursion.',
        example: 'open-grid',
      },
      note: 'Space Θ(RC) for the table; one row is enough for the count alone, but the trace needs the whole table.',
    },
    {
      op: 'solve, top-down with a memo',
      best: {
        cost: 'O(R + C)',
        why: 'One row: each call asks only the cell to its left, so R + C − 1 calls.',
      },
      average: {
        cost: 'O(RC)',
        why: 'Each cell is worked out once; a later call on it is a memo hit.',
        example: 'memo-once',
      },
      worst: {
        cost: 'O(RC)',
        why: 'At most two calls per cell asked for, plus the first: 32 calls and 20 cells on an open 4 × 5 grid.',
        example: 'memo-once',
      },
      note: 'The stack gets R + C − 1 calls deep, which a big grid can overflow.',
    },
    {
      op: 'solve, plain recursion',
      best: {
        cost: 'Θ(R + C)',
        why: 'One row or one column: a single path, one call per cell.',
        example: 'one-row',
      },
      average: {
        cost: 'exponential',
        why: 'Each cell is called once for every path from it to the target.',
        example: 'count-with-walls',
      },
      worst: {
        cost: 'Θ(C(R + C, R))',
        why: 'An open grid: the start alone is called once per path, 35 times on 4 × 5, 125 calls in all.',
        example: 'recursion-repeats',
      },
    },
    {
      op: 'trace the path',
      best: {
        cost: 'Θ(R + C)',
        why: 'One step per move: R − 1 down and C − 1 right.',
        example: 'cheapest-path',
      },
      average: {
        cost: 'Θ(R + C)',
        why: 'Each step compares the cell above with the cell to the left.',
      },
      worst: {
        cost: 'Θ(R + C)',
        why: 'Every path from corner to corner has R + C − 2 moves.',
        example: 'cheap-step-trap',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as GPSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    countWithWalls,
    openGrid,
    recursionRepeats,
    memoOnce,
    cheapestPath,
    cheapStepTrap,
    noWayThrough,
    oneRow,
  ] as unknown as SavedExample[],
  practice: gridPractice(() => dpGridPaths),
  preview: { example: 'cheapest-path', level: 2 },
};

/**
 * Driver protocol for the code tabs: "count g" prints the number of paths, "cost g" the cheapest
 * path's cost and "path g" the cost and the moves, or "none" when walls block every path. Both
 * approaches give the same answers; operations the model refuses are left out.
 */
function codeScript(calls: OpCall[], settings: GPSettings) {
  const t = new Timeline(dpGridPaths, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const v = e.steps.at(-1)!.vars ?? {};
    const g = gridText(e.end.grid);
    if (e.call[0] === 'solve') {
      if (v.paths !== undefined) {
        input.push(`count ${g}`);
        expected.push(String(v.paths));
      } else if (v.cost !== undefined) {
        input.push(`cost ${g}`);
        expected.push(v.cost === '∞' ? 'none' : String(v.cost));
      }
    } else if (e.call[0] === 'trace' && v.path !== undefined) {
      input.push(`path ${g}`);
      expected.push(v.path === 'none' ? 'none' : `${v.cost} ${v.path}`.trim());
    }
  }
  return { input, expected };
}

export default dpGridPaths;
