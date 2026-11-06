/**
 * Graph drawings, shared by every graph page: where vertices go (layout templates), how
 * vertices and edges look (with their algorithm state), and the state panels around them
 * (a queue or stack, tables of d and π, adjacency lists and matrices, edge lists).
 *
 * Graphs are anything shaped like src/viz/_graph/graph.ts's Graph (vertices in name order,
 * edges { u, v, w }), so this file does not depend on a page.
 *
 * Layout templates (a page setting: `layoutSetting()` gives the choice, key 'layout')
 *   'force'    a seeded spring layout (stress majorization on hop distances). The seed comes
 *              from the graph, so the same graph always gets the same picture.
 *   'circle'   vertices clockwise from the top, in name order.
 *   'grid'     rows of ceil(sqrt(n)) in name order (a grid graph lands on its grid).
 *   'layered'  layers top to bottom: longest path from the sources in a directed graph (back
 *              edges set aside, so cycles are fine) and breadth-first layers from the first
 *              vertex in an undirected one. Trees and DAGs come out as trees and DAGs.
 *   Separate pieces (weak components) are laid out on their own and packed side by side.
 *   layoutGraph(g, template) -> { pos: { [vertex]: {x, y} }, r, bounds }. Results are cached.
 *   scaleLayout(layout, k) moves the vertices k times as far apart (circles keep their size),
 *   for a page where the drawing shares the stage with bigger panels.
 *
 * Fitting a laptop and a phone: the stage is about 884 x 305 pixels on a 1366 x 768 laptop
 * and 362 x 585 on a phone in portrait. A scene of about 500 x 420 units keeps 15-unit text
 * near 11 pixels on both; wider scenes shrink on a phone and taller ones on a laptop. Views
 * cannot see the screen, so `placePanels` puts the panels under the graph or beside it,
 * whichever keeps the smaller of the two pictures larger (`fitScore`). Keep panels compact,
 * and reserve room for what grows (a queue, a stack) so the choice holds through a run.
 *
 * Drawing: drawGraph(g, layout, options) -> { shapes, bounds }
 *   Vertices are circles with their names; edges are lines (undirected) or arrows (directed),
 *   with weights beside them when the graph is weighted. An edge that would pass through
 *   another vertex bends around it, and the two arcs of A>B, B>A sit side by side.
 *   State is shown with a shape, a label or a dash as well as a color:
 *     vertex(v): 'frontier'  teal outline plus a dashed ring (in the queue or on the stack)
 *                'visited'   teal outline
 *                'current'   blue, thick outline (pair it with a pointer label such as u)
 *                'done'      green, thick outline and tint (finished, black in CLRS)
 *     edge(key): 'unexamined' faint                'seen'  dashed (looked at, not used)
 *                'tree'       solid, arrowhead from parent(key) to the child, green head
 *                'back' | 'forward' | 'cross'  dashed with the letter B, F or C beside it
 *     note(v): a small badge beside the vertex (a distance, or d/f times).
 *     pointers: labels such as s, u and v placed beside their vertex, away from its edges.
 *   Marks override colors: mark vertexId(v), labelId(v), edgeId(key) or pointerId(name).
 *
 * Shape ids
 *   vertexId(v) "vx-A" circle   labelId(v) "vl-A"   ringId(v) "vr-A"   noteId(v) "vn-A" (+ "-box")
 *   edgeId(key) "e-A-B" the line (the part with the arrowhead when bent; the other part is
 *   "e-A-B-a"), weightId(key) "ew-A-B", kindId(key) "ek-A-B", pointerId(name) "ptr-u".
 *   Edge keys are "u-v" as stored in the graph (u before v when undirected).
 *
 * Panels (each takes x, y, appends shapes, and returns its bounds, so a view can stack them
 * under or beside the graph; `below(bounds)` and `beside(bounds)` give the next spot, and
 * `placePanels` puts a whole block under or beside the graph, whichever reads better):
 *   drawRow       a labeled row of cells: a queue (front first), a visited set, an order.
 *   drawColumn    a labeled stack, top first: the call stack or an explicit stack.
 *   drawTable     columns per vertex and rows such as d, π, color.
 *   drawAdjList   each vertex and its out-neighbours, in name order.
 *   drawAdjMatrix an n x n matrix: row u, column v holds 1 for an edge u -> v (its weight when
 *                 weighted) and 0 for none (blank when weighted, so weight 0 still shows).
 *   drawEdgeList  one row per edge, in the order the graph stores them.
 *   drawLegend    a line of short explanations, such as "B back edge".
 * Panel ids are `${id}-${key}` for a cell and `${id}-${key}-t` for its text, where id is the
 * panel's id and key a vertex, an edge key or a uid. Sizes are in scene units, chosen so a
 * graph of 10 vertices and 15 edges with its queue and table stays readable on a phone.
 */
import { makeRng } from '../engine/rng';
import type { MarkRole, SettingSpec } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export interface GraphLike {
  directed: boolean;
  weighted: boolean;
  vertices: string[];
  edges: { u: string; v: string; w: number }[];
}

export interface Pt {
  x: number;
  y: number;
}

export type GraphTemplate = 'force' | 'circle' | 'grid' | 'layered';

export const GRAPH_TEMPLATES: { value: GraphTemplate; label: string }[] = [
  { value: 'force', label: 'Spring: edges pull, vertices push apart' },
  { value: 'layered', label: 'Layers: top to bottom (trees and DAGs)' },
  { value: 'circle', label: 'Circle: in name order' },
  { value: 'grid', label: 'Grid: rows in name order' },
];

export function layoutSetting(): SettingSpec {
  return {
    kind: 'choice',
    key: 'layout',
    label: 'Layout',
    options: GRAPH_TEMPLATES,
    help: 'Only the picture changes. The graph and the algorithm stay the same.',
  };
}

/** Vertex radius, in scene units. */
export const VERTEX_R = 17;
/** Target length of one edge in the spring and layered layouts. */
const EDGE = 74;
const LAYER_GAP = 72;
const SIBLING_GAP = 62;
const PIECE_GAP = 46;

export interface GraphLayout {
  pos: Record<string, Pt>;
  r: number;
  /** The box around the circles. */
  bounds: Bounds;
}

// ---------------------------------------------------------------------------------------------
// Helpers

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

