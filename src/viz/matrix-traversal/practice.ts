import type { Rng } from '../../engine/rng';
import { Timeline } from '../../engine/timeline';
import type { OpCall, PracticeKind, VizDef } from '../../engine/types';
import { spotItKind, type SpotRow } from '../_patterns/kit';
import {
  defaults,
  ordinal,
  valuesOf,
  type MatrixExtra,
  type MatrixSettings,
  type MatrixState,
} from './model';

type Def = VizDef<MatrixState, MatrixSettings, MatrixExtra>;

const rowsText = (vs: number[][]) => vs.map((r) => r.join(' ')).join(' / ');

/** An r × c matrix of distinct values from 1 to 99. */
function distinct(rng: Rng, rows: number, cols: number): number[][] {
  const pool = Array.from({ length: 99 }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return Array.from({ length: rows }, (_, r) => pool.slice(r * cols, (r + 1) * cols));
}

/**
 * Our own problem statements, for "spot it": some that call for a matrix walk or a rotation,
 * and some grid problems that call for another pattern.
 */
export const SPOT_ROWS: SpotRow[] = [
  {
    problem:
      'A grid of numbers. List them starting at the top left, going clockwise around the edge, then around the next ring in, until the middle.',
    pattern: 'matrix-traversal',
    cue: ['clockwise around the edge', 'the next ring in'],
    why: 'That is spiral order. Four bounds around the part not visited yet do it with no extra grid; shrink one after each side.',
    near: ['dp-grid-paths', 'state-space-bfs', 'sliding-window'],
  },
  {
    problem:
      'A square image is stored as a grid of pixels. Turn it a quarter turn to the right without making a second image.',
    pattern: 'matrix-traversal',
    cue: ['a quarter turn', 'without making a second image'],
    why: 'A rotation in place: four-way swaps ring by ring, or transpose and then reverse each row.',
    near: ['two-pointers', 'dp-grid-paths', 'cyclic-sort'],
  },
  {
    problem:
      'A square table of distances between towns lists the rows in the wrong direction: what should be row i is column i. Fix it in place.',
    pattern: 'matrix-traversal',
    cue: ['row i is column i', 'in place'],
    why: 'Turning rows into columns is a transpose: swap each cell above the diagonal with its mirror below.',
    near: ['two-pointers', 'cyclic-sort', 'dp-interval'],
  },
  {
    problem:
      'A grid of fields, some blocked. In how many ways can a robot go from the top left to the bottom right, moving only right or down?',
    pattern: 'dp-grid-paths',
    cue: ['in how many ways', 'only right or down'],
    why: 'Counting paths is dynamic programming: a cell’s count is the sum of the counts above and to the left. A traversal visits cells; it does not count paths.',
    near: ['matrix-traversal', 'backtracking', 'state-space-bfs'],
  },
  {
    problem:
      'A maze drawn on a grid. What is the fewest number of steps from the entrance to the exit, moving up, down, left or right?',
    pattern: 'state-space-bfs',
    cue: ['fewest number of steps', 'up, down, left or right'],
    why: 'Fewest steps on an unweighted grid is breadth-first search from the entrance, layer by layer.',
    near: ['matrix-traversal', 'dp-grid-paths'],
    alsoFits: ['dijkstra'],
  },
  {
    problem: 'Reverse the order of the letters of a word, in place.',
    pattern: 'two-pointers',
    cue: ['reverse', 'in place'],
    why: 'One index at each end, swap and move both in. (Reversing each row is the second half of a rotation.)',
    near: ['matrix-traversal', 'cyclic-sort'],
  },
];

/**
 * Practice questions. Every answer comes from running the model. `def` is a getter to avoid an
 * import cycle.
 */
export function matrixPractice(def: () => Def): PracticeKind[] {
  const run = (ops: OpCall[]) => new Timeline(def(), defaults, 1, ops);

  return [
    {
      id: 'kth-cell',
      title: 'The cell visited k-th',
      make(rng) {
        const rows = rng.int(3, 4);
        const cols = rng.int(3, 5);
        const vs = distinct(rng, rows, cols);
        const steps = run([['load', rowsText(vs)], ['spiral']]).entries[1]!.steps;
        const out = steps.at(-1)!.extra!.out!;
        const path = steps.at(-1)!.extra!.path!;
        // Past the first row, so the turn matters.
        const k = rng.int(cols + 1, rows * cols);
        const [r, c] = path[k - 1]!;
        return {
          prompt: `List M in spiral order: clockwise from the top left, ring by ring inward. Which value is visited ${ordinal(k)}?`,
          setup: [['load', rowsText(vs)]],
          answer: { kind: 'number', value: out[k - 1]! },
          explain: `The spiral visits ${out.slice(0, k).join(', ')}: the ${ordinal(k)} value is M[${r}][${c}] = ${out[k - 1]}.`,
          watch: [['spiral']],
        };
      },
    },
    {
      id: 'after-rotate',
      title: 'A cell after the rotation',
      make(rng) {
        const n = rng.int(3, 4);
        const vs = distinct(rng, n, n);
        const t = run([['load', rowsText(vs)], ['rotate']]);
        const after = valuesOf(t.endState());
        const r = rng.int(0, n - 1);
        const c = rng.int(0, n - 1);
        return {
          prompt: `Rotate M a quarter turn clockwise. Afterwards, what value is in row ${r}, column ${c}?`,
          setup: [['load', rowsText(vs)]],
          answer: { kind: 'number', value: after[r]![c]! },
          explain: `A quarter turn clockwise sends row i, column j to row j, column ${n - 1} − i. So the new M[${r}][${c}] comes from the old M[${n - 1 - c}][${r}] = ${vs[n - 1 - c]![r]}.`,
          watch: [['rotate']],
        };
      },
    },
    spotItKind({ page: 'matrix-traversal', rows: SPOT_ROWS, watch: [['spiral']] }),
  ];
}
