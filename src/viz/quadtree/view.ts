import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { labelSize, padBounds, trimmedLine, unionBounds } from '../../layouts/binary-tree';
import { drawGrid, drawPoint, drawSegment, makePlane, text } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { drawBox } from '../_spatial/kit';
import {
  SIDE,
  describe,
  insertQuiet,
  node,
  point,
  ptId,
  qnId,
  type QExtra,
  type QSettings,
  type QState,
} from './model';

const R = 19;
const RI = 8;
const NIL = 11;
const GAP = 5;
const LEVEL = 54;

interface Placed {
  x: number;
  y: number;
  kind: 'inner' | 'leaf' | 'empty';
}

/** A tidy enough layout for a 4-way tree: empty leaves are narrow, so the tree stays compact. */
function layoutQuad(s: QState): { at: Map<number, Placed>; w: number; h: number } {
  const widths = new Map<number, number>();
  const width = (id: number): number => {
    const n = node(s, id);
    let w: number;
    if (n.kids) {
      const sum = n.kids.reduce((t, k) => t + width(k), 0) + 3 * GAP;
      w = Math.max(2 * RI, sum);
    } else w = n.points!.length ? 2 * R : NIL;
    widths.set(id, w);
    return w;
  };
  const w = width(0);
  const at = new Map<number, Placed>();
  let deepest = 0;
  const place = (id: number, left: number): number => {
    const n = node(s, id);
    const wn = widths.get(id)!;
    const y = n.depth * LEVEL;
    deepest = Math.max(deepest, n.depth);
    if (n.kids) {
      const sum = n.kids.reduce((t, k) => t + widths.get(k)!, 0) + 3 * GAP;
      let cur = left + (wn - sum) / 2;
      const xs = n.kids.map((k) => {
        const x = place(k, cur);
        cur += widths.get(k)! + GAP;
        return x;
      });
      const x = (xs[0]! + xs[3]!) / 2;
      at.set(id, { x, y, kind: 'inner' });
      return x;
    }
    const x = left + wn / 2;
    at.set(id, { x, y, kind: n.points!.length ? 'leaf' : 'empty' });
    return x;
  };
  place(0, 0);
  return { at, w, h: deepest * LEVEL };
}

