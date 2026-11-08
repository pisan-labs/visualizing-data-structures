/**
 * Extras over the alignment layout (src/layouts/align.ts) for pages that work along one string
 * rather than slide a pattern: several named pointers in the pointer lane (i, l, r; or i, C, R),
 * a tinted span over top-row cells (a Z-box, a palindrome, a sliding window), and a curved arrow
 * from one column to another (a value copied from its mirror). Used by the z-algorithm,
 * manacher and lz-compression pages.
 */
import type { MarkRole } from '../../engine/types';
import type { AlignGeometry } from '../../layouts/align';
import type { Shape } from '../../render/scene';

export interface Pointer {
  name: string;
  at: number;
  role?: MarkRole;
}

/**
 * Pointers over top-row columns. Names on the same column sit side by side, and so do their
 * arrows' heads, within the column. Shape ids: `ptr-<name>` the arrow, `ptr-<name>-label` the name
 * (a name's characters other than letters and digits become "_", so i' is `ptr-i_`).
 */
export function pointerShapes(
  g: AlignGeometry,
  pointers: readonly Pointer[],
  roles: ReadonlyMap<string, MarkRole> = new Map(),
): Shape[] {
  const shapes: Shape[] = [];
  const byCol = new Map<number, Pointer[]>();
  for (const p of pointers) byCol.set(p.at, [...(byCol.get(p.at) ?? []), p]);
  for (const [col, ps] of byCol) {
    const chars = ps.reduce((a, p) => a + p.name.length, 0) + ps.length - 1;
    const size = Math.max(14, Math.min(21, Math.floor((g.pitch * 1.9) / (chars * 0.6))));
    const unit = size * 0.6;
    let x = g.cx(col) - (chars * unit) / 2;
    for (const p of ps) {
      const w = p.name.length * unit;
      const id = `ptr-${p.name.replace(/[^A-Za-z0-9]/g, '_')}`;
      const role = roles.get(id) ?? p.role ?? 'active';
      const lx = x + w / 2;
      shapes.push({
        kind: 'text',
        id: `${id}-label`,
        x: lx,
        y: g.pointerTop + 16,
        text: p.name,
        size,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role,
      });
      shapes.push({
        kind: 'arrow',
        id,
        x1: lx,
        y1: g.pointerTop + 21,
        // Names that share a column point at it side by side, so their heads do not pile up.
        x2: g.cx(col) + Math.max(-g.pitch * 0.3, Math.min(g.pitch * 0.3, lx - g.cx(col))),
        y2: g.indexY - 15,
        role,
      });
      x += w + unit;
    }
  }
  return shapes;
}

/**
 * A tinted span over top-row cells from..to (inclusive), with a dashed outline so it does not
 * rest on color alone. `top`/`bottom` default to the text row. Shape ids: `<id>` the tint,
 * `<id>-box` the outline.
 */
export function spanShapes(
  g: AlignGeometry,
  id: string,
  from: number,
  to: number,
  role: MarkRole,
  o: { top?: number; bottom?: number; pad?: number; outline?: boolean } = {},
): Shape[] {
  if (to < from) return [];
  const pad = o.pad ?? 3;
  const x1 = g.left(from) - pad;
  const x2 = g.left(to + 1) + pad;
  const y1 = (o.top ?? g.textTop) - pad;
  const y2 = (o.bottom ?? g.textBottom) + pad;
  const out: Shape[] = [
    {
      kind: 'polygon',
      id,
      points: [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ],
      role,
      z: 1.2,
    },
  ];
  if (o.outline !== false)
    out.push({
      kind: 'rect',
      id: `${id}-box`,
      x: x1,
      y: y1,
      w: x2 - x1,
      h: y2 - y1,
      r: 4,
      cls: 'ghost',
      z: 1.3,
    });
  return out;
}

/** A curved arrow from column `from` to column `to` at height y, bulging by `bulge` (down > 0). */
export function arcShape(
  g: AlignGeometry,
  id: string,
  from: number,
  to: number,
  y: number,
  bulge: number,
  role: MarkRole = 'active',
  dashed = false,
): Shape {
  const x1 = g.cx(from);
  const x2 = g.cx(to);
  return {
    kind: 'arrow',
    id,
    x1,
    y1: y,
    x2,
    y2: y,
    via: { x: (x1 + x2) / 2, y: y + 2 * bulge },
    role,
    dashed,
    z: 1.6,
  };
}
