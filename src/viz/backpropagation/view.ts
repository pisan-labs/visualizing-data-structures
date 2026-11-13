/**
 * Backpropagation: the computation graph, one box per node with what it computes on top
 * ("n1 = a × b") and two cells under it, its value and its gradient ∂f/∂(node), the gradient
 * shaded by size. Edges run from a node to the nodes that read it; once the backward pass sends
 * a share back along an edge, a chip on the edge shows it, so a variable used twice shows both
 * shares beside it. Under the graph, the topological order as a row of cells, and a key.
 *
 * On a wide stage the graph runs left to right, inputs first; on a tall one, top to bottom.
 *
 * Shape ids: nd-<i> the node's box (nd-<i>-t its formula), v-<i> and g-<i> its value and
 * gradient cells (-t their text), e-<k> edge k (the piece with the arrowhead; e-<k>-<j> the
 * pieces before it), ch-<k> its chip (ch-<k>-t), o-<j> cell j of the order (o-<j>-t),
 * o-title, key-v, key-g (and -t), key-title.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { backwardPass, forwardValues, formula, type Graph } from './graph';
import { layoutDag } from './layout';
import { describe, type BpExtra, type BpSettings, type BpState } from './model';

export const NODE_W = 120;
const CELL_W = NODE_W / 2;
const CELL_H = 32;
const TITLE_H = 24;
export const NODE_H = TITLE_H + CELL_H;
const TEXT = 15;
const SMALL = 14;
const CHIP_H = 22;
const ORDER_W = 42;
const ORDER_H = 30;
/** Room kept clear at the top for the stage's zoom buttons when they have no strip. */
const ZOOM_PAD = 46;

interface Geometry {
  across: boolean;
  /** Top left of each node's box. */
  node: { x: number; y: number }[];
  /** Each edge as a polyline, from the reader-to-be to the reader. */
  edge: { x: number; y: number }[][];
  /** Each edge's chip, centered. */
  chip: { x: number; y: number }[];
  bounds: Bounds;
}

const cache = new WeakMap<Graph, Geometry[]>();

/** Geometry of the graph, running left to right (across) or top to bottom. */
function geometry(g: Graph, across: boolean): Geometry {
  const hit = cache.get(g)?.[across ? 0 : 1];
  if (hit) return hit;
  const lay = layoutDag(g);
  const W = lay.width;
  const colPitch = across ? NODE_W + 80 : NODE_W + 10;
  const rowPitch = across ? NODE_H + 28 : NODE_H + 56;
  /** Top left of slot (layer, index). */
  const slot = (l: number, i: number) => {
    const n = lay.layers[l]!.length;
    const off = i + (W - n) / 2;
    return across ? { x: l * colPitch, y: off * rowPitch } : { x: off * colPitch, y: l * rowPitch };
  };
  const node = lay.at.map(([l, i]) => slot(l, i));
  // Each edge up to the target, then into it at a point spread along the target's near side,
  // in the order the edges arrive from (so they do not cross there).
  const lead = g.edges.map((e, k) => {
    const from = node[e.from]!;
    const pts = [
      across
        ? { x: from.x + NODE_W, y: from.y + NODE_H / 2 }
        : { x: from.x + NODE_W / 2, y: from.y + NODE_H },
    ];
    for (const v of lay.via[k]!) {
      const p = slot(v.layer, v.index);
      if (across)
        pts.push({ x: p.x, y: p.y + NODE_H / 2 }, { x: p.x + NODE_W, y: p.y + NODE_H / 2 });
      else pts.push({ x: p.x + NODE_W / 2, y: p.y }, { x: p.x + NODE_W / 2, y: p.y + NODE_H });
    }
    return pts;
  });
  const side = (k: number) => {
    const p = lead[k]!.at(-1)!;
    return (across ? p.y : p.x) + g.edges[k]!.slot * 1e-3;
  };
  const edge = g.edges.map((e, k) => {
    const to = node[e.to]!;
    const into = g.edges.flatMap((d, j) => (d.to === e.to ? [j] : []));
    into.sort((a, b) => side(a) - side(b));
    const f = (into.indexOf(k) + 1) / (into.length + 1);
    return [
      ...lead[k]!,
      across ? { x: to.x, y: to.y + NODE_H * f } : { x: to.x + NODE_W * f, y: to.y },
    ];
  });

  // Chips on each edge's first piece, moved along it (or off it a little) to stay clear of one
  // another and of the boxes.
  const chipW = 60;
  const boxes: Bounds[] = node.map((p) => ({ x: p.x, y: p.y, w: NODE_W, h: NODE_H }));
  const hits = (b: Bounds, c: Bounds) =>
    b.x < c.x + c.w + 2 && c.x < b.x + b.w + 2 && b.y < c.y + c.h + 2 && c.y < b.y + b.h + 2;
  const placed: Bounds[] = [];
  const chip = edge.map((pts) => {
    const [a, b] = [pts[0]!, pts[1]!];
    let pick = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    search: for (const t of [0.5, 0.35, 0.65, 0.25, 0.75])
      for (const d of [0, 14, -14, 26, -26]) {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        const c = { x: a.x + (b.x - a.x) * t + nx * d, y: a.y + (b.y - a.y) * t + ny * d };
        const box = { x: c.x - chipW / 2, y: c.y - CHIP_H / 2, w: chipW, h: CHIP_H };
        if (![...boxes, ...placed].some((o) => hits(o, box))) {
          pick = c;
          break search;
        }
      }
    placed.push({ x: pick.x - chipW / 2, y: pick.y - CHIP_H / 2, w: chipW, h: CHIP_H });
    return pick;
  });
  const bounds = unionBounds(...boxes, ...placed);
  const out: Geometry = { across, node, edge, chip, bounds };
  const both = cache.get(g) ?? [];
  both[across ? 0 : 1] = out;
  cache.set(g, both);
  return out;
}

