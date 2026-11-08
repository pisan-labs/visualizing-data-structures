/**
 * Page helpers for the flow pages: the input field, the `load` operation, the layout setting
 * (left to right from s to t by default) and the drawing of a network with its flow, or of its
 * residual network.
 *
 * Both pages use the operation names load (network text, the primary button) and run (no
 * value), so compare mode can put them side by side on the same network.
 *
 * API
 *   NetState                 { net }
 *   networkInput(sample)     the controls.input spec
 *   loadNetwork({ ... })     the load operation
 *   layoutSettingFlow()      the 'layout' choice: 'lr' (s on the left, t on the right) plus
 *                            the shared templates
 *   networkLayout(net, t)    a GraphLayout for the network
 *   drawNetwork(net, layout, o)   the network with "f/c" labels (or "f/c $k" with costs), or
 *                            with o.residual its residual network, labels r (or "r $k")
 */
import type {
  Controls,
  MarkRole,
  OpSpec,
  Scalar,
  SettingSpec,
  StageSize,
  Step,
  Value,
} from '../../engine/types';
import {
  GRAPH_TEMPLATES,
  drawGraph,
  edgeId,
  layoutGraph,
  scaleLayout,
  turnLayout,
  type GraphLayout,
  type GraphTemplate,
  type Pt,
  textWidth,
  type VertexLook,
  VERTEX_R,
  weightId,
} from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';
import { overlaps } from '../_paths/overlap';
import { compareNames, keyOf, makeGraph, type Graph } from '../_graph/graph';
import {
  MAX_ARCS,
  endsText,
  flowOn,
  hasArc,
  parseNetwork,
  residualArcs,
  type Flow,
  type Network,
  type ParseOptions,
} from './network';

export interface NetState {
  net: Network;
}

export const MAX_INPUT = 400;

export function networkInput(sample: string, o: ParseOptions = {}): NonNullable<Controls['input']> {
  return {
    label: 'Network',
    placeholder: o.costs ? 'e.g. s>a:4:2, a>t:3:1' : 'e.g. s>a:4, a>t:3, s>t:2',
    maxLength: MAX_INPUT,
    sample,
    parse(token: string): Value | Error {
      const t = token.trim();
      if (!t) return new Error('Type a network, such as s>a:3, a>t:2.');
      const r = parseNetwork(t, o);
      return r instanceof Error ? r : t;
    },
  };
}

export const netVars = (net: Network): Record<string, Scalar> => ({
  V: net.graph.vertices.length,
  E: net.graph.edges.length,
  s: net.s ?? '–',
  t: net.t ?? '–',
});

export interface LoadNetworkOptions {
  parse: ParseOptions;
  /** What to say after a good load, such as "Press Run.". */
  ready(net: Network): string;
  vars?(net: Network): Record<string, Scalar>;
}

