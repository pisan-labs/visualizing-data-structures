import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { cellName, gridInput, gridPresets, gridText, loadCall, randomGrid } from '../_grid/grid';
import cppSource from './code/cpp/grid_bfs.hpp?raw';
import javaSource from './code/java/GridBfs.java?raw';
import pythonSource from './code/python/grid_bfs.py?raw';
import aroundTheWall from './examples/around-the-wall.json';
import eightMoves from './examples/eight-moves.json';
import maze from './examples/maze.json';
import nextDoor from './examples/next-door.json';
import noPath from './examples/no-path.json';
import openField from './examples/open-field.json';
import ties from './examples/ties.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type BfsGridExtra,
  type BfsGridSettings,
  type BfsGridState,
} from './model';
import { gridBfsPractice } from './practice';
import { view } from './view';

export const gridBfs: VizDef<BfsGridState, BfsGridSettings, BfsGridExtra> = {
  id: 'grid-bfs',
  title: 'Shortest path in a grid (BFS)',
  family: 'Graphs',
  blurb:
    'Find the fewest moves from S to T through a grid with walls, as breadth-first search fills it ring by ring.',
  settings: [
    {
      kind: 'choice',
      key: 'moves',
      label: 'Moves',
      options: [
        { value: '4', label: '4 neighbours: up, down, left, right' },
        { value: '8', label: '8 neighbours: diagonals too' },
      ],
      help: 'With 8 neighbours a diagonal step costs one move, the same as a straight one, as a king moves in chess.',
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
    input: gridInput(),
    buttons: [
      { op: 'load', label: 'Load', usesInput: true, primary: true },
      { op: 'run', label: 'Find path', usesInput: false },
    ],
    random: {
      label: 'Random grid',
      make: (rng) => [loadCall(randomGrid(rng, rng.int(5, 8), rng.int(7, 11)))],
    },
    presets: gridPresets([['run']]),
    sizes: [5, 7, 9],
  },
  explain,
  complexity: [
    {
      op: 'GRID-BFS on R × C cells',
      best: {
        cost: 'O(1)',
        why: 'T is next to S: one dequeue finds it, and the next one is T.',
        example: 'next-door',
      },
      average: {
        cost: 'O(RC)',
        why: 'BFS stops at T, but first it expands every cell nearer to S than T is.',
        example: 'around-the-wall',
      },
      worst: {
        cost: 'Θ(RC)',
        why: 'No path: every cell S can reach goes through the queue before BFS gives up.',
        example: 'no-path',
      },
      note: 'Each cell has at most 4 (or 8) neighbours, so the edges are O(RC) too: O(V + E) is O(RC).',
    },
    {
      op: 'Neighbour checks per cell',
      best: { cost: 'O(1)', why: 'A cell boxed in by walls has nothing to check.', example: 'maze' },
      average: {
        cost: 'O(1)',
        why: 'At most 4 checks, or 8 with diagonals, however big the grid.',
        example: 'eight-moves',
      },
      worst: {
        cost: 'O(1)',
        why: 'An open cell in the middle has all 4 (or 8) neighbours open.',
        example: 'open-field',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'O(RC)', why: 'd and π take one slot per cell.', example: 'next-door' },
      average: {
        cost: 'O(RC)',
        why: 'The queue holds one ring of cells, and π is kept for every cell.',
        example: 'open-field',
      },
      worst: {
        cost: 'O(RC)',
        why: 'A ring can never hold more cells than the grid has.',
        example: 'no-path',
      },
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) =>
      codeScript(calls, settings as BfsGridSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    aroundTheWall,
    openField,
    eightMoves,
    noPath,
    nextDoor,
    maze,
    ties,
  ] as unknown as SavedExample[],
  practice: gridBfsPractice(() => gridBfs),
};

/**
 * Driver protocol for the code tabs: one line "bfs <4|8> <row> <row> ..." per run, with the
 * rows of the grid in . # S T. The driver prints "<moves> <expanded> <path>" with the path as
 * cell names from S to T (A1 is the top-left cell), or "none <expanded>" when T cannot be
 * reached. Expanded counts the cells that left the queue, T included.
 */
function codeScript(calls: OpCall[], settings: BfsGridSettings) {
  const t = new Timeline(gridBfs, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] !== 'run' || !r) continue;
    const g = e.end.grid;
    input.push(`bfs ${settings.moves} ${gridText(g)}`);
    expected.push(
      r.end === 'found'
        ? `${r.path.length - 1} ${r.order.length} ${r.path.map((k) => cellName(g, k)).join(' ')}`
        : `none ${r.order.length}`,
    );
  }
  return { input, expected };
}

export default gridBfs;
