/**
 * State diagrams, shared by the automata pages: states as circles (an accept state has a
 * second ring), an arrow into the start state, and one arrow per pair of states labeled with
 * every symbol that moves along it ("a,b"). A move from a state to itself is a loop on the
 * side of the state with the most room; when moves go both ways between two states, the two
 * arrows curve apart; an arrow that would pass through a third state curves around it.
 *
 * Layout: breadth-first layers from the start state, in the order the moves are read, so the
 * diagram reads from the start onward. Layers run left to right when `across` (a wide stage)
 * and top to bottom otherwise (a phone). States no move reaches go in a last layer.
 *
 *   layoutStates(a, across)            -> { pos, bounds } (cached per automaton and direction)
 *   layoutFromLayers(layers, across)   -> the same from layers a page chooses itself
 *   fixedLayout(pos, across)           -> the same from positions a page chooses itself
 *   drawAutomaton(a, layout, opts)     -> { shapes, bounds }
 *     opts.roles       marks by shape id (a mark beats a look)
 *     opts.look(q)     'current' (blue, thick), 'dim' (faded), 'dead' (dashed outline)
 *     opts.edge(p, q)  'used' (the arrow just followed, blue), 'dim', or nothing
 *     opts.note(q)     a small badge beside the state, such as the block it is in
 *     opts.prefix      put before every id, so two diagrams can share a scene
 *     opts.startArrow  false leaves out the arrow into the start state
 *     opts.show        draw only some states and moves, each where it is in the whole diagram
 *                      (a diagram that grows: nothing moves as the rest arrives)
 *     opts.route(p, q) the page's own route for an arrow, and optionally its label's place
 *     opts.around      'avoid' routes an arrow blocked by a state around everything in its way
 *                      (src/layouts/route.ts) instead of a fixed bend
 *     opts.label(ms)   an arrow's own label from the moves drawn along it: a string, or lines
 *                      (one per move, say), each with an id of its own if the page marks it
 *   labelBeside(seg, text, toward)     where a label goes beside an arrow, clear of it
 *
 * Labels. Each move label sits beside the middle of its arrow, as close as it can be without
 * touching it, on the outside of a curve and above a level arrow. A label of several lines is
placed as one block, LINE_H apart. When that spot covers a
 * state, another label, or another arrow (a loop included), it slides along the arrow, moves
 * to the other side or further out, whichever costs least. A loop's label sits just past the
 * loop. Labels are placed for the whole diagram, before `show` picks what is drawn, so they
 * stay put while a diagram grows. Notes go on the side of their state that is freest of
 * arrows and labels.
 *
 * Shape ids (use them as mark ids): stateId(q) "s-q0" the circle, "s-q0-t" its name,
 * "s-q0-acc" the accept ring, "s-q0-n" the note, "start" the start arrow, moveId(p, q)
 * "m-q0-q1" the arrow (with "-a", "-b", ... for the pieces before the last of a routed arrow)
 * and "m-q0-q1-t" its label (a label of lines: "m-q0-q1-t", "m-q0-q1-t1", ..., or the ids the
page gives them).
 *
 * Sizes are in scene units: states have radius 22, layers sit 130 apart and states within a
 * layer 96 apart, so a 6-state diagram is about 760 x 250 across and stays readable on a phone
 * drawn down.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { EPS, type Automaton, type Move } from '../viz/_automata/automaton';
import {
  add,
  clipArrow,
  curveLength,
  curvePoint,
  curveSamples,
  curveTangent,
  dist,
  loopArrow,
  mul,
  routeArrow,
  sub,
  unit,
  type Obstacle,
  type Pt,
  type Seg,
} from './route';

export type { Pt, Seg } from './route';

export const STATE_R = 22;
export const LAYER_GAP = 130;
export const ROW_GAP = 96;
export const LABEL_SIZE = 15;
/** The distance between the lines of a label of several lines. */
export const LINE_H = 18;
const NOTE_SIZE = 13;
/** The room left between a label and its arrow. */
const GAP = 5;

export interface StateLayout {
  pos: Record<string, Pt>;
  bounds: Bounds;
  across: boolean;
}

