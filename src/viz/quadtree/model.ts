import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { Vec } from '../../layouts/plane';
import { at, nameOf, pointsArg, readBox, same, type NPt } from '../_spatial/kit';

/** The root square is [0, SIDE) × [0, SIDE); points have whole coordinates 0 to SIDE − 1. */
export const SIDE = 16;
export const MAX = SIDE - 1;
export const MOST = 16;

export const QUADS = ['NW', 'NE', 'SW', 'SE'] as const;
export type Quad = (typeof QUADS)[number];

export interface QNode {
  id: number;
  x0: number;
  y0: number;
  size: number;
  depth: number;
  /** Point ids in a leaf; null for an inner node. */
  points: number[] | null;
  /** Children NW, NE, SW, SE; null for a leaf. */
  kids: [number, number, number, number] | null;
}

export interface Box {
  lo: Vec;
  hi: Vec;
}

export interface QState {
  nodes: QNode[];
  points: NPt[];
  /** Points of the running insert not placed yet (drawn faded). */
  pending: NPt[];
  nextId: number;
  nextNode: number;
  box: Box | null;
  found: number[];
  visited: number[];
  pruned: number[];
  /** Points tested against the rectangle in the last query. */
  tests: number;
}

export interface QSettings {
  [key: string]: Scalar;
  /** Points a leaf holds before it splits. */
  capacity: number;
}

export interface QExtra {
  /** The point being placed. */
  moving?: number;
}

type S = QState;
type X = QExtra;
type Op = OpSpec<S, QSettings, X>;
type QStep = Step<S, X>;

export const defaults: QSettings = { capacity: 1 };

const ROOT: QNode = { id: 0, x0: 0, y0: 0, size: SIDE, depth: 0, points: [], kids: null };

export function init(): S {
  return {
    nodes: [ROOT],
    points: [],
    pending: [],
    nextId: 1,
    nextNode: 1,
    box: null,
    found: [],
    visited: [],
    pruned: [],
    tests: 0,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const ptId = (id: number) => `pt-${id}`;
export const qnId = (id: number) => `qn-${id}`;

export const node = (s: S, id: number) => s.nodes.find((n) => n.id === id)!;
export const point = (s: S, id: number) =>
  s.points.find((p) => p.id === id) ?? s.pending.find((p) => p.id === id)!;

/** Which child square of n holds p: west or east of the middle, then south or north. */
export function quadOf(n: QNode, p: Vec): number {
  const h = n.size / 2;
  const east = p.x >= n.x0 + h;
  const north = p.y >= n.y0 + h;
  return (north ? 0 : 2) + (east ? 1 : 0);
}

export const squareName = (n: QNode) => `[${n.x0}, ${n.x0 + n.size}) × [${n.y0}, ${n.y0 + n.size})`;

export function heightOf(s: S): number {
  return Math.max(...s.nodes.map((n) => n.depth));
}

export function leafCount(s: S): number {
  return s.nodes.filter((n) => n.points).length;
}

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.points.length,
    nodes: s.nodes.length,
    height: heightOf(s),
    ...more,
  };
}

function queryVars(s: S): Record<string, Scalar> {
  return vars(s, {
    visited: s.visited.length,
    pruned: s.pruned.length,
    tests: s.tests,
    found: s.found.length ? s.found.map((id) => point(s, id).name).join(' ') : '(none)',
  });
}

const clean = (s: S): S => ({ ...s, box: null, found: [], visited: [], pruned: [], tests: 0 });

function replace(s: S, n: QNode): S {
  return { ...s, nodes: s.nodes.map((m) => (m.id === n.id ? n : m)) };
}

/** Split leaf n into four children and hand its points down. Returns the new state. */
function split(s: S, n: QNode): S {
  const h = n.size / 2;
  const corners: [number, number][] = [
    [n.x0, n.y0 + h],
    [n.x0 + h, n.y0 + h],
    [n.x0, n.y0],
    [n.x0 + h, n.y0],
  ];
  const kids = corners.map(([x0, y0], k): QNode => ({
    id: s.nextNode + k,
    x0,
    y0,
    size: h,
    depth: n.depth + 1,
    points: [],
    kids: null,
  }));
  for (const pid of n.points!) {
    const k = quadOf(n, point(s, pid));
    kids[k]!.points!.push(pid);
  }
  const inner: QNode = {
    ...n,
    points: null,
    kids: kids.map((c) => c.id) as [number, number, number, number],
  };
  return {
    ...replace(s, inner),
    nodes: [...replace(s, inner).nodes, ...kids],
    nextNode: s.nextNode + 4,
  };
}

