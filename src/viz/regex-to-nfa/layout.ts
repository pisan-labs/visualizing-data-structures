/**
 * Where every state goes, and how every arrow runs, for an NFA built from a regular expression.
 * The picture follows the textbook: each fragment is laid out once, inside its parent, so a
 * fragment built early never moves while the rest of the build goes on.
 *
 * Bottom up, in build order, each fragment gets a local frame with its start state at (0, 0)
 * and its main line along y = 0:
 *   concatenation   the two parts side by side, left to right
 *   union           a new start (and, in Thompson's, a new accept) on the main line, with the
 *                   two parts stacked above and below it
 *   star            the part on the main line, the arrow that repeats it curving above, and
 *                   (Thompson) the arrow that skips it curving below
 * An arrow is straight unless a state or a label is in its way, or it repeats a part; then it
 * curves just far enough to clear them (a quadratic curve through `via`).
 *
 * Three shapes of picture come out of it, and the view picks the one that fits the stage:
 *   rows 1      the whole NFA left to right
 *   rows 2, 3   the top-level concatenation wrapped onto 2 or 3 rows; the arrow from the end of
 *               one row runs back under it to the start of the next
 *   down        the one-row picture turned to read top to bottom (x and y swapped)
 */
import { STATE_R, type Pt } from '../../layouts/automaton';
import type { Bounds } from '../../render/scene';
import type { Move } from '../_automata/automaton';
import type { Construction, Frag } from './construct';

/** Between two states joined by an arrow, along the flow. */
export const GAP = 80;
/** Between the boxes of the two parts of a union. */
const VGAP = 20;
/** Between wrapped rows; the arrow from one row to the next runs along its middle. */
const ROW_GAP = 60;
/** How far an arrow stays from the middle of a state it passes. */
const CLEAR = STATE_R + 9;
const LABEL_R = 12;
/** The start arrow's length outside the state. */
const START_TAIL = STATE_R + 38;

export interface Seg {
  a: Pt;
  b: Pt;
  via?: Pt;
}

/** One arrow: one segment (or three, for the arrow between wrapped rows), and its label. */
export interface Path {
  segs: Seg[];
  label: Pt;
}

export interface Picture {
  pos: Record<string, Pt>;
  /** By pairKey(from, to). */
  paths: Record<string, Path>;
  /** Everything drawn, the start arrow included. */
  bounds: Bounds;
  /** The start arrow comes from the left (true) or from above. */
  across: boolean;
  /** 1, 2 or 3 rows, or 0 for the picture turned to read down. */
  rows: number;
  /** The rows' extents in y (one band unless wrapped), for framing a piece row by row. */
  bands: { y1: number; y2: number }[];
}

export const pairKey = (p: string, q: string) => `${p}>${q}`;

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Local {
  pos: Record<string, Pt>;
  paths: Record<string, Path>;
  box: Box;
}

interface Obstacle {
  x: number;
  y: number;
  r: number;
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** A point of the quadratic curve from a through via to b (or the straight line). */
function along(s: Seg, t: number): Pt {
  if (!s.via) return add(s.a, mul(sub(s.b, s.a), t));
  const u = 1 - t;
  return {
    x: u * u * s.a.x + 2 * u * t * s.via.x + t * t * s.b.x,
    y: u * u * s.a.y + 2 * u * t * s.via.y + t * t * s.b.y,
  };
}

const SAMPLES = 24;

function samples(s: Seg, n = SAMPLES): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => along(s, i / n));
}

/** Does the segment between two state centers keep clear of the obstacles? */
function clear(s: Seg, obstacles: Obstacle[]): boolean {
  for (let i = 1; i < SAMPLES; i++) {
    const p = along(s, i / SAMPLES);
    if (dist(p, s.a) < STATE_R + 2 || dist(p, s.b) < STATE_R + 2) continue;
    for (const o of obstacles) if (Math.abs(p.x - o.x) < o.r && dist(p, o) < o.r) return false;
  }
  return true;
}

type Hint = 'up' | 'down' | 'auto';

/**
 * The via point for an arrow from P to Q, or none for a straight one. `force` curves it even
 * when the straight line is clear (an arrow that repeats a part, or skips it).
 */
