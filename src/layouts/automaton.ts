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
 *   layoutStates(a, across)        -> { pos, bounds } (cached per automaton and direction)
 *   fixedLayout(pos, across)       -> the same from positions a page chooses itself
 *   drawAutomaton(a, layout, opts) -> { shapes, bounds }
 *     opts.roles      marks by shape id (a mark beats a look)
 *     opts.look(q)    'current' (blue, thick), 'dim' (faded), 'dead' (dashed outline)
 *     opts.edge(p, q) 'used' (the arrow just followed, blue), 'dim', or nothing
 *     opts.note(q)    a small badge under the state, such as the NFA states a DFA state holds
 *     opts.prefix     put before every id, so two diagrams can share a scene
 *
 * Shape ids (use them as mark ids): stateId(q) "s-q0" the circle, "s-q0-t" its name,
 * "s-q0-acc" the accept ring, "s-q0-n" the badge, "start" the start arrow, moveId(p, q)
 * "m-q0-q1" the arrow and "m-q0-q1-t" its label.
 *
 * Sizes are in scene units: states have radius 22, layers sit 130 apart and states within a
 * layer 96 apart, so a 6-state diagram is about 760 x 250 across and stays readable on a phone
 * drawn down.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { EPS, type Automaton } from '../viz/_automata/automaton';

export const STATE_R = 22;
const LAYER_GAP = 130;
const ROW_GAP = 96;
const LABEL_SIZE = 15;

export interface Pt {
  x: number;
  y: number;
}

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

export function layoutStates(a: Automaton, across = true): StateLayout {
  const key = `${across}|${a.start}|${a.states.join(',')}|${a.moves.map((m) => `${m.from}>${m.to}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ls = layers(a);
  const widest = Math.max(...ls.map((l) => l.length));
  const pos: Record<string, Pt> = {};
  ls.forEach((layer, i) =>
    layer.forEach((q, j) => {
      const along = i * LAYER_GAP;
      // Center each layer on the widest; nudge a lone state of an odd layer off the middle line
      // when the layer before has one there too, so a straight run of arrows stays clear of
      // loops and labels.
      const off = (j - (layer.length - 1) / 2) * ROW_GAP + ((widest - 1) / 2) * ROW_GAP;
      pos[q] = across ? { x: along, y: off } : { x: off, y: along };
    }),
  );
  const out = fixedLayout(pos, across);
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

export interface DrawOptions {
  roles?: Map<string, MarkRole>;
  look?: (q: string) => StateLook | undefined;
  edge?: (p: string, q: string) => MoveLook | undefined;
  note?: (q: string) => string | undefined;
  prefix?: string;
}

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Pt) => Math.hypot(v.x, v.y) || 1;
const unit = (v: Pt) => ({ x: v.x / len(v), y: v.y / len(v) });
const along = (p: Pt, v: Pt, d: number) => ({ x: p.x + v.x * d, y: p.y + v.y * d });

/** Distance from c to the segment a-b. */
function segDist(a: Pt, b: Pt, c: Pt): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, ((c.x - a.x) * ab.x + (c.y - a.y) * ab.y) / len(ab) ** 2));
  return Math.hypot(a.x + ab.x * t - c.x, a.y + ab.y * t - c.y);
}

const symbolList = (on: string[]) =>
  [...on].sort((x, y) => (x === EPS ? -1 : y === EPS ? 1 : x < y ? -1 : 1)).join(',');

