import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { at, inCircle, nameOf, pointsArg, same, type NPt } from '../_spatial/kit';

export const MAX = 12;
export const MOST = 16;
/** The super triangle's corners sit this far out: far enough to act like points at infinity. */
export const FAR = 10000;

/** The three corners of the super triangle, counter-clockwise, with ids -1, -2, -3. */
export const SUPER: NPt[] = [
  { id: -1, name: 'S1', x: -FAR, y: -FAR },
  { id: -2, name: 'S2', x: FAR, y: -FAR },
  { id: -3, name: 'S3', x: 0, y: FAR },
];

/** A triangle by vertex ids, counter-clockwise. */
export interface Tri {
  id: number;
  v: [number, number, number];
}

export interface DState {
  points: NPt[];
  /** Points of the running insert not added yet. */
  pending: NPt[];
  /** Every triangle, the super triangle's scaffolding included. */
  tris: Tri[];
  /** The point being inserted. */
  current: number | null;
  /** Triangles whose circle holds the current point. */
  bad: number[];
  /** The hole's boundary, once the bad triangles are removed: edges as vertex id pairs. */
  hole: [number, number][];
  /** Triangles made by the last insert. */
  fresh: number[];
  /** In-circle tests in the last operation. */
  tests: number;
  nextId: number;
  nextTri: number;
}

export interface DSettings {
  [key: string]: Scalar;
  /** Draw the Voronoi diagram, the dual of the triangulation. */
  voronoi: boolean;
}

export interface DExtra {
  /** The triangle whose circumcircle is being tested, and the verdict. */
  circle?: { tri: number; inside: boolean };
  /** A point found inside a circle during the empty-circle check. */
  intruder?: number;
}

type S = DState;
type X = DExtra;
type Op = OpSpec<S, DSettings, X>;
type DStep = Step<S, X>;

export const defaults: DSettings = { voronoi: false };

