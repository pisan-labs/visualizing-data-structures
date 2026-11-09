/**
 * Karger's minimum cut: the graph as loaded, with each super-vertex drawn as a box holding its
 * original vertices. A vertex keeps its circle and name all the way through (so the animation
 * follows it into its box), and an edge keeps its line while it still joins two super-vertices:
 * the lines between two boxes are the multigraph's parallel edges. The edge just picked is
 * blue, the edges that become self-loops with it red, and at the end the cut's edges are red.
 *
 * A box sits at the average place of its members in the graph's own layout, members in rows
 * as they lie there; boxes that would overlap are pushed apart. Beside or under the drawing: the
 * super-vertices, the shuffled order (with that setting), the cut and, after trials, how often
 * each cut size came up.
 */
import { groupRole, type MarkRole, type Step, type StageSize } from '../../engine/types';
import {
  below,
  drawGraph,
  drawRow,
  edgeId,
  layoutGraph,
  padBounds,
  placePanels,
  unionBounds,
  VERTEX_R,
  vertexId,
  type GraphLayout,
  type GraphTemplate,
  type Pt,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { keyOf, type Graph } from '../_graph/graph';
import { drawCounts, monoW, txt } from '../_numbers/draw';
import { bound, crossing, describe, groupsOf, type KgSettings, type KgState } from './model';

/** Distance between the centers of two members in a box. */
const PITCH = 2 * VERTEX_R + 20;
/** Room around the members inside a box, and between two boxes. */
const PAD = 8;
const GAP = 26;
const LINE = 13;

interface Cluster {
  rep: string;
  members: string[];
  cx: number;
  cy: number;
  hw: number;
  hh: number;
  offsets: Map<string, Pt>;
}

const template = (settings: KgSettings): GraphTemplate =>
  (['force', 'layered', 'circle', 'grid'] as const).includes(settings.layout as GraphTemplate)
    ? (settings.layout as GraphTemplate)
    : 'force';

/** Where every vertex goes with these super-vertices, and the boxes around them. */
export function clusterLayout(
  g: Graph,
  group: Record<string, string>,
  base: GraphLayout,
): { layout: GraphLayout; clusters: Cluster[] } {
  const at = (v: string) => base.pos[v]!;
  const clusters: Cluster[] = groupsOf({ graph: g, group }).map(([rep, members]) => {
    const k = members.length;
    const cols = Math.ceil(Math.sqrt(k));
    const rows = Math.ceil(k / cols);
    const byY = [...members].sort((a, b) => at(a).y - at(b).y || at(a).x - at(b).x);
    const offsets = new Map<string, Pt>();
    for (let j = 0; j < rows; j++) {
      const row = byY.slice(j * cols, (j + 1) * cols).sort((a, b) => at(a).x - at(b).x);
      row.forEach((v, i) =>
        offsets.set(v, { x: (i - (row.length - 1) / 2) * PITCH, y: (j - (rows - 1) / 2) * PITCH }),
      );
    }
    const cx = members.reduce((n, v) => n + at(v).x, 0) / k;
    const cy = members.reduce((n, v) => n + at(v).y, 0) / k;
    const hw = ((cols - 1) * PITCH) / 2 + VERTEX_R + PAD;
    const hh = ((rows - 1) * PITCH) / 2 + VERTEX_R + PAD;
    return { rep, members, cx, cy, hw, hh, offsets };
  });
  // Push overlapping boxes apart, along the axis where they overlap least.
  for (let round = 0; round < 60; round++) {
    let moved = false;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const a = clusters[i]!;
        const b = clusters[j]!;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const ox = a.hw + b.hw + GAP - Math.abs(dx);
        const oy = a.hh + b.hh + GAP - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox < oy) {
          const d = (ox / 2 + 0.5) * (dx < 0 ? -1 : 1);
          a.cx -= d;
          b.cx += d;
        } else {
          const d = (oy / 2 + 0.5) * (dy < 0 ? -1 : 1);
          a.cy -= d;
          b.cy += d;
        }
      }
    if (!moved) break;
  }
  const pos: Record<string, Pt> = {};
  for (const c of clusters)
    for (const v of c.members) {
      const o = c.offsets.get(v)!;
      pos[v] = { x: c.cx + o.x, y: c.cy + o.y };
    }
  const boxes = clusters.map((c) => ({
    x: c.cx - c.hw,
    y: c.cy - c.hh,
    w: 2 * c.hw,
    h: 2 * c.hh,
  }));
  return { layout: { pos, r: base.r, bounds: unionBounds(...boxes) }, clusters };
}

const colorOf = (g: Graph, rep: string): MarkRole => groupRole(g.vertices.indexOf(rep) + 1);

const groupCell = (members: string[]) => members.join(members.some((v) => v.length > 1) ? ' ' : '');

