/**
 * Shortest path in a grid by breadth-first search. The grid is a graph whose vertices are the
 * open cells and whose edges join neighbouring cells (4 or 8 of them, a setting). Every move
 * costs the same, so BFS's distances are shortest paths: it takes cells from a FIFO queue,
 * and the queue holds the cells at distance k, then those at k + 1, ring after ring.
 *
 * The search stops when T leaves the queue, as Dijkstra's algorithm and A* do, so the three
 * pages count expanded cells the same way. Then it follows the parent pointers back from T to
 * draw the path.
 *
 * The state is just the grid; a run's bookkeeping (d, π, the queue) travels in the steps'
 * `extra`, so the last step of a run shows the result and a plain state draws the bare grid.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { cellShapeId } from '../../layouts/grid';
import {
  cellName,
  describeGrid,
  gridVars,
  listWords,
  loadOp,
  names,
  neighbours,
  plural,
  rc,
  startGrid,
  startOf,
  targetOf,
  type Grid,
  type GridState,
  type Moves,
} from '../_grid/grid';

export type BfsGridState = GridState;

export interface BfsGridSettings {
  [key: string]: Scalar;
  moves: Moves;
}

export const defaults: BfsGridSettings = { moves: '4' };

/** One run's bookkeeping, as it stands at a step. Cells are numbered r * cols + c. */
export interface GridRun {
  /** Moves from S; -1 is ∞ (not found yet). */
  d: number[];
  /** The cell each cell was found from; -1 is NIL. */
  pi: number[];
  /** Front first. */
  queue: number[];
  /** Cells in the order they left the queue. */
  order: number[];
  /** The cell being expanded and the neighbour being looked at (-1: none). */
  u: number;
  v: number;
  /** S to T, once T has left the queue. */
  path: number[];
  /** How the run ended: T reached, or the queue ran dry. */
  end?: 'found' | 'none';
  /** Neighbour checks so far. */
  checks: number;
}

export interface BfsGridExtra {
  run?: GridRun;
}

type S = BfsGridState;
type X = BfsGridExtra;
type Op = OpSpec<S, BfsGridSettings, X>;
type BfsStep = Step<S, X>;

export const init = (): S => ({ grid: startGrid() });

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (g: Grid, k: number) => {
  const [r, c] = rc(g, k);
  return cellShapeId(r, c);
};
/** The queue's boxes under the grid. */
export const queueId = (k: number) => `q-${k}`;

function clone(r: GridRun): GridRun {
  return {
    ...r,
    d: [...r.d],
    pi: [...r.pi],
    queue: [...r.queue],
    order: [...r.order],
    path: [...r.path],
  };
}

export function runVars(g: Grid, r: GridRun | undefined): Record<string, Scalar> {
  if (!r) return gridVars(g);
  return {
    ...gridVars(g),
    u: r.u >= 0 ? cellName(g, r.u) : '–',
    'u.d': r.u >= 0 ? r.d[r.u]! : '–',
    queue: r.queue.length,
    expanded: r.order.length,
    found: r.d.filter((x) => x >= 0).length,
    checks: r.checks,
    'T.d': r.d[targetOf(g)]! >= 0 ? r.d[targetOf(g)]! : '∞',
  };
}

/** Follow π back from k to S. */
export function pathTo(r: GridRun, k: number): number[] {
  const path = [k];
  while (r.pi[path[0]!]! >= 0) path.unshift(r.pi[path[0]!]!);
  return path;
}