export function init(): S {
  return {
    points: [],
    pending: [],
    tris: [{ id: 0, v: [-1, -2, -3] }],
    current: null,
    bad: [],
    hole: [],
    fresh: [],
    tests: 0,
    nextId: 1,
    nextTri: 1,
  };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const ptId = (id: number) => `pt-${id}`;
export const triId = (id: number) => `tri-${id}`;

export function vertex(s: S, id: number): NPt {
  return id < 0
    ? SUPER[-id - 1]!
    : (s.points.find((p) => p.id === id) ?? s.pending.find((p) => p.id === id)!);
}
export const isReal = (t: Tri) => t.v.every((v) => v > 0);
export const realTris = (s: S) => s.tris.filter(isReal);
const triName = (s: S, t: Tri) => t.v.map((v) => vertex(s, v).name).join('');
const triById = (s: S, id: number) => s.tris.find((t) => t.id === id)!;

export function vars(s: S, more: Record<string, Scalar> = {}): Record<string, Scalar> {
  return {
    n: s.points.length,
    triangles: realTris(s).length,
    ...more,
    'circle tests': s.tests,
  };
}

const clean = (s: S): S => ({ ...s, current: null, bad: [], hole: [], fresh: [], tests: 0 });

function oops(s: S, say: string): DStep {
  return { state: s, marks: [], say, lines: [], vars: vars(s), level: 1 };
}

/** Insert p with no steps (Bowyer–Watson), for tests and the code tabs. */
export function insertQuiet(s: S, p: NPt): S {
  const pts = [...s.points, p];
  const look = { ...s, points: pts };
  const bad = s.tris.filter((t) => {
    const [a, b, c] = t.v.map((v) => vertex(look, v)) as [NPt, NPt, NPt];
    return inCircle(a, b, c, p) > 0;
  });
  const hole = boundary(bad);
  let next = s.nextTri;
  const made: Tri[] = hole.map(([u, w]) => ({ id: next++, v: [u, w, p.id] }));
  const gone = new Set(bad.map((t) => t.id));
  return {
    ...s,
    points: pts,
    tris: [...s.tris.filter((t) => !gone.has(t.id)), ...made],
    nextTri: next,
  };
}

/** Edges of the bad triangles that no other bad triangle shares, keeping their direction. */
function boundary(bad: Tri[]): [number, number][] {
  const edges: [number, number][] = bad.flatMap((t) => [
    [t.v[0], t.v[1]] as [number, number],
    [t.v[1], t.v[2]] as [number, number],
    [t.v[2], t.v[0]] as [number, number],
  ]);
  return edges.filter(([u, w]) => !edges.some(([a, b]) => a === w && b === u));
}

const insert: Op = {
  label: 'Insert',
  arity: 1,
  *run(s0, [v], { rng }) {
    const pts = pointsArg(v, rng, MAX, MOST, 0, MAX);
    if (typeof pts === 'string') {
      yield oops(s0, `insert: ${pts}`);
      return s0;
    }
    if (s0.points.length + pts.length > MOST) {
      yield oops(
        s0,
        `insert: there are ${s0.points.length} points and at most ${MOST} fit here. Nothing was inserted.`,
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
        say: `Insert ${incoming.length} points, one at a time: ${incoming.map(at).join(', ')}. The triangulation starts as one huge super triangle around everything.`,
        lines: ['dt.sig'],
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
          say: `${p.name}(${p.x}, ${p.y}) is the same point as ${dup.name}. Skip it.`,
          lines: ['dt.add'],
          vars: vars(s),
          level: 2,
        };
        continue;
      }
      s = {
        ...s,
        points: [...s.points, p],
        pending: s.pending.filter((q) => q.id !== p.id),
        current: p.id,
        bad: [],
        hole: [],
        fresh: [],
      };
      yield {
        state: s,
        marks: [mark(ptId(p.id), 'active')],
        say: `Add ${at(p)}. Which triangles does it spoil? A triangle is bad if ${p.name} falls inside its circumcircle, the circle through its three corners.`,
        lines: ['dt.add'],
        vars: vars(s),
        level: 2,
      };
      for (const t of s.tris) {
        const [a, b, c] = t.v.map((id) => vertex(s, id)) as [NPt, NPt, NPt];
        const inside = inCircle(a, b, c, p) > 0;
        s = { ...s, tests: s.tests + 1, bad: inside ? [...s.bad, t.id] : s.bad };
        const scaffold = !isReal(t);
        yield {
          state: s,
          marks: [mark(ptId(p.id), 'active'), mark(triId(t.id), inside ? 'error' : 'compare')],
          say: `${scaffold ? `The scaffolding triangle ${triName(s, t)}` : `Triangle ${triName(s, t)}`}: ${p.name} is ${inside ? 'inside its circumcircle, so it is bad' : 'outside its circumcircle, so it stays'}.`,
          lines: ['dt.test'],
          vars: vars(s, { bad: s.bad.length }),
          level: 3,
          extra: { circle: { tri: t.id, inside } },
        };
      }
      const hole = boundary(s.bad.map((id) => triById(s, id)));
      yield {
        state: s,
        marks: [mark(ptId(p.id), 'active'), ...s.bad.map((id) => mark(triId(id), 'error'))],
        say: `${s.bad.length} bad triangle${s.bad.length === 1 ? '' : 's'}. ${s.bad.length === 1 ? 'It forms' : 'Together they form'} a hole around ${p.name} with ${hole.length} edges on its boundary.`,
        lines: ['dt.bad'],
        vars: vars(s, { bad: s.bad.length }),
        level: 2,
      };
      const gone = new Set(s.bad);
      s = { ...s, tris: s.tris.filter((t) => !gone.has(t.id)), hole, bad: [] };
      yield {
        state: s,
        marks: [mark(ptId(p.id), 'active')],
        say: `Remove the bad triangles. What is left is a hole that ${p.name} can see all of.`,
        lines: ['dt.remove'],
        vars: vars(s),
        level: 2,
      };
      let tn = s.nextTri;
      const made: Tri[] = hole.map(([u, w]) => ({ id: tn++, v: [u, w, p.id] }));
      s = { ...s, tris: [...s.tris, ...made], nextTri: tn, hole: [], fresh: made.map((t) => t.id) };
      added.push(p.name);
      yield {
        state: s,
        marks: [mark(ptId(p.id), 'new'), ...made.map((t) => mark(triId(t.id), 'new'))],
        say: `Join ${p.name} to every edge of the hole: ${made.length} new triangles. Every circle is empty again.`,
        lines: ['dt.fill'],
        vars: vars(s),
        level: 2,
      };
    }
    s = { ...s, current: null, fresh: [] };
    const n = s.points.length;
    const k = realTris(s).length;
    yield {
      state: s,
      marks: [],
      say: added.length
        ? `Inserted ${added.join(', ')}. ${n} points, ${k} triangle${k === 1 ? '' : 's'} (not counting the ones that touch the super triangle), after ${s.tests} circle tests.`
        : 'Nothing new was inserted.',
      lines: ['dt.done'],
      vars: vars(s),
      level: 1,
    };
    return s;
  },
};