function boxOf(points: Pt[], pad: number): Bounds {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** The smallest box holding the given boxes (empty ones ignored). */
export function unionBounds(...boxes: Bounds[]): Bounds {
  const real = boxes.filter((b) => b.w > 0 || b.h > 0);
  if (real.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...real.map((b) => b.x));
  const y = Math.min(...real.map((b) => b.y));
  const r = Math.max(...real.map((b) => b.x + b.w));
  const bottom = Math.max(...real.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bottom - y };
}

export const padBounds = (b: Bounds, m: number): Bounds => ({
  x: b.x - m,
  y: b.y - m,
  w: b.w + 2 * m,
  h: b.h + 2 * m,
});

/** The y just under a box, with a gap. */
export const below = (b: Bounds, gap = 18): number => b.y + b.h + gap;
/** The x just right of a box, with a gap. */
export const beside = (b: Bounds, gap = 26): number => b.x + b.w + gap;

/** Rough text width for a font size (glyphs average about 0.6 of the size). */
export const textWidth = (text: string, size: number, mono = false): number =>
  text.length * size * (mono ? 0.6 : 0.58);

/** A 32-bit FNV-1a hash, for seeds that come from a graph. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Undirected neighbour lists (both directions of every edge), in the graph's vertex order. */
function undirectedAdj(g: GraphLike): Map<string, string[]> {
  const index = new Map(g.vertices.map((v, i) => [v, i]));
  const adj = new Map(g.vertices.map((v) => [v, new Set<string>()]));
  for (const e of g.edges) {
    adj.get(e.u)?.add(e.v);
    adj.get(e.v)?.add(e.u);
  }
  return new Map(
    [...adj].map(([v, s]) => [v, [...s].sort((a, b) => index.get(a)! - index.get(b)!)]),
  );
}

/** Weak components in vertex order, each listed in vertex order. */
function pieces(g: GraphLike, adj: Map<string, string[]>): string[][] {
  const index = new Map(g.vertices.map((v, i) => [v, i]));
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const s of g.vertices) {
    if (seen.has(s)) continue;
    const comp = [s];
    seen.add(s);
    for (let k = 0; k < comp.length; k++) {
      for (const v of adj.get(comp[k]!) ?? []) {
        if (!seen.has(v)) {
          seen.add(v);
          comp.push(v);
        }
      }
    }
    out.push(comp.sort((a, b) => index.get(a)! - index.get(b)!));
  }
  return out;
}

/** Hop distances from s inside its piece. */
function hops(s: string, adj: Map<string, string[]>): Map<string, number> {
  const d = new Map([[s, 0]]);
  const q = [s];
  for (let k = 0; k < q.length; k++) {
    const u = q[k]!;
    for (const v of adj.get(u) ?? []) {
      if (!d.has(v)) {
        d.set(v, d.get(u)! + 1);
        q.push(v);
      }
    }
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Spring layout: stress majorization

function stress(names: string[], X: Pt[], D: number[][]): number {
  let s = 0;
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const d = D[i]![j]!;
      const e = dist(X[i]!, X[j]!) - EDGE * d;
      s += (e * e) / (d * d);
    }
  return s;
}

function majorize(X: Pt[], D: number[][], rounds: number): Pt[] {
  const n = X.length;
  const P = X.map((p) => ({ ...p }));
  for (let it = 0; it < rounds; it++) {
    for (let i = 0; i < n; i++) {
      let sx = 0;
      let sy = 0;
      let sw = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = D[i]![j]!;
        const w = 1 / (d * d);
        const dx = P[i]!.x - P[j]!.x;
        const dy = P[i]!.y - P[j]!.y;
        const len = Math.hypot(dx, dy) || 1e-6;
        sx += w * (P[j]!.x + (EDGE * d * dx) / len);
        sy += w * (P[j]!.y + (EDGE * d * dy) / len);
        sw += w;
      }
      P[i] = { x: sx / sw, y: sy / sw };
    }
  }
  return P;
}

/** Turn the drawing so its long axis is horizontal and its first vertex is at the top left. */
function orient(P: Pt[]): Pt[] {
  const n = P.length;
  const cx = P.reduce((s, p) => s + p.x, 0) / n;
  const cy = P.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of P) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const c = Math.cos(-t);
  const s = Math.sin(-t);
  let Q = P.map((p) => ({
    x: (p.x - cx) * c - (p.y - cy) * s,
    y: (p.x - cx) * s + (p.y - cy) * c,
  }));
  // Round off floating-point noise so the same graph draws the same everywhere.
  Q = Q.map((p) => ({ x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 }));
  const first = Q[0]!;
  const fx = first.x > 0.01 ? -1 : 1;
  const fy = first.y > 0.01 ? -1 : 1;
  return Q.map((p) => ({ x: p.x * fx + 0, y: p.y * fy + 0 }));
}

function springPiece(names: string[], adj: Map<string, string[]>, key: string): Pt[] {
  const n = names.length;
  if (n === 1) return [{ x: 0, y: 0 }];
  if (n === 2)
    return [
      { x: 0, y: 0 },
      { x: EDGE, y: 0 },
    ];
  const D = names.map((s) => {
    const d = hops(s, adj);
    return names.map((t) => d.get(t) ?? n);
  });
  const starts: Pt[][] = [
    names.map((_, i) => ({
      x: EDGE * Math.cos((2 * Math.PI * i) / n),
      y: EDGE * Math.sin((2 * Math.PI * i) / n),
    })),
  ];
  const seed = hash(key);
  for (let t = 0; t < 6; t++) {
    const rng = makeRng(seed + t * 7919);
    starts.push(names.map(() => ({ x: rng.next() * EDGE * n, y: rng.next() * EDGE * n })));
  }
  let best: Pt[] = [];
  let bestStress = Infinity;
  for (const s of starts) {
    const P = majorize(s, D, 160);
    const st = stress(names, P, D);
    if (st < bestStress - 1e-6) {
      bestStress = st;
      best = P;
    }
  }
  return orient(best);
}

// ---------------------------------------------------------------------------------------------
// Layered layout

/** Layer numbers inside one piece. */
function layerNumbers(
  g: GraphLike,
  names: string[],
  adj: Map<string, string[]>,
): Map<string, number> {
  if (!g.directed) return hops(names[0]!, adj);
  const inPiece = new Set(names);
  const out = new Map(names.map((v) => [v, [] as string[]]));
  for (const e of g.edges) if (inPiece.has(e.u)) out.get(e.u)!.push(e.v);
  // Depth-first search in name order sets aside the arcs that close cycles (back arcs).
  const color = new Map<string, number>();
  const kept: [string, string][] = [];
  const post: string[] = [];
  const visit = (u: string) => {
    color.set(u, 1);
    for (const v of out.get(u)!) {
      const c = color.get(v) ?? 0;
      if (c === 0) {
        kept.push([u, v]);
        visit(v);
      } else if (c === 2) kept.push([u, v]);
    }
    color.set(u, 2);
    post.push(u);
  };
  for (const v of names) if (!color.get(v)) visit(v);
  const preds = new Map(names.map((v) => [v, [] as string[]]));
  for (const [u, v] of kept) preds.get(v)!.push(u);
  const layer = new Map<string, number>();
  for (const v of post.reverse()) {
    const ps = preds.get(v)!;
    layer.set(v, ps.length ? Math.max(...ps.map((u) => layer.get(u)! + 1)) : 0);
  }
  return layer;
}

/** Isotonic fit: positions as close as possible to `want`, in order, at least `gap` apart. */
function spread(want: number[], gap: number): number[] {
  // x_i = y_i + i * gap with y non-decreasing: pool adjacent violators on want_i - i * gap.
  const blocks: { sum: number; n: number }[] = [];
  want.forEach((w, i) => {
    blocks.push({ sum: w - i * gap, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sum / a.n <= b.sum / b.n) break;
      blocks.splice(-2, 2, { sum: a.sum + b.sum, n: a.n + b.n });
    }
  });
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n + out.length * gap);
  return out;
}

