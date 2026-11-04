/**
 * Tidy layout for binary trees, shared by every tree page (BST, AVL, red-black, splay, treap,
 * heaps, Huffman, recursion trees).
 *
 * The algorithm is Reingold-Tilford: lay out each subtree on its own, then push the left and
 * right subtrees of a node together until, at some depth, their outlines are `gap` apart.
 * The parent sits centered over its two children. A lone child sits half a sibling's distance
 * to its side, so left and right stay visible. The result is deterministic, compact, never
 * overlaps, and draws the same subtree the same way wherever it appears, so small changes to
 * a tree move only the nodes near the change. That keeps animations calm.
 *
 * Plain Reingold-Tilford lets a deeper subtree tuck a node right under a neighboring leaf, where
 * it looks like that leaf's child. So the outline of every node also keeps the spot where
 * nilSpot draws each of its missing children: no node of another subtree comes within
 * `radius + gap` of it sideways. (With `nulls`, the null squares themselves take that room.)
 *
 * API
 *
 *   layoutBinaryTree(root, { left, right }, options) -> TreeLayout
 *     root     the root id, or null for an empty tree. Ids are any strings or numbers
 *              (use the uid that gives a node its identity in your model).
 *     left/right  child accessors that return an id or null.
 *     options  radius, gap, levelGap: node size and spacing in scene units.
 *              width(id): a node's drawn width when it is not a circle (for example a
 *                         "fib(4)" box in a recursion tree). Defaults to 2 * radius.
 *              nulls: also lay out empty children as small squares that take up room
 *                     (red-black trees draw their NIL leaves this way).
 *     Returns node centers (root at x = 0, y = 0, one level per levelGap), the null squares
 *     when asked for, the height (edges on the longest path, -1 when empty), and the tight
 *     bounds of everything drawn.
 *
 *   drawBinaryTree(layout, { label, roles, ... }) -> Shape[]
 *     Circles for nodes, the label as a separate text shape, edges as arrows with head 'none',
 *     and the null squares. Shape ids come from the helpers below and are keyed by node id, so
 *     a node that moves keeps its shapes and the renderer animates it:
 *       nodeShapeId(id)  circle        keyShapeId(id)  label
 *       edgeShapeId(id)  the edge from id's parent down to id
 *       nullShapeId(parent, side), nullEdgeShapeId(parent, side)
 *     Marks in a step should use these ids.
 *
 *   nilSpot(layout, parent, side): where to draw a temporary "nil" marker for an empty child
 *     when nulls are not laid out, placed so it never touches a neighbor.
 *   padBounds(bounds, margin): grow bounds on every side, for a scene's framing.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type TreeId = string | number;
export type Side = 'left' | 'right';

export interface BinaryTreeAccess<Id extends TreeId> {
  left(id: Id): Id | null;
  right(id: Id): Id | null;
}

export interface TreeLayoutOptions<Id extends TreeId> {
  /** Node radius in scene units. Default 17. */
  radius?: number;
  /** Smallest horizontal gap between two outlines on the same level. Default 8. */
  gap?: number;
  /** Vertical distance between levels, center to center. Default 52. */
  levelGap?: number;
  /** Drawn width of a node that is not a circle. Default 2 * radius. */
  width?: (id: Id) => number;
  /** Lay out empty children as small squares that take up room. Default false. */
  nulls?: boolean;
  /** Side of a null square. Default 12. */
  nullSize?: number;
  /** Vertical distance from a node down to its null squares. Default 0.7 * levelGap. */
  nullDrop?: number;
}

export interface PlacedNode<Id extends TreeId> {
  id: Id;
  x: number;
  y: number;
  depth: number;
  parent: Id | null;
  /** Which child of its parent this node is; null for the root. */
  side: Side | null;
}

export interface PlacedNull<Id extends TreeId> {
  parent: Id;
  side: Side;
  x: number;
  y: number;
  depth: number;
}

