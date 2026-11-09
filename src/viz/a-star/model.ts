/**
 * A* search on a grid. Every move costs 1 (a diagonal too, with 8 neighbours). Each cell found
 * gets g (the cost of the best path to it so far), h (a guess at the cost from it to T: the
 * heuristic) and f = g + w·h. A* keeps an open set, a priority queue of cells found but not
 * expanded, and always expands the one with the least f. When T comes out, its g is the cost of
 * the path found. With h = 0 that is Dijkstra's algorithm.
 *
 * Ties on f go to the cell with the smaller h (the one nearer T), then to the one added first.
 * Cells in the closed set are never reopened, so a heuristic that overestimates (Manhattan with
 * diagonal moves, or a weight above 1) can return a path that is not the shortest; the
 * narration says when that happens.
 *
 * The state is just the grid, as on the grid-bfs page, so compare mode lines the two up. A
 * run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { cellShapeId } from '../../layouts/grid';
import {
  bfsDistances,
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

export type AStarState = GridState;
export type Heuristic = 'manhattan' | 'euclidean' | 'chebyshev' | 'zero';

export interface AStarSettings {
  [key: string]: Scalar;
  heuristic: Heuristic;
  /** w in f = g + w·h, as text so the settings panel can offer a choice. */
  weight: '1' | '1.5' | '2' | '5';
  moves: Moves;
}

export const defaults: AStarSettings = { heuristic: 'manhattan', weight: '1', moves: '4' };

export const HEURISTIC_NAMES: Record<Heuristic, string> = {
  manhattan: 'Manhattan distance',
  euclidean: 'straight-line (Euclidean) distance',
  chebyshev: 'Chebyshev distance',
  zero: 'zero',
};

/** One entry of the open set. */
export interface OpenEntry {
  k: number;
  f: number;
  h: number;
  /** When it was added or last improved: the last tie-break. */
  order: number;
}

export interface AStarRun {
  /** Cost of the best path found so far; -1 is ∞ (not found). */
  g: number[];
  /** The heuristic, for cells found so far (-1: not computed). */
  h: number[];
  f: number[];
  pi: number[];
  /** The open set, in priority order (least f first). */
  open: OpenEntry[];
  /** Cells in the order they were expanded (the closed set). */
  closed: number[];
  u: number;
  v: number;
  path: number[];
  end?: 'found' | 'none';
  /** Entries added to the open set, improvements included. */
  pushes: number;
}

export interface AStarExtra {
  run?: AStarRun;
}

type S = AStarState;
type X = AStarExtra;
type Op = OpSpec<S, AStarSettings, X>;
type AStarStep = Step<S, X>;

export const init = (): S => ({ grid: startGrid() });

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (g: Grid, k: number) => {
  const [r, c] = rc(g, k);
  return cellShapeId(r, c);
};

/** A cost for people: whole numbers as they are, anything else to one decimal. */
export const fmt = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1));

export function heuristic(g: Grid, k: number, which: Heuristic): number {
  const [r, c] = rc(g, k);
  const [tr, tc] = rc(g, targetOf(g));
  const dr = Math.abs(r - tr);
  const dc = Math.abs(c - tc);
  switch (which) {
    case 'manhattan':
      return dr + dc;
    case 'euclidean':
      return Math.sqrt(dr * dr + dc * dc);
    case 'chebyshev':
      return Math.max(dr, dc);
    default:
      return 0;
  }
}

/** Open-set order: least f, then least h, then added first. */
export const before = (a: OpenEntry, b: OpenEntry) => a.f - b.f || a.h - b.h || a.order - b.order;

function clone(r: AStarRun): AStarRun {
  return {
    ...r,
    g: [...r.g],
    h: [...r.h],
    f: [...r.f],
    pi: [...r.pi],
    open: r.open.map((e) => ({ ...e })),
    closed: [...r.closed],
    path: [...r.path],
  };
}

