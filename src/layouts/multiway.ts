/**
 * Multiway trees whose nodes are rows of key cells: B-trees, 2-4 trees and B+ trees. A node is a
 * rounded frame around its keys, one cell per key. Child pointers leave the bottom of the frame
 * between and beside the keys, so the pointer between keys a and b leads to the keys between
 * a and b. Every key has its own id, so a key that moves to another node (a split, a borrow, a
 * merge) slides there instead of fading out and back in.
 *
 * API
 *
 *   layoutMultiway(root, { kids, width }, options) -> MultiwayLayout
 *     root      the root id, or null for an empty tree. Ids are strings or numbers (use the uid
 *               that gives a node its identity in your model).
 *     kids(id)  the node's children, left to right (empty for a leaf).
 *     width(id) the node's drawn width; nodeWidth(keyCount) gives the width drawMultiway uses.
 *     options   gap: smallest gap between neighbouring subtrees; levelGap: from the top of one
 *               level to the top of the next; nodeH: the frame's height.
 *     Each subtree gets a band as wide as its children's bands put side by side (or as the node
 *     itself, if wider), and a parent sits centered over its children. Bands never overlap, so
 *     nodes never do, and a change in one subtree moves only the nodes to its right. Returns
 *     every node's frame (left x, top y, w, h), depth, parent and index among its siblings, the
 *     ids at each depth, the height (-1 when empty) and the bounds of all frames.
 *
 *   drawMultiway(layout, { keys, roles, ... }) -> Shape[]
 *     Frames, key cells, key labels, child edges and pointer dots. Shape ids:
 *       nodeShapeId(node)   the frame          cellShapeId(key)  a key's cell
 *       keyShapeId(key)     a key's label      edgeShapeId(child) the edge down into child
 *       dotShapeId(child)   the pointer dot where that edge leaves its parent
 *     Marks in a step should use these ids. A key marked `ghost` is drawn dashed and faded: a
 *     leftover copy that is about to be deleted.
 *
 *   keyCell(key, x, y, opts) -> Shape[]
 *     One free-standing key cell (an argument box, a key in flight) with the same ids, so a key
 *     drawn there slides into the tree when it is inserted.
 *
 *   pointerAnchor(placed, index, keyCount): where the pointer to child `index` leaves the node.
 *   nodeWidth(keyCount), CELL, NODE_PAD, NODE_H: the sizes drawMultiway uses.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type MultiId = string | number;

/** Width of one key cell, in scene units. Narrow enough for a 20-key tree on a phone. */
export const CELL = 24;
/** Space between the frame and the cells inside it. */
export const NODE_PAD = 2;
/** Height of a node's frame. */
export const NODE_H = CELL + 2 * NODE_PAD;

/** Drawn width of a node holding `keys` keys. An empty node is one cell wide. */
export function nodeWidth(keys: number): number {
  return Math.max(1, keys) * CELL + 2 * NODE_PAD;
}

/** Font size for a key, so up to four characters fit in a cell. */
export function keyFontSize(text: string): number {
  return text.length <= 2 ? 15 : text.length === 3 ? 11.5 : 9.5;
}

export interface MultiwayAccess<Id extends MultiId> {
  kids(id: Id): readonly Id[];
  width(id: Id): number;
}

export interface MultiwayOptions {
  /** Smallest horizontal gap between neighbouring subtrees. Default 8. */
  gap?: number;
  /** From the top of one level to the top of the next. Default 58. */
  levelGap?: number;
  /** Height of a node's frame. Default NODE_H. */
  nodeH?: number;
}

export interface PlacedMulti<Id extends MultiId> {
  id: Id;
  /** Left and top edges of the frame. */
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  parent: Id | null;
  /** Position among its parent's children; 0 for the root. */
  index: number;
}