export interface TreeLayout<Id extends TreeId> {
  /** Every node, in preorder. */
  nodes: Map<Id, PlacedNode<Id>>;
  /** Null squares, in preorder (empty unless `nulls` was asked for). */
  nulls: PlacedNull<Id>[];
  /** Edges on the longest root-to-leaf path; -1 for an empty tree. */
  height: number;
  /** Tight box around every node outline and null square. Zero size for an empty tree. */
  bounds: Bounds;
  radius: number;
  gap: number;
  levelGap: number;
  nullSize: number;
}

interface Outline {
  /** Left and right edges of the subtree at each depth, relative to its root's center. */
  l: number[];
  r: number[];
}

type Item<Id> = { id: Id } | { parent: Id; side: Side };

/** Reingold-Tilford layout. See the comment at the top of this file. */
export function layoutBinaryTree<Id extends TreeId>(
  root: Id | null,
  tree: BinaryTreeAccess<Id>,
  options: TreeLayoutOptions<Id> = {},
): TreeLayout<Id> {
  const radius = options.radius ?? 17;
  const gap = options.gap ?? 8;
  const levelGap = options.levelGap ?? 52;
  const nullSize = options.nullSize ?? 12;
  const nullDrop = options.nullDrop ?? levelGap * 0.7;
  const half = (id: Id) => (options.width ? options.width(id) : 2 * radius) / 2;
  const lone = radius + gap / 2;
  const nilDx = nilOffset(radius, gap);

  const children = (id: Id): [Item<Id> | null, Item<Id> | null] => {
    const pick = (c: Id | null, side: Side): Item<Id> | null =>
      c !== null ? { id: c } : options.nulls ? { parent: id, side } : null;
    return [pick(tree.left(id), 'left'), pick(tree.right(id), 'right')];
  };

  // Offsets of each node's children from its center, filled in bottom-up.
  const offsets = new Map<Id, [number, number]>();
  const seen = new Set<Id>();

  const outline = (item: Item<Id>): Outline => {
    if (!('id' in item)) return { l: [-nullSize / 2], r: [nullSize / 2] };
    const id = item.id;
    if (seen.has(id)) throw new Error(`Node ${String(id)} appears twice: not a tree.`);
    seen.add(id);
    const [a, b] = children(id);
    const oa = a && outline(a);
    const ob = b && outline(b);
    let offL = 0;
    let offR = 0;
    if (oa && ob) {
      let d = 0;
      const n = Math.min(oa.l.length, ob.l.length);
      for (let k = 0; k < n; k++) d = Math.max(d, oa.r[k]! - ob.l[k]! + gap);
      offL = -d / 2;
      offR = d / 2;
    } else if (oa) {
      offL = -lone;
    } else if (ob) {
      offR = lone;
    }
    offsets.set(id, [offL, offR]);
    const h = half(id);
    const out: Outline = { l: [-h], r: [h] };
    const depth = Math.max(oa?.l.length ?? 0, ob?.l.length ?? 0);
    for (let k = 0; k < depth; k++) {
      let lo = Infinity;
      let hi = -Infinity;
      if (oa && k < oa.l.length) {
        lo = Math.min(lo, offL + oa.l[k]!);
        hi = Math.max(hi, offL + oa.r[k]!);
      }
      if (ob && k < ob.l.length) {
        lo = Math.min(lo, offR + ob.l[k]!);
        hi = Math.max(hi, offR + ob.r[k]!);
      }
      out.l.push(lo);
      out.r.push(hi);
    }
    // Keep the nil spot of each missing child free: a zero-width point one level down, so a
    // node of a neighboring subtree stays at least radius + gap away from it sideways.
    if (!options.nulls) {
      for (const [item, x] of [
        [a, -nilDx],
        [b, nilDx],
      ] as const) {
        if (item !== null) continue;
        if (out.l.length < 2) {
          out.l.push(x);
          out.r.push(x);
        } else {
          out.l[1] = Math.min(out.l[1]!, x);
          out.r[1] = Math.max(out.r[1]!, x);
        }
      }
    }
    return out;
  };

  const nodes = new Map<Id, PlacedNode<Id>>();
  const nulls: PlacedNull<Id>[] = [];
  let height = -1;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const place = (id: Id, x: number, depth: number, parent: Id | null, side: Side | null) => {
    const y = depth * levelGap;
    nodes.set(id, { id, x, y, depth, parent, side });
    height = Math.max(height, depth);
    minX = Math.min(minX, x - half(id));
    maxX = Math.max(maxX, x + half(id));
    maxY = Math.max(maxY, y + radius);
    const [offL, offR] = offsets.get(id)!;
    const [a, b] = children(id);
    for (const [item, off, s] of [
      [a, offL, 'left'],
      [b, offR, 'right'],
    ] as const) {
      if (!item) continue;
      if ('id' in item) {
        place(item.id, x + off, depth + 1, id, s);
      } else {
        const ny = y + nullDrop;
        nulls.push({ parent: id, side: s, x: x + off, y: ny, depth: depth + 1 });
        minX = Math.min(minX, x + off - nullSize / 2);
        maxX = Math.max(maxX, x + off + nullSize / 2);
        maxY = Math.max(maxY, ny + nullSize / 2);
      }
    }
  };

  if (root !== null) {
    outline({ id: root });
    place(root, 0, 0, null, null);
  }

  const bounds: Bounds =
    root === null
      ? { x: 0, y: 0, w: 0, h: 0 }
      : { x: minX, y: -radius, w: maxX - minX, h: maxY + radius };
  return { nodes, nulls, height, bounds, radius, gap, levelGap, nullSize };
}