export function view(step: Step<QState, QExtra>, settings: QSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: SIDE, ymin: 0, ymax: SIDE, unit: 22, x: 34, y: 16 });
  const left: Shape[] = [];
  drawGrid(left, plane, { id: 'g', labelEvery: 4, opacity: 0.16 });

  for (const id of s.pruned) {
    const n = node(s, id);
    drawBox(left, plane, {
      id: `pr-${id}`,
      lo: { x: n.x0, y: n.y0 },
      hi: { x: n.x0 + n.size, y: n.y0 + n.size },
      fill: true,
      noEdges: true,
    });
  }
  for (const n of s.nodes) {
    const r = roles.get(qnId(n.id));
    if (!r || r === 'stale') continue;
    drawBox(left, plane, {
      id: `sq-${n.id}`,
      lo: { x: n.x0, y: n.y0 },
      hi: { x: n.x0 + n.size, y: n.y0 + n.size },
      fill: r === 'visit' ? true : r,
      noEdges: true,
    });
  }
  if (s.box)
    drawBox(left, plane, { id: 'box', lo: s.box.lo, hi: s.box.hi, role: 'active', fill: 'active' });

  drawBox(left, plane, { id: 'root', lo: { x: 0, y: 0 }, hi: { x: SIDE, y: SIDE } });
  for (const n of s.nodes) {
    if (!n.kids) continue;
    const h = n.size / 2;
    const r = roles.get(qnId(n.id)) === 'active' ? 'active' : undefined;
    drawSegment(left, plane, {
      id: `cx-${n.id}-v`,
      a: { x: n.x0 + h, y: n.y0 },
      b: { x: n.x0 + h, y: n.y0 + n.size },
      role: r,
    });
    drawSegment(left, plane, {
      id: `cx-${n.id}-h`,
      a: { x: n.x0, y: n.y0 + h },
      b: { x: n.x0 + n.size, y: n.y0 + h },
      role: r,
    });
  }

  for (const p of s.points) {
    const id = ptId(p.id);
    drawPoint(left, plane, {
      id,
      at: p,
      r: 5,
      role: roles.get(id) ?? (s.found.includes(p.id) ? 'found' : undefined),
      label: p.name,
      size: 15,
    });
  }
  for (const p of s.pending) {
    const moving = extra.moving === p.id;
    drawPoint(left, plane, {
      id: ptId(p.id),
      at: p,
      r: 5,
      role: moving ? 'active' : roles.get(ptId(p.id)),
      label: p.name,
      size: 15,
      opacity: moving ? undefined : 0.45,
    });
  }

  const planeBox: Bounds = {
    x: 0,
    y: 0,
    w: plane.rect.x + plane.rect.w + 14,
    h: plane.rect.y + plane.rect.h + 22,
  };

  // The tree as it is now, framed by the tree the running insert will end with.
  let full = s;
  for (const p of s.pending) full = insertQuiet(full, p, settings.capacity);
  const now = layoutQuad(s);
  const end = layoutQuad(full);
  const right: Shape[] = [];
  for (const n of s.nodes) {
    const a = now.at.get(n.id)!;
    if (n.kids)
      for (const k of n.kids) {
        const b = now.at.get(k)!;
        right.push({
          kind: 'arrow',
          id: `qe-${k}`,
          ...trimmedLine(a, b, RI, b.kind === 'empty' ? NIL / 2 : b.kind === 'leaf' ? R : RI),
          head: 'none',
          role: roles.get(`qe-${k}`),
        });
      }
  }
  for (const n of s.nodes) {
    const a = now.at.get(n.id)!;
    const role =
      roles.get(qnId(n.id)) ??
      (n.points?.some((pid) => s.found.includes(pid)) ? ('found' as const) : undefined);
    const dim = role === 'stale' ? 0.4 : undefined;
    if (a.kind === 'empty') {
      right.push({
        kind: 'rect',
        id: qnId(n.id),
        x: a.x - NIL / 2,
        y: a.y - NIL / 2,
        w: NIL,
        h: NIL,
        r: 2,
        role: role === 'stale' ? undefined : role,
        opacity: dim,
      });
      continue;
    }
    right.push({
      kind: 'circle',
      id: qnId(n.id),
      x: a.x,
      y: a.y,
      r: a.kind === 'leaf' ? R : RI,
      cls: 'live',
      role: role === 'stale' ? undefined : role,
      opacity: dim,
    });
    if (a.kind === 'leaf') {
      const label = n.points!.map((pid) => point(s, pid).name).join('');
      const size = labelSize(label, R);
      right.push({
        kind: 'text',
        id: `qk-${n.id}`,
        x: a.x,
        y: a.y + size * 0.35,
        text: label,
        size,
        anchor: 'middle',
        weight: 'bold',
        role: role === 'stale' ? undefined : role,
        opacity: dim,
      });
    }
  }
  right.push(text('legend', { x: 0, y: -R - 12 }, 'children: NW, NE, SW, SE', { size: 14 }));
  const treeBox: Bounds = { x: 0, y: -R - 28, w: Math.max(end.w, 170), h: end.h + 2 * R + 28 };

  const place = (dx: number, dy: number) => ({
    dx,
    dy,
    bounds: unionBounds(planeBox, { ...treeBox, x: treeBox.x + dx, y: treeBox.y + dy }),
  });
  const beside = place(planeBox.w + 24, planeBox.y + ZOOM_DROP + 4 - treeBox.y);
  const under = place(
    Math.max(0, (planeBox.w - treeBox.w) / 2),
    planeBox.y + planeBox.h + 10 - treeBox.y,
  );
  const pick = pickLayout(stage, [beside, under]);
  const shapes = [...left, ...translate(right, pick.dx, pick.dy)];
  return { shapes, bounds: padBounds(pick.bounds, 8), label: describe(s) };
}
