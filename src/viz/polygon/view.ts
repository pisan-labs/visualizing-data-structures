import type { MarkRole, Step } from '../../engine/types';
import {
  drawGrid,
  drawPoint,
  drawPolygon,
  drawSegment,
  makePlane,
  text,
} from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import {
  MAX,
  describe,
  half,
  nameOf,
  vId,
  type PolyExtra,
  type PolySettings,
  type PolyState,
} from './model';

export function view(step: Step<PolyState, PolyExtra>, settings: PolySettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 32, x: 34, y: 16 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g' });
  const v = s.verts;
  const n = v.length;

  drawPolygon(shapes, plane, {
    id: 'e',
    pts: v.map((p, i) => ({ key: i, at: p })),
    roles,
    fill: true,
  });

  // Shoelace: the triangle that edge i makes with the origin.
  if (extra.edge !== undefined) {
    const a = v[extra.edge]!;
    const b = v[(extra.edge + 1) % n]!;
    const o = { x: 0, y: 0 };
    const role = roles.get('tri') === 'error' ? 'error' : 'active';
    shapes.push({
      kind: 'polygon',
      id: 'tri-fill',
      points: [o, a, b].map((q) => plane.at(q)),
      role,
    });
    drawSegment(shapes, plane, { id: 'tri-a', a: o, b: a, dashed: true, role });
    drawSegment(shapes, plane, { id: 'tri-b', a: o, b, dashed: true, role });
    const term = a.x * b.y - b.x * a.y;
    const c = plane.at({ x: (a.x + b.x) / 3, y: (a.y + b.y) / 3 });
    shapes.push(
      text('tri', { x: c.x, y: c.y + 5 }, `${term >= 0 ? '+' : ''}${term}`, {
        size: 15,
        anchor: 'middle',
        bold: true,
        role: roles.get('tri') ?? 'active',
      }),
    );
  }

  // A vertex being tested: the turn through it.
  if (extra.vertex !== undefined) {
    const k = extra.vertex;
    const a = v[(k - 1 + n) % n]!;
    const b = v[k]!;
    const c = v[(k + 1) % n]!;
    const role = roles.get(vId(k)) === 'error' ? 'error' : 'active';
    drawSegment(shapes, plane, { id: 'turn-a', a, b, role, z: 1 });
    drawSegment(shapes, plane, { id: 'turn-b', a: b, b: c, role, z: 1 });
  }

  if (s.query) {
    const q = s.query;
    drawSegment(shapes, plane, {
      id: 'ray',
      a: q,
      b: { x: MAX, y: q.y },
      dashed: true,
      head: 'end',
      role: roles.has('q') ? 'active' : undefined,
    });
    for (const h of extra.hits ?? []) {
      drawPoint(shapes, plane, {
        id: `hit-${h.edge}`,
        at: { x: h.x, y: q.y },
        r: 4,
        role: settings.inside === 'winding' && !h.up ? 'error' : 'active',
        label: settings.inside === 'winding' ? (h.up ? '+1' : '−1') : undefined,
        dx: -4,
        dy: -9,
        size: 14,
      });
    }
    drawPoint(shapes, plane, {
      id: 'q',
      at: q,
      r: 6,
      role: roles.get('q') ?? 'found',
      label: 'q',
      dx: -10,
      dy: -8,
      anchor: 'end',
      size: 15,
    });
  }

  v.forEach((p, i) => {
    drawPoint(shapes, plane, {
      id: vId(i),
      at: p,
      r: 5,
      role: roles.get(vId(i)),
      label: nameOf(i),
      size: 14,
    });
  });

  // Readout under the plane.
  const r = s.result;
  const y0 = plane.rect.y + plane.rect.h + 44;
  const line1 =
    r?.kind === 'area'
      ? `sum = ${r.sum}, area = |sum| / 2 = ${half(r.sum)}`
      : r?.kind === 'orient'
        ? r.turn > 0
          ? 'counter-clockwise'
          : r.turn < 0
            ? 'clockwise'
            : 'degenerate'
        : r?.kind === 'convex'
          ? r.convex
            ? 'convex'
            : 'not convex'
          : r?.kind === 'inside'
            ? `q is ${r.where === 'boundary' ? 'on the boundary' : r.where}${r.where === 'boundary' ? '' : settings.inside === 'ray' ? ` (${r.count} crossing${r.count === 1 ? '' : 's'})` : ` (winding number ${r.count})`}`
            : extra.sum !== undefined
              ? `sum = ${extra.sum}`
              : extra.hits && s.query
                ? settings.inside === 'ray'
                  ? `crossings so far: ${extra.hits.length}`
                  : `winding number so far: ${extra.hits.reduce((t, h) => t + (h.up ? 1 : -1), 0)}`
                : '';
  shapes.push(
    text('res', { x: plane.rect.x, y: y0 }, line1, {
      size: 15,
      bold: true,
      role: r ? 'found' : undefined,
    }),
  );
  shapes.push(
    text(
      'info',
      { x: plane.rect.x, y: y0 + 22 },
      `${n} vertices${s.simple ? '' : ', edges cross (not simple)'} · ${s.tests} ${s.tests === 1 ? 'test' : 'tests'}`,
      { size: 14 },
    ),
  );

  return {
    shapes,
    bounds: { x: 0, y: 0, w: plane.rect.x + plane.rect.w + 24, h: y0 + 36 },
    label: describe(s),
  };
}
