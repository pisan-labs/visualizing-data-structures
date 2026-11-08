/**
 * Test helper: labels in a graph scene that overlap each other or a vertex they do not belong
 * to (weights, d badges, pointer labels, edge letters). src/viz/paths.test.ts runs it on the
 * curated examples of every page that draws a graph with src/layouts/graph.ts.
 */
import type { Shape } from '../../render/scene';

interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function textBox(s: Extract<Shape, { kind: 'text' }>): Box {
  const size = s.size ?? 16;
  // Glyphs average about 0.6 of the size (narrower for digits in a sans font).
  const w = s.text.length * size * (s.mono ? 0.6 : 0.56);
  const x = s.anchor === 'middle' ? s.x - w / 2 : s.anchor === 'end' ? s.x - w : s.x;
  return { id: s.id, x, y: s.y - size * 0.75, w, h: size * 0.9 };
}

/**
 * Text boxes are estimates from advance widths and cap height, so they run about a unit wider
 * and taller than the ink on each side; `pad` is how far two boxes may overlap and still pass.
 */
const PAD = 2;

const hit = (a: Box, b: Box, pad = 0) =>
  a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad;

function circleHitsBox(c: Extract<Shape, { kind: 'circle' }>, b: Box): boolean {
  const x = Math.max(b.x, Math.min(c.x, b.x + b.w));
  const y = Math.max(b.y, Math.min(c.y, b.y + b.h));
  return Math.hypot(c.x - x, c.y - y) < c.r - 1;
}

/** Which vertex a label belongs to, if any: "vn-A", "vn-A-box", "vl-A" belong to A. */
function owner(id: string): string | null {
  const m = /^(?:vn|vl|vr|vx)-([^-]+)/.exec(id);
  return m ? m[1]! : null;
}

/** Pairs of overlapping labels (ids), in a graph drawing. */
export function overlaps(shapes: Shape[]): string[] {
  const labels: Box[] = [];
  const circles: Extract<Shape, { kind: 'circle' }>[] = [];
  for (const s of shapes) {
    if ((s.opacity ?? 1) <= 0) continue;
    if (s.kind === 'circle' && s.id.startsWith('vx-')) circles.push(s);
    else if (s.kind === 'rect' && /^vn-.*-box$/.test(s.id))
      labels.push({ id: s.id, x: s.x, y: s.y, w: s.w, h: s.h });
    else if (s.kind === 'text' && /^(ew|ptr|ek)-/.test(s.id)) labels.push(textBox(s));
  }
  const out: string[] = [];
  for (let i = 0; i < labels.length; i++)
    for (let j = i + 1; j < labels.length; j++)
      if (hit(labels[i]!, labels[j]!, PAD)) out.push(`${labels[i]!.id} / ${labels[j]!.id}`);
  for (const b of labels)
    for (const c of circles) {
      if (owner(b.id) && owner(b.id) === owner(c.id)) continue;
      if (circleHitsBox(c, b)) out.push(`${b.id} / ${c.id}`);
    }
  return out;
}
