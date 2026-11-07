import { Timeline } from '../../engine/timeline';
import type { OpCall, SavedExample, Settings, VizDef } from '../../engine/types';
import { cellName, gridInput, gridPresets, gridText, loadCall, randomGrid } from '../_grid/grid';
import cppSource from './code/cpp/astar.hpp?raw';
import javaSource from './code/java/AStar.java?raw';
import pythonSource from './code/python/astar.py?raw';
import diagonalOverestimate from './examples/diagonal-overestimate.json';
import manhattan from './examples/manhattan.json';
import noPath from './examples/no-path.json';
import openField from './examples/open-field.json';
import straightLine from './examples/straight-line.json';
import weighted from './examples/weighted.json';
import zeroHeuristic from './examples/zero-heuristic.json';
import explain from './explain.md?raw';
import {
  defaults,
  describe,
  init,
  initialSay,
  initialVars,
  ops,
  pseudocode,
  type AStarExtra,
  type AStarSettings,
  type AStarState,
} from './model';
import { aStarPractice } from './practice';
import { view } from './view';

export const aStar: VizDef<AStarState, AStarSettings, AStarExtra> = {
  id: 'a-star',
  title: 'A* search',
  family: 'Graphs',
  blurb:
    'Search a grid from S to T, always expanding the cell with the least f = g + h, and see how a good guess saves work.',
  settings: [
    {
      kind: 'choice',
      key: 'heuristic',
      label: 'Heuristic h',
      options: [
        { value: 'manhattan', label: 'Manhattan: rows + columns' },
        { value: 'euclidean', label: 'Euclidean: straight line' },
        { value: 'chebyshev', label: 'Chebyshev: the larger of the two' },
        { value: 'zero', label: 'Zero: Dijkstra’s algorithm' },
      ],
      help: 'h guesses the cost from a cell to T. A guess that never overestimates gives a shortest path; a better guess expands fewer cells.',
    },
    {
      kind: 'choice',
      key: 'weight',
      label: 'Weight w in f = g + w·h',
      options: [
        { value: '1', label: '1 (plain A*)' },
        { value: '1.5', label: '1.5' },
        { value: '2', label: '2' },
        { value: '5', label: '5 (nearly greedy)' },
      ],
      help: 'Above 1, A* trusts the guess more: it expands fewer cells, but the path can be longer than the shortest.',
    },
    {
      kind: 'choice',
      key: 'moves',
      label: 'Moves',
      options: [
        { value: '4', label: '4 neighbours: up, down, left, right' },
        { value: '8', label: '8 neighbours: diagonals too' },
      ],
      help: 'Every move costs 1, a diagonal too. With diagonals, Manhattan and Euclidean overestimate; Chebyshev is exact on an open grid.',
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
      op: 'A* on R × C cells, plain A*',
      best: {
        cost: 'O(d log d)',
        why: 'An open line to T: a good h expands only the d cells on the path.',
        example: 'straight-line',
      },
      average: {
        cost: 'O(k log k)',
        why: 'k cells expanded, each costing a heap operation; a better h makes k smaller.',
        example: 'manhattan',
      },
      worst: {
        cost: 'O(RC log RC)',
        why: 'With no path, or h = 0, every reachable cell is expanded: Dijkstra on the grid.',
        example: 'no-path',
      },
      note: 'd is the length of the path and k the cells expanded; each has at most 8 neighbours.',
    },
    {
      op: 'Cells expanded, by heuristic',
      best: {
        cost: 'd + 1',
        why: 'A perfect h (the true distance) expands only the path.',
        example: 'open-field',
      },
      average: {
        cost: 'Between',
        why: 'The closer h is to the true distance, the fewer cells: Manhattan beats zero.',
        example: 'manhattan',
      },
      worst: {
        cost: 'All reachable',
        why: 'h = 0 knows nothing about T and fans out in every direction, like BFS.',
        example: 'zero-heuristic',
      },
    },
    {
      op: 'Extra space',
      best: { cost: 'O(RC)', why: 'g, h, f and π take a slot per cell.', example: 'straight-line' },
      average: {
        cost: 'O(RC)',
        why: 'The open set holds the frontier; the closed set holds every cell expanded.',
        example: 'weighted',
      },
      worst: {
        cost: 'O(RC)',
        why: 'Every cell is open or closed by the end of a search with no path.',
        example: 'no-path',
      },
      note: 'Memory, not time, is what usually limits A* on big maps.',
    },
  ],
  code: {
    python: pythonSource,
    java: javaSource,
    cpp: cppSource,
    script: (calls: OpCall[], settings: Settings) => codeScript(calls, settings as AStarSettings),
  },
  // JSON imports lose the tuple types; the conformance test validates every example.
  examples: [
    manhattan,
    zeroHeuristic,
    straightLine,
    openField,
    diagonalOverestimate,
    weighted,
    noPath,
  ] as unknown as SavedExample[],
  practice: aStarPractice(() => aStar),
  preview: { example: 'manhattan', level: 2, hide: ['pq-'] },
};

/**
 * Driver protocol for the code tabs: one line "astar <4|8> <heuristic> <weight> <row> ..." per
 * run, with the rows in . # S T. The driver prints "<cost> <expanded> <path>" with the path as
 * cell names from S to T (A1 is the top-left cell), or "none <expanded>". Expanded counts the
 * cells taken from the open set, T included.
 */
function codeScript(calls: OpCall[], settings: AStarSettings) {
  const t = new Timeline(aStar, settings, 1, calls);
  const input: string[] = [];
  const expected: string[] = [];
  for (const e of t.entries) {
    const r = e.steps.at(-1)!.extra?.run;
    if (e.call[0] !== 'run' || !r) continue;
    const g = e.end.grid;
    input.push(`astar ${settings.moves} ${settings.heuristic} ${settings.weight} ${gridText(g)}`);
    expected.push(
      r.end === 'found'
        ? `${r.path.length - 1} ${r.closed.length} ${r.path.map((k) => cellName(g, k)).join(' ')}`
        : `none ${r.closed.length}`,
    );
  }
  return { input, expected };
}

export default aStar;