function layeredPiece(g: GraphLike, names: string[], adj: Map<string, string[]>): Pt[] {
  const layer = layerNumbers(g, names, adj);
  const depth = Math.max(...names.map((v) => layer.get(v)!));
  const index = new Map(names.map((v, i) => [v, i]));
  // Links between neighbouring layers, with a dummy point on each layer a long edge crosses.
  type Node = string;
  const rows: Node[][] = Array.from({ length: depth + 1 }, () => []);
  for (const v of names) rows[layer.get(v)!]!.push(v);
  const up = new Map<Node, Node[]>();
  const down = new Map<Node, Node[]>();
  const link = (a: Node, b: Node) => {
    down.set(a, [...(down.get(a) ?? []), b]);
    up.set(b, [...(up.get(b) ?? []), a]);
  };
  let dummies = 0;
  const inPiece = new Set(names);
  for (const e of g.edges) {
    if (!inPiece.has(e.u)) continue;
    let [a, b] = [e.u, e.v];
    if (layer.get(a)! > layer.get(b)!) [a, b] = [b, a];
    const la = layer.get(a)!;
    const lb = layer.get(b)!;
    if (la === lb) continue;
    let prev = a;
    for (let l = la + 1; l < lb; l++) {
      const d = `#${dummies++}`;
      rows[l]!.push(d);
      link(prev, d);
      prev = d;
    }
    link(prev, b);
  }
  // Order each layer by the average position of its neighbours, sweeping down and up.
  const order = new Map<Node, number>();
  rows.forEach((row) => row.forEach((v, i) => order.set(v, i)));
  const tie = (v: Node) => (v.startsWith('#') ? 1e6 + Number(v.slice(1)) : index.get(v)!);
  const crossings = () => {
    let c = 0;
    for (let l = 0; l < depth; l++) {
      const links: [number, number][] = [];
      for (const a of rows[l]!)
        for (const b of down.get(a) ?? []) links.push([order.get(a)!, order.get(b)!]);
      for (let i = 0; i < links.length; i++)
        for (let j = i + 1; j < links.length; j++) {
          const [a1, b1] = links[i]!;
          const [a2, b2] = links[j]!;
          if ((a1 - a2) * (b1 - b2) < 0) c++;
        }
    }
    return c;
  };
  let best = rows.map((r) => [...r]);
  let bestCross = crossings();
  for (let sweep = 0; sweep < 8; sweep++) {
    const goingDown = sweep % 2 === 0;
    const ls = goingDown ? [...rows.keys()].slice(1) : [...rows.keys()].reverse().slice(1);
    for (const l of ls) {
      const row = rows[l]!;
      const bary = new Map(
        row.map((v) => {
          const ns = (goingDown ? up.get(v) : down.get(v)) ?? [];
          return [
            v,
            ns.length ? ns.reduce((s, n) => s + order.get(n)!, 0) / ns.length : order.get(v)!,
          ];
        }),
      );
      row.sort((a, b) => bary.get(a)! - bary.get(b)! || tie(a) - tie(b));
      row.forEach((v, i) => order.set(v, i));
    }
    const c = crossings();
    if (c < bestCross) {
      bestCross = c;
      best = rows.map((r) => [...r]);
    }
  }
  // Coordinates: real vertices only, pulled toward their neighbours, kept in order.
  const real = best.map((r) => r.filter((v) => !v.startsWith('#')));
  const x = new Map<string, number>();
  real.forEach((row) => row.forEach((v, i) => x.set(v, (i - (row.length - 1) / 2) * SIBLING_GAP)));
  const nbrs = (v: string) => (adj.get(v) ?? []).filter((n) => layer.get(n) !== layer.get(v));
  for (let it = 0; it < 6; it++) {
    for (const row of it % 2 === 0 ? real : [...real].reverse()) {
      const want = row.map((v) => {
        const ns = nbrs(v);
        return ns.length ? ns.reduce((s, n) => s + x.get(n)!, 0) / ns.length : x.get(v)!;
      });
      spread(want, SIBLING_GAP).forEach((p, i) => x.set(row[i]!, p));
    }
  }
  return names.map((v) => ({ x: x.get(v)!, y: layer.get(v)! * LAYER_GAP }));
}

// ---------------------------------------------------------------------------------------------
// Templates

/** Pack pieces left to right, wrapping into rows when the drawing gets much wider than tall. */
function pack(parts: { names: string[]; pts: Pt[] }[]): Record<string, Pt> {
  const boxes = parts.map((p) => boxOf(p.pts, VERTEX_R));
  const area = boxes.reduce((s, b) => s + (b.w + PIECE_GAP) * (b.h + PIECE_GAP), 0);
  const maxW = Math.max(...boxes.map((b) => b.w), Math.sqrt(area) * 1.6);
  const pos: Record<string, Pt> = {};
  let x = 0;
  let y = 0;
  let rowH = 0;
  parts.forEach((p, k) => {
    const b = boxes[k]!;
    if (x > 0 && x + b.w > maxW) {
      x = 0;
      y += rowH + PIECE_GAP;
      rowH = 0;
    }
    p.names.forEach((v, i) => {
      pos[v] = { x: p.pts[i]!.x - b.x + x, y: p.pts[i]!.y - b.y + y };
    });
    x += b.w + PIECE_GAP;
    rowH = Math.max(rowH, b.h);
  });
  return pos;
}

function circleLayout(g: GraphLike): Record<string, Pt> {
  const n = g.vertices.length;
  const R = n <= 1 ? 0 : Math.max(EDGE * 0.6, 35 / Math.sin(Math.PI / n));
  const pos: Record<string, Pt> = {};
  g.vertices.forEach((v, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    pos[v] = {
      x: Math.round(R * Math.cos(a) * 100) / 100,
      y: Math.round(R * Math.sin(a) * 100) / 100,
    };
  });
  return pos;
}

function gridLayout(g: GraphLike): Record<string, Pt> {
  const cols = Math.max(1, Math.ceil(Math.sqrt(g.vertices.length)));
  const pos: Record<string, Pt> = {};
  g.vertices.forEach((v, i) => {
    pos[v] = { x: (i % cols) * (EDGE + 6), y: Math.floor(i / cols) * (EDGE + 6) };
  });
  return pos;
}

/** Push apart vertices that ended up too close (rare, but two can land together). */
function separate(pos: Record<string, Pt>, names: string[]): void {
  const min = 2 * VERTEX_R + 16;
  for (let round = 0; round < 20; round++) {
    let moved = false;
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) {
        const a = pos[names[i]!]!;
        const b = pos[names[j]!]!;
        const d = dist(a, b);
        if (d >= min) continue;
        const ux = d > 1e-6 ? (b.x - a.x) / d : 1;
        const uy = d > 1e-6 ? (b.y - a.y) / d : 0;
        const push = (min - d) / 2 + 0.5;
        pos[names[i]!] = { x: a.x - ux * push, y: a.y - uy * push };
        pos[names[j]!] = { x: b.x + ux * push, y: b.y + uy * push };
        moved = true;
      }
    if (!moved) break;
  }
}

const cache = new Map<string, GraphLayout>();