/** Insert p with no steps (for the view's look ahead and for tests). */
export function insertQuiet(s0: S, p: NPt, capacity: number): S {
  if (s0.points.some((q) => same(q, p))) return s0;
  let s: S = { ...s0, points: [...s0.points, p] };
  let n = node(s, 0);
  while (n.kids) n = node(s, n.kids[quadOf(n, p)]!);
  s = replace(s, { ...n, points: [...n.points!, p.id] });
  let leaf = node(s, n.id);
  while (leaf.points!.length > capacity && leaf.size > 1) {
    s = split(s, leaf);
    const inner = node(s, leaf.id);
    leaf = node(s, inner.kids![quadOf(inner, p)]!);
  }
  return s;
}

function oops(s: S, say: string, v = vars(s)): QStep {
  return { state: s, marks: [], say, lines: [], vars: v, level: 1 };
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [v], { rng, settings }) {
    const cap = settings.capacity;
    const pts = pointsArg(v, rng, MAX, MOST, 0, MAX);
    if (typeof pts === 'string') {
      yield oops(s0, `insert: ${pts}`);
      return s0;
    }
    if (s0.points.length + pts.length > MOST) {
      yield oops(
        s0,
        `insert: the quadtree has ${s0.points.length} points and holds at most ${MOST} here. Nothing was inserted.`,
      );
      return s0;
    }
    let s = clean(s0);
    let next = s.nextId;
    const incoming: NPt[] = pts.map((p) => {
      const id = next++;
      return { id, name: nameOf(id), x: p.x, y: p.y };
    });
    s = { ...s, pending: incoming, nextId: next };
    if (incoming.length > 1)
      yield {
        state: s,
        marks: incoming.map((p) => mark(ptId(p.id), 'new')),
        say: `Insert ${incoming.length} points, one at a time: ${incoming.map(at).join(', ')}. Each leaf holds at most ${cap} point${cap === 1 ? '' : 's'}.`,
        lines: ['ins.sig'],
        vars: vars(s),
        level: 2,
      };
    const added: string[] = [];
    for (const p of incoming) {
      const dup = s.points.find((q) => same(q, p));
      if (dup) {
        s = { ...s, pending: s.pending.filter((q) => q.id !== p.id) };
        yield {
          state: s,
          marks: [mark(ptId(dup.id), 'error')],
          say: `${p.name}(${p.x}, ${p.y}) is the same point as ${dup.name}. A set holds each point once, so skip it.`,
          lines: ['ins.sig'],
          vars: vars(s),
          level: 2,
        };
        continue;
      }
      let n = node(s, 0);
      while (n.kids) {
        const k = quadOf(n, p);
        const child = node(s, n.kids[k]!);
        yield {
          state: s,
          marks: [mark(qnId(n.id), 'active'), mark(ptId(p.id), 'active')],
          say: `${p.name}(${p.x}, ${p.y}) is in the ${QUADS[k]} quarter of ${squareName(n)}: x ${p.x >= n.x0 + n.size / 2 ? '≥' : '<'} ${n.x0 + n.size / 2}, y ${p.y >= n.y0 + n.size / 2 ? '≥' : '<'} ${n.y0 + n.size / 2}. Go down to that child.`,
          lines: ['ins.down', 'ins.quad'],
          vars: vars(s),
          level: 3,
          extra: { moving: p.id },
        };
        n = child;
      }
      s = {
        ...replace(s, { ...n, points: [...n.points!, p.id] }),
        points: [...s.points, p],
        pending: s.pending.filter((q) => q.id !== p.id),
      };
      added.push(p.name);
      let leaf = node(s, n.id);
      const count = leaf.points!.length;
      yield {
        state: s,
        marks: [mark(qnId(leaf.id), 'new'), mark(ptId(p.id), 'new')],
        say: `${p.name} lands in the leaf for ${squareName(leaf)}, which now holds ${count} point${count === 1 ? '' : 's'}${count > cap ? `: more than the capacity of ${cap}` : ` (capacity ${cap})`}.`,
        lines: ['ins.add'],
        vars: vars(s),
        level: 2,
      };
      while (leaf.points!.length > cap && leaf.size > 1) {
        s = split(s, leaf);
        const inner = node(s, leaf.id);
        const kids = inner.kids!.map((id) => node(s, id));
        const busy = kids.filter((c) => c.points!.length > 0);
        yield {
          state: s,
          marks: [
            mark(qnId(inner.id), 'active'),
            ...busy.map((c) => mark(qnId(c.id), 'new')),
            ...inner.kids!.flatMap((id) =>
              node(s, id).points!.map((pid) => mark(ptId(pid), 'new')),
            ),
          ],
          say: `Too many points: split ${squareName(inner)} into four squares of side ${inner.size / 2} and move each point into its quarter: ${kids
            .map(
              (c, k) =>
                `${QUADS[k]} ${c.points!.length ? c.points!.map((pid) => point(s, pid).name).join('') : '—'}`,
            )
            .join(', ')}.`,
          lines: ['ins.full', 'ins.split'],
          vars: vars(s),
          level: 2,
        };
        leaf = node(s, inner.kids![quadOf(inner, p)]!);
      }
    }
    yield {
      state: s,
      marks: [],
      say: added.length
        ? `Inserted ${added.join(', ')}. The quadtree has ${s.points.length} point${s.points.length === 1 ? '' : 's'} in ${leafCount(s)} leaves (${s.nodes.length} nodes), and height ${heightOf(s)}.`
        : 'Nothing new was inserted.',
      lines: [],
      vars: vars(s),
      level: 1,
    };
    return s;
  },
};