export const stateId = (q: string, prefix = '') => `${prefix}s-${q}`;
export const moveId = (p: string, q: string, prefix = '') => `${prefix}m-${p}-${q}`;

const cache = new Map<string, StateLayout>();

/** Breadth-first layers from the start state; within a layer, in the order states are found. */
export function layers(a: Automaton): string[][] {
  const depth = new Map([[a.start, 0]]);
  const order = [a.start];
  for (let i = 0; i < order.length; i++) {
    const q = order[i]!;
    for (const m of a.moves)
      if (m.from === q && !depth.has(m.to)) {
        depth.set(m.to, depth.get(q)! + 1);
        order.push(m.to);
      }
  }
  const out: string[][] = [];
  for (const q of order) (out[depth.get(q)!] ??= []).push(q);
  const rest = a.states.filter((q) => !depth.has(q));
  if (rest.length) out.push(rest);
  return out;
}

/**
 * A layout from layers a page chooses: layers LAYER_GAP apart, states in a layer ROW_GAP apart,
 * each layer centered on the widest. Across, layers run left to right; down, top to bottom.
 * `tight` (0 to 1) scales both gaps down, for a large automaton that must fit a small stage.
 */
export function layoutFromLayers(
  ls: readonly (readonly string[])[],
  across = true,
  tight = 1,
): StateLayout {
  const layerGap = LAYER_GAP * tight;
  const rowGap = ROW_GAP * tight;
  const widest = Math.max(1, ...ls.map((l) => l.length));
  const pos: Record<string, Pt> = {};
  ls.forEach((layer, i) =>
    layer.forEach((q, j) => {
      const along = i * layerGap;
      const off = (j - (layer.length - 1) / 2) * rowGap + ((widest - 1) / 2) * rowGap;
      pos[q] = across ? { x: along, y: off } : { x: off, y: along };
    }),
  );
  return fixedLayout(pos, across);
}

export function layoutStates(a: Automaton, across = true, tight = 1): StateLayout {
  const key = `${across}|${tight}|${a.start}|${a.states.join(',')}|${a.moves.map((m) => `${m.from}>${m.to}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = layoutFromLayers(layers(a), across, tight);
  if (cache.size > 200) cache.clear();
  cache.set(key, out);
  return out;
}

/**
 * A layout from positions a page chooses itself, such as Thompson's construction placing each
 * fragment inside its parent's. `across` says which side the start arrow comes from.
 */
export function fixedLayout(pos: Record<string, Pt>, across = true): StateLayout {
  const xs = Object.values(pos).map((p) => p.x);
  const ys = Object.values(pos).map((p) => p.y);
  const bounds = {
    x: Math.min(...xs) - STATE_R,
    y: Math.min(...ys) - STATE_R,
    w: Math.max(...xs) - Math.min(...xs) + 2 * STATE_R,
    h: Math.max(...ys) - Math.min(...ys) + 2 * STATE_R,
  };
  return { pos, bounds, across };
}

export type StateLook = 'current' | 'dim' | 'dead';
export type MoveLook = 'used' | 'dim';

/** An arrow a page routes itself. */
export interface ArrowRoute {
  /** Its pieces, in order; only the last has a head. */
  segs: Seg[];
  /** The middle of its label (see labelBeside); left out, the label is placed here. */
  label?: Pt;
}

export interface DrawOptions {
  roles?: ReadonlyMap<string, MarkRole>;
  look?: (q: string) => StateLook | undefined;
  edge?: (p: string, q: string) => MoveLook | undefined;
  note?: (q: string) => string | undefined;
  prefix?: string;
  /** Draw the arrow into the start state (the default). */
  startArrow?: boolean;
  /**
   * Draw only the states and moves these pass; everything keeps the place it has in the whole
   * diagram. An arrow's label lists the symbols of its moves drawn so far. The start arrow
   * comes with the start state, unless `start` is false (not known yet).
   */
  show?: { state?: (q: string) => boolean; move?: (m: Move) => boolean; start?: boolean };
  /** The page's route for the arrow from p to q, or undefined to route it here. */
  route?: (p: string, q: string) => ArrowRoute | undefined;
  /** How an arrow blocked by a state gets past it: a fixed bend, or the least curve that clears. */
  around?: 'bend' | 'avoid';
  /**
   * The label of an arrow, from the moves drawn along it (in the order the automaton lists
   * them): one string, or several lines. Left out, the label lists their symbols, "a,b". The
   * label is placed for all the arrow's moves, so it stays put while a diagram grows. A line
   * takes the arrow's mark only when it is the label's one line; mark the others by their ids.
   */
  label?: (moves: Move[]) => string | LabelLine[];
}