export function layoutGraph(g: GraphLike, template: GraphTemplate): GraphLayout {
  const key = `${template}|${g.directed ? 'd' : 'u'}|${g.vertices.join(',')}|${g.edges
    .map((e) => `${e.u}-${e.v}`)
    .join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let pos: Record<string, Pt>;
  if (template === 'circle') pos = circleLayout(g);
  else if (template === 'grid') pos = gridLayout(g);
  else {
    const adj = undirectedAdj(g);
    pos = pack(
      pieces(g, adj).map((names) => ({
        names,
        pts:
          template === 'layered'
            ? layeredPiece(g, names, adj)
            : springPiece(names, adj, `${key}|${names.join(',')}`),
      })),
    );
    separate(pos, g.vertices);
  }
  const layout: GraphLayout = {
    pos,
    r: VERTEX_R,
    bounds: boxOf(
      g.vertices.map((v) => pos[v]!),
      VERTEX_R,
    ),
  };
  if (cache.size > 400) cache.clear();
  cache.set(key, layout);
  return layout;
}

/** The same layout with the distances between vertices scaled by k (the circles stay). */
export function scaleLayout(layout: GraphLayout, k: number): GraphLayout {
  const pos: Record<string, Pt> = {};
  for (const [v, p] of Object.entries(layout.pos)) pos[v] = { x: p.x * k, y: p.y * k };
  return { pos, r: layout.r, bounds: boxOf(Object.values(pos), layout.r) };
}

// ---------------------------------------------------------------------------------------------
// Drawing the graph

export type VertexLook = 'frontier' | 'visited' | 'current' | 'done';
export type EdgeLook = 'unexamined' | 'seen' | 'tree' | 'back' | 'forward' | 'cross';

export const vertexId = (v: string) => `vx-${v}`;
export const labelId = (v: string) => `vl-${v}`;
export const ringId = (v: string) => `vr-${v}`;
export const noteId = (v: string) => `vn-${v}`;
export const edgeId = (key: string) => `e-${key}`;
export const weightId = (key: string) => `ew-${key}`;
export const kindId = (key: string) => `ek-${key}`;
export const pointerId = (name: string) => `ptr-${name}`;

const LOOK_ROLE: Record<VertexLook, MarkRole> = {
  frontier: 'visit',
  visited: 'visit',
  current: 'active',
  done: 'done',
};

export const KIND_LETTER: Partial<Record<EdgeLook, string>> = {
  back: 'B',
  forward: 'F',
  cross: 'C',
};

export interface DrawGraphOptions {
  /** Roles by shape id, usually from the step's marks. */
  roles?: ReadonlyMap<string, MarkRole>;
  vertex?(v: string): VertexLook | undefined;
  /** How an edge looks, by its key ("u-v" as stored). */
  edge?(key: string): EdgeLook | undefined;
  /** For a tree edge, the end it was found from; its arrowhead points to the other end. */
  parent?(key: string): string | undefined;
  /** A short badge beside a vertex, such as "d=2" or "1/8". */
  note?(v: string): string | undefined;
  /** Labels beside vertices, such as s, u and v. */
  pointers?: { name: string; at: string; role?: MarkRole }[];
  /** Draw weights. Default: when the graph is weighted. */
  weights?: boolean;
  /** Opacity of a whole vertex (circle, name, ring), such as a vertex being removed. */
  fade?(v: string): number | undefined;
}

interface Route {
  /** Untrimmed points from the edge's u to its v (plus a bend point when it bends). */
  pts: Pt[];
  /** A point for labels, and the unit normal there (outward when bent). */
  mid: Pt;
  nx: number;
  ny: number;
}

/** Distance from p to the segment ab. */
function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function clearOf(path: Pt[], others: Pt[], room: number): boolean {
  for (const p of others)
    for (let i = 0; i + 1 < path.length; i++)
      if (segDist(p, path[i]!, path[i + 1]!) < room) return false;
  return true;
}

/** The path from a to b, offset sideways, bent around any vertex in `others` it would touch. */
function route(a: Pt, b: Pt, others: Pt[], offset: number): Route {
  const len = dist(a, b) || 1;
  // Normal to the left of the direction a -> b (y grows downward).
  const nx = (b.y - a.y) / len;
  const ny = -(b.x - a.x) / len;
  const A = { x: a.x + nx * offset, y: a.y + ny * offset };
  const B = { x: b.x + nx * offset, y: b.y + ny * offset };
  const room = VERTEX_R + 5;
  const near = others.filter((p) => segDist(p, A, B) < VERTEX_R + 40);
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  if (clearOf([A, B], near, room)) return { pts: [A, B], mid, nx, ny };
  const sides = offset < 0 ? [-1, 1] : [1, -1];
  for (const h of [VERTEX_R + 12, VERTEX_R + 26, VERTEX_R + 42, VERTEX_R + 60]) {
    for (const side of sides) {
      const c = { x: mid.x + nx * h * side, y: mid.y + ny * h * side };
      if (clearOf([A, c, B], near, room))
        return { pts: [A, c, B], mid: c, nx: nx * side, ny: ny * side };
    }
  }
  return { pts: [A, B], mid, nx, ny };
}

/** Move `from` toward `toward` by `by`. */
function trim(from: Pt, toward: Pt, by: number): Pt {
  const d = dist(from, toward) || 1;
  return { x: from.x + ((toward.x - from.x) * by) / d, y: from.y + ((toward.y - from.y) * by) / d };
}

const NOTE_SIZE = 13;
const POINTER_SIZE = 15;
/** Room kept beside every vertex for a badge, so badges never move as others appear. */
const NOTE_W = textWidth('88/88', NOTE_SIZE, true) + 8;
const NOTE_H = NOTE_SIZE + 5;

export function labelSize(text: string): number {
  return text.length <= 2 ? 16 : 13.5;
}

const overlaps = (a: Bounds, b: Bounds) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function boxHitsCircle(b: Bounds, c: Pt, r: number): boolean {
  const x = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const y = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - x, c.y - y) < r;
}

function boxHitsSegment(b: Bounds, p: Pt, q: Pt): boolean {
  const n = Math.max(2, Math.ceil(dist(p, q) / 4));
  for (let i = 0; i <= n; i++) {
    const x = p.x + ((q.x - p.x) * i) / n;
    const y = p.y + ((q.y - p.y) * i) / n;
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/** The eight directions around a vertex, the ones farthest from its edges first. */
function freeDirections(at: Pt, toward: Pt[]): number[] {
  const angles = toward.map((p) => Math.atan2(p.y - at.y, p.x - at.x));
  // Preferred order when there is a tie: above right, below right, right, above, ...
  const candidates = [-45, 45, 0, -90, 90, -135, 135, 180].map((d) => (d * Math.PI) / 180);
  const gap = (a: number) =>
    angles.length === 0
      ? Math.PI
      : Math.min(
          ...angles.map((b) => {
            const d = Math.abs(a - b) % (2 * Math.PI);
            return d > Math.PI ? 2 * Math.PI - d : d;
          }),
        );
  // Gaps within about 10 degrees of each other count as equal, so the preferred spot wins.
  return candidates
    .map((a, i) => ({ a, g: Math.round(gap(a) / 0.18), i }))
    .sort((p, q) => q.g - p.g || p.i - q.i)
    .map((c) => c.a);
}

/** Edge routes and the spots beside each vertex for its badge and its pointer labels. */
interface Geometry {
  routes: Map<string, Route>;
  /** The direction of each vertex's badge, in radians. */
  note: Map<string, number>;
  pointer: Map<string, { at: Pt; a: number }>;
  labels: Map<string, { weight?: Pt; kind?: Pt }>;
  noteBox(v: string, a: number, w: number): Bounds;
}

const geometryCache = new WeakMap<GraphLayout, Map<string, Geometry>>();

/**
 * Everything about where things go that does not depend on a step: edge routes, the spots for
 * weights and edge letters, and a spot beside every vertex for a badge and for pointers. The
 * spots avoid other vertices, edges, labels and each other, so a badge stays put when others
 * appear.
 */
function geometry(g: GraphLike, layout: GraphLayout, weights: boolean): Geometry {
  const key = `${g.directed}|${weights}|${g.edges.map((e) => `${e.u}-${e.v}`).join(',')}`;
  let byKey = geometryCache.get(layout);
  const hit = byKey?.get(key);
  if (hit) return hit;
  const R = layout.r;
  const pos = layout.pos;
  const arcs = new Set(g.edges.map((e) => `${e.u}>${e.v}`));
  const routes = new Map<string, Route>();
  const labels = new Map<string, { weight?: Pt; kind?: Pt }>();
  const segments: [Pt, Pt][] = [];
  const taken: Bounds[] = [];
  const leaving = new Map(g.vertices.map((v) => [v, [] as Pt[]]));
  for (const e of g.edges) {
    const p = pos[e.u];
    const q = pos[e.v];
    if (!p || !q) continue;
    const k = `${e.u}-${e.v}`;
    const paired = g.directed && arcs.has(`${e.v}>${e.u}`);
    const others = g.vertices.filter((v) => v !== e.u && v !== e.v).map((v) => pos[v]!);
    // The two arcs of a pair each keep to their right of the line between their ends.
    const r = route(p, q, others, paired ? -6 : 0);
    routes.set(k, r);
    for (let i = 0; i + 1 < r.pts.length; i++) segments.push([r.pts[i]!, r.pts[i + 1]!]);
    leaving.get(e.u)!.push(r.pts[1]!);
    leaving.get(e.v)!.push(r.pts[r.pts.length - 2]!);
    // Weight on one side and the edge letter on the other. A paired arc or a bent edge has
    // only one free side (outside the pair, outside the bend), so both go there, apart.
    const bent = r.pts.length > 2;
    const oneSide = paired || bent;
    const s = paired && !bent ? -1 : 1;
    const tx = -r.ny;
    const ty = r.nx;
    const apart = oneSide && weights ? 9 : 0;
    const out = { x: r.mid.x + r.nx * 11 * s, y: r.mid.y + r.ny * 11 * s };
    const spot = {
      weight: weights ? { x: out.x - tx * apart, y: out.y - ty * apart } : undefined,
      kind: oneSide
        ? { x: out.x + tx * apart, y: out.y + ty * apart }
        : { x: r.mid.x - r.nx * 11, y: r.mid.y - r.ny * 11 },
    };
    labels.set(k, spot);
    if (spot.weight) taken.push({ x: spot.weight.x - 10, y: spot.weight.y - 8, w: 20, h: 16 });
  }
  const cost = (b: Bounds, self: string) => {
    let n = 0;
    for (const v of g.vertices) if (v !== self && boxHitsCircle(b, pos[v]!, R + 6)) n += 4;
    for (const [p, q] of segments) if (boxHitsSegment(b, p, q)) n += 1;
    for (const t of taken) if (overlaps(t, b)) n += 3;
    return n;
  };
  const best = (v: string, boxAt: (a: number) => Bounds, skip: (a: number) => boolean) => {
    let pick: { a: number; b: Bounds; n: number } | null = null;
    for (const a of freeDirections(pos[v]!, leaving.get(v)!)) {
      if (skip(a)) continue;
      const b = boxAt(a);
      const n = cost(b, v);
      if (!pick || n < pick.n) pick = { a, b, n };
      if (n === 0) break;
    }
    return pick!;
  };
  /** A badge of width w beside v in direction a, its near side just clear of the circle. */
  const noteBox = (v: string, a: number, w: number): Bounds => {
    const at = pos[v]!;
    const d = R + 4 + Math.max(w * Math.abs(Math.cos(a)), NOTE_H * Math.abs(Math.sin(a))) / 2;
    const c = { x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d };
    return { x: c.x - w / 2, y: c.y - NOTE_H / 2, w, h: NOTE_H };
  };
  const note = new Map<string, number>();
  for (const v of g.vertices) {
    const pick = best(
      v,
      (a) => noteBox(v, a, NOTE_W),
      () => false,
    );
    taken.push(pick.b);
    note.set(v, pick.a);
  }
  const pointer = new Map<string, { at: Pt; a: number }>();
  for (const v of g.vertices) {
    const at = pos[v]!;
    const used = note.get(v)!;
    const pick = best(
      v,
      (a) => {
        const c = { x: at.x + Math.cos(a) * (R + 13), y: at.y + Math.sin(a) * (R + 13) };
        return { x: c.x - 14, y: c.y - 10, w: 28, h: 20 };
      },
      (a) => Math.abs(Math.atan2(Math.sin(a - used), Math.cos(a - used))) < 0.7,
    );
    taken.push(pick.b);
    pointer.set(v, { at: { x: pick.b.x + 14, y: pick.b.y + 10 }, a: pick.a });
  }
  const geo = { routes, note, pointer, labels, noteBox };
  if (!byKey) {
    byKey = new Map();
    geometryCache.set(layout, byKey);
  }
  byKey.set(key, geo);
  return geo;
}

export function drawGraph(
  g: GraphLike,
  layout: GraphLayout,
  o: DrawGraphOptions = {},
): { shapes: Shape[]; bounds: Bounds } {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const R = layout.r;
  const pos = layout.pos;
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [layout.bounds];
  const showWeights = o.weights ?? g.weighted;
  const geo = geometry(g, layout, showWeights);

  for (const e of g.edges) {
    const key = `${e.u}-${e.v}`;
    const r = geo.routes.get(key);
    if (!r) continue;
    const id = edgeId(key);
    const look = o.edge?.(key);
    // A tree edge of an undirected graph found from v is drawn from v, so its head is at u.
    const flip = look === 'tree' && !g.directed && o.parent?.(key) === e.v;
    const head = g.directed || look === 'tree';
    const pts = flip ? [...r.pts].reverse() : r.pts;
    const n = pts.length;
    const drawn = [
      trim(pts[0]!, pts[1]!, R + 1),
      ...pts.slice(1, -1),
      trim(pts[n - 1]!, pts[n - 2]!, head ? R + 2 : R + 1),
    ];
    const role = roles.get(id) ?? (look === 'tree' ? 'done' : undefined);
    const dashed = look === 'seen' || look === 'back' || look === 'forward' || look === 'cross';
    const opacity = look === 'unexamined' ? 0.35 : look === 'seen' ? 0.75 : undefined;
    for (let i = 0; i + 1 < drawn.length; i++) {
      const last = i + 2 === drawn.length;
      shapes.push({
        kind: 'arrow',
        id: last ? id : `${id}-a`,
        x1: drawn[i]!.x,
        y1: drawn[i]!.y,
        x2: drawn[i + 1]!.x,
        y2: drawn[i + 1]!.y,
        head: last && head ? 'end' : 'none',
        dashed,
        role,
        opacity,
      });
    }
    const spot = geo.labels.get(key)!;
    if (showWeights && spot.weight) {
      shapes.push({
        kind: 'text',
        id: weightId(key),
        x: spot.weight.x,
        y: spot.weight.y + 4.5,
        text: String(e.w),
        size: 13,
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(weightId(key)),
        opacity,
      });
    }
    const letter = look ? KIND_LETTER[look] : undefined;
    if (letter && spot.kind) {
      shapes.push({
        kind: 'text',
        id: kindId(key),
        x: spot.kind.x,
        y: spot.kind.y + 5,
        text: letter,
        size: 13.5,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(kindId(key)),
      });
    }
  }

  // Pointer labels by vertex, so two at one vertex sit side by side.
  const pointersAt = new Map<string, { name: string; role?: MarkRole }[]>();
  for (const p of o.pointers ?? []) {
    if (!pos[p.at]) continue;
    pointersAt.set(p.at, [...(pointersAt.get(p.at) ?? []), p]);
  }

  for (const v of g.vertices) {
    const at = pos[v]!;
    const look = o.vertex?.(v);
    const role = roles.get(vertexId(v)) ?? (look ? LOOK_ROLE[look] : undefined);
    const opacity = o.fade?.(v);
    if (look === 'frontier') {
      shapes.push({
        kind: 'circle',
        id: ringId(v),
        x: at.x,
        y: at.y,
        r: R + 5,
        cls: 'ghost',
        role: 'visit',
        opacity,
      });
    }
    shapes.push({
      kind: 'circle',
      id: vertexId(v),
      x: at.x,
      y: at.y,
      r: R,
      cls: 'live',
      role,
      opacity,
    });
    const size = labelSize(v);
    shapes.push({
      kind: 'text',
      id: labelId(v),
      x: at.x,
      y: at.y + size * 0.36,
      text: v,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(labelId(v)) ?? (role === 'active' || role === 'error' ? role : undefined),
      opacity,
    });
    const note = o.note?.(v);
    if (note) {
      const box = geo.noteBox(v, geo.note.get(v)!, textWidth(note, NOTE_SIZE, true) + 8);
      const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      shapes.push({ kind: 'rect', id: `${noteId(v)}-box`, ...box, r: 4, opacity });
      shapes.push({
        kind: 'text',
        id: noteId(v),
        x: c.x,
        y: c.y + NOTE_SIZE * 0.36,
        text: note,
        size: NOTE_SIZE,
        anchor: 'middle',
        mono: true,
        role: roles.get(noteId(v)),
        opacity,
      });
      boxes.push(box);
    }
    const here = pointersAt.get(v);
    if (here) {
      const { at: c, a } = geo.pointer.get(v)!;
      here.forEach((p, i) => {
        const off = (i - (here.length - 1) / 2) * 13;
        // Side by side across the direction they sit in.
        const x = c.x - Math.sin(a) * off;
        const y = c.y + Math.cos(a) * off;
        shapes.push({
          kind: 'text',
          id: pointerId(p.name),
          x,
          y: y + POINTER_SIZE * 0.36,
          text: p.name,
          size: POINTER_SIZE,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: roles.get(pointerId(p.name)) ?? p.role,
          cls: 'pointer',
        });
        boxes.push({ x: x - 6, y: y - 9, w: 12, h: 18 });
      });
    }
  }
  return { shapes, bounds: unionBounds(...boxes) };
}

// ---------------------------------------------------------------------------------------------
// Arranging panels around the graph

/**
 * The stages a picture has to read on: a 1366 x 768 laptop (wide and short) and a phone in
 * portrait (narrow and tall), in pixels.
 */
const STAGES = [
  { w: 884, h: 305 },
  { w: 362, h: 585 },
];

/** How large a scene of this size is drawn on the smaller of the two stages (pixels per unit). */
export function fitScore(b: Bounds): number {
  return Math.min(...STAGES.map((s) => Math.min(s.w / b.w, s.h / b.h)));
}

/** Move shapes by (dx, dy). Where they slide in from stays put: it is a place in the scene. */
export function translate(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map((s) => {
    if (s.kind === 'arrow')
      return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
    if (s.kind === 'polygon')
      return { ...s, points: s.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
    return { ...s, x: s.x + dx, y: s.y + dy };
  });
}

/**
 * Put a block of panels under the graph or beside it, whichever keeps the whole picture larger
 * on both a laptop and a phone (`fitScore`). `draw(shapes, x, y)` draws the block with its top
 * left corner at (x, y) and returns its box; keep its size the same through a run (reserve
 * room for what grows), so the block does not jump between the two places. Beside the graph,
 * the block starts a little lower, clear of the stage's zoom buttons in the top right corner.
 */
export function placePanels(
  shapes: Shape[],
  graph: Bounds,
  draw: (shapes: Shape[], x: number, y: number) => Bounds,
): Bounds {
  const block: Shape[] = [];
  const box = draw(block, 0, 0);
  const under = { x: graph.x - box.x, y: below(graph, 22) - box.y };
  const side = { x: beside(graph, 30) - box.x, y: graph.y + 34 - box.y };
  const total = (p: Pt) =>
    padBounds(unionBounds(graph, { ...box, x: box.x + p.x, y: box.y + p.y }), 14);
  const at = fitScore(total(side)) > fitScore(total(under)) * 1.05 ? side : under;
  shapes.push(...translate(block, at.x, at.y));
  return { ...box, x: box.x + at.x, y: box.y + at.y };
}

// ---------------------------------------------------------------------------------------------
// Panels

export interface PanelCell {
  /** Stable key: a vertex name, an edge key or a uid. */
  key: string;
  text: string;
  role?: MarkRole;
  /** Where the cell slides in from the first time it appears, such as its vertex. */
  from?: Pt;
  /** Faded: an entry that no longer counts. */
  dim?: boolean;
}

const CELL_H = 26;
const CELL_TEXT = 15;
const LABEL_SIZE = 14;

function cellWidth(cells: { text: string }[], min = 30): number {
  return Math.max(min, ...cells.map((c) => textWidth(c.text, CELL_TEXT, true) + 12));
}

function labelText(
  shapes: Shape[],
  id: string,
  text: string,
  x: number,
  y: number,
  size = LABEL_SIZE,
) {
  shapes.push({ kind: 'text', id, x, y, text, size, cls: 'label', mono: true });
}

function cellShapes(
  shapes: Shape[],
  id: string,
  c: PanelCell,
  x: number,
  y: number,
  w: number,
  roles: ReadonlyMap<string, MarkRole>,
  h = CELL_H,
) {
  const rid = `${id}-${c.key}`;
  const role = roles.get(rid) ?? c.role;
  shapes.push({
    kind: 'rect',
    id: rid,
    x,
    y,
    w,
    h,
    r: 5,
    cls: 'live',
    role,
    opacity: c.dim ? 0.45 : undefined,
    enterFrom: c.from && { x: c.from.x - w / 2, y: c.from.y - h / 2 },
  });
  const size = c.text.length <= 3 ? CELL_TEXT : 13;
  shapes.push({
    kind: 'text',
    id: `${rid}-t`,
    x: x + w / 2,
    y: y + h / 2 + size * 0.36,
    text: c.text,
    size,
    anchor: 'middle',
    weight: 'bold',
    mono: c.text.length > 2,
    role: roles.get(`${rid}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
    opacity: c.dim ? 0.45 : undefined,
    enterFrom: c.from && { x: c.from.x, y: c.from.y + 5 },
  });
}