function route(
  P: Pt,
  Q: Pt,
  obstacles: Obstacle[],
  curves: Obstacle[],
  hint: Hint,
  force: boolean,
): Pt | undefined {
  const others = obstacles.filter((o) => dist(o, P) > 1 && dist(o, Q) > 1);
  if (!force && clear({ a: P, b: Q }, others)) return undefined;
  const d = dist(P, Q);
  const n0 = unit({ x: -(Q.y - P.y), y: Q.x - P.x });
  const m = mid(P, Q);
  const upSide = n0.y < 0 || (n0.y === 0 && n0.x < 0) ? 1 : -1;
  const sides = hint === 'auto' ? [-upSide, upSide] : [hint === 'up' ? upSide : -upSide];
  const c0 = force ? Math.max(30, 0.3 * d) : 0.2 * d;
  const cmax = 2.5 * d + 260;
  const find = (side: number, obs: Obstacle[]) => {
    const n = mul(n0, side);
    for (let c = c0; c <= cmax; c += 6) {
      const via = add(m, mul(n, c));
      if (clear({ a: P, b: Q, via }, obs)) return { via, c };
    }
    return null;
  };
  for (const obs of [[...others, ...curves], others]) {
    const found = sides.map((s) => find(s, obs)).filter((f) => f !== null);
    if (found.length) return found.reduce((b, f) => (f.c < b.c - 18 ? f : b)).via;
  }
  return add(m, mul(n0, sides[0]! * Math.max(c0, 0.45 * d)));
}

/** Clip a segment between two state centers to the circles' edges. */
function clip(P: Pt, Q: Pt, via?: Pt): Seg {
  const a = add(P, mul(unit(sub(via ?? Q, P)), STATE_R));
  const b = add(Q, mul(unit(sub(via ?? P, Q)), STATE_R + 1));
  return via ? { a, b, via } : { a, b };
}

/**
 * Where a label goes: beside the middle of the arrow, on the side away from the main line (at
 * y = axis), or above an arrow along it.
 */
function labelFor(P: Pt, Q: Pt, via?: Pt, axis = 0): Pt {
  const m = mid(P, Q);
  if (via) {
    const top = add(mul(m, 0.5), mul(via, 0.5));
    return add(top, mul(unit(sub(via, m)), 13));
  }
  const n = unit({ x: -(Q.y - P.y), y: Q.x - P.x });
  const outward = Math.abs(m.y - axis) < 1 ? -1 : Math.sign(m.y - axis);
  const flip = n.y === 0 ? (n.x < 0 ? 1 : -1) : Math.sign(n.y) === outward ? 1 : -1;
  return add(m, mul(n, 15 * flip));
}