export const nodeShapeId = (id: TreeId) => `node-${id}`;
export const keyShapeId = (id: TreeId) => `key-${id}`;
export const edgeShapeId = (id: TreeId) => `edge-${id}`;
export const nullShapeId = (parent: TreeId, side: Side) =>
  `null-${parent}-${side === 'left' ? 'L' : 'R'}`;
export const nullEdgeShapeId = (parent: TreeId, side: Side) =>
  `nulledge-${parent}-${side === 'left' ? 'L' : 'R'}`;

/** Font size for a node label: smaller for longer labels so they stay inside the circle. */
export function labelSize(text: string, radius = 17): number {
  const scale = radius / 17;
  const base = text.length <= 2 ? 16 : text.length === 3 ? 13.5 : 11.5;
  return Math.round(base * scale * 10) / 10;
}

export interface DrawTreeOptions<Id extends TreeId> {
  /** The text drawn in the node. */
  label(id: Id): string;
  /** Roles by shape id, usually built from the step's marks. */
  roles?: ReadonlyMap<string, MarkRole>;
  /** Role to use for a node's circle and label when no mark names it. */
  baseRole?(id: Id): MarkRole | undefined;
  /** Extra CSS class for a node's circle. Default 'live'. */
  nodeClass?(id: Id): string;
  /** Opacity of a node (circle, label and the edge into it). */
  opacity?(id: Id): number | undefined;
  /** Where a node slides in from the first time it appears. */
  enterFrom?(id: Id): { x: number; y: number } | undefined;
}

/** End points of a line between two circles, trimmed so it stops at both outlines. */
export function trimmedLine(
  a: { x: number; y: number },
  b: { x: number; y: number },
  ra: number,
  rb: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: a.x + ux * ra, y1: a.y + uy * ra, x2: b.x - ux * rb, y2: b.y - uy * rb };
}

/**
 * Shapes for a laid-out tree: edges (head 'none'), circles, labels and null squares. A node's
 * circle and label use the role marked on their own id, or failing that the circle's mark, or
 * failing that `baseRole`.
 */