export function drawAutomaton(
  a: Automaton,
  layout: StateLayout,
  o: DrawOptions = {},
): { shapes: Shape[]; bounds: Bounds } {
  const pre = o.prefix ?? '';
  const roles = o.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const { pos } = layout;
  const pairs = new Map<string, { p: string; q: string; on: string[] }>();
  for (const m of a.moves) {
    const k = `${m.from}\u0000${m.to}`;
    const e = pairs.get(k) ?? { p: m.from, q: m.to, on: [] };
    e.on.push(m.on);
    pairs.set(k, e);
  }
  // Arrows between two states first, so loops can keep clear of the curved ones.
  interface Route {
    start: Pt;
    end: Pt;
    via?: Pt;
    labelAt: Pt;
    /** The middle of a curve, which bulges away from the line between its states. */
    bulge?: Pt;
  }
  const routes = new Map<string, Route>();
  for (const [k, e] of pairs) {
    if (e.p === e.q) continue;
    const P = pos[e.p]!;
    const Q = pos[e.q]!;
    const v = unit(sub(Q, P));
    const n = { x: -v.y, y: v.x };
    const back = pairs.has(`${e.q}\u0000${e.p}`);
    const blocked = a.states.some(
      (r) => r !== e.p && r !== e.q && segDist(P, Q, pos[r]!) < STATE_R + 10,
    );
    const d = len(sub(Q, P));
    const bend = back ? d * 0.18 : blocked ? d * 0.32 : 0;
    const mid = { x: (P.x + Q.x) / 2, y: (P.y + Q.y) / 2 };
    if (bend) {
      const via = along(mid, n, bend);
      // The curve's middle is halfway from the chord to the control point.
      const bulge = along(mid, n, bend / 2);
      routes.set(k, {
        start: along(P, unit(sub(via, P)), STATE_R),
        end: along(Q, unit(sub(via, Q)), STATE_R + 1),
        via,
        labelAt: along(bulge, n, 13),
        bulge,
      });
    } else
      routes.set(k, {
        start: along(P, v, STATE_R),
        end: along(Q, v, -(STATE_R + 1)),
        // Label above a level arrow and beside a steep one.
        labelAt: along(mid, Math.abs(v.x) >= Math.abs(v.y) ? { x: 0, y: -1 } : n, 13),
      });
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
    const others = [...pairs.values()]
      .filter((e) => (e.p === q) !== (e.q === q))
      .map((e) => unit(sub(pos[e.p === q ? e.q : e.p]!, pos[q]!)));
    if (q === a.start) others.push(layout.across ? { x: -1, y: 0 } : { x: 0, y: -1 });
    for (const r of routes.values())
      if (r.bulge && len(sub(r.bulge, pos[q]!)) < ROW_GAP * 1.6)
        others.push(unit(sub(r.bulge, pos[q]!)));
    const score = (d: Pt) => Math.min(2, ...others.map((v) => len(sub(v, d))));
    return dirs.reduce((best, d) => (score(d) > score(best) + 1e-9 ? d : best), dirs[0]!);
  };
  const xs: number[] = [];
  const ys: number[] = [];
  const grow = (p: Pt, r = 0) => {
    xs.push(p.x - r, p.x + r);
    ys.push(p.y - r, p.y + r);
  };
  const edgeRole = (id: string, look: MoveLook | undefined): MarkRole | undefined =>
    roles.get(id) ?? (look === 'used' ? 'active' : undefined);

  for (const e of pairs.values()) {
    const id = moveId(e.p, e.q, pre);
    const look = o.edge?.(e.p, e.q);
    const opacity = look === 'dim' ? 0.35 : undefined;
    const text = symbolList(e.on);
    const P = pos[e.p]!;
    let start: Pt;
    let end: Pt;
    let via: Pt | undefined;
    let labelAt: Pt;
    if (e.p === e.q) {
      const d = loopDir(e.p);
      const n = { x: -d.y, y: d.x };
      start = along(along(P, d, STATE_R * 0.8), n, -STATE_R * 0.6);
      end = along(along(P, d, STATE_R * 0.8), n, STATE_R * 0.6);
      via = along(P, d, STATE_R * 3.3);
      start = along(P, unit(sub(start, P)), STATE_R);
      end = along(P, unit(sub(end, P)), STATE_R + 1);
      const top = along(P, d, STATE_R * 2.2);
      labelAt = along(top, d, 12);
    } else {
      ({ start, end, via, labelAt } = routes.get(`${e.p}\u0000${e.q}`)!);
    }
    shapes.push({
      kind: 'arrow',
      id,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      ...(via ? { via } : {}),
      role: edgeRole(id, look),
      opacity,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: labelAt.x,
      y: labelAt.y + LABEL_SIZE * 0.35,
      text,
      size: LABEL_SIZE,
      anchor: 'middle',
      mono: true,
      cls: 'label',
      role: roles.get(`${id}-t`) ?? edgeRole(id, look),
      opacity,
    });
    grow(labelAt, 14 + text.length * LABEL_SIZE * 0.3);
    if (via) grow({ x: (start.x + end.x) / 4 + via.x / 2, y: (start.y + end.y) / 4 + via.y / 2 });
  }

  // The start arrow, from the side the layers start on.
  const S = pos[a.start]!;
  const inDir = layout.across ? { x: -1, y: 0 } : { x: 0, y: -1 };
  const tail = along(S, inDir, STATE_R + 34);
  shapes.push({
    kind: 'arrow',
    id: `${pre}start`,
    x1: tail.x,
    y1: tail.y,
    x2: along(S, inDir, STATE_R + 1).x,
    y2: along(S, inDir, STATE_R + 1).y,
    role: roles.get(`${pre}start`),
  });
  grow(tail, 4);

  for (const q of a.states) {
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
      const y = p.y + STATE_R + 18;
      shapes.push({
        kind: 'text',
        id: `${id}-n`,
        x: p.x,
        y,
        text: note,
        size: 13,
        anchor: 'middle',
        mono: true,
        cls: 'label',
        role: roles.get(`${id}-n`),
        opacity,
      });
      grow({ x: p.x, y: y - 4 }, note.length * 4 + 4);
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { shapes, bounds: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y } };
}