const check: Op = {
  label: 'Check empty circles',
  arity: 0,
  *run(s0) {
    let s = clean(s0);
    const tris = realTris(s);
    if (tris.length === 0) {
      yield oops(
        s,
        'check: there are no triangles yet. Insert at least three points that are not on one line.',
      );
      return s;
    }
    let bad = 0;
    for (const t of tris) {
      const [a, b, c] = t.v.map((id) => vertex(s, id)) as [NPt, NPt, NPt];
      const others = s.points.filter((p) => !t.v.includes(p.id));
      const intruder = others.find((p) => inCircle(a, b, c, p) > 0);
      s = { ...s, tests: s.tests + others.length };
      if (intruder) bad++;
      const on = others.filter((p) => inCircle(a, b, c, p) === 0);
      yield {
        state: s,
        marks: [
          mark(triId(t.id), intruder ? 'error' : 'found'),
          ...(intruder ? [mark(ptId(intruder.id), 'error')] : []),
        ],
        say: intruder
          ? `Triangle ${triName(s, t)}: ${intruder.name} is inside its circle. That should never happen.`
          : `Triangle ${triName(s, t)}: no other point is inside its circle${on.length ? ` (${on.map((p) => p.name).join(', ')} ${on.length === 1 ? 'is' : 'are'} on it: the points are cocircular, and either diagonal would do)` : ''}.`,
        lines: ['ck.test'],
        vars: vars(s),
        level: 3,
        extra: {
          circle: { tri: t.id, inside: !!intruder },
          ...(intruder ? { intruder: intruder.id } : {}),
        },
      };
    }
    yield {
      state: s,
      marks: [],
      say: bad
        ? `${bad} triangle${bad === 1 ? ' has' : 's have'} a point inside the circle.`
        : `All ${tris.length} circles are empty: this is the Delaunay triangulation. ${s.tests} point-in-circle tests.`,
      lines: ['ck.done'],
      vars: vars(s),
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
        ? 'Clear: back to the empty super triangle.'
        : 'Clear: there were no points.',
      lines: [],
      vars: vars(end),
      level: 1,
    };
    return end;
  },
};

export const ops = { insert, check, clear };

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(): PseudoBlock[] {
  return [
    {
      op: 'insert',
      lines: [
        L('dt.sig', 0, 'BOWYER-WATSON(P)', 'To triangulate the points P:'),
        L(
          'dt.super',
          1,
          'T = { a super triangle containing every point }',
          'Start with one huge triangle around everything.',
        ),
        L('dt.add', 1, 'for each point p in P', 'Add the points one at a time:'),
        L(
          'dt.test',
          2,
          'bad = { t in T : p is inside the circumcircle of t }',
          'find every triangle whose circle holds p;',
        ),
        L(
          'dt.bad',
          2,
          'H = boundary edges of the bad triangles',
          'their outline is a hole around p;',
        ),
        L('dt.remove', 2, 'T = T − bad', 'remove them;'),
        L(
          'dt.fill',
          2,
          'for each edge (u, w) of H: add triangle (u, w, p) to T',
          'join p to every edge of the hole.',
        ),
        L(
          'dt.done',
          1,
          'remove triangles that touch the super triangle; return T',
          'Drop the scaffolding.',
        ),
      ],
    },
    {
      op: 'check',
      lines: [
        L(
          'ck.test',
          0,
          'for each triangle t: no point lies inside its circumcircle',
          'Every triangle’s circle is empty of other points.',
        ),
        L('ck.done', 0, 'then T is the Delaunay triangulation', 'That is what makes it Delaunay.'),
      ],
    },
  ];
}

export function initialSay(): string {
  return 'No points yet. Type points such as 2,2 9,3 5,9 6,5 and press Insert, or pick a preset. Turn on the Voronoi option to see the dual.';
}

export function initialVars(state: S) {
  return vars(state);
}

export function describe(state: S): string {
  if (state.points.length === 0 && state.pending.length === 0)
    return 'No points; only the super triangle, far off the drawing.';
  const tris = realTris(state).map((t) => triName(state, t));
  const pts = state.points.map(at).join(', ');
  return `${state.points.length} points: ${pts}. ${tris.length ? `Triangles: ${tris.join(', ')}.` : 'No triangles yet.'}${state.pending.length ? ` Waiting: ${state.pending.map((p) => p.name).join(', ')}.` : ''}`;
}

/** The real triangles as sorted corner lists "x,y x,y x,y", sorted. For tests and code tabs. */
export function triangleList(s: S): string[] {
  return realTris(s)
    .map((t) =>
      t.v
        .map((id) => vertex(s, id))
        .sort((a, b) => a.x - b.x || a.y - b.y)
        .map((p) => `${p.x},${p.y}`)
        .join(' '),
    )
    .sort();
}