/** A line of a move label, with the id of its text shape (by default the arrow's "-t", "-t1"...). */
export interface LabelLine {
  text: string;
  id?: string;
}

// ---------------------------------------------------------------------------------------------
// Geometry

/** Distance from c to the segment a-b. */
function segDist(a: Pt, b: Pt, c: Pt): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y || 1;
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * ab.x + (c.y - a.y) * ab.y) / l2));
  return Math.hypot(a.x + ab.x * t - c.x, a.y + ab.y * t - c.y);
}

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

const boxAt = (c: Pt, w: number, h: number): Box => ({
  l: c.x - w / 2,
  r: c.x + w / 2,
  t: c.y - h / 2,
  b: c.y + h / 2,
});
const overlaps = (a: Box, b: Box, pad = 0) =>
  a.l < b.r + pad && b.l < a.r + pad && a.t < b.b + pad && b.t < a.b + pad;
const boxDist = (b: Box, p: Pt) =>
  Math.hypot(Math.max(b.l - p.x, 0, p.x - b.r), Math.max(b.t - p.y, 0, p.y - b.b));
/** How far a w x h box reaches from its middle in direction d. */
const reachOf = (d: Pt, w: number, h: number) => (Math.abs(d.x) * w) / 2 + (Math.abs(d.y) * h) / 2;

/** The box a label of this text takes, in mono type of this size. */
export const labelSize = (text: string, size = LABEL_SIZE): { w: number; h: number } => ({
  w: text.length * size * 0.6,
  h: size,
});

/** The box a label of these lines takes, the lines LINE_H apart. */
const blockSize = (lines: readonly LabelLine[]): { w: number; h: number } => ({
  w: Math.max(0, ...lines.map((l) => labelSize(l.text).w)),
  h: lines.length ? LABEL_SIZE + (lines.length - 1) * LINE_H : 0,
});

/** The text's baseline for a label whose box has its middle at y. */
const baseline = (y: number, size: number) => y + size * 0.3;

/**
 * The middle of a label beside an arrow piece, at t along it, on the side of the arrow that
 * `toward` points to, GAP clear of the arrow there.
 */
export function labelBeside(seg: Seg, text: string, toward: Pt, t = 0.5): Pt {
  const T = curveTangent(seg, t);
  const n = { x: -T.y, y: T.x };
  const d = n.x * toward.x + n.y * toward.y < 0 ? mul(n, -1) : n;
  const { w, h } = labelSize(text);
  return add(curvePoint(seg, t), mul(d, GAP + reachOf(d, w, h)));
}

const symbolList = (on: string[]) =>
  [...on].sort((x, y) => (x === EPS ? -1 : y === EPS ? 1 : x < y ? -1 : 1)).join(',');

/** An arrow's label as lines: the page's, or its symbols. */
function labelLines(moves: Move[], o: DrawOptions): LabelLine[] {
  const l = o.label ? o.label(moves) : symbolList(moves.map((m) => m.on));
  return typeof l === 'string' ? [{ text: l }] : l;
}

interface Arrow {
  key: string;
  p: string;
  q: string;
  /** Every move along it. */
  moves: Move[];
  segs: Seg[];
  /** For a loop, the side it is on. */
  loop?: Pt;
  /** A label place the page chose. */
  label?: Pt;
  /** The label for all its moves. */
  lines: LabelLine[];
  /** Its box. */
  size: { w: number; h: number };
  pts: Pt[];
  box: Box;
}

function sampled(segs: Seg[]): { pts: Pt[]; box: Box } {
  const pts = segs.flatMap((s) => curveSamples(s, Math.max(12, Math.ceil(curveLength(s) / 5))));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    pts,
    box: { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) },
  };
}