export function runVars(g: Grid, r: AStarRun | undefined): Record<string, Scalar> {
  if (!r) return gridVars(g);
  const u = r.u;
  return {
    ...gridVars(g),
    u: u >= 0 ? cellName(g, u) : '–',
    'u.g': u >= 0 ? fmt(r.g[u]!) : '–',
    'u.h': u >= 0 ? fmt(r.h[u]!) : '–',
    'u.f': u >= 0 ? fmt(r.f[u]!) : '–',
    open: r.open.length,
    expanded: r.closed.length,
    pushes: r.pushes,
  };
}

/** Follow π back from k to S. */
export function pathTo(r: AStarRun, k: number): number[] {
  const path = [k];
  while (r.pi[path[0]!]! >= 0) path.unshift(r.pi[path[0]!]!);
  return path;
}

/** The whole search without steps: how many cells A* expands with these settings. */
export function expandedWith(g: Grid, settings: AStarSettings): number {
  const gen = search({ grid: g }, settings, false);
  let last: AStarStep | undefined;
  for (let it = gen.next(); !it.done; it = gen.next()) last = it.value;
  return last!.extra!.run!.closed.length;
}

/** The search, step by step. `compare` adds the other heuristic's count to the last step. */
function* search(s: S, settings: AStarSettings, compare = true): Generator<AStarStep, S, void> {
  {
    const g = s.grid;
    const n = g.lines.length * g.lines[0]!.length;
    const src = startOf(g);
    const dst = targetOf(g);
    const w = Number(settings.weight);
    const hName = settings.heuristic;
    const r: AStarRun = {
      g: Array<number>(n).fill(-1),
      h: Array<number>(n).fill(-1),
      f: Array<number>(n).fill(-1),
      pi: Array<number>(n).fill(-1),
      open: [],
      closed: [],
      u: -1,
      v: -1,
      path: [],
      pushes: 0,
    };
    const step = (
      say: string,
      lines: string[],
      level: 1 | 2 | 3,
      marks: Mark[] = [],
    ): AStarStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const id = (k: number) => cellId(g, k);
    const fText = (k: number) =>
      w === 1
        ? `f = ${fmt(r.g[k]!)} + ${fmt(r.h[k]!)} = ${fmt(r.f[k]!)}`
        : `f = ${fmt(r.g[k]!)} + ${settings.weight}·${fmt(r.h[k]!)} = ${fmt(r.f[k]!)}`;
    const put = (k: number) => {
      r.open = r.open.filter((e) => e.k !== k);
      r.open.push({ k, f: r.f[k]!, h: r.h[k]!, order: r.pushes++ });
      r.open.sort(before);
    };

    r.g[src] = 0;
    r.h[src] = heuristic(g, src, hName);
    r.f[src] = w * r.h[src]!;
    put(src);
    const moves = settings.moves === '8' ? '8 neighbours, diagonals too,' : '4 neighbours';
    yield step(
      `A* from S at ${cellName(g, src)} to T at ${cellName(g, dst)}, moving to ${moves} at a cost of 1 a move. ${hName === 'zero' ? 'h is 0, so f = g and this is Dijkstra’s algorithm' : `h is the ${HEURISTIC_NAMES[hName]} to T`}. S gets g = 0, h = ${fmt(r.h[src]!)}, ${fText(src)}, and goes in the open set.`,
      ['start', 'h', 'open'],
      2,
      [mark(id(src), 'new')],
    );

    while (r.open.length > 0) {
      const top = r.open.shift()!;
      const u = top.k;
      r.u = u;
      r.v = -1;
      const name = cellName(g, u);
      const ties = r.open.filter((e) => e.f === top.f);
      const byH = ties.filter((e) => e.h > top.h).length;
      const rule =
        byH === ties.length
          ? 'the smaller h'
          : byH === 0
            ? 'the earlier entry'
            : 'the smaller h, then the earlier entry';
      const why = ties.length
        ? ` ${listWords(
            names(
              g,
              ties.map((e) => e.k),
            ),
          )} ${ties.length === 1 ? 'ties' : 'tie'} on f; ${name} wins with ${rule}.`
        : '';
      if (u === dst) {
        r.closed.push(u);
        yield step(
          `Take ${name}, the open cell with the least f (${fText(u)}).${why} That is T, so the search is over: the path costs g = ${fmt(r.g[u]!)}.`,
          ['while', 'pop', 'goal'],
          2,
          [mark(id(u), 'found')],
        );
        r.path = pathTo(r, dst);
        r.end = 'found';
        r.u = -1;
        const moves = r.path.length - 1;
        const best = bfsDistances(g, settings.moves)[dst]!;
        const worse =
          moves > best
            ? ` That is not the shortest path: the shortest takes ${best}. ${w > 1 ? `The weight ${settings.weight} makes h overestimate` : 'This h overestimates'} the cost to T, so A* settled for a longer path to save work.`
            : '';
        const other = !compare
          ? ''
          : hName === 'zero'
            ? ` With the Manhattan distance as h, A* expands ${expandedWith(g, { ...settings, heuristic: 'manhattan', weight: '1' })}.`
            : ` With h = 0 (Dijkstra’s algorithm) it expands ${expandedWith(g, { ...settings, heuristic: 'zero', weight: '1' })}.`;
        yield step(
          `Follow π back from T: ${names(g, r.path).join(' → ')}, ${plural(moves, 'move')}. A* expanded ${plural(r.closed.length, 'cell')}.${other}${worse}`,
          ['ret'],
          1,
          r.path.map((k) => mark(id(k), 'found')),
        );
        return s;
      }
      r.closed.push(u);
      const adj = neighbours(g, u, settings.moves);
      yield step(
        `Take ${name}, the open cell with the least f (${fText(u)}).${why} Move it to the closed set and look at its ${adj.length ? `open neighbours: ${listWords(names(g, adj))}` : 'neighbours: it has none open'}.`,
        ['while', 'pop', 'goal', 'close'],
        2,
        [mark(id(u), 'active')],
      );
      for (const v of adj) {
        r.v = v;
        const vn = cellName(g, v);
        if (r.closed.includes(v)) {
          yield step(
            `${vn} is closed: it was expanded already, so skip it.`,
            ['for', 'closed'],
            3,
            [mark(id(u), 'active'), mark(id(v), 'compare')],
          );
          continue;
        }
        const tentative = r.g[u]! + 1;
        const known = r.g[v]! >= 0;
        if (known && tentative >= r.g[v]!) {
          yield step(
            `${vn} is already open with g = ${fmt(r.g[v]!)}. Through ${name} it would cost ${fmt(tentative)}, no better, so leave it.`,
            ['for', 'closed', 'tent', 'if'],
            3,
            [mark(id(u), 'active'), mark(id(v), 'compare')],
          );
          continue;
        }
        const old = r.g[v]!;
        r.g[v] = tentative;
        r.h[v] = heuristic(g, v, hName);
        r.f[v] = tentative + w * r.h[v]!;
        r.pi[v] = u;
        put(v);
        yield step(
          known
            ? `${vn} was open with g = ${fmt(old)}, but through ${name} it costs ${fmt(tentative)}: better. Its parent becomes ${name} and ${fText(v)}.`
            : `${vn} is new: g = ${fmt(r.g[u]!)} + 1 = ${fmt(tentative)}, h = ${fmt(r.h[v]!)}, so ${fText(v)}. Its parent is ${name}; add it to the open set.`,
          ['for', 'closed', 'tent', 'if', 'set', 'f', 'push'],
          2,
          [mark(id(u), 'active'), mark(id(v), 'new')],
        );
      }
      r.v = -1;
    }
    r.u = -1;
    r.end = 'none';
    yield step(
      `The open set is empty and T never came out of it: there is no path from S to T. A* expanded ${plural(r.closed.length, 'cell')}, every one S can reach. A heuristic cannot help when there is nothing to find.`,
      ['while', 'none'],
      1,
      [mark(id(dst), 'error')],
    );
    return s;
  }
}