export interface RowOptions {
  /** Prefix for shape ids. */
  id: string;
  label: string;
  cells: PanelCell[];
  x: number;
  y: number;
  roles?: ReadonlyMap<string, MarkRole>;
  /** Cells per line before wrapping. Default 10. */
  perRow?: number;
  /** Width of the label column. Default: the label's width. */
  labelW?: number;
  /** Shown when there are no cells. Default "empty". */
  empty?: string;
  /** Small captions under the first and last cell, such as ['front', 'back']. */
  ends?: [string, string];
  /** Width of every cell. Default: fits the longest text, at least 30. */
  cellW?: number;
}

/** A labeled row of cells (a queue front first, a visited set, an order). */
export function drawRow(shapes: Shape[], o: RowOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const labelW = o.labelW ?? textWidth(o.label, LABEL_SIZE, true) + 10;
  const w = o.cellW ?? cellWidth(o.cells);
  const pitch = w + 4;
  const perRow = Math.max(1, o.perRow ?? 10);
  labelText(shapes, `${o.id}-label`, o.label, o.x, o.y + CELL_H / 2 + 5);
  const x0 = o.x + labelW;
  if (o.cells.length === 0) {
    const text = o.empty ?? 'empty';
    shapes.push({
      kind: 'text',
      id: `${o.id}-empty`,
      x: x0,
      y: o.y + CELL_H / 2 + 5,
      text,
      size: 13,
      cls: 'label',
    });
    return { x: o.x, y: o.y, w: labelW + textWidth(text, 13), h: CELL_H };
  }
  // With captions under the ends, lines leave room for them.
  const linePitch = CELL_H + (o.ends ? 20 : 8);
  let lines = 1;
  o.cells.forEach((c, i) => {
    const line = Math.floor(i / perRow);
    lines = line + 1;
    cellShapes(shapes, o.id, c, x0 + (i % perRow) * pitch, o.y + line * linePitch, w, roles);
  });
  let h = lines * linePitch - (o.ends ? 20 : 8);
  if (o.ends) {
    const last = o.cells.length - 1;
    const capY = o.y + h + 13;
    const cap = (k: number, text: string, sid: string) =>
      shapes.push({
        kind: 'text',
        id: sid,
        x: x0 + (k % perRow) * pitch + w / 2,
        y: o.y + Math.floor(k / perRow) * linePitch + CELL_H + 13,
        text,
        size: 12,
        anchor: 'middle',
        cls: 'label',
      });
    cap(0, last === 0 ? `${o.ends[0]}, ${o.ends[1]}` : o.ends[0], `${o.id}-front`);
    if (last > 0) cap(last, o.ends[1], `${o.id}-back`);
    h = Math.max(h, capY - o.y + 2);
  }
  const shown = Math.min(o.cells.length, perRow);
  return { x: o.x, y: o.y, w: labelW + shown * pitch - 4, h };
}