interface Run {
  s: S;
  box: Box;
}

const meets = (n: QNode, b: Box) =>
  b.lo.x < n.x0 + n.size && b.hi.x >= n.x0 && b.lo.y < n.y0 + n.size && b.hi.y >= n.y0;
const inBox = (p: Vec, b: Box) => p.x >= b.lo.x && p.x <= b.hi.x && p.y >= b.lo.y && p.y <= b.hi.y;

function* queryRec(run: Run, id: number): Generator<QStep, void, void> {
  const n = node(run.s, id);
  if (!meets(n, run.box)) {
    run.s = { ...run.s, pruned: [...run.s.pruned, id] };
    yield {
      state: run.s,
      marks: [mark(qnId(id), 'stale')],
      say: `The square ${squareName(n)} misses the rectangle. Skip it and everything under it.`,
      lines: ['q.miss'],
      vars: queryVars(run.s),
      level: 2,
    };
    return;
  }
  run.s = { ...run.s, visited: [...run.s.visited, id] };
  if (n.kids) {
    yield {
      state: run.s,
      marks: [mark(qnId(id), 'active')],
      say: `The square ${squareName(n)} overlaps the rectangle. Look at its four children.`,
      lines: ['q.kids'],
      vars: queryVars(run.s),
      level: 3,
    };
    for (const k of n.kids) yield* queryRec(run, k);
    return;
  }
  if (n.points!.length === 0) {
    yield {
      state: run.s,
      marks: [mark(qnId(id), 'visit')],
      say: `The leaf for ${squareName(n)} overlaps the rectangle but is empty.`,
      lines: ['q.leaf'],
      vars: queryVars(run.s),
      level: 3,
    };
    return;
  }
  for (const pid of n.points!) {
    const p = point(run.s, pid);
    const inside = inBox(p, run.box);
    run.s = {
      ...run.s,
      tests: run.s.tests + 1,
      found: inside ? [...run.s.found, pid] : run.s.found,
    };
    yield {
      state: run.s,
      marks: [mark(qnId(id), 'visit'), mark(ptId(pid), inside ? 'found' : 'visit')],
      say: inside
        ? `Test ${at(p)} in the leaf ${squareName(n)}: inside the rectangle. Report it.`
        : `Test ${at(p)} in the leaf ${squareName(n)}: outside the rectangle.`,
      lines: ['q.leaf', 'q.test'],
      vars: queryVars(run.s),
      level: 2,
    };
  }
}

