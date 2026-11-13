import { defaultZ, type Bounds, type Scene, type Shape } from './scene';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const GEOMETRY = ['x', 'y', 'w', 'h', 'r', 'x1', 'y1', 'x2', 'y2', 'size', 'shade'] as const;

function mix(a: Shape, b: Shape, t: number): Shape {
  const out: Record<string, unknown> = { ...b };
  for (const k of GEOMETRY) {
    const av = (a as unknown as Record<string, unknown>)[k];
    const bv = (b as unknown as Record<string, unknown>)[k];
    if (typeof av === 'number' && typeof bv === 'number') out[k] = lerp(av, bv, t);
  }
  out.opacity = lerp(a.opacity ?? 1, b.opacity ?? 1, t);
  if (a.kind === 'text' && b.kind === 'text' && a.text !== b.text)
    out.text = t < 0.5 ? a.text : b.text;
  // A curve bends smoothly when both ends of the tween are curves.
  if (a.kind === 'arrow' && b.kind === 'arrow' && a.via && b.via)
    out.via = { x: lerp(a.via.x, b.via.x, t), y: lerp(a.via.y, b.via.y, t) };
  // Polygons with the same number of corners move corner by corner; otherwise they snap.
  if (a.kind === 'polygon' && b.kind === 'polygon' && a.points.length === b.points.length)
    out.points = b.points.map((q, i) => ({
      x: lerp(a.points[i]!.x, q.x, t),
      y: lerp(a.points[i]!.y, q.y, t),
    }));
  return out as unknown as Shape;
}

function entering(b: Shape, t: number): Shape {
  const out: Record<string, unknown> = { ...b, opacity: lerp(0, b.opacity ?? 1, t) };
  if (b.enterFrom && 'x' in b) {
    out.x = lerp(b.enterFrom.x, b.x, t);
    out.y = lerp(b.enterFrom.y, b.y, t);
  }
  delete out.enterFrom;
  return out as unknown as Shape;
}

function leaving(a: Shape, t: number): Shape {
  return { ...a, opacity: lerp(a.opacity ?? 1, 0, t), enterFrom: undefined };
}

export function mixBounds(a: Bounds, b: Bounds, t: number): Bounds {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t) };
}

/**
 * Blend two scenes at t in [0, 1]. Shapes in both are moved and faded between their states,
 * new shapes fade (and optionally slide) in, removed shapes fade out.
 */
export function interpolate(a: Scene, b: Scene, t: number): Scene {
  if (t >= 1)
    return { ...b, shapes: sortShapes(b.shapes.map((s) => ({ ...s, enterFrom: undefined }))) };
  const before = new Map(a.shapes.map((s) => [s.id, s]));
  const shapes: Shape[] = [];
  const seen = new Set<string>();
  for (const s of b.shapes) {
    const prev = before.get(s.id);
    seen.add(s.id);
    shapes.push(prev && prev.kind === s.kind ? mix(prev, s, t) : entering(s, t));
  }
  for (const s of a.shapes) if (!seen.has(s.id)) shapes.push(leaving(s, t));
  return { label: b.label, bounds: mixBounds(a.bounds, b.bounds, t), shapes: sortShapes(shapes) };
}

export function sortShapes(shapes: Shape[]): Shape[] {
  return shapes
    .map((s, i) => ({ s, i }))
    .sort((p, q) => defaultZ(p.s) - defaultZ(q.s) || p.i - q.i)
    .map((p) => p.s);
}