export interface ColumnOptions {
  id: string;
  label: string;
  /** Bottom first: the last cell is the top of the stack. */
  cells: PanelCell[];
  x: number;
  y: number;
  roles?: ReadonlyMap<string, MarkRole>;
  /** Room to keep for this many cells, so what is drawn below does not move. */
  rows?: number;
  width?: number;
  empty?: string;
}

/** A labeled stack, top first: a call stack or an explicit stack. */
export function drawColumn(shapes: Shape[], o: ColumnOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const w = o.width ?? cellWidth(o.cells, 44);
  const pitch = CELL_H + 4;
  labelText(shapes, `${o.id}-label`, o.label, o.x, o.y + 12);
  const y0 = o.y + 22;
  const n = o.cells.length;
  o.cells.forEach((c, i) => {
    cellShapes(shapes, o.id, c, o.x, y0 + (n - 1 - i) * pitch, w, roles);
  });
  if (n === 0) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-empty`,
      x: o.x,
      y: y0 + 17,
      text: o.empty ?? 'empty',
      size: 13,
      cls: 'label',
    });
  }
  const rows = Math.max(n, o.rows ?? 0, 1);
  return {
    x: o.x,
    y: o.y,
    w: Math.max(w, textWidth(o.label, LABEL_SIZE, true)),
    h: 22 + rows * pitch - 4,
  };
}

export interface TableRow {
  key: string;
  label: string;
  /** One per column, in column order. */
  cells: { text: string; role?: MarkRole }[];
}

export interface TableOptions {
  id: string;
  x: number;
  y: number;
  /** Column keys (usually vertex names), shown as the header row. */
  columns: string[];
  /** Label for the header row, such as "v". */
  head?: string;
  rows: TableRow[];
  roles?: ReadonlyMap<string, MarkRole>;
  /** Columns per block before wrapping into another block below. Default 10. */
  perRow?: number;
}

/**
 * A table with a column per vertex: a header row of names, then rows such as d and π. Cell
 * ids are `${id}-${row}-${column}`; header ids `${id}-h-${column}`.
 */
export function drawTable(shapes: Shape[], o: TableOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const perRow = Math.max(1, o.perRow ?? 10);
  const labels = [o.head ?? '', ...o.rows.map((r) => r.label)];
  const labelW = Math.max(...labels.map((l) => textWidth(l, LABEL_SIZE, true))) + 10;
  const all = [...o.columns.map((c) => ({ text: c })), ...o.rows.flatMap((r) => r.cells)];
  const w = cellWidth(all, 28);
  const h = 22;
  const blocks = Math.max(1, Math.ceil(o.columns.length / perRow));
  const blockH = (o.rows.length + 1) * (h + 2) + 10;
  for (let b = 0; b < blocks; b++) {
    const cols = o.columns.slice(b * perRow, (b + 1) * perRow);
    const y = o.y + b * blockH;
    if (o.head) labelText(shapes, `${o.id}-h-label${b ? `-${b}` : ''}`, o.head, o.x, y + h / 2 + 5);
    o.rows.forEach((r, k) => {
      labelText(
        shapes,
        `${o.id}-${r.key}-label${b ? `-${b}` : ''}`,
        r.label,
        o.x,
        y + (k + 1) * (h + 2) + h / 2 + 5,
      );
    });
    cols.forEach((c, i) => {
      const x = o.x + labelW + i * (w + 2);
      const col = b * perRow + i;
      shapes.push({
        kind: 'text',
        id: `${o.id}-h-${c}`,
        x: x + w / 2,
        y: y + h / 2 + 5.5,
        text: c,
        size: 15,
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`${o.id}-h-${c}`),
      });
      o.rows.forEach((r, k) => {
        const cell = r.cells[col] ?? { text: '' };
        const rid = `${o.id}-${r.key}-${c}`;
        const role = roles.get(rid) ?? cell.role;
        const cy = y + (k + 1) * (h + 2);
        shapes.push({ kind: 'rect', id: rid, x, y: cy, w, h, r: 3, cls: 'live', role });
        shapes.push({
          kind: 'text',
          id: `${rid}-t`,
          x: x + w / 2,
          y: cy + h / 2 + 5,
          text: cell.text,
          size: cell.text.length <= 3 ? 14 : 12,
          anchor: 'middle',
          mono: true,
          role: roles.get(`${rid}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
        });
      });
    });
  }
  const shown = Math.min(o.columns.length, perRow);
  return { x: o.x, y: o.y, w: labelW + shown * (w + 2) - 2, h: blocks * blockH - 10 };
}

