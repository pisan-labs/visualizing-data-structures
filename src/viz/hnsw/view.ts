/**
 * HNSW: one panel per layer. Layer 0 (every point) is the big plane; layers 3, 2 and 1 are small
 * planes, each showing only the nodes that reach it (the others as faint dots) and that layer's
 * links. A link both ways is a plain line; a link one way is a dashed arrow. A side table lists
 * the search's candidates C and the nearest found W (with squared distances), and at the end of
 * a search the answer next to brute force's. A laptop puts the small layers in a column at the
 * left and the table at the right; a phone puts the small layers in a row under layer 0 and the
 * table under them.
 *
 * Shape ids, for marks: n<layer>-<id> a node on a layer; q<layer> the query on a layer.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { text, type Plane, type Vec } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { drawPt, drawWindow, field } from '../_retrieve/draw';
import { d2 } from '../_retrieve/points';
import {
  describe,
  EF_C,
  efOf,
  K,
  nodeId,
  queryId,
  TOP,
  type HnswExtra,
  type HnswSettings,
  type HnswState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const SIZE = 13;
const BIG = 28;
const SMALL = 9;
const ROW_H = 18;

/** Ends of a line between two node circles of radius r, pulled in so an arrowhead shows. */
function between(a: Vec, b: Vec, r: number) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return { x1: a.x + ux * r, y1: a.y + uy * r, x2: b.x - ux * (r + 1), y2: b.y - uy * (r + 1) };
}

function drawLayer(
  s: HnswState,
  layer: number,
  plane: Plane,
  roles: Roles,
  extra: HnswExtra,
  big: boolean,
): Shape[] {
  const shapes: Shape[] = [];
  const on = s.nodes.filter((n) => n.level >= layer);
  const empty = !on.length;
  drawWindow(shapes, plane, `w${layer}`, {
    grid: big ? 1 : 2,
    title: `layer ${layer}${layer === 0 ? ': every point' : empty ? ': empty' : ''}`,
  });
  const r = big ? 7 : 5;
  const here = extra.layer === layer;

  // Links on this layer: once per pair; dashed with an arrowhead when they go one way.
  for (const a of on) {
    for (const b of a.links[layer] ?? []) {
      const bn = s.nodes[b]!;
      const both = (bn.links[layer] ?? []).includes(a.id);
      if (both && b < a.id) continue;
      const lo = Math.min(a.id, b);
      const hi = Math.max(a.id, b);
      let role: MarkRole | undefined;
      if (here && extra.cur !== undefined && extra.seen !== undefined)
        if (
          (extra.cur === a.id && extra.seen === b) ||
          (both && extra.cur === b && extra.seen === a.id)
        )
          role = 'active';
      if (extra.linked?.layer === layer && extra.newId !== undefined)
        if (
          (a.id === extra.newId && extra.linked.ids.includes(b)) ||
          (b === extra.newId && extra.linked.ids.includes(a.id))
        )
          role = 'new';
      const pa = plane.at(a);
      const pb = plane.at(bn);
      shapes.push({
        kind: 'arrow',
        id: both ? `e${layer}-${lo}-${hi}` : `e${layer}-${a.id}-${b}`,
        ...(both ? { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y } : between(pa, pb, r)),
        head: both ? 'none' : 'end',
        dashed: !both,
        role,
        opacity: role ? 1 : 0.7,
      });
    }
  }
  if (extra.dropped?.layer === layer) {
    const a = plane.at(s.nodes[extra.dropped.from]!);
    const b = plane.at(s.nodes[extra.dropped.to]!);
    shapes.push({
      kind: 'arrow',
      id: `x${layer}`,
      ...between(a, b, r),
      head: 'none',
      dashed: true,
      role: 'remove',
    });
  }

  // The end of a search: the answer against brute force on layer 0, the path above it.
  const last = s.last?.kind === 'search' ? s.last : undefined;
  const base = (id: number): MarkRole | undefined => {
    if (last) {
      if (layer === 0) {
        const f = last.found.includes(id);
        const t = last.truth.includes(id);
        if (f && t) return 'found';
        if (t) return 'error';
        if (f) return 'compare';
        return undefined;
      }
      return last.path.includes(id) ? 'visit' : undefined;
    }
    if (layer > 0 && extra.path?.includes(id)) return 'visit';
    if (s.last?.kind === 'insert' && s.last.id === id) return 'found';
    return undefined;
  };
  for (const n of s.nodes) {
    if (n.level < layer) {
      if (big) continue;
      drawPt(shapes, plane, { id: `f${layer}-${n.id}`, at: n, r: 2, opacity: 0.4 });
      continue;
    }
    const id = nodeId(layer, n.id);
    drawPt(shapes, plane, {
      id,
      at: n,
      r,
      role: roles.get(id) ?? base(n.id),
      label: n.name,
      dx: big ? 8 : 6,
      dy: big ? -8 : -6,
      z: 3,
    });
  }

  // The query of a search, on every layer.
  const q = extra.newId === undefined ? (extra.q ?? last?.q) : undefined;
  if (q) {
    const c = plane.at(q);
    const w = big ? 12 : 9;
    shapes.push({
      kind: 'rect',
      id: queryId(layer),
      x: c.x - w / 2,
      y: c.y - w / 2,
      w,
      h: w,
      r: 1,
      cls: 'live',
      role: roles.get(queryId(layer)) ?? 'active',
      z: 4,
    });
    if (big)
      shapes.push(
        text(`${queryId(layer)}-l`, { x: c.x + 8, y: c.y + 17 }, 'q', {
          size: SIZE,
          bold: true,
          cls: '',
        }),
      );
  }
  return shapes;
}