export interface MultiwayLayout<Id extends MultiId> {
  /** Every node, in preorder. */
  nodes: Map<Id, PlacedMulti<Id>>;
  /** Node ids at each depth, left to right. */
  levels: Id[][];
  /** Edges on the longest root-to-leaf path; -1 for an empty tree. */
  height: number;
  /** Tight box around every frame. Zero size for an empty tree. */
  bounds: Bounds;
  levelGap: number;
}

export function layoutMultiway<Id extends MultiId>(
  root: Id | null,
  tree: MultiwayAccess<Id>,
  options: MultiwayOptions = {},
): MultiwayLayout<Id> {
  const gap = options.gap ?? 8;
  const levelGap = options.levelGap ?? 58;
  const nodeH = options.nodeH ?? NODE_H;

  // Width of each subtree's band, bottom-up.
  const band = new Map<Id, number>();
  const measure = (id: Id): number => {
    if (band.has(id)) throw new Error(`Node ${String(id)} appears twice: not a tree.`);
    band.set(id, 0);
    const kids = tree.kids(id);
    let sum = 0;
    kids.forEach((k, i) => (sum += measure(k) + (i ? gap : 0)));
    const b = Math.max(tree.width(id), sum);
    band.set(id, b);
    return b;
  };

  // Children are placed before their parent (the parent centers over them).
  const placed = new Map<Id, PlacedMulti<Id>>();
  const place = (id: Id, left: number, depth: number, parent: Id | null, index: number) => {
    const b = band.get(id)!;
    const w = tree.width(id);
    const kids = tree.kids(id);
    let cx = left + b / 2;
    if (kids.length) {
      let sum = 0;
      kids.forEach((k, i) => (sum += band.get(k)! + (i ? gap : 0)));
      let x = left + (b - sum) / 2;
      kids.forEach((k, i) => {
        place(k, x, depth + 1, id, i);
        x += band.get(k)! + gap;
      });
      const first = placed.get(kids[0]!)!;
      const last = placed.get(kids[kids.length - 1]!)!;
      cx = (first.x + first.w / 2 + last.x + last.w / 2) / 2;
      cx = Math.max(left + w / 2, Math.min(left + b - w / 2, cx));
    }
    placed.set(id, { id, x: cx - w / 2, y: depth * levelGap, w, h: nodeH, depth, parent, index });
  };

  // Then a preorder walk lists the nodes, and each level left to right.
  const nodes = new Map<Id, PlacedMulti<Id>>();
  const levels: Id[][] = [];
  let height = -1;
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (id: Id) => {
    const n = placed.get(id)!;
    nodes.set(id, n);
    (levels[n.depth] ??= []).push(id);
    height = Math.max(height, n.depth);
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
    for (const k of tree.kids(id)) walk(k);
  };

  if (root !== null) {
    measure(root);
    place(root, 0, 0, null, 0);
    walk(root);
  }
  const bounds: Bounds =
    root === null ? { x: 0, y: 0, w: 0, h: 0 } : { x: minX, y: 0, w: maxX - minX, h: maxY };
  return { nodes, levels, height, bounds, levelGap };
}

export const nodeShapeId = (id: MultiId) => `node-${id}`;
export const cellShapeId = (key: MultiId) => `cell-${key}`;
export const keyShapeId = (key: MultiId) => `key-${key}`;
export const edgeShapeId = (child: MultiId) => `edge-${child}`;
export const dotShapeId = (child: MultiId) => `dot-${child}`;

/** Where the pointer to child `index` leaves a node with `keyCount` keys. */
export function pointerAnchor(
  node: { x: number; y: number; w: number; h: number },
  index: number,
  keyCount: number,
): { x: number; y: number } {
  const y = node.y + node.h;
  if (keyCount === 0) return { x: node.x + node.w / 2, y };
  const i = Math.max(0, Math.min(index, keyCount));
  // The two outer pointers sit just inside the frame's rounded corners.
  const x = node.x + NODE_PAD + i * CELL;
  return { x: Math.max(node.x + 5, Math.min(node.x + node.w - 5, x)), y };
}