/** A line of short explanations, such as "B back edge", wrapping at maxW. */
export function drawLegend(
  shapes: Shape[],
  o: { id: string; items: string[]; x: number; y: number; maxW: number },
): Bounds {
  const size = 13;
  let x = o.x;
  let y = o.y;
  let right = o.x;
  o.items.forEach((text, i) => {
    const w = textWidth(text, size);
    if (x > o.x && x + w > o.x + o.maxW) {
      x = o.x;
      y += size + 7;
    }
    shapes.push({ kind: 'text', id: `${o.id}-${i}`, x, y: y + size, text, size, cls: 'label' });
    x += w + 16;
    right = Math.max(right, x - 16);
  });
  return { x: o.x, y: o.y, w: right - o.x, h: y - o.y + size + 4 };
}

// ---------------------------------------------------------------------------------------------
// Representations

export interface ReprOptions {
  /** Prefix for shape ids. */
  id: string;
  x: number;
  y: number;
  roles?: ReadonlyMap<string, MarkRole>;
  /** A caption above, such as "adjacency list". */
  title?: string;
}

function title(shapes: Shape[], o: ReprOptions): number {
  if (!o.title) return o.y;
  labelText(shapes, `${o.id}-title`, o.title, o.x, o.y + 13);
  return o.y + 24;
}