const run: Op = {
  label: 'Find path',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.grid;
    const n = g.lines.length * g.lines[0]!.length;
    const src = startOf(g);
    const dst = targetOf(g);
    const S = cellName(g, src);
    const T = cellName(g, dst);
    const r: GridRun = {
      d: Array<number>(n).fill(-1),
      pi: Array<number>(n).fill(-1),
      queue: [],
      order: [],
      u: -1,
      v: -1,
      path: [],
      checks: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BfsStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const id = (k: number) => cellId(g, k);
    const moves = settings.moves === '8' ? '8 neighbours, diagonals too' : '4 neighbours';

    r.d[src] = 0;
    r.queue.push(src);
    yield step(
      `Search from S at ${S} for T at ${T}, moving to ${moves}. Every cell starts with d = ∞. S gets d = 0 and goes in the queue.`,
      ['init', 'src', 'q'],
      2,
      [mark(id(src), 'new'), mark(queueId(src), 'new')],
    );

    let layer = 0;
    while (r.queue.length > 0) {
      const u = r.queue.shift()!;
      r.order.push(u);
      r.u = u;
      r.v = -1;
      const du = r.d[u]!;
      let opening = '';
      if (du > layer) {
        const ring = r.order.filter((k) => r.d[k] === layer).length;
        opening = `Every cell at distance ${layer} has left the queue (${plural(ring, 'cell')}). What remains is the ring at distance ${du}: ${plural(r.queue.length + 1, 'cell')}. `;
        layer = du;
      }
      const name = cellName(g, u);
      if (u === dst) {
        yield step(
          `${opening}Dequeue ${name}: that is T, at distance ${du}. Every cell nearer to S has already left the queue, so no path is shorter.`,
          ['while', 'deq', 'goal'],
          2,
          [mark(id(u), 'found')],
        );
        r.path = pathTo(r, dst);
        r.end = 'found';
        r.u = -1;
        yield step(
          `Follow π back from T to S and read it forwards: ${names(g, r.path).join(' → ')}. That is ${plural(du, 'move')}, and BFS expanded ${plural(r.order.length, 'cell')} to find it.`,
          ['ret'],
          1,
          r.path.map((k) => mark(id(k), 'found')),
        );
        return s;
      }
      const adj = neighbours(g, u, settings.moves);
      yield step(
        `${opening}Dequeue ${name} (d = ${du}). ${adj.length ? `Its open neighbours, clockwise from north: ${listWords(names(g, adj))}.` : 'It has no open neighbours.'}`,
        ['while', 'deq', 'goal'],
        2,
        [mark(id(u), 'active')],
      );
      for (const v of adj) {
        r.v = v;
        r.checks++;
        const vn = cellName(g, v);
        if (r.d[v] === -1) {
          r.d[v] = du + 1;
          r.pi[v] = u;
          r.queue.push(v);
          yield step(
            `${vn} is new: d[${vn}] = ${du} + 1 = ${du + 1}, its parent is ${name}, and it joins the back of the queue.`,
            ['for', 'if', 'd', 'pi', 'enq'],
            2,
            [mark(id(u), 'active'), mark(id(v), 'new'), mark(queueId(v), 'new')],
          );
        } else {
          yield step(
            `${vn} already has d = ${r.d[v]}, so skip it.${r.pi[u] === v ? ` (${name} came from there.)` : ''}`,
            ['for', 'if'],
            3,
            [mark(id(u), 'active'), mark(id(v), 'compare')],
          );
        }
      }
      r.v = -1;
    }
    r.u = -1;
    r.end = 'none';
    yield step(
      `The queue is empty and T never left it: there is no path from S to T. BFS reached ${plural(r.order.length, 'cell')}, every one S can get to, before giving up.`,
      ['while', 'none'],
      1,
      [mark(id(dst), 'error')],
    );
    return s;
  },
};

const load = loadOp<S, BfsGridSettings, X>({
  make: (grid) => ({ grid }),
  ready: 'Press Find path to search from S to T.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS's BFS, with the early stop at T.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BfsGridSettings): PseudoBlock[] {
  const k = settings.moves === '8' ? 8 : 4;
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'GRID-BFS(grid, S, T)', 'Shortest path from S to T:'),
        L('init', 1, 'for each open cell u: u.d = ∞', 'No cell has a distance yet.'),
        L('src', 1, 'S.d = 0', 'S is zero moves from itself.'),
        L('q', 1, 'Q = [S]', 'Start a queue holding S.'),
        L('while', 1, 'while Q ≠ ∅', 'While the queue has cells,'),
        L('deq', 2, 'u = DEQUEUE(Q)', 'take u from the front.'),
        L('goal', 2, 'if u == T', 'If u is the target,'),
        L('ret', 3, 'return path S..T along π', 'follow the parents back: done.'),
        L(
          'for',
          2,
          `for each open v of u's ${k} neighbours`,
          `Look at u's open neighbours (${k} directions):`,
        ),
        L('if', 3, 'if v.d == ∞', 'if v has no distance yet,'),
        L('d', 4, 'v.d = u.d + 1', 'it is one move further than u,'),
        L('pi', 4, 'v.π = u', 'found from u,'),
        L('enq', 4, 'ENQUEUE(Q, v)', 'and joins the back of the queue.'),
        L('none', 1, 'return "no path"', 'The queue ran dry: T cannot be reached.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGrid(s.grid)} Press Find path: breadth-first search fills the grid ring by ring around S until it reaches T.`;
}

export const initialVars = (s: S) => gridVars(s.grid);

export const describe = (s: S) => describeGrid(s.grid);

/** The scene label: the grid, plus where a run stands. */
export function describeRun(g: Grid, r: GridRun): string {
  const q = r.queue.length ? names(g, r.queue.slice(0, 8)).join(', ') : 'empty';
  const more = r.queue.length > 8 ? ` and ${r.queue.length - 8} more` : '';
  const tail =
    r.end === 'found'
      ? ` Path: ${names(g, r.path).join(', ')}.`
      : r.end === 'none'
        ? ' No path.'
        : '';
  return `BFS: ${plural(r.order.length, 'cell')} expanded. Queue: ${q}${more}.${tail}`;
}