/** Two columns of names with squared distances. */
function drawLists(s: HnswState, extra: HnswExtra, settings: HnswSettings): Block {
  const shapes: Shape[] = [];
  const name = (id: number) => s.nodes[id]?.name ?? '?';
  let heads: [string, string];
  let cols: [number, number][][];
  const last = s.last?.kind === 'search' ? s.last : undefined;
  if (extra.cand || extra.found) {
    const joins =
      extra.newId !== undefined && (extra.layer ?? 0) <= (s.nodes[extra.newId]?.level ?? 0);
    const ef =
      extra.newId === undefined ? (extra.layer === 0 ? efOf(settings) : 1) : joins ? EF_C : 1;
    heads = ['candidates C', `found W (ef ${ef})`];
    cols = [extra.cand ?? [], extra.found ?? []];
  } else if (last) {
    heads = [`HNSW (${last.dists})`, `exact (${s.nodes.length})`];
    const withD = (ids: number[]) =>
      ids.map((id) => [d2(last.q, s.nodes[id]!), id] as [number, number]);
    cols = [withD(last.found), withD(last.truth)];
  } else {
    heads = ['', ''];
    cols = [[], []];
  }
  const colW = 100;
  heads.forEach((h, c) =>
    shapes.push(text(`lh-${c}`, { x: c * colW, y: 14 }, h, { size: SIZE, bold: true })),
  );
  cols.forEach((col, c) =>
    col.forEach(([d, id], r) => {
      const missed = last && c === 1 && !last.found.includes(id);
      shapes.push(
        text(
          `li-${c}-${id}`,
          { x: c * colW, y: 34 + r * ROW_H },
          `${name(id)} ${d}${missed ? ' missed' : ''}`,
          {
            size: SIZE,
            mono: true,
            role: missed ? 'error' : undefined,
            cls: missed ? undefined : '',
          },
        ),
      );
    }),
  );
  if (last)
    shapes.push(
      text(
        'lr',
        { x: 0, y: 34 + K * ROW_H + 8 },
        `recall ${last.found.filter((id) => last.truth.includes(id)).length}/${Math.min(K, s.nodes.length)}`,
        {
          size: SIZE,
          bold: true,
        },
      ),
    );
  return { shapes, bounds: { x: 0, y: 0, w: 2 * colW + 4, h: 34 + 12 * ROW_H } };
}

export function view(
  step: Step<HnswState, HnswExtra>,
  settings: HnswSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const lists = drawLists(s, extra, settings);
  const smallW = SMALL * 10 + 14;
  const smallH = SMALL * 10 + 24;
  const bigW = BIG * 10 + 20;
  const bigH = BIG * 10 + 34;

  const compose = (parts: [Shape[], number, number][], w: number, h: number): Block => ({
    shapes: parts.flatMap(([sh, dx, dy]) => translate(sh, dx, dy)),
    bounds: { x: -8, y: -8, w: w + 16, h: h + 16 },
  });
  const bigShapes = (x: number, y: number) =>
    drawLayer(s, 0, field(BIG, x + 8, y + 22), roles, extra, true);
  const smallShapes = (layer: number, x: number, y: number) =>
    drawLayer(s, layer, field(SMALL, x + 6, y + 20), roles, extra, false);
  const uppers = Array.from({ length: TOP }, (_, i) => TOP - i);

  const wide = (() => {
    const parts: [Shape[], number, number][] = uppers.map((l, i) => [
      smallShapes(l, 0, i * smallH),
      0,
      0,
    ]);
    const bx = smallW + 10;
    parts.push([bigShapes(bx, 0), 0, 0]);
    const lx = bx + bigW + 12;
    // Below the stage's zoom buttons, which sit over the top right corner.
    const ly = stage?.strip ? 8 : ZOOM_DROP + 14;
    parts.push([lists.shapes, lx, ly]);
    return compose(parts, lx + lists.bounds.w, Math.max(TOP * smallH, bigH, lists.bounds.h + ly));
  })();
  const tall = (() => {
    const parts: [Shape[], number, number][] = [[bigShapes(0, 0), 0, 0]];
    uppers.forEach((l, i) => parts.push([smallShapes(l, i * smallW, bigH), 0, 0]));
    const ly = bigH + smallH + 6;
    parts.push([lists.shapes, 4, ly]);
    return compose(parts, Math.max(bigW, TOP * smallW), ly + lists.bounds.h);
  })();
  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