const DIRS: Pt[] = [
  { x: 0, y: -1 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
];

/** A loop on a state, on the side with the most room (as in drawAutomaton). */
function loopFor(P: Pt, obstacles: Obstacle[]): Path {
  const at = (d: Pt): Path => {
    const n = { x: -d.y, y: d.x };
    const s = add(add(P, mul(d, STATE_R * 0.8)), mul(n, -STATE_R * 0.6));
    const e = add(add(P, mul(d, STATE_R * 0.8)), mul(n, STATE_R * 0.6));
    return {
      segs: [
        {
          a: add(P, mul(unit(sub(s, P)), STATE_R)),
          b: add(P, mul(unit(sub(e, P)), STATE_R + 1)),
          via: add(P, mul(d, STATE_R * 3.3)),
        },
      ],
      label: add(P, mul(d, STATE_R * 2.2 + 12)),
    };
  };
  const room = (p: Path) =>
    Math.min(
      400,
      ...[...samples(p.segs[0]!, 8), p.label].flatMap((q) =>
        obstacles.filter((o) => dist(o, P) > 1).map((o) => dist(q, o) - o.r),
      ),
    );
  return DIRS.map(at).reduce((best, p) => (room(p) > room(best) + 4 ? p : best));
}

function boxOf(pos: Record<string, Pt>, paths: Record<string, Path>, labels = true): Box {
  const b = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  const grow = (p: Pt, rx: number, ry = rx) => {
    b.x1 = Math.min(b.x1, p.x - rx);
    b.x2 = Math.max(b.x2, p.x + rx);
    b.y1 = Math.min(b.y1, p.y - ry);
    b.y2 = Math.max(b.y2, p.y + ry);
  };
  for (const p of Object.values(pos)) grow(p, STATE_R + 3);
  for (const path of Object.values(paths)) {
    for (const s of path.segs) for (const p of samples(s, 12)) grow(p, 3);
    if (labels) grow(path.label, 8, 11);
  }
  return b;
}

function obstaclesOf(local: { pos: Record<string, Pt>; paths: Record<string, Path> }) {
  const obstacles: Obstacle[] = Object.values(local.pos).map((p) => ({ ...p, r: CLEAR }));
  const curves: Obstacle[] = [];
  for (const path of Object.values(local.paths)) {
    obstacles.push({ ...path.label, r: LABEL_R });
    for (const s of path.segs)
      if (s.via) for (const p of samples(s, 8).slice(1, -1)) curves.push({ ...p, r: 8 });
  }
  return { obstacles, curves };
}

function shiftPath(p: Path, d: Pt): Path {
  return {
    segs: p.segs.map((s) => ({
      a: add(s.a, d),
      b: add(s.b, d),
      ...(s.via ? { via: add(s.via, d) } : {}),
    })),
    label: add(p.label, d),
  };
}

/** Copy a part's states and arrows into its parent's frame, moved by d. */
function put(into: Local, part: Local, d: Pt): void {
  for (const [q, p] of Object.entries(part.pos)) into.pos[q] = add(p, d);
  for (const [k, p] of Object.entries(part.paths)) into.paths[k] = shiftPath(p, d);
}

interface Routing {
  move: Move;
  hint?: Hint;
  force?: boolean;
}

/** Route the moves a part added, in order, each clear of everything placed so far. */
function routeAll(local: Local, moves: Routing[], axis = 0): void {
  for (const { move, hint = 'auto', force = false } of moves) {
    const key = pairKey(move.from, move.to);
    if (local.paths[key]) continue;
    const { obstacles, curves } = obstaclesOf(local);
    const P = local.pos[move.from]!;
    if (move.from === move.to) {
      local.paths[key] = loopFor(P, [...obstacles, ...curves]);
      continue;
    }
    const Q = local.pos[move.to]!;
    const via = route(P, Q, obstacles, curves, hint, force);
    local.paths[key] = { segs: [clip(P, Q, via)], label: labelFor(P, Q, via, axis) };
  }
}

const maxX = (l: Local) => Math.max(...Object.values(l.pos).map((p) => p.x));

/** The x at which a part goes, so its box clears a state at x = 0. */
const after = (part: Local, x: number) => Math.max(x, STATE_R + 16 - part.box.x1);

/** Where the second part of a concatenation starts, right of the first. */
const nextX = (a: Local, b: Local) => Math.max(maxX(a) + GAP, a.box.x2 - b.box.x1 + 14);

/** Lay out one fragment from its children's layouts. */
function layoutOne(f: Frag, kids: Local[], kidFrags: Frag[], how: Construction): Local {
  const local: Local = { pos: {}, paths: {}, box: { x1: 0, y1: 0, x2: 0, y2: 0 } };
  const at = (q: string, x: number, y = 0) => (local.pos[q] = { x, y });
  const accept = (f: Frag) => f.accepts[0]!;
  const ys = (a: Local, b: Local) => [-(VGAP / 2 + a.box.y2), VGAP / 2 - b.box.y1] as const;
  let routing: Routing[] = f.added.map((move) => ({ move }));
  const [a, b] = kids;
  const [fa, fb] = kidFrags;
  switch (f.kind) {
    case 'sym':
    case 'eps':
    case 'empty':
      at(f.start, 0);
      if (f.fresh.length === 2)
        at(
          f.fresh.find((q) => q !== f.start)!,
          GAP,
        );
      break;
    case 'concat':
      put(local, a!, { x: 0, y: 0 });
      put(local, b!, { x: nextX(a!, b!), y: 0 });
      break;
    case 'union':
    case 'opt':
      at(f.start, 0);
      if (how === 'thompson' || f.kind === 'union') {
        const [ya, yb] = ys(a!, b ?? a!);
        if (how === 'thompson') {
          const wa = a!.pos[accept(fa!)]!.x;
          const wb = b!.pos[accept(fb!)]!.x;
          const w = Math.max(wa, wb);
          const xa = after(a!, GAP + (w - wa) / 2);
          const xb = after(b!, GAP + (w - wb) / 2);
          put(local, a!, { x: xa, y: ya });
          put(local, b!, { x: xb, y: yb });
          const right = Math.max(xa + a!.box.x2, xb + b!.box.x2);
          at(accept(f), Math.max(GAP + w + GAP, right + STATE_R + 16));
        } else {
          put(local, a!, { x: after(a!, GAP), y: ya });
          put(local, b!, { x: after(b!, GAP), y: yb });
        }
      } else put(local, a!, { x: after(a!, GAP), y: 0 }); // Sipser's R?
      break;
    case 'star':
    case 'plus': {
      if (how === 'thompson') {
        at(f.start, 0);
        const xa = after(a!, GAP);
        put(local, a!, { x: xa, y: 0 });
        at(accept(f), Math.max(maxX(local) + GAP, xa + a!.box.x2 + STATE_R + 16));
        routing = f.added.map((move) => {
          if (move.from === accept(fa!) && move.to === fa!.start)
            return { move, hint: 'up', force: true };
          if (move.from === f.start && move.to === accept(f))
            return { move, hint: 'down', force: true };
          return { move };
        });
      } else {
        if (f.kind === 'star') at(f.start, 0);
        put(local, a!, { x: f.kind === 'star' ? after(a!, GAP) : 0, y: 0 });
        routing = f.added.map((move) =>
          move.to === fa!.start && move.from !== f.start
            ? { move, hint: local.pos[move.from]!.y > 0 ? 'down' : 'up', force: true }
            : { move },
        );
      }
      break;
    }
  }
  if (how === 'sipser' && f.kind === 'concat')
    routing = f.added.map((move) => {
      const y = local.pos[move.from]!.y;
      return { move, hint: y < 0 ? 'up' : y > 0 ? 'down' : 'auto' };
    });
  routeAll(local, routing);
  local.box = boxOf(local.pos, local.paths);
  return local;
}

/** Every fragment's layout in its own frame, bottom up. */
function layoutFrags(frags: readonly Frag[], how: Construction): Local[] {
  const out: Local[] = [];
  for (const f of frags)
    out.push(
      layoutOne(
        f,
        f.kids.map((k) => out[k]!),
        f.kids.map((k) => frags[k]!),
        how,
      ),
    );
  return out;
}

function finish(
  local: Local,
  start: string,
  across: boolean,
  rows: number,
  bands?: { y1: number; y2: number }[],
): Picture {
  const s = local.pos[start]!;
  const b = boxOf(local.pos, local.paths);
  if (across) b.x1 = Math.min(b.x1, s.x - START_TAIL - 4);
  else b.y1 = Math.min(b.y1, s.y - START_TAIL - 4);
  return {
    pos: local.pos,
    paths: local.paths,
    bounds: { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 },
    across,
    rows,
    bands: bands ?? [{ y1: b.y1, y2: b.y2 }],
  };
}

const swap = (p: Pt): Pt => ({ x: p.y, y: p.x });

function transpose(local: Local): Local {
  const pos: Record<string, Pt> = {};
  for (const [q, p] of Object.entries(local.pos)) pos[q] = swap(p);
  const paths: Record<string, Path> = {};
  for (const [k, p] of Object.entries(local.paths))
    paths[k] = {
      segs: p.segs.map((s) => ({
        a: swap(s.a),
        b: swap(s.b),
        ...(s.via ? { via: swap(s.via) } : {}),
      })),
      label: swap(p.label),
    };
  return { pos, paths, box: boxOf(pos, paths) };
}

/**
 * The top-level concatenation on `rows` rows: its factors in order, broken where the widest row
 * is narrowest. Null when there are fewer factors than rows.
 */
function wrapped(
  frags: readonly Frag[],
  locals: Local[],
  rows: number,
): { local: Local; bands: { y1: number; y2: number }[] } | null {
  const factors: number[] = [];
  const joins: number[] = [];
  const flatten = (k: number) => {
    const f = frags[k]!;
    if (f.kind !== 'concat') return factors.push(k);
    flatten(f.kids[0]!);
    factors.push(f.kids[1]!);
    joins.push(k);
  };
  flatten(frags.length - 1);
  if (factors.length < rows) return null;
  // Lay each row out as a concatenation, to measure it.
  const rowOf = (from: number, to: number) => {
    const row: Local = { pos: {}, paths: {}, box: { x1: 0, y1: 0, x2: 0, y2: 0 } };
    let x = 0;
    let prev: Local | null = null;
    for (let i = from; i < to; i++) {
      const part = locals[factors[i]!]!;
      if (prev) x += nextX(prev, part);
      put(row, part, { x, y: 0 });
      prev = part;
    }
    row.box = boxOf(row.pos, row.paths);
    return row;
  };
  const width = (from: number, to: number) => {
    const r = rowOf(from, to);
    return r.box.x2 - r.box.x1;
  };
  let best: number[] = [];
  let bestW = Infinity;
  const n = factors.length;
  const tryBreaks = (breaks: number[]) => {
    const edges = [0, ...breaks, n];
    const w = Math.max(...edges.slice(1).map((e, i) => width(edges[i]!, e)));
    if (w < bestW - 1e-6) {
      bestW = w;
      best = breaks;
    }
  };
  if (rows === 1) tryBreaks([]);
  else if (rows === 2) for (let i = 1; i < n; i++) tryBreaks([i]);
  else for (let i = 1; i < n; i++) for (let j = i + 1; j < n; j++) tryBreaks([i, j]);
  const edges = [0, ...best, n];
  const out: Local = { pos: {}, paths: {}, box: { x1: 0, y1: 0, x2: 0, y2: 0 } };
  const rowStarts = new Set<number>();
  let y = 0;
  const rowsOut: { row: Local; y: number }[] = [];
  for (let r = 0; r < edges.length - 1; r++) {
    const row = rowOf(edges[r]!, edges[r + 1]!);
    const prev = rowsOut.at(-1)?.row;
    if (prev) y += prev.box.y2 + ROW_GAP - row.box.y1;
    put(out, row, { x: 0, y });
    rowsOut.push({ row, y });
    rowStarts.add(edges[r]!);
  }
  // The joins: inside a row an ordinary arrow; from one row to the next, an arrow that leaves
  // the end of the row, runs back under it, and comes into the next row's first state.
  joins.forEach((j, i) => {
    const first = i + 1;
    const f = frags[j]!;
    if (!rowStarts.has(first)) {
      const axis = rowsOut[edges.findLastIndex((e) => e <= first)]!.y;
      routeAll(
        out,
        f.added.map((move) => {
          const y = out.pos[move.from]!.y;
          return { move, hint: y < axis ? 'up' : y > axis ? 'down' : 'auto' };
        }),
        axis,
      );
      return;
    }
    const r = edges.indexOf(first);
    const above = rowsOut[r - 1]!;
    const below = rowsOut[r]!;
    const gapY = above.y + above.row.box.y2 + ROW_GAP / 2;
    const right = above.row.box.x2 + 14;
    const left = Math.min(below.row.box.x1, -STATE_R) - 16;
    for (const move of f.added) {
      const key = pairKey(move.from, move.to);
      if (out.paths[key]) continue;
      const P = out.pos[move.from]!;
      const Q = out.pos[move.to]!;
      const J = { x: right, y: gapY };
      const K = { x: left, y: gapY };
      const { obstacles } = obstaclesOf(out);
      const others = obstacles.filter((o) => dist(o, P) > 1);
      let via: Pt | undefined = { x: J.x, y: P.y };
      if (!clear({ a: P, b: J, via }, others)) via = route(P, J, others, [], 'auto', false);
      const lead = via
        ? { a: add(P, mul(unit(sub(via, P)), STATE_R)), b: J, via }
        : { a: add(P, mul(unit(sub(J, P)), STATE_R)), b: J };
      out.paths[key] = {
        segs: [
          lead,
          { a: J, b: K },
          { a: K, b: { x: Q.x - STATE_R - 1, y: Q.y }, via: { x: K.x, y: Q.y } },
        ],
        label: { x: J.x + 13, y: (P.y + gapY) / 2 },
      };
    }
  });
  out.box = boxOf(out.pos, out.paths);
  const bands = rowsOut.map(({ row, y }) => ({ y1: y + row.box.y1, y2: y + row.box.y2 }));
  return { local: out, bands };
}

const cache = new Map<string, Picture[]>();

/**
 * The pictures to choose from for these fragments: one row, two and three rows when the
 * expression is a concatenation, and the one row turned to read down.
 */
export function pictures(frags: readonly Frag[], how: Construction, key: string): Picture[] {
  const hit = cache.get(`${how}|${key}`);
  if (hit) return hit;
  const locals = layoutFrags(frags, how);
  const top = frags[frags.length - 1]!;
  const one = locals[locals.length - 1]!;
  const out = [finish(one, top.start, true, 1)];
  for (const rows of [2, 3]) {
    const w = top.kind === 'concat' ? wrapped(frags, locals, rows) : null;
    if (w) out.push(finish(w.local, top.start, true, rows, w.bands));
  }
  out.push(finish(transpose(one), top.start, false, 0));
  if (cache.size > 100) cache.clear();
  cache.set(`${how}|${key}`, out);
  return out;
}

/** The box around a set of states and the arrows between them, in a picture. */
export function boxAround(pic: Picture, states: readonly string[], moves: readonly Move[]): Bounds {
  const pos: Record<string, Pt> = {};
  for (const q of states) pos[q] = pic.pos[q]!;
  const paths: Record<string, Path> = {};
  for (const m of moves) {
    const k = pairKey(m.from, m.to);
    paths[k] = pic.paths[k]!;
  }
  const b = boxOf(pos, paths);
  return { x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 };
}