export function drawBinaryTree<Id extends TreeId>(
  layout: TreeLayout<Id>,
  opts: DrawTreeOptions<Id>,
): Shape[] {
  const r = layout.radius;
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  for (const n of layout.nodes.values()) {
    const role = roles.get(nodeShapeId(n.id)) ?? opts.baseRole?.(n.id);
    const opacity = opts.opacity?.(n.id);
    const enter = opts.enterFrom?.(n.id);
    if (n.parent !== null) {
      const p = layout.nodes.get(n.parent)!;
      shapes.push({
        kind: 'arrow',
        id: edgeShapeId(n.id),
        ...trimmedLine(p, n, r, r),
        head: 'none',
        role: roles.get(edgeShapeId(n.id)),
        opacity,
      });
    }
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(n.id),
      x: n.x,
      y: n.y,
      r,
      cls: opts.nodeClass?.(n.id) ?? 'live',
      role,
      opacity,
      enterFrom: enter,
    });
    const text = opts.label(n.id);
    const size = labelSize(text, r);
    shapes.push({
      kind: 'text',
      id: keyShapeId(n.id),
      x: n.x,
      y: n.y + size * 0.35,
      text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(keyShapeId(n.id)) ?? role,
      opacity,
      enterFrom: enter && { x: enter.x, y: enter.y + size * 0.35 },
    });
  }
  for (const z of layout.nulls) {
    const p = layout.nodes.get(z.parent)!;
    const s = layout.nullSize;
    shapes.push({
      kind: 'arrow',
      id: nullEdgeShapeId(z.parent, z.side),
      ...trimmedLine(p, z, r, s / 2),
      head: 'none',
      cls: 'null-edge',
      role: roles.get(nullEdgeShapeId(z.parent, z.side)),
    });
    shapes.push({
      kind: 'rect',
      id: nullShapeId(z.parent, z.side),
      x: z.x - s / 2,
      y: z.y - s / 2,
      w: s,
      h: s,
      r: 2,
      cls: 'null',
      role: roles.get(nullShapeId(z.parent, z.side)),
    });
  }
  return shapes;
}

/**
 * A spot for a temporary "nil" marker under `parent` on `side`, when null children are not
 * laid out. It sits a little over halfway down the would-be edge, where it cannot touch the
 * parent, the sibling, or a node of a neighboring subtree.
 */
export function nilSpot<Id extends TreeId>(
  layout: TreeLayout<Id>,
  parent: Id,
  side: Side,
): { x: number; y: number } {
  const p = layout.nodes.get(parent);
  if (!p) return { x: 0, y: 0 };
  const dx = nilOffset(layout.radius, layout.gap);
  // A little over halfway down, but never so high that the marker touches its parent. The
  // layout keeps nodes of other subtrees at least radius + gap away from this spot sideways.
  const clear = layout.radius + NIL_SIZE / Math.SQRT2 + 1;
  const dy = Math.max(layout.levelGap * 0.55, Math.sqrt(Math.max(0, clear * clear - dx * dx)));
  return { x: p.x + (side === 'left' ? -dx : dx), y: p.y + dy };
}

/** Side of the nil marker that nilSpot makes room for. */
export const NIL_SIZE = 12;

/** How far to the side of its parent a nil marker sits. */
function nilOffset(radius: number, gap: number): number {
  return (radius + gap / 2) * 0.55;
}

/** Grow bounds by `margin` on every side. */
export function padBounds(b: Bounds, margin: number): Bounds {
  return { x: b.x - margin, y: b.y - margin, w: b.w + 2 * margin, h: b.h + 2 * margin };
}

/** The smallest box holding all of the given boxes. Empty boxes (w = h = 0) are ignored. */
export function unionBounds(...boxes: Bounds[]): Bounds {
  const real = boxes.filter((b) => b.w > 0 || b.h > 0);
  if (real.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...real.map((b) => b.x));
  const y = Math.min(...real.map((b) => b.y));
  const r = Math.max(...real.map((b) => b.x + b.w));
  const bottom = Math.max(...real.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bottom - y };
}