/** The largest |gradient| of a fresh pass: the shading's full strength, fixed per graph. */
const scales = new WeakMap<Graph, number>();
function gradScale(g: Graph): number {
  let s = scales.get(g);
  if (s === undefined) {
    const grads = backwardPass(g, forwardValues(g), [], true).grads;
    s = Math.max(1, ...grads.map(Math.abs));
    scales.set(g, s);
  }
  return s;
}

function draw(step: Step<BpState, BpExtra>, across: boolean, stage?: StageSize) {
  const { state } = step;
  const { g } = state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const geo = geometry(g, across);
  const top = stage?.strip ? 0 : ZOOM_PAD;
  const dy = top - geo.bounds.y;
  const dx = -geo.bounds.x;
  const shapes: Shape[] = [];
  const scale = gradScale(g);

  // Edges first, under the boxes.
  geo.edge.forEach((pts, k) => {
    const role = roles.get(`e-${k}`);
    for (let j = 0; j + 1 < pts.length; j++) {
      const last = j + 2 === pts.length;
      shapes.push({
        kind: 'arrow',
        id: last ? `e-${k}` : `e-${k}-${j}`,
        x1: pts[j]!.x + dx,
        y1: pts[j]!.y + dy,
        x2: pts[j + 1]!.x + dx,
        y2: pts[j + 1]!.y + dy,
        head: last ? 'end' : 'none',
        role,
      });
    }
  });

  g.nodes.forEach((n, i) => {
    const p = geo.node[i]!;
    const x = p.x + dx;
    const y = p.y + dy;
    shapes.push({
      kind: 'rect',
      id: `nd-${i}`,
      x,
      y,
      w: NODE_W,
      h: NODE_H,
      r: 6,
      cls: 'live',
      role: roles.get(`nd-${i}`),
    });
    shapes.push({
      kind: 'text',
      id: `nd-${i}-t`,
      x: x + NODE_W / 2,
      y: y + 17,
      text: formula(g, i),
      size: TEXT,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`nd-${i}`) === 'active' ? 'active' : undefined,
    });
    const value = state.values[i];
    const grad = state.grads[i]!;
    for (const [id, cx, text, shade] of [
      [`v-${i}`, x, value === null || value === undefined ? '' : short(value), undefined],
      [`g-${i}`, x + CELL_W, short(grad), Math.max(-1, Math.min(1, grad / scale))],
    ] as const) {
      shapes.push({
        kind: 'rect',
        id,
        x: cx,
        y: y + TITLE_H,
        w: CELL_W,
        h: CELL_H,
        r: 2,
        cls: text ? 'live' : undefined,
        shade: text ? shade : undefined,
        role: roles.get(id),
      });
      if (text)
        shapes.push({
          kind: 'text',
          id: `${id}-t`,
          x: cx + CELL_W / 2,
          y: y + TITLE_H + CELL_H / 2 + 5,
          text,
          size: TEXT,
          anchor: 'middle',
          mono: true,
        });
    }
  });

  // Chips: what the latest pass sent back along each edge.
  geo.chip.forEach((c, k) => {
    const v = state.passed[k];
    if (v === null || v === undefined) return;
    const text = short(v);
    const w = Math.max(30, text.length * SMALL * 0.6 + 10);
    shapes.push({
      kind: 'rect',
      id: `ch-${k}`,
      x: c.x + dx - w / 2,
      y: c.y + dy - CHIP_H / 2,
      w,
      h: CHIP_H,
      r: 11,
      cls: 'live',
      role: roles.get(`ch-${k}`),
      z: 3,
    });
    shapes.push({
      kind: 'text',
      id: `ch-${k}-t`,
      x: c.x + dx,
      y: c.y + dy + 5,
      text,
      size: SMALL,
      anchor: 'middle',
      mono: true,
      z: 4,
    });
  });

  // The order, and a key.
  const gb: Bounds = { x: 0, y: top, w: geo.bounds.w, h: geo.bounds.h };
  const oy = gb.y + gb.h + 26;
  shapes.push({
    kind: 'text',
    id: 'o-title',
    x: 0,
    y: oy + ORDER_H / 2 + 5,
    text: 'order',
    size: SMALL,
    mono: true,
    cls: 'label',
  });
  const ox = 56;
  g.nodes.forEach((_, j) => {
    const v = state.order[j];
    const id = `o-${j}`;
    shapes.push({
      kind: 'rect',
      id,
      x: ox + j * ORDER_W,
      y: oy,
      w: ORDER_W,
      h: ORDER_H,
      r: 2,
      cls: v === undefined ? undefined : 'live',
      role: roles.get(id),
    });
    if (v !== undefined)
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: ox + j * ORDER_W + ORDER_W / 2,
        y: oy + ORDER_H / 2 + 5,
        text: g.nodes[v]!.name,
        size: SMALL,
        anchor: 'middle',
        mono: true,
      });
  });
  const orderRight = ox + g.nodes.length * ORDER_W;
  // The key goes beside the order when it fits under the graph, else under it.
  const keyW = 104 + NODE_W;
  const beside = orderRight + 30 + keyW <= Math.max(gb.w, 360);
  const kx = beside ? orderRight + 30 : 0;
  const ky = beside ? oy : oy + ORDER_H + 16;
  shapes.push({
    kind: 'text',
    id: 'key-title',
    x: kx + 96,
    y: ky + ORDER_H / 2 + 5,
    text: 'each node:',
    size: SMALL,
    anchor: 'end',
    cls: 'label',
  });
  for (const [id, x, text] of [
    ['key-v', kx + 104, 'value'],
    ['key-g', kx + 104 + CELL_W, 'grad'],
  ] as const) {
    shapes.push({ kind: 'rect', id, x, y: ky, w: CELL_W, h: ORDER_H, r: 2, cls: 'live' });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + CELL_W / 2,
      y: ky + ORDER_H / 2 + 5,
      text,
      size: SMALL,
      anchor: 'middle',
      cls: 'label',
    });
  }
  const bottom = ky + ORDER_H;
  const bounds = padBounds(
    unionBounds(
      gb,
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: oy, w: Math.max(orderRight, kx + keyW), h: bottom - oy },
    ),
    12,
  );
  return { shapes, bounds };
}

export function view(
  step: Step<BpState, BpExtra>,
  _settings: BpSettings,
  stage?: StageSize,
): Scene {
  const best = pickLayout(stage, [draw(step, true, stage), draw(step, false, stage)]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(step.state) };
}