function panels(
  out: Shape[],
  s: KgState,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const g = s.graph;
  const parts: Bounds[] = [];
  const groups = groupsOf(s);
  const n = g.vertices.length;
  const longest = groupCell(g.vertices.slice(0, Math.max(1, n - 1)));
  const cellW = Math.max(30, monoW(longest, 13) + 14);
  const perRow = Math.max(1, Math.min(4, Math.floor(300 / (cellW + 4))));
  const row = drawRow(out, {
    id: 'grp',
    label: 'groups',
    labelW: 64,
    cells: groups.map(([rep, members]) => ({
      key: rep,
      text: groupCell(members),
      role: members.length > 1 ? colorOf(g, rep) : undefined,
    })),
    x,
    y,
    roles,
    perRow,
    cellW,
  });
  parts.push(row);
  let next = below(row, 10);
  const rowsMax = Math.ceil(Math.max(1, n) / perRow);
  const reserveRow = rowsMax * 34 - 8;
  next = Math.max(next, y + reserveRow + 10);
  let orderH = 0;
  if (s.order) {
    const ord = drawRow(out, {
      id: 'ord',
      label: 'order',
      labelW: 64,
      cells: s.order.map((k, i) => ({
        key: k,
        text: k,
        role: i === s.at ? ('active' as const) : undefined,
        dim: s.at !== null && i < s.at,
      })),
      x,
      y: next,
      roles,
      perRow: 6,
    });
    parts.push(ord);
    orderH = ord.h + 10;
    next = below(ord, 10);
  }
  const left = crossing(s).length;
  const lines: { text: string; role?: MarkRole }[] = [
    { text: `super-vertices: ${groups.length}, edges left: ${left}` },
  ];
  if (s.cut)
    lines.push({
      text: `cut: ${s.cut.length} ${s.cut.length === 1 ? 'edge' : 'edges'}${
        s.shown && s.minCut !== null
          ? s.cut.length === s.minCut
            ? ' (a minimum cut)'
            : ` (minimum ${s.minCut})`
          : ''
      }`,
      role: s.minCut !== null && s.cut.length === s.minCut ? 'found' : undefined,
    });
  lines.forEach((l, k) =>
    out.push(
      txt(`info-${k}`, x, next + LINE + k * (LINE + 7), l.text, LINE, {
        cls: l.role ? undefined : 'label',
        role: l.role,
      }),
    ),
  );
  parts.push({
    x,
    y: next,
    w: Math.max(...lines.map((l) => monoW(l.text, LINE))),
    h: 2 * (LINE + 7),
  });
  next += 2 * (LINE + 7) + 8;
  let width = Math.max(64 + perRow * (cellW + 4), monoW('cut: 99 edges (minimum 99)', LINE));
  if (s.stats) {
    const st = s.stats;
    const lo = s.minCut ?? 0;
    const hi = Math.max(lo, st.sizes.length - 1);
    const sizes = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const counts = sizes.map((k) => st.sizes[k] ?? 0);
    const chart = drawCounts('hist', x, next, sizes.map(String), counts, null, {
      h: 70,
      barW: 24,
      gap: 6,
      size: LINE,
      title: `cut sizes in ${st.runs} trials`,
      roles,
      highlight: new Map([[0, 'found' as MarkRole]]),
    });
    out.push(...chart.shapes);
    parts.push(chart.bounds);
    next = below(chart.bounds, 6);
    const p = bound(n);
    const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
    const stat = [
      `minimum found: ${st.found} of ${st.runs} (${pct(st.found / Math.max(1, st.runs))})`,
      `bound: at least 1/${(n * (n - 1)) / 2} (${pct(p)})`,
    ];
    stat.forEach((t, k) =>
      out.push(
        txt(`stat-${k}`, x, next + LINE + k * (LINE + 7), t, LINE, {
          cls: k === 0 ? undefined : 'label',
          role: k === 0 ? 'found' : undefined,
        }),
      ),
    );
    parts.push({
      x,
      y: next,
      w: Math.max(...stat.map((t) => monoW(t, LINE))),
      h: stat.length * (LINE + 7),
    });
    width = Math.max(width, monoW('minimum found: 1000 of 1000 (100%)', LINE));
  }
  // Room for what a run shows, so the block keeps its size from step to step.
  parts.push({ x, y, w: width, h: reserveRow + 10 + orderH + 2 * (LINE + 7) });
  return unionBounds(...parts);
}

export function view(
  step: Step<KgState, undefined>,
  settings: KgSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const g = s.graph;
  const base = layoutGraph(g, template(settings));
  const { layout, clusters } = clusterLayout(g, s.group, base);
  const roles = new Map<string, MarkRole>();
  for (const c of clusters)
    if (c.members.length > 1) for (const v of c.members) roles.set(vertexId(v), colorOf(g, c.rep));
  const loops = new Set(s.loops);
  const cut = new Set(s.cut ?? []);
  const edges = g.edges.filter((e) => s.group[e.u] !== s.group[e.v] || keyOf(e) === s.picked);
  for (const e of edges) {
    const k = keyOf(e);
    if (k === s.picked) roles.set(edgeId(k), s.group[e.u] === s.group[e.v] ? 'compare' : 'active');
    else if (loops.has(k)) roles.set(edgeId(k), 'remove');
    else if (cut.has(k)) roles.set(edgeId(k), 'error');
  }
  for (const m of step.marks) roles.set(m.id, m.role);
  const now = { ...g, weighted: false, edges };
  const drawn = drawGraph(now, layout, {
    roles,
    weights: false,
    edge: (k) =>
      k === s.picked && s.group[k.split('-')[0]!] === s.group[k.split('-')[1]!]
        ? 'seen'
        : undefined,
  });
  const shapes: Shape[] = [];
  for (const c of clusters)
    if (c.members.length > 1)
      shapes.push({
        kind: 'rect',
        id: `sv-${c.rep}`,
        x: c.cx - c.hw,
        y: c.cy - c.hh,
        w: 2 * c.hw,
        h: 2 * c.hh,
        r: 14,
        role: roles.get(`sv-${c.rep}`) ?? colorOf(g, c.rep),
        z: -0.5,
      });
  shapes.push(...drawn.shapes);
  // The drawing keeps the graph's own frame, so the camera holds still as boxes form.
  const frame = unionBounds(padBounds(base.bounds, PAD), drawn.bounds, layout.bounds);
  const boxes: Bounds[] = [frame];
  if (g.vertices.length)
    boxes.push(placePanels(shapes, frame, stage, (out, x, y) => panels(out, s, x, y, roles)));
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
