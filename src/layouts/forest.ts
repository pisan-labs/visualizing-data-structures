/**
 * Forests of multiway trees: binomial queues and Fibonacci heaps.
 *
 * Each tree gets a tidy layout: the children of a node are laid out left to right, each pushed
 * right only until its outline, at every depth, is `gap` clear of its older siblings', and the
 * parent sits centered over its first and last child. Trees then go side by side, `treeGap`
 * apart, wrapping onto a new row when a row would grow wider than `maxWidth`. The layout is
 * deterministic, so a tree that does not change keeps its shape, and a node that moves (a link,
 * a cut) slides to its new place.
 *
 * API
 *
 *   layoutForest(roots, children, options) -> ForestLayout
 *     roots        root ids, left to right
 *     children(id) child ids, left to right
 *     options      radius (17), gap (8), treeGap (28), levelGap (52), maxWidth (no wrapping),
 *                  rowGap (vertical room between rows, 40)
 *     Returns the center of every node, each tree's box and row, and the bounds of it all.
 *     The first row's roots are at y = 0; the forest starts at x = 0.
 *
 *   drawForest(layout, options) -> Shape[]
 *     Circles nodeShapeId(id), labels keyShapeId(id) (or options.keyId(id), so a key can move
 *     between nodes with its own identity), and edges:
 *       style 'tree'      a plain line from each parent to each child: forestEdgeId(child)
 *       style 'pointers'  left-child, right-sibling: an arrow from a node to its first child,
 *                         childPtrId(parent), and from each child to the next, siblingPtrId(id)
 *     Roles come from `roles` by those ids; a role on nodeShapeId(id) also colors its label.
 *
 *   The root list (the arrows between roots, a head pointer) is drawn by the view, which knows
 *   how its list is linked.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { keyShapeId, labelSize, nodeShapeId, trimmedLine } from './binary-tree';

export type ForestId = number;

export interface ForestOptions {
  radius?: number;
  gap?: number;
  treeGap?: number;
  levelGap?: number;
  maxWidth?: number;
  rowGap?: number;
}

export interface PlacedForestNode {
  id: ForestId;
  x: number;
  y: number;
  depth: number;
  parent: ForestId | null;
  root: ForestId;
}

export interface PlacedTree {
  root: ForestId;
  row: number;
  bounds: Bounds;
}

export interface ForestLayout {
  nodes: Map<ForestId, PlacedForestNode>;
  trees: PlacedTree[];
  bounds: Bounds;
  radius: number;
  levelGap: number;
}

interface Outline {
  l: number[];
  r: number[];
}

export const forestEdgeId = (child: ForestId) => `fedge-${child}`;
export const childPtrId = (parent: ForestId) => `fchild-${parent}`;
export const siblingPtrId = (id: ForestId) => `fsib-${id}`;

export function layoutForest(
  roots: ForestId[],
  children: (id: ForestId) => ForestId[],
  options: ForestOptions = {},
): ForestLayout {
  const radius = options.radius ?? 17;
  const gap = options.gap ?? 8;
  const treeGap = options.treeGap ?? 28;
  const levelGap = options.levelGap ?? 52;
  const maxWidth = options.maxWidth ?? Infinity;
  const rowGap = options.rowGap ?? 40;

  // Offsets of each child from its parent's center, filled in bottom-up.
  const offset = new Map<ForestId, number>();

  const outline = (id: ForestId, seen: Set<ForestId>): Outline => {
    if (seen.has(id)) throw new Error(`Node ${id} appears twice: not a forest.`);
    seen.add(id);
    const kids = children(id);
    const out: Outline = { l: [-radius], r: [radius] };
    if (kids.length === 0) return out;
    const placed: number[] = [];
    let merged: Outline = { l: [], r: [] };
    kids.forEach((k, i) => {
      const o = outline(k, seen);
      let x = 0;
      if (i > 0) {
        for (let d = 0; d < Math.min(o.l.length, merged.l.length); d++)
          x = Math.max(x, merged.r[d]! + gap - o.l[d]!);
      }
      placed.push(x);
      const next: Outline = { l: [...merged.l], r: [...merged.r] };
      for (let d = 0; d < o.l.length; d++) {
        const lo = x + o.l[d]!;
        const hi = x + o.r[d]!;
        if (d < next.l.length) {
          next.l[d] = Math.min(next.l[d]!, lo);
          next.r[d] = Math.max(next.r[d]!, hi);
        } else {
          next.l.push(lo);
          next.r.push(hi);
        }
      }
      merged = next;
    });
    const center = (placed[0]! + placed[placed.length - 1]!) / 2;
    kids.forEach((k, i) => offset.set(k, placed[i]! - center));
    for (let d = 0; d < merged.l.length; d++) {
      out.l.push(merged.l[d]! - center);
      out.r.push(merged.r[d]! - center);
    }
    return out;
  };

  const nodes = new Map<ForestId, PlacedForestNode>();
  const trees: PlacedTree[] = [];
  const seen = new Set<ForestId>();
  let x0 = 0;
  let row = 0;
  let rowTop = 0;
  let rowBottom = 0;

  for (const root of roots) {
    const o = outline(root, seen);
    const left = Math.min(...o.l);
    const right = Math.max(...o.r);
    const width = right - left;
    // Wrap, unless this tree is the first of its row.
    if (x0 > 0 && x0 + width > maxWidth) {
      row += 1;
      rowTop = rowBottom + rowGap + radius;
      x0 = 0;
    }
    const rootX = x0 - left;
    let maxY = rowTop;
    const place = (id: ForestId, x: number, depth: number, parent: ForestId | null) => {
      const y = rowTop + depth * levelGap;
      nodes.set(id, { id, x, y, depth, parent, root });
      maxY = Math.max(maxY, y);
      for (const k of children(id)) place(k, x + offset.get(k)!, depth + 1, id);
    };
    place(root, rootX, 0, null);
    trees.push({
      root,
      row,
      bounds: { x: x0, y: rowTop - radius, w: width, h: maxY - rowTop + 2 * radius },
    });
    rowBottom = Math.max(rowBottom, maxY + radius);
    x0 += width + treeGap;
  }

  let bounds: Bounds = { x: 0, y: 0, w: 0, h: 0 };
  if (trees.length) {
    const xs = trees.map((t) => t.bounds.x);
    const x2 = trees.map((t) => t.bounds.x + t.bounds.w);
    const y2 = trees.map((t) => t.bounds.y + t.bounds.h);
    const x = Math.min(...xs);
    bounds = { x, y: -radius, w: Math.max(...x2) - x, h: Math.max(...y2) + radius };
  }
  return { nodes, trees, bounds, radius, levelGap };
}

export interface DrawForestOptions {
  label(id: ForestId): string;
  /** The id of a node's label shape. Default keyShapeId(id). */
  keyId?(id: ForestId): string;
  children(id: ForestId): ForestId[];
  roles?: ReadonlyMap<string, MarkRole>;
  style?: 'tree' | 'pointers';
  baseRole?(id: ForestId): MarkRole | undefined;
  /** Extra CSS class for a node's circle. Default 'live'. */
  nodeClass?(id: ForestId): string;
}