const withLines = (lines: LabelLine[]) => ({ lines, size: blockSize(lines) });

/** Every arrow's route: the page's, a loop, a straight line, or a curve. */
function arrowsOf(a: Automaton, layout: StateLayout, o: DrawOptions): Arrow[] {
  const { pos } = layout;
  const byPair = new Map<string, Move[]>();
  for (const m of a.moves) {
    const k = `${m.from}\u0000${m.to}`;
    byPair.set(k, [...(byPair.get(k) ?? []), m]);
  }
  const keyOf = (p: string, q: string) => `${p}\u0000${q}`;
  const given = new Map<string, ArrowRoute>();
  for (const k of byPair.keys()) {
    const [p, q] = k.split('\u0000') as [string, string];
    const r = o.route?.(p, q);
    if (r) given.set(k, r);
  }
  // Arrows between two states first, so loops can keep clear of the curved ones.
  const segsOf = new Map<string, Seg[]>();
  const bulges: Pt[] = [];
  const curves: Obstacle[] = [];
  const states: Obstacle[] = a.states.map((q) => ({ ...pos[q]!, r: STATE_R + 9 }));
  for (const [k, moves] of byPair) {
    const { from: p, to: q } = moves[0]!;
    const r = given.get(k);
    if (r) {
      segsOf.set(k, r.segs);
      for (const seg of r.segs)
        if (seg.via) bulges.push(mul(add(add(seg.a, seg.b), mul(seg.via, 2)), 0.25));
      continue;
    }
    if (p === q) continue;
    const P = pos[p]!;
    const Q = pos[q]!;
    const v = unit(sub(Q, P));
    const n = { x: -v.y, y: v.x };
    const back = byPair.has(keyOf(q, p));
    const blocked = a.states.some(
      (s) => s !== p && s !== q && segDist(P, Q, pos[s]!) < STATE_R + 10,
    );
    const d = dist(P, Q);
    const mid = mul(add(P, Q), 0.5);
    let via: Pt | undefined;
    if (back) via = add(mid, mul(n, d * 0.18));
    else if (blocked && o.around === 'avoid')
      via = routeArrow(P, Q, { obstacles: states, curves, r: STATE_R });
    else if (blocked) via = add(mid, mul(n, d * 0.32));
    const seg = clipArrow(P, Q, via, STATE_R);
    segsOf.set(k, [seg]);
    if (via) {
      // The curve's middle is halfway from the chord to the control point.
      bulges.push(mul(add(mid, via), 0.5));
      for (const pt of curveSamples(seg, 8).slice(1, -1)) curves.push({ ...pt, r: 8 });
    }
  }

  // Where each state's loop goes: the side (of up, down, left, right) furthest from its arrows
  // and from any curve that bulges close by.
  const loopDir = (q: string): Pt => {
    const dirs = [
      { x: 0, y: -1 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const others = [...byPair.values()]
      .map((ms) => ms[0]!)
      .filter((m) => (m.from === q) !== (m.to === q))
      .map((m) => unit(sub(pos[m.from === q ? m.to : m.from]!, pos[q]!)));
    if (q === a.start && o.startArrow !== false)
      others.push(layout.across ? { x: -1, y: 0 } : { x: 0, y: -1 });
    for (const b of bulges)
      if (dist(b, pos[q]!) < ROW_GAP * 1.6) others.push(unit(sub(b, pos[q]!)));
    const score = (d: Pt) => Math.min(2, ...others.map((v) => dist(v, d)));
    return dirs.reduce((best, d) => (score(d) > score(best) + 1e-9 ? d : best), dirs[0]!);
  };

  const out: Arrow[] = [];
  for (const [k, moves] of byPair) {
    const { from: p, to: q } = moves[0]!;
    let segs = segsOf.get(k);
    let loop: Pt | undefined;
    if (!segs) {
      loop = loopDir(p);
      segs = [loopArrow(pos[p]!, loop, STATE_R)];
    } else if (p === q && segs.at(-1)!.via) loop = unit(sub(segs.at(-1)!.via!, pos[p]!));
    out.push({
      key: k,
      p,
      q,
      moves,
      segs,
      loop,
      label: given.get(k)?.label,
      ...withLines(labelLines(moves, o)),
      ...sampled(segs),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Labels

const STATE_HIT = 1000;
const LABEL_HIT = 1000;
const ARROW_HIT = 150;
const OWN_HIT = 300;

interface Candidate {
  c: Pt;
  cost: number;
}

/** Places along an arrow for its label, the most natural first. */
function candidates(x: Arrow, pos: Record<string, Pt>): Candidate[] {
  const { w, h } = x.size;
  const out: Candidate[] = [];
  if (x.loop) {
    const P = pos[x.p]!;
    for (const deg of [0, 30, -30, 60, -60, 90, -90]) {
      const th = (deg * Math.PI) / 180;
      const u = {
        x: x.loop.x * Math.cos(th) - x.loop.y * Math.sin(th),
        y: x.loop.x * Math.sin(th) + x.loop.y * Math.cos(th),
      };
      const reach = Math.max(STATE_R, ...x.pts.map((p) => (p.x - P.x) * u.x + (p.y - P.y) * u.y));
      for (const extra of [0, 4, 9])
        out.push({
          c: add(P, mul(u, reach + GAP + reachOf(u, w, h) + extra)),
          cost: Math.abs(deg) * 0.2 + extra * 1.2,
        });
    }
    return out.sort((m, n) => m.cost - n.cost);
  }
  const seg = x.segs.reduce((best, s) => (curveLength(s) > curveLength(best) ? s : best));
  // The side to try first: outside a curve; above a level arrow; to the left of a steep one
  // as it runs (so two arrows between the same states label opposite sides).
  const chord = mul(add(seg.a, seg.b), 0.5);
  for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74]) {
    const T = curveTangent(seg, t);
    const n = { x: -T.y, y: T.x };
    const pref = seg.via
      ? n.x * (seg.via.x - chord.x) + n.y * (seg.via.y - chord.y) < 0
        ? -1
        : 1
      : Math.abs(T.x) >= Math.abs(T.y)
        ? n.y > 0
          ? -1
          : 1
        : 1;
    const P = curvePoint(seg, t);
    for (const side of [pref, -pref]) {
      const d = mul(n, side);
      for (const extra of [0, 4, 9, 15])
        out.push({
          c: add(P, mul(d, GAP + reachOf(d, w, h) + extra)),
          cost: Math.abs(t - 0.5) * 40 + extra * 1.2 + (side === pref ? 0 : 7),
        });
    }
  }
  return out.sort((m, n) => m.cost - n.cost);
}

/** What covering this box costs: states, labels and arrows under it, its own arrow too close. */
function conflicts(
  b: Box,
  own: Arrow | null,
  arrows: readonly Arrow[],
  states: readonly Pt[],
  placed: readonly Box[],
): number {
  let cost = 0;
  for (const s of states) if (boxDist(b, s) < STATE_R + 2) cost += STATE_HIT;
  for (const o of placed) if (overlaps(b, o, 2)) cost += LABEL_HIT;
  for (const x of arrows) {
    if (!overlaps(b, x.box, GAP)) continue;
    const near = x === own ? GAP - 1.5 : 2;
    if (x.pts.some((p) => boxDist(b, p) < near)) cost += x === own ? OWN_HIT : ARROW_HIT;
  }
  return cost;
}

/** The cheapest place, stopping at the first one that covers nothing. */
function cheapest(
  cands: Candidate[],
  w: number,
  h: number,
  cost: (b: Box) => number,
): { c: Pt; box: Box } {
  let best = { c: cands[0]!.c, box: boxAt(cands[0]!.c, w, h), total: Infinity };
  for (const cand of cands) {
    if (cand.cost >= best.total) break;
    const box = boxAt(cand.c, w, h);
    const total = cand.cost + cost(box);
    if (total < best.total) best = { c: cand.c, box, total };
  }
  return best;
}

const labelCache = new Map<string, Map<string, Pt>>();

/** The middle of every arrow's label, placed for the whole diagram (cached by its geometry). */
function placeLabels(
  arrows: Arrow[],
  pos: Record<string, Pt>,
  start: Arrow | null,
): Map<string, Pt> {
  const f = (v: number) => v.toFixed(1);
  const pt = (p: Pt) => `${f(p.x)},${f(p.y)}`;
  const key = [
    Object.entries(pos)
      .map(([q, p]) => `${q}@${pt(p)}`)
      .join(' '),
    start ? start.segs.map((s) => `${pt(s.a)}>${pt(s.b)}`).join('') : '-',
    ...arrows.map(
      (x) =>
        `${x.key}:${x.lines.map((l) => l.text).join('\n')}:${x.segs.map((s) => `${pt(s.a)}${s.via ? `~${pt(s.via)}` : ''}>${pt(s.b)}`).join('|')}${x.label ? `@${pt(x.label)}` : ''}`,
    ),
  ].join(';');
  const hit = labelCache.get(key);
  if (hit) return hit;
  const states = Object.values(pos);
  const obstacles = start ? [...arrows, start] : arrows;
  const out = new Map<string, Pt>();
  const placed: Box[] = [];
  for (const x of arrows)
    if (x.label) {
      out.set(x.key, x.label);
      placed.push(boxAt(x.label, x.size.w, x.size.h));
    }
  // Large labels first: they have fewer places that fit.
  const area = (x: Arrow) => x.size.w * x.size.h;
  const order = arrows
    .filter((x) => !x.label)
    .map((x, i) => ({ x, i }))
    .sort((m, n) => area(n.x) - area(m.x) || m.i - n.i)
    .map(({ x }) => x);
  for (const x of order) {
    const { w, h } = x.size;
    const best = cheapest(candidates(x, pos), w, h, (b) =>
      conflicts(b, x, obstacles, states, placed),
    );
    out.set(x.key, best.c);
    placed.push(best.box);
  }
  if (labelCache.size > 300) labelCache.clear();
  labelCache.set(key, out);
  return out;
}

const NOTE_SIDES: Pt[] = [
  { x: 0, y: 1 },
  { x: 0.71, y: 0.71 },
  { x: -0.71, y: 0.71 },
  { x: 0.71, y: -0.71 },
  { x: -0.71, y: -0.71 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

// ---------------------------------------------------------------------------------------------
// Drawing

export function drawAutomaton(
  a: Automaton,
  layout: StateLayout,
  o: DrawOptions = {},
): { shapes: Shape[]; bounds: Bounds } {
  const pre = o.prefix ?? '';
  const roles = o.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const { pos } = layout;
  const showState = (q: string) => o.show?.state?.(q) ?? true;
  const showMove = (m: Move) => o.show?.move?.(m) ?? true;

  const arrows = arrowsOf(a, layout, o);
  const S = pos[a.start]!;
  const inDir = layout.across ? { x: -1, y: 0 } : { x: 0, y: -1 };
  const startSeg: Seg = { a: add(S, mul(inDir, STATE_R + 34)), b: add(S, mul(inDir, STATE_R + 1)) };
  const start: Arrow | null =
    o.startArrow === false
      ? null
      : {
          key: 'start',
          p: a.start,
          q: a.start,
          moves: [],
          segs: [startSeg],
          ...withLines([]),
          ...sampled([startSeg]),
        };
  const labels = placeLabels(arrows, pos, start);

  const xs: number[] = [];
  const ys: number[] = [];
  const grow = (p: Pt, rx = 0, ry = rx) => {
    xs.push(p.x - rx, p.x + rx);
    ys.push(p.y - ry, p.y + ry);
  };
  const edgeRole = (id: string, look: MoveLook | undefined): MarkRole | undefined =>
    roles.get(id) ?? (look === 'used' ? 'active' : undefined);

  for (const x of arrows) {
    const moves = x.moves.filter(showMove);
    if (!moves.length) continue;
    const id = moveId(x.p, x.q, pre);
    const look = o.edge?.(x.p, x.q);
    const opacity = look === 'dim' ? 0.35 : undefined;
    const role = edgeRole(id, look);
    x.segs.forEach((s, i) => {
      const last = i === x.segs.length - 1;
      shapes.push({
        kind: 'arrow',
        id: last ? id : `${id}-${String.fromCharCode(97 + i)}`,
        x1: s.a.x,
        y1: s.a.y,
        x2: s.b.x,
        y2: s.b.y,
        ...(s.via ? { via: s.via } : {}),
        ...(last ? {} : { head: 'none' as const }),
        role,
        opacity,
      });
    });
    for (const p of x.pts) grow(p, 2);
    const lines = moves.length === x.moves.length ? x.lines : labelLines(moves, o);
    const c = labels.get(x.key)!;
    lines.forEach((l, k) => {
      const lid = l.id ?? `${id}-t${k ? k : ''}`;
      const y = c.y + (k - (lines.length - 1) / 2) * LINE_H;
      shapes.push({
        kind: 'text',
        id: lid,
        x: c.x,
        y: baseline(y, LABEL_SIZE),
        text: l.text,
        size: LABEL_SIZE,
        anchor: 'middle',
        mono: true,
        cls: 'label',
        role: roles.get(lid) ?? (lines.length === 1 ? role : undefined),
        opacity,
      });
    });
    const { w, h } = blockSize(lines);
    grow(c, w / 2 + 2, h / 2 + 1);
  }

  // The start arrow, from the side the layers start on.
  if (start && showState(a.start) && (o.show?.start ?? true)) {
    shapes.push({
      kind: 'arrow',
      id: `${pre}start`,
      x1: startSeg.a.x,
      y1: startSeg.a.y,
      x2: startSeg.b.x,
      y2: startSeg.b.y,
      role: roles.get(`${pre}start`),
    });
    grow(startSeg.a, 4);
  }

  // Notes, on the freest side of their state, clear of every label of the whole diagram.
  const allLabels = arrows.map((x) => boxAt(labels.get(x.key)!, x.size.w, x.size.h));
  const notes: Box[] = [];
  const statePts = a.states.map((q) => pos[q]!);
  const obstacles = start ? [...arrows, start] : arrows;
  for (const q of a.states) {
    if (!showState(q)) continue;
    const p = pos[q]!;
    const id = stateId(q, pre);
    const look = o.look?.(q);
    const role = roles.get(id) ?? (look === 'current' ? 'active' : undefined);
    const opacity = look === 'dim' ? 0.4 : undefined;
    shapes.push({
      kind: 'circle',
      id,
      x: p.x,
      y: p.y,
      r: STATE_R,
      role,
      opacity,
      cls: look === 'dead' ? 'dead-state' : undefined,
    });
    if (a.accept.includes(q))
      shapes.push({
        kind: 'circle',
        id: `${id}-acc`,
        x: p.x,
        y: p.y,
        r: STATE_R - 5,
        role: roles.get(`${id}-acc`) ?? role,
        opacity,
        cls: 'ring',
      });
    const size = q.length > 3 ? 12 : 15;
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: p.x,
      y: p.y + size * 0.35,
      text: q,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`${id}-t`) ?? (role === 'active' ? 'active' : undefined),
      opacity,
    });
    grow(p, STATE_R + 2);
    const note = o.note?.(q);
    if (note) {
      const { w, h } = labelSize(note, NOTE_SIZE);
      const cands = NOTE_SIDES.map((d, i) => ({
        c: add(p, mul(d, STATE_R + 5 + reachOf(d, w, h))),
        cost: i * 2,
      }));
      const best = cheapest(cands, w, h, (b) =>
        conflicts(b, null, obstacles, statePts, [...allLabels, ...notes]),
      );
      notes.push(best.box);
      shapes.push({
        kind: 'text',
        id: `${id}-n`,
        x: best.c.x,
        y: baseline(best.c.y, NOTE_SIZE),
        text: note,
        size: NOTE_SIZE,
        anchor: 'middle',
        mono: true,
        cls: 'label',
        role: roles.get(`${id}-n`),
        opacity,
      });
      grow(best.c, w / 2 + 2, h / 2 + 1);
    }
  }
  if (!xs.length) return { shapes, bounds: { x: layout.bounds.x, y: layout.bounds.y, w: 0, h: 0 } };
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { shapes, bounds: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } };
}