const query: Op = {
  label: 'Range query',
  arity: 1,
  *run(s0, [v]) {
    const box = readBox(v, MAX);
    if (typeof box === 'string') {
      yield oops(s0, `query: ${box}`);
      return s0;
    }
    const run: Run = { s: { ...clean(s0), box }, box };
    const name = `[${box.lo.x}, ${box.hi.x}] × [${box.lo.y}, ${box.hi.y}]`;
    yield {
      state: run.s,
      marks: [],
      say: `Report every point in the rectangle ${name}. Start at the root and only go into squares that overlap it.`,
      lines: ['q.sig'],
      vars: queryVars(run.s),
      level: 2,
    };
    yield* queryRec(run, 0);
    const s = run.s;
    yield {
      state: s,
      marks: s.found.map((id) => mark(ptId(id), 'found')),
      say: `${s.found.length ? `Found ${s.found.length}: ${s.found.map((id) => point(s, id).name).join(', ')}.` : 'No point is inside the rectangle.'} The query visited ${s.visited.length} of ${s.nodes.length} nodes, skipped ${s.pruned.length} square${s.pruned.length === 1 ? '' : 's'}, and tested ${s.tests} of ${s.points.length} points.`,
      lines: ['q.ret'],
      vars: queryVars(s),
      level: 1,
    };
    return s;
  },
};

const clear: Op = {
  label: 'Clear',
  arity: 0,
  *run(s) {
    const end = init();
    yield {
      state: end,
      marks: [],
      say: s.points.length
        ? 'Clear: one empty square again.'
        : 'Clear: the quadtree was already empty.',
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
  },
};

export const ops = { insert, query, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: QSettings): PseudoBlock[] {
  const c = settings.capacity;
  return [
    {
      op: 'insert',
      lines: [
        L(
          'ins.sig',
          0,
          `INSERT(T, p)    ▷ capacity ${c}`,
          `To insert p (a leaf holds up to ${c}):`,
        ),
        L(
          'ins.down',
          1,
          'x = T.root; while x is not a leaf',
          'Start at the root square; while it has children,',
        ),
        L(
          'ins.quad',
          2,
          'x = x.child[QUADRANT(x, p)]',
          'go into the quarter (NW, NE, SW or SE) that holds p.',
        ),
        L('ins.add', 1, 'add p to x.points', 'Put p in the leaf.'),
        L(
          'ins.full',
          1,
          `while |x.points| > ${c} and x.side > 1`,
          `While the leaf holds more than ${c},`,
        ),
        L(
          'ins.split',
          2,
          'SPLIT(x): four children of half the side; move each point down; x = the child holding p',
          'split it into four equal squares, hand its points down, and check the square p went to.',
        ),
      ],
    },
    {
      op: 'query',
      lines: [
        L('q.sig', 0, 'QUERY(x, R)', 'To report the points in the rectangle R, from node x:'),
        L(
          'q.miss',
          1,
          'if x.square does not overlap R: return',
          'A square that misses R is skipped whole.',
        ),
        L(
          'q.kids',
          1,
          'if x has children: QUERY(c, R) for each child c',
          'An inner node: try all four children.',
        ),
        L('q.leaf', 1, 'else for each point p in x.points', 'A leaf: look at each of its points;'),
        L('q.test', 2, 'if p is in R: report p', 'report the ones inside R.'),
        L('q.ret', 1, 'return the reported points', 'Every reported point is in R.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'One empty square, 16 by 16. Type points such as 3,12 12,13 6,5 and press Insert, or pick a preset. Then try Range query with two corners.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  const parts: string[] = [];
  const walk = (id: number) => {
    const n = node(state, id);
    if (n.kids) n.kids.forEach(walk);
    else if (n.points!.length)
      parts.push(`${squareName(n)}: ${n.points!.map((pid) => point(state, pid).name).join(', ')}`);
  };
  walk(0);
  const wait = state.pending.length
    ? ` Waiting: ${state.pending.map((p) => p.name).join(', ')}.`
    : '';
  const found = state.box
    ? ` In the rectangle: ${state.found.map((id) => point(state, id).name).join(', ') || 'none'}.`
    : '';
  return `A quadtree of ${state.points.length} points in ${leafCount(state)} leaves, height ${heightOf(state)}.${parts.length ? ` Leaves with points: ${parts.join('; ')}.` : ''}${wait}${found}`;
}
