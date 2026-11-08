import type { MarkRole, Step, StageSize } from '../../engine/types';
import { padBounds } from '../../layouts/graph';
import {
  clipLine,
  drawGrid,
  drawPoint,
  drawSegment,
  makePlane,
  text,
  type Vec,
} from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import { circumcenter, clipPolygon, drawClippedCircle } from '../_spatial/kit';
import {
  MAX,
  describe,
  isReal,
  ptId,
  realTris,
  triId,
  vertex,
  type DExtra,
  type DSettings,
  type DState,
  type Tri,
} from './model';

const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`).replace(/-/g, 'm');

export function view(step: Step<DState, DExtra>, settings: DSettings, _stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 32, x: 34, y: 16 });
  const box = plane.o;
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g' });
  const P = (id: number): Vec => vertex(s, id);

  // Tinted triangles: the ones a step points at, the bad ones, the new ones.
  const bad = new Set(s.bad);
  const fresh = new Set(s.fresh);
  for (const t of s.tris) {
    const role =
      roles.get(triId(t.id)) ?? (bad.has(t.id) ? 'error' : fresh.has(t.id) ? 'new' : undefined);
    if (!role) continue;
    const pts = clipPolygon(t.v.map(P), box);
    if (pts.length < 3) {
      // Off the drawing (a scaffolding triangle): a token shape keeps the mark's target.
      shapes.push({ kind: 'polygon', id: triId(t.id), points: [], role });
      continue;
    }
    shapes.push({ kind: 'polygon', id: triId(t.id), points: pts.map((p) => plane.at(p)), role });
  }

  // Edges: between real points solid; towards the super triangle a faint dashed ray.
  const hole = new Set(s.hole.map(([a, b]) => key(a, b)));
  const seen = new Set<string>();
  for (const t of s.tris)
    for (let i = 0; i < 3; i++) {
      const a = t.v[i]!;
      const b = t.v[(i + 1) % 3]!;
      const k = key(a, b);
      if (seen.has(k) || (a < 0 && b < 0)) continue;
      seen.add(k);
      if (a > 0 && b > 0) {
        drawSegment(shapes, plane, {
          id: `e-${k}`,
          a: P(a),
          b: P(b),
          role: hole.has(k) ? 'error' : undefined,
        });
      } else if (s.current !== null || hole.has(k)) {
        // Scaffolding edges only while a point is going in: they would read as grid lines.
        const r = a > 0 ? a : b;
        const sv = a > 0 ? b : a;
        const from = P(r);
        const to = P(sv);
        const seg = clipLine(from, { x: to.x - from.x, y: to.y - from.y }, box, 0, 1);
        if (seg)
          drawSegment(shapes, plane, {
            id: `e-${k}`,
            a: seg[0],
            b: seg[1],
            dashed: true,
            opacity: hole.has(k) ? 0.9 : 0.35,
            role: hole.has(k) ? 'error' : undefined,
          });
      }
    }

  if (settings.voronoi) {
    const center = new Map<number, Vec | null>(
      s.tris.map((t) => [t.id, circumcenter(P(t.v[0]), P(t.v[1]), P(t.v[2]))]),
    );
    const owner = new Map<string, Tri>();
    for (const t of s.tris)
      for (let i = 0; i < 3; i++) owner.set(`${t.v[i]}>${t.v[(i + 1) % 3]}`, t);
    const drawn = new Set<string>();
    for (const t of s.tris)
      for (let i = 0; i < 3; i++) {
        const a = t.v[i]!;
        const b = t.v[(i + 1) % 3]!;
        const k = key(a, b);
        const u = owner.get(`${b}>${a}`);
        if (!u || drawn.has(k) || (!isReal(t) && !isReal(u))) continue;
        drawn.add(k);
        const c1 = center.get(t.id);
        const c2 = center.get(u.id);
        if (!c1 || !c2) continue;
        const seg = clipLine(c1, { x: c2.x - c1.x, y: c2.y - c1.y }, box, 0, 1);
        if (seg) drawSegment(shapes, plane, { id: `vor-${k}`, a: seg[0], b: seg[1], role: 'g3' });
      }
    for (const t of realTris(s)) {
      const c = center.get(t.id);
      if (c && plane.contains(c))
        drawPoint(shapes, plane, { id: `vc-${t.id}`, at: c, r: 3, role: 'g3', cls: 'arrowhead' });
    }
  }

  if (extra.circle) {
    const t = s.tris.find((u) => u.id === extra.circle!.tri);
    if (t) {
      const [a, b, c] = t.v.map(P) as [Vec, Vec, Vec];
      const o = circumcenter(a, b, c);
      if (o)
        drawClippedCircle(shapes, plane, {
          id: 'cc',
          c: o,
          r: Math.hypot(a.x - o.x, a.y - o.y),
          role: extra.circle.inside
            ? 'error'
            : roles.get(triId(t.id)) === 'found'
              ? 'found'
              : 'compare',
        });
    }
  }

  for (const p of s.points) {
    const id = ptId(p.id);
    const role = roles.get(id) ?? (s.current === p.id ? 'active' : undefined);
    drawPoint(shapes, plane, { id, at: p, r: 6, role, label: p.name, size: 15 });
  }
  for (const p of s.pending)
    drawPoint(shapes, plane, {
      id: ptId(p.id),
      at: p,
      r: 6,
      role: roles.get(ptId(p.id)),
      label: p.name,
      size: 15,
      opacity: 0.45,
    });

  const bottom = plane.rect.y + plane.rect.h + 22;
  const k = realTris(s).length;
  shapes.push(
    text(
      'counts',
      { x: plane.rect.x, y: bottom + 22 },
      `${k} triangle${k === 1 ? '' : 's'}; ${s.tests} circle test${s.tests === 1 ? '' : 's'}${settings.voronoi ? '; Voronoi edges in colour' : ''}`,
      { size: 14, bold: true },
    ),
  );
  const graph = { x: 0, y: 0, w: plane.rect.x + plane.rect.w + 14, h: bottom + 32 };
  return { shapes, bounds: padBounds(graph, 8), label: describe(s) };
}