/**
 * Each vertex in a box, then its out-neighbours in name order (with ":w" when weighted).
 * Ids: head `${id}-${u}`, entry `${id}-${u}-${v}`, the arrow into the list `${id}-${u}-arrow`.
 */
export function drawAdjList(shapes: Shape[], g: GraphLike, o: ReprOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const y0 = title(shapes, o);
  const lists = new Map(g.vertices.map((v) => [v, [] as { v: string; w: number }[]]));
  for (const e of g.edges) {
    lists.get(e.u)?.push({ v: e.v, w: e.w });
    if (!g.directed) lists.get(e.v)?.push({ v: e.u, w: e.w });
  }
  const index = new Map(g.vertices.map((v, i) => [v, i]));
  const text = (a: { v: string; w: number }) => (g.weighted ? `${a.v}:${a.w}` : a.v);
  const headW = cellWidth(
    g.vertices.map((v) => ({ text: v })),
    30,
  );
  const entryW = cellWidth(
    [...lists.values()].flat().map((a) => ({ text: text(a) })),
    28,
  );
  const pitch = CELL_H + 6;
  let right = o.x + headW;
  g.vertices.forEach((u, k) => {
    const y = y0 + k * pitch;
    cellShapes(shapes, o.id, { key: u, text: u }, o.x, y, headW, roles);
    const list = lists.get(u)!.sort((a, b) => index.get(a.v)! - index.get(b.v)!);
    const x1 = o.x + headW + 24;
    shapes.push({
      kind: 'arrow',
      id: `${o.id}-${u}-arrow`,
      x1: o.x + headW + 2,
      y1: y + CELL_H / 2,
      x2: x1 - 2,
      y2: y + CELL_H / 2,
      role: roles.get(`${o.id}-${u}-arrow`),
      opacity: list.length ? undefined : 0,
    });
    if (list.length === 0) {
      shapes.push({
        kind: 'text',
        id: `${o.id}-${u}-none`,
        x: o.x + headW + 10,
        y: y + CELL_H / 2 + 5,
        text: '(none)',
        size: 12,
        cls: 'label',
      });
      right = Math.max(right, o.x + headW + 50);
    }
    list.forEach((a, i) => {
      const x = x1 + i * (entryW + 3);
      cellShapes(shapes, o.id, { key: `${u}-${a.v}`, text: text(a) }, x, y, entryW, roles);
      right = Math.max(right, x + entryW);
    });
  });
  return { x: o.x, y: o.y, w: right - o.x, h: y0 - o.y + g.vertices.length * pitch - 6 };
}

/**
 * The adjacency matrix: row u, column v holds the weight of u -> v, or 0. Ids: cell
 * `${id}-m-${u}-${v}` (text `-t`), row header `${id}-r-${u}`, column header `${id}-c-${v}`. The
 * cell's own `m` segment keeps it apart from the headers even for vertices named r or c.
 */
export function drawAdjMatrix(shapes: Shape[], g: GraphLike, o: ReprOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const y0 = title(shapes, o);
  const n = g.vertices.length;
  const w = new Map<string, number>();
  for (const e of g.edges) {
    w.set(`${e.u}-${e.v}`, e.w);
    if (!g.directed) w.set(`${e.v}-${e.u}`, e.w);
  }
  const texts = [...w.values()].map((x) => String(x));
  const cw = Math.max(27, ...texts.map((t) => textWidth(t, 15, true) + 8));
  const ch = 25;
  const headW = Math.max(20, ...g.vertices.map((v) => textWidth(v, 15) + 8));
  g.vertices.forEach((v, j) => {
    shapes.push({
      kind: 'text',
      id: `${o.id}-c-${v}`,
      x: o.x + headW + j * cw + cw / 2,
      y: y0 + 14,
      text: v,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`${o.id}-c-${v}`),
    });
  });
  g.vertices.forEach((u, i) => {
    const y = y0 + 20 + i * ch;
    shapes.push({
      kind: 'text',
      id: `${o.id}-r-${u}`,
      x: o.x + headW - 6,
      y: y + ch / 2 + 5,
      text: u,
      size: 15,
      anchor: 'end',
      weight: 'bold',
      role: roles.get(`${o.id}-r-${u}`),
    });
    g.vertices.forEach((v, j) => {
      const cid = `${o.id}-m-${u}-${v}`;
      const value = w.get(`${u}-${v}`);
      const role = roles.get(cid);
      shapes.push({
        kind: 'rect',
        id: cid,
        x: o.x + headW + j * cw,
        y,
        w: cw,
        h: ch,
        r: 0,
        cls: value !== undefined ? 'live' : undefined,
        role,
      });
      shapes.push({
        kind: 'text',
        id: `${cid}-t`,
        x: o.x + headW + j * cw + cw / 2,
        y: y + ch / 2 + 5,
        // A weighted matrix leaves "no edge" blank, so an edge of weight 0 still shows.
        text: value !== undefined ? String(value) : g.weighted ? '' : '0',
        size: 15,
        anchor: 'middle',
        mono: true,
        weight: value !== undefined ? 'bold' : 'normal',
        cls: value !== undefined ? undefined : 'label',
        role: roles.get(`${cid}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
      });
    });
  });
  return { x: o.x, y: o.y, w: headW + n * cw, h: y0 - o.y + 20 + n * ch };
}

/**
 * One row per edge, in stored order: "A B" (and the weight). Ids: `${id}-${key}` per row.
 * Long lists wrap into columns of `perCol`.
 */
export function drawEdgeList(
  shapes: Shape[],
  g: GraphLike,
  o: ReprOptions & { perCol?: number },
): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const y0 = title(shapes, o);
  const perCol = Math.max(1, o.perCol ?? 8);
  const sep = g.directed ? '>' : '-';
  const text = (e: { u: string; v: string; w: number }) =>
    `${e.u}${sep}${e.v}${g.weighted ? `:${e.w}` : ''}`;
  const w = cellWidth(
    g.edges.map((e) => ({ text: text(e) })),
    44,
  );
  const pitch = CELL_H + 4;
  g.edges.forEach((e, i) => {
    const col = Math.floor(i / perCol);
    const row = i % perCol;
    cellShapes(
      shapes,
      o.id,
      { key: `${e.u}-${e.v}`, text: text(e) },
      o.x + col * (w + 10),
      y0 + row * pitch,
      w,
      roles,
    );
  });
  if (g.edges.length === 0) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-none`,
      x: o.x,
      y: y0 + 17,
      text: '(no edges)',
      size: 13,
      cls: 'label',
    });
  }
  const cols = Math.max(1, Math.ceil(g.edges.length / perCol));
  const rows = Math.max(1, Math.min(perCol, g.edges.length));
  return { x: o.x, y: o.y, w: cols * (w + 10) - 10, h: y0 - o.y + rows * pitch - 4 };
}
