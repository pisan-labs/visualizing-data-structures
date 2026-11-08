/**
 * Fitting a part of a drawing into the room another part leaves: a table or a second picture
 * slid in beside a tree, or under it, as far as it goes. A tree is a triangle, so there is often
 * room by its sloping sides.
 *
 *   room(moving, fixed, axis, clear)  how far `moving` can travel toward smaller x (or y)
 *   along(x1, y1, x2, y2)             points along a line, standing in for it in `room`
 */
import type { Bounds } from '../render/scene';

/** Points along a line (without its ends), standing in for the line when checking for room. */
export function along(x1: number, y1: number, x2: number, y2: number, n = 8): Bounds[] {
  const out: Bounds[] = [];
  for (let k = 1; k < n; k++)
    out.push({ x: x1 + ((x2 - x1) * k) / n, y: y1 + ((y2 - y1) * k) / n, w: 0, h: 0 });
  return out;
}

/**
 * How far the boxes in `moving` can travel toward smaller `axis` values (left for x, up for y)
 * before one of them comes closer than `clear` to a box in `fixed`. Boxes that do not line up
 * across the direction of travel never meet; a fixed box already behind a moving one does not
 * count. Never negative.
 */
export function room(
  moving: readonly Bounds[],
  fixed: readonly Bounds[],
  axis: 'x' | 'y',
  clear: number,
): number {
  const other = axis === 'x' ? 'y' : 'x';
  const len = axis === 'x' ? 'w' : 'h';
  const olen = axis === 'x' ? 'h' : 'w';
  let best = Infinity;
  for (const m of moving)
    for (const f of fixed) {
      if (m[other] >= f[other] + f[olen] + clear || f[other] >= m[other] + m[olen] + clear)
        continue;
      if (f[axis] >= m[axis] + m[len]) continue;
      best = Math.min(best, m[axis] - (f[axis] + f[len] + clear));
    }
  return Math.max(0, best);
}

/** Boxes moved by (dx, dy). */
export const shifted = (boxes: readonly Bounds[], dx: number, dy: number): Bounds[] =>
  boxes.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }));