export function loadNetwork<Set, X>(o: LoadNetworkOptions): OpSpec<NetState, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const r = parseNetwork(String(arg ?? ''), o.parse);
      if (r instanceof Error) {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${r.message} The network stays as it was.`,
          lines: [],
          level: 1,
          vars: { ...netVars(s.net), ...o.vars?.(s.net) },
        } satisfies Step<NetState, X>;
        return s;
      }
      const next = { net: r };
      const g = r.graph;
      yield {
        state: next,
        marks: [],
        say: `Loaded a network with ${g.vertices.length} ${g.vertices.length === 1 ? 'vertex' : 'vertices'} and ${g.edges.length} ${g.edges.length === 1 ? 'arc' : 'arcs'}. ${endsText(r)}${r.s && r.t ? ` ${o.ready(r)}` : ''}`,
        lines: [],
        level: 1,
        vars: { ...netVars(r), ...o.vars?.(r) },
      } satisfies Step<NetState, X>;
      return next;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Layout

export type FlowTemplate = 'lr' | GraphTemplate;

export function layoutSettingFlow(): SettingSpec {
  return {
    kind: 'choice',
    key: 'layout',
    label: 'Layout',
    options: [{ value: 'lr', label: 'Left to right: s to t' }, ...GRAPH_TEMPLATES],
    help: 'Only the picture changes. The network and the algorithm stay the same.',
  };
}

const COL = 124;
const ROW = 80;
const lrCache = new WeakMap<Network, Map<number, GraphLayout>>();

/**
 * Columns from s to t: s alone on the left, t alone on the right, and every other vertex in the
 * column of its distance from s (arcs either way). Vertices s cannot reach that way go by their
 * distance back from t, and the rest into the middle column. Within a column, vertices are
 * sorted a few times by the average height of their neighbours, which removes most crossings.
 */
function columns(net: Network, spread: number): GraphLayout {
  const hit = lrCache.get(net)?.get(spread);
  if (hit) return hit;
  const g = net.graph;
  const near = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const e of g.edges) {
    near.get(e.u)!.push(e.v);
    near.get(e.v)!.push(e.u);
  }
  const bfs = (from: string | null) => {
    const d = new Map<string, number>();
    if (!from) return d;
    d.set(from, 0);
    const q = [from];
    for (let i = 0; i < q.length; i++)
      for (const v of near.get(q[i]!)!)
        if (!d.has(v)) {
          d.set(v, d.get(q[i]!)! + 1);
          q.push(v);
        }
    return d;
  };
  const fromS = bfs(net.s);
  const fromT = bfs(net.t);
  const inner = g.vertices.filter((v) => v !== net.s && v !== net.t);
  const deepest = Math.max(1, ...inner.map((v) => fromS.get(v) ?? 0));
  const col = new Map<string, number>();
  for (const v of inner) {
    const ds = fromS.get(v);
    const dt = fromT.get(v);
    col.set(
      v,
      ds !== undefined
        ? Math.max(1, ds)
        : dt !== undefined
          ? Math.max(1, deepest + 1 - dt)
          : Math.ceil(deepest / 2),
    );
  }
  const last = Math.max(1, ...[...col.values()]) + 1;
  if (net.s) col.set(net.s, 0);
  if (net.t) col.set(net.t, last);
  const byCol: string[][] = Array.from({ length: last + 1 }, () => []);
  for (const v of g.vertices) byCol[col.get(v)!]!.push(v);
  const y = new Map<string, number>();
  const place = () =>
    byCol.forEach((vs) => vs.forEach((v, i) => y.set(v, (i - (vs.length - 1) / 2) * ROW * spread)));
  place();
  for (let sweep = 0; sweep < 4; sweep++) {
    for (const vs of byCol) {
      const key = new Map(
        vs.map((v) => {
          const ns = near.get(v)!.filter((w) => col.get(w) !== col.get(v));
          const avg = ns.length ? ns.reduce((n, w) => n + y.get(w)!, 0) / ns.length : y.get(v)!;
          return [v, avg];
        }),
      );
      vs.sort((a, b) => key.get(a)! - key.get(b)! || compareNames(a, b));
    }
    place();
  }
  const pos: Record<string, Pt> = {};
  for (const v of g.vertices) pos[v] = { x: col.get(v)! * COL * spread, y: y.get(v)! };
  const r = VERTEX_R;
  const xs = g.vertices.map((v) => pos[v]!.x);
  const ys = g.vertices.map((v) => pos[v]!.y);
  const bounds: Bounds = xs.length
    ? {
        x: Math.min(...xs) - r,
        y: Math.min(...ys) - r,
        w: Math.max(...xs) - Math.min(...xs) + 2 * r,
        h: Math.max(...ys) - Math.min(...ys) + 2 * r,
      }
    : { x: 0, y: 0, w: 0, h: 0 };
  const out = { pos, r, bounds };
  const byNet = lrCache.get(net) ?? new Map<number, GraphLayout>();
  byNet.set(spread, out);
  lrCache.set(net, byNet);
  return out;
}

/** The layout of a network. */
export function networkLayout(net: Network, template: FlowTemplate, spread = 1): GraphLayout {
  if (template === 'lr') return columns(net, spread);
  const base = layoutGraph(net.graph, template);
  return spread === 1 ? base : scaleLayout(base, spread);
}

/**
 * The layouts a view may draw the network with on this stage: networkLayout, and when it is
 * clearly longer one way, the same turned on its side (s on top, t at the bottom, for 'lr'),
 * which a phone may draw larger. Spring layouts turn too; the circle and grid keep their
 * shape. With no stage, only networkLayout, so thumbnails stay.
 */
const TURN_WIDEN = 1.4;
/** A turned network may also come this much shorter from s to t. */
const TURN_SHORTEN = 0.75;

export function networkLayouts(
  net: Network,
  template: FlowTemplate,
  stage?: StageSize,
  spread = 1,
): GraphLayout[] {
  const layout = networkLayout(net, template, spread);
  if (!stage || (template !== 'lr' && template !== 'force')) return [layout];
  const { w, h } = layout.bounds;
  if (Math.max(w, h) <= 1.3 * Math.min(w, h)) return [layout];
  // Turned, a column of vertices becomes a row, and their arcs' labels need more room across
  // than the column had down: widen it (a phone has width to spare when height is short).
  const turned = turnLayout(layout);
  const pos: Record<string, Pt> = {};
  for (const [v, p] of Object.entries(turned.pos)) pos[v] = { x: p.x * TURN_WIDEN, y: p.y };
  const xs = Object.values(pos).map((p) => p.x);
  const r = turned.r;
  const bounds = {
    x: Math.min(...xs) - r,
    y: turned.bounds.y,
    w: Math.max(...xs) - Math.min(...xs) + 2 * r,
    h: turned.bounds.h,
  };
  const side: GraphLayout = { pos, r, bounds };
  // Turned, the column is long and its labels sit beside the arcs, so it may also come shorter.
  const ys = Object.values(pos).map((p) => p.y);
  const top = Math.min(...ys);
  const shortPos: Record<string, Pt> = {};
  for (const [v, p] of Object.entries(pos))
    shortPos[v] = { x: p.x, y: top + (p.y - top) * TURN_SHORTEN };
  const short: GraphLayout = {
    pos: shortPos,
    r,
    bounds: { ...bounds, h: (bounds.h - 2 * r) * TURN_SHORTEN + 2 * r },
  };
  // Only when its labels stay clear at their longest (every arc full, costs shown), drawn as
  // flow or as the residual network, so the choice holds through a run.
  const full: Flow = Object.fromEntries(net.graph.edges.map((e) => [keyOf(e), e.w ?? 1]));
  const clear = (l: GraphLayout) =>
    [false, true].every((residual) =>
      [false, true].every(
        (costs) =>
          overlaps(drawNetwork(net, l, { roles: new Map(), flow: full, residual, costs }).shapes)
            .length === 0,
      ),
    );
  return [layout, ...[side, short].filter(clear)];
}

// ---------------------------------------------------------------------------------------------
// Drawing

export interface DrawNetworkOptions {
  roles: ReadonlyMap<string, MarkRole>;
  flow: Flow;
  /** Draw the residual network instead of the flow. */
  residual?: boolean;
  /** Show costs on the labels. */
  costs?: boolean;
  vertex?(v: string): VertexLook | undefined;
  /** Arcs (u, v) on the current path, as "u-v" keys of residual arcs. */
  path?: string[];
  /** Arcs of the network to mark as cut, by key. */
  cut?: string[];
  note?(v: string): string | undefined;
  pointers?: { name: string; at: string; role?: MarkRole }[];
  /** Fade arcs that carry no flow (when nothing else is going on). */
}

const residualCache = new WeakMap<Network, Map<string, Graph>>();

function residualGraph(net: Network, flow: Flow): Graph {
  const arcs = residualArcs(net, flow);
  const key = arcs.map((a) => `${a.u}-${a.v}:${a.r}`).join(',');
  let byKey = residualCache.get(net);
  if (!byKey) {
    byKey = new Map();
    residualCache.set(net, byKey);
  }
  let g = byKey.get(key);
  if (!g) {
    g = makeGraph({
      directed: true,
      weighted: true,
      vertices: net.graph.vertices,
      edges: arcs.map((a) => ({ u: a.u, v: a.v, w: a.r })),
    });
    if (byKey.size > 200) byKey.clear();
    byKey.set(key, g);
  }
  return g;
}

/** The cost of sending one unit along residual arc (u, v). */
export function residualCost(net: Network, u: string, v: string, flow: Flow): number {
  // A real arc u -> v costs its cost; a reverse arc gives back the cost of v -> u.
  if (hasArc(net, u, v) && !(flowOn(flow, v, u) > 0)) return net.cost[`${u}-${v}`] ?? 1;
  return -(net.cost[`${v}-${u}`] ?? 1);
}

/**
 * Labels such as "12/16" are wider than the weights the graph drawing leaves room for. Move each
 * one straight away from its arc until its box clears the line, to the less crowded side.
 */
function clearLabels(shapes: Shape[]) {
  const normals = new Map<string, { nx: number; ny: number }>();
  const lines = new Map<string, Extract<Shape, { kind: 'arrow' }>[]>();
  const ids = new Set(shapes.map((sh) => sh.id));
  for (const sh of shapes) {
    if (sh.kind !== 'arrow' || !sh.id.startsWith('e-')) continue;
    // A bent arc's first part is "e-u-v-a", but "e-s-a" is the arc into a vertex named a.
    const part = sh.id.endsWith('-a') && ids.has(sh.id.slice(0, -2));
    const key = sh.id.slice(2, part ? -2 : undefined);
    lines.set(key, [...(lines.get(key) ?? []), sh]);
  }
  const texts = shapes.filter(
    (sh): sh is Extract<Shape, { kind: 'text' }> => sh.kind === 'text' && sh.id.startsWith('ew-'),
  );
  const box = (t: Extract<Shape, { kind: 'text' }>) => {
    const size = t.size ?? 13;
    const w = textWidth(t.text, size, false, true) + 4;
    return { x: t.x - w / 2, y: t.y - size, w, h: size + 4 };
  };
  const hit = (a: Bounds, b: Bounds) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const crosses = (b: Bounds, a: Extract<Shape, { kind: 'arrow' }>) => {
    for (let i = 0; i <= 12; i++) {
      const x = a.x1 + ((a.x2 - a.x1) * i) / 12;
      const y = a.y1 + ((a.y2 - a.y1) * i) / 12;
      if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    }
    return false;
  };
  for (const sh of texts) {
    const segs = lines.get(sh.id.slice(3));
    if (!segs) continue;
    const size = sh.size ?? 13;
    // Drawn bold: measure it so.
    const w = textWidth(sh.text, size, false, true) / 2 + 3;
    const h = size / 2 + 2;
    const c = { x: sh.x, y: sh.y - size * 0.35 };
    // The nearest segment, the label's offset from it, and the foot of that offset.
    let best: { d: number; nx: number; ny: number; px: number; py: number } | null = null;
    for (const a of segs) {
      const dx = a.x2 - a.x1;
      const dy = a.y2 - a.y1;
      const len = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((c.x - a.x1) * dx + (c.y - a.y1) * dy) / (len * len)));
      const px = a.x1 + t * dx;
      const py = a.y1 + t * dy;
      const d = Math.hypot(c.x - px, c.y - py);
      let nx = -dy / len;
      let ny = dx / len;
      if ((c.x - px) * nx + (c.y - py) * ny < 0) {
        nx = -nx;
        ny = -ny;
      }
      if (!best || d < best.d) best = { d, nx, ny, px, py };
    }
    if (!best) continue;
    const need = Math.abs(best.nx) * w + Math.abs(best.ny) * h;
    if (best.d < need) {
      const f = best;
      // Clear of the line on its own side, or on the other side when that side is crowded
      // with other labels and arcs.
      const at = (side: number) => ({
        x: f.px + f.nx * need * side,
        y: f.py + f.ny * need * side + size * 0.35,
      });
      const crowd = (side: number) => {
        const b = box({ ...sh, ...at(side) });
        let n = 0;
        for (const o of texts) if (o !== sh && hit(b, box(o))) n += 2;
        for (const [k, ss] of lines)
          if (k !== sh.id.slice(3)) for (const a of ss) if (crosses(b, a)) n += 1;
        return n;
      };
      const side = crowd(-1) < crowd(1) ? -1 : 1;
      Object.assign(sh, at(side));
      if (side < 0) best = { ...best, nx: -best.nx, ny: -best.ny };
    }
    normals.set(sh.id, best);
  }
  // Labels that still overlap each other move apart, each along its own normal.
  const labels = texts.filter((sh) => normals.has(sh.id));
  for (let round = 0; round < 20; round++) {
    let moved = false;
    for (let i = 0; i < labels.length; i++)
      for (let j = i + 1; j < labels.length; j++) {
        const a = box(labels[i]!);
        const b = box(labels[j]!);
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox <= 0 || oy <= 0) continue;
        const by = Math.min(ox, oy) / 2 + 1;
        for (const t of [labels[i]!, labels[j]!]) {
          const n = normals.get(t.id)!;
          t.x += n.nx * by;
          t.y += n.ny * by;
        }
        moved = true;
      }
    if (!moved) break;
  }
}

export function drawNetwork(
  net: Network,
  layout: GraphLayout,
  o: DrawNetworkOptions,
): { shapes: Shape[]; bounds: Bounds } {
  const roles = new Map(o.roles);
  const path = new Set(o.path ?? []);
  const cut = new Set(o.cut ?? []);
  if (o.residual) {
    const g = residualGraph(net, o.flow);
    for (const k of path) {
      roles.set(edgeId(k), 'active');
      roles.set(weightId(k), 'active');
    }
    const drawn = drawGraph(g, layout, {
      roles,
      weights: true,
      vertex: o.vertex,
      // Reverse arcs (no arc of the network goes that way) are dashed.
      edge: (key) => {
        const [u, v] = key.split('-') as [string, string];
        return hasArc(net, u, v) ? undefined : 'seen';
      },
      note: o.note,
      pointers: o.pointers,
    });
    if (o.costs)
      for (const sh of drawn.shapes) {
        if (sh.kind !== 'text' || !sh.id.startsWith('ew-')) continue;
        const [u, v] = sh.id.slice(3).split('-') as [string, string];
        sh.text = `${sh.text} $${residualCost(net, u, v, o.flow)}`;
      }
    clearLabels(drawn.shapes);
    return drawn;
  }
  // The network itself: a path arc used backwards (cancelling flow) is dashed.
  const back = new Set<string>();
  for (const k of path) {
    const [u, v] = k.split('-') as [string, string];
    const forward = hasArc(net, u, v) && !(flowOn(o.flow, v, u) > 0);
    const arc = forward ? k : `${v}-${u}`;
    roles.set(edgeId(arc), 'active');
    roles.set(weightId(arc), 'active');
    if (!forward) back.add(arc);
  }
  for (const k of cut) {
    roles.set(edgeId(k), 'error');
    roles.set(weightId(k), 'error');
  }
  for (const e of net.graph.edges) {
    const k = keyOf(e);
    if (!roles.has(weightId(k)) && flowOn(o.flow, e.u, e.v) > 0) roles.set(weightId(k), 'done');
  }
  const drawn = drawGraph(net.graph, layout, {
    roles,
    weights: true,
    vertex: o.vertex,
    edge: (key) => (back.has(key) ? 'seen' : undefined),
    note: o.note,
    pointers: o.pointers,
  });
  for (const sh of drawn.shapes) {
    if (sh.kind !== 'text' || !sh.id.startsWith('ew-')) continue;
    const key = sh.id.slice(3);
    const [u, v] = key.split('-') as [string, string];
    sh.text = `${flowOn(o.flow, u, v)}/${sh.text}${o.costs ? ` $${net.cost[key] ?? 1}` : ''}`;
  }
  clearLabels(drawn.shapes);
  return drawn;
}

export { MAX_ARCS };