export interface KeyLabel {
  /** The key's identity: its shapes are cellShapeId(id) and keyShapeId(id). */
  id: MultiId;
  text: string;
  /** A leftover copy, about to be deleted: dashed cell, faded label. */
  ghost?: boolean;
}

export interface DrawMultiwayOptions<Id extends MultiId> {
  /** The keys in a node, in order. */
  keys(id: Id): KeyLabel[];
  /** Roles by shape id, usually built from the step's marks. */
  roles?: ReadonlyMap<string, MarkRole>;
  /** Role for a node's frame when no mark names it (for example 'visit' on a search path). */
  nodeRole?(id: Id): MarkRole | undefined;
  /** Extra CSS class for a frame. */
  nodeClass?(id: Id): string | undefined;
  /** Where a key slides in from the first time it appears. */
  enterFrom?(key: MultiId): { x: number; y: number } | undefined;
  /** Skip the edge into this child (a view that draws its own). */
  skipEdge?(child: Id): boolean;
}

/** One key cell and its label at (x, y), the cell's top-left corner. */
export function keyCell(
  key: KeyLabel,
  x: number,
  y: number,
  opts: {
    role?: MarkRole;
    textRole?: MarkRole;
    enterFrom?: { x: number; y: number };
    opacity?: number;
  } = {},
): Shape[] {
  const size = keyFontSize(key.text);
  const enter = opts.enterFrom;
  return [
    {
      kind: 'rect',
      id: cellShapeId(key.id),
      x,
      y,
      w: CELL,
      h: CELL,
      r: 2,
      cls: key.ghost ? 'ghost' : 'live',
      role: opts.role,
      opacity: opts.opacity,
      z: 1.2,
      enterFrom: enter && { x: enter.x - CELL / 2, y: enter.y - CELL / 2 },
    },
    {
      kind: 'text',
      id: keyShapeId(key.id),
      x: x + CELL / 2,
      y: y + CELL / 2 + size * 0.36,
      text: key.text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: key.ghost ? (opts.textRole ?? 'stale') : (opts.textRole ?? opts.role),
      opacity: opts.opacity,
      enterFrom: enter && { x: enter.x, y: enter.y + size * 0.36 },
    },
  ];
}

/** Frames, key cells, labels, child edges and pointer dots for a laid-out tree. */
export function drawMultiway<Id extends MultiId>(
  layout: MultiwayLayout<Id>,
  opts: DrawMultiwayOptions<Id>,
): Shape[] {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  for (const n of layout.nodes.values()) {
    const keys = opts.keys(n.id);
    if (n.parent !== null && !opts.skipEdge?.(n.id)) {
      const p = layout.nodes.get(n.parent)!;
      const a = pointerAnchor(p, n.index, opts.keys(n.parent).length);
      const role = roles.get(edgeShapeId(n.id));
      shapes.push({
        kind: 'arrow',
        id: edgeShapeId(n.id),
        x1: a.x,
        y1: a.y,
        x2: n.x + n.w / 2,
        y2: n.y,
        head: 'none',
        role,
      });
      shapes.push({
        kind: 'circle',
        id: dotShapeId(n.id),
        x: a.x,
        y: a.y,
        r: 2.6,
        cls: 'arrowhead',
        role,
        z: 1.6,
      });
    }
    shapes.push({
      kind: 'rect',
      id: nodeShapeId(n.id),
      x: n.x,
      y: n.y,
      w: n.w,
      h: n.h,
      r: 6,
      cls: opts.nodeClass?.(n.id),
      role: roles.get(nodeShapeId(n.id)) ?? opts.nodeRole?.(n.id),
    });
    keys.forEach((k, i) => {
      const role = roles.get(cellShapeId(k.id));
      shapes.push(
        ...keyCell(k, n.x + NODE_PAD + i * CELL, n.y + NODE_PAD, {
          role,
          textRole: roles.get(keyShapeId(k.id)),
          enterFrom: opts.enterFrom?.(k.id),
        }),
      );
    });
  }
  return shapes;
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