export function drawForest(layout: ForestLayout, opts: DrawForestOptions): Shape[] {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const r = layout.radius;
  const shapes: Shape[] = [];
  for (const n of layout.nodes.values()) {
    const kids = opts.children(n.id);
    if (opts.style === 'pointers') {
      const first = kids[0];
      if (first !== undefined) {
        const c = layout.nodes.get(first)!;
        shapes.push({
          kind: 'arrow',
          id: childPtrId(n.id),
          ...trimmedLine(n, c, r, r + 2),
          role: roles.get(childPtrId(n.id)),
        });
      }
      kids.forEach((k, i) => {
        const next = kids[i + 1];
        if (next === undefined) return;
        const a = layout.nodes.get(k)!;
        const b = layout.nodes.get(next)!;
        shapes.push({
          kind: 'arrow',
          id: siblingPtrId(k),
          ...trimmedLine(a, b, r, r + 2),
          role: roles.get(siblingPtrId(k)),
        });
      });
    } else {
      for (const k of kids) {
        const c = layout.nodes.get(k)!;
        shapes.push({
          kind: 'arrow',
          id: forestEdgeId(k),
          ...trimmedLine(n, c, r, r),
          head: 'none',
          role: roles.get(forestEdgeId(k)),
        });
      }
    }
    const role = roles.get(nodeShapeId(n.id)) ?? opts.baseRole?.(n.id);
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(n.id),
      x: n.x,
      y: n.y,
      r,
      cls: opts.nodeClass?.(n.id) ?? 'live',
      role,
    });
    const text = opts.label(n.id);
    const size = labelSize(text, r);
    const kid = opts.keyId ? opts.keyId(n.id) : keyShapeId(n.id);
    shapes.push({
      kind: 'text',
      id: kid,
      x: n.x,
      y: n.y + size * 0.35,
      text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(kid) ?? role,
    });
  }
  return shapes;
}

/** Shift a layout (for a second forest drawn under the first). */
export function shiftForest(layout: ForestLayout, dx: number, dy: number): ForestLayout {
  const nodes = new Map(
    [...layout.nodes].map(([id, n]) => [id, { ...n, x: n.x + dx, y: n.y + dy }] as const),
  );
  const move = (b: Bounds) => ({ ...b, x: b.x + dx, y: b.y + dy });
  return {
    ...layout,
    nodes,
    trees: layout.trees.map((t) => ({ ...t, bounds: move(t.bounds) })),
    bounds: move(layout.bounds),
  };
}