const run: Op = {
  label: 'Find path',
  arity: 0,
  run: (s, _args, { settings }) => search(s, settings),
};

const load = loadOp<S, AStarSettings, X>({
  make: (grid) => ({ grid }),
  ready: 'Press Find path to search from S to T.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, in the style of CLRS's Dijkstra, with A*'s f and the early stop at T.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const H_TEXT: Record<Heuristic, [string, string]> = {
  manhattan: ['h(v) = |Δrow| + |Δcol| to T', 'h: rows plus columns to T.'],
  euclidean: ['h(v) = √(Δrow² + Δcol²) to T', 'h: the straight-line distance to T.'],
  chebyshev: ['h(v) = max(|Δrow|, |Δcol|) to T', 'h: the larger of rows and columns to T.'],
  zero: ['h(v) = 0', 'h is always 0, so A* is Dijkstra.'],
};

export function pseudocode(settings: AStarSettings): PseudoBlock[] {
  const k = settings.moves === '8' ? 8 : 4;
  const w = settings.weight === '1' ? '' : `${settings.weight}·`;
  const [hText, hPlain] = H_TEXT[settings.heuristic];
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'A*(grid, S, T)', 'Search from S to T, best guess first:'),
        L('h', 1, hText, hPlain),
        L('start', 1, `S.g = 0; S.f = ${w}h(S)`, 'S costs nothing to reach.'),
        L('open', 1, 'OPEN = {S}; CLOSED = ∅', 'Only S is open; nothing is closed.'),
        L('while', 1, 'while OPEN ≠ ∅', 'While some cell is open,'),
        L('pop', 2, 'u = cell in OPEN with least f', 'take the open cell with the least f.'),
        L('goal', 2, 'if u == T', 'If it is the target,'),
        L('ret', 3, 'return path S..T along π', 'follow the parents back: done.'),
        L('close', 2, 'move u from OPEN to CLOSED', 'Otherwise u is done: close it.'),
        L('for', 2, `for each open v of u's ${k} neighbours`, `Look at u's open neighbours:`),
        L('closed', 3, 'if v in CLOSED: skip v', 'skip one that is closed;'),
        L('tent', 3, "g' = u.g + 1", 'the cost to v through u is one more;'),
        L('if', 3, "if v not in OPEN or g' < v.g", 'if v is new, or this is cheaper,'),
        L('set', 4, "v.g = g'; v.π = u", 'record the cost and the parent,'),
        L('f', 4, `v.f = v.g + ${w}h(v)`, `add the${w ? ' weighted' : ''} guess to get f,`),
        L('push', 4, 'add or update v in OPEN', 'and put v in the open set.'),
        L('none', 1, 'return "no path"', 'Nothing is open: T cannot be reached.'),
      ],
    },
  ];
}

export function initialSay(s: S, settings: AStarSettings): string {
  return `${describeGrid(s.grid)} Press Find path: A* expands the open cell with the least f = g + h, ${settings.heuristic === 'zero' ? 'where h is 0' : `where h is the ${HEURISTIC_NAMES[settings.heuristic]} to T`}.`;
}

export const initialVars = (s: S) => gridVars(s.grid);

export const describe = (s: S) => describeGrid(s.grid);

export function describeRun(g: Grid, r: AStarRun): string {
  const open = r.open.slice(0, 8).map((e) => `${cellName(g, e.k)} f ${fmt(e.f)}`);
  const more = r.open.length > 8 ? ` and ${r.open.length - 8} more` : '';
  const tail =
    r.end === 'found'
      ? ` Path: ${names(g, r.path).join(', ')}.`
      : r.end === 'none'
        ? ' No path.'
        : '';
  return `A*: ${plural(r.closed.length, 'cell')} closed. Open: ${open.length ? open.join(', ') : 'empty'}${more}.${tail}`;
}
