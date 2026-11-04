/**
 * Array-backed complete binary trees: binary heaps and heap sort.
 *
 * The tree is the tidy layout of binary-tree.ts, laid out by array position, so its shape
 * depends only on how many items there are. Values are drawn with their own identity (an id
 * the model gives each value, usually a uid), in the tree and in the array under it. A swap
 * then animates the value in both pictures, and a mark on the value highlights both. Edges,
 * cells and index labels belong to positions, so they stay put while values move.
 *
 * API
 *
 *   heapLayout(n, options) -> HeapTreeLayout
 *     Node centers of a complete binary tree with n nodes, by 0-based array position: the
 *     children of p are 2p + 1 and 2p + 2. The root is at x = 0, y = 0. Options are those of
 *     layoutBinaryTree (radius, gap, levelGap). `height` is -1 when n = 0.
 *
 *   drawHeapTree(layout, items, options) -> Shape[]
 *     items[p] = { id, text } is the value at position p. Draws, for every position p:
 *       heapEdgeId(p)        the edge from p's parent down to p
 *       nodeShapeId(id)      the circle,  keyShapeId(id)  its label
 *       treeIndexId(p)       the array index (p + base) under the node, when `base` is given;
 *                            leave TREE_INDEX_ROOM free under the tree for the bottom row
 *     `opacity(p)` fades a position (heap sort fades the sorted part).
 *
 *   drawHeapArray(items, options) -> { shapes, bounds, cell(p) }
 *     The array: cells cellId(p), the value in each cellValueId(id), and the index p + base under
 *     each cell, cellIndexId(p). The row is centered on x = 0 (under the root) with its top at
 *     `top`, and wraps every `perRow` cells. `name` labels the array ("A") on its left.
 *
 *   Roles: pass the step's marks as `roles`. A role on nodeShapeId(id) colors that value
 *   everywhere: its circle, its label, its array cell and its array text. A role on cellId(p)
 *   or heapEdgeId(p) colors that cell or edge alone.
 *
 *   arrayRowLength(height): how many cells per row keep the array no wider than the tree's
 *   bottom level, with at least 8 per row.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import {
  keyShapeId,
  labelSize,
  layoutBinaryTree,
  nodeShapeId,
  trimmedLine,
  type TreeLayout,
  type TreeLayoutOptions,
} from './binary-tree';

export interface HeapTreeLayout {
  n: number;
  tree: TreeLayout<number>;
  /** Center of position p. */
  at(p: number): { x: number; y: number };
  height: number;
  bounds: Bounds;
  radius: number;
}

export interface HeapValue {
  id: number | string;
  text: string;
}

export type Roles = ReadonlyMap<string, MarkRole>;

export const heapEdgeId = (p: number) => `hedge-${p}`;
export const treeIndexId = (p: number) => `tidx-${p}`;
export const cellId = (p: number) => `cell-${p}`;
export const cellValueId = (id: number | string) => `aval-${id}`;
export const cellIndexId = (p: number) => `aidx-${p}`;

export const parentPos = (p: number) => Math.floor((p - 1) / 2);

/** Lay out a complete binary tree with n nodes by array position. */
export function heapLayout(n: number, options: TreeLayoutOptions<number> = {}): HeapTreeLayout {
  const kid = (c: number) => (c < n ? c : null);
  const tree = layoutBinaryTree<number>(
    n > 0 ? 0 : null,
    { left: (p) => kid(2 * p + 1), right: (p) => kid(2 * p + 2) },
    options,
  );
  return {
    n,
    tree,
    at: (p) => {
      const node = tree.nodes.get(p);
      return node ? { x: node.x, y: node.y } : { x: 0, y: 0 };
    },
    height: tree.height,
    bounds: tree.bounds,
    radius: tree.radius,
  };
}

export interface DrawHeapTreeOptions {
  roles?: Roles;
  /** Draw each node's array index (p + base) under it. Leave out to draw no indices. */
  base?: number;
  /** Opacity of a position: its node, label, index and the edge into it. */
  opacity?(p: number): number | undefined;
  /** Role for a position's circle when no mark names its value. */
  baseRole?(p: number): MarkRole | undefined;
}

/** The tree part. See the comment at the top of this file. */
export function drawHeapTree(
  layout: HeapTreeLayout,
  items: HeapValue[],
  opts: DrawHeapTreeOptions = {},
): Shape[] {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const r = layout.radius;
  const shapes: Shape[] = [];
  for (let p = 0; p < layout.n; p++) {
    const item = items[p];
    if (!item) continue;
    const c = layout.at(p);
    const opacity = opts.opacity?.(p);
    if (p > 0) {
      const q = layout.at(parentPos(p));
      shapes.push({
        kind: 'arrow',
        id: heapEdgeId(p),
        ...trimmedLine(q, c, r, r),
        head: 'none',
        role: roles.get(heapEdgeId(p)),
        opacity,
      });
    }
    const role = roles.get(nodeShapeId(item.id)) ?? opts.baseRole?.(p);
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(item.id),
      x: c.x,
      y: c.y,
      r,
      cls: 'live',
      role,
      opacity,
    });
    const size = labelSize(item.text, r);
    shapes.push({
      kind: 'text',
      id: keyShapeId(item.id),
      x: c.x,
      y: c.y + size * 0.35,
      text: item.text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(keyShapeId(item.id)) ?? role,
      opacity,
    });
    if (opts.base !== undefined) {
      // Under the node, between the edges down to its children: nothing else is drawn there.
      shapes.push({
        kind: 'text',
        id: treeIndexId(p),
        x: c.x,
        y: c.y + r + INDEX_DROP,
        text: String(p + opts.base),
        size: 12,
        anchor: 'middle',
        cls: 'index',
        mono: true,
        opacity,
      });
    }
  }
  return shapes;
}

/** How far under a node's circle its index label's baseline sits. */
const INDEX_DROP = 13;
/** Extra room under the tree's bottom row when index labels are drawn. */
export const TREE_INDEX_ROOM = INDEX_DROP + 3;

export const CELL = { w: 34, h: 30 };
/** Vertical room an array row takes, index labels included. */
export const ROW_PITCH = CELL.h + 22;

export interface DrawHeapArrayOptions {
  roles?: Roles;
  /** Index of the first cell: 1 (CLRS) or 0. */
  base: number;
  /** y of the top of the first row. */
  top: number;
  /** Cells per row before wrapping. Default: all in one row. */
  perRow?: number;
  /** Name drawn to the left of the first row. */
  name?: string;
  /** Opacity of a cell, its value and its index. */
  opacity?(p: number): number | undefined;
  /** Extra CSS class for cell p. Default 'live'. */
  cellClass?(p: number): string;
  /** Role for a cell when no mark names it or its value. */
  baseRole?(p: number): MarkRole | undefined;
}

export interface HeapArray {
  shapes: Shape[];
  bounds: Bounds;
  /** Top-left corner of cell p. */
  cell(p: number): { x: number; y: number; w: number; h: number };
}

export function arrayRowLength(height: number): number {
  return Math.max(8, 2 ** Math.max(0, height));
}

/** The array part. See the comment at the top of this file. */
export function drawHeapArray(items: HeapValue[], opts: DrawHeapArrayOptions): HeapArray {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const n = items.length;
  const perRow = Math.max(1, opts.perRow ?? Math.max(n, 1));
  const cols = Math.min(Math.max(n, 1), perRow);
  const x0 = -(cols * CELL.w) / 2;
  const cell = (p: number) => ({
    x: x0 + (p % perRow) * CELL.w,
    y: opts.top + Math.floor(p / perRow) * ROW_PITCH,
    w: CELL.w,
    h: CELL.h,
  });
  const shapes: Shape[] = [];
  items.forEach((item, p) => {
    const c = cell(p);
    const valueRole = roles.get(nodeShapeId(item.id));
    const opacity = opts.opacity?.(p);
    shapes.push({
      kind: 'rect',
      id: cellId(p),
      ...c,
      r: 0,
      cls: opts.cellClass?.(p) ?? 'live',
      role: roles.get(cellId(p)) ?? valueRole ?? opts.baseRole?.(p),
      opacity,
    });
    const size = item.text.length <= 2 ? 15 : item.text.length === 3 ? 13.5 : 11.5;
    shapes.push({
      kind: 'text',
      id: cellValueId(item.id),
      x: c.x + c.w / 2,
      y: c.y + c.h / 2 + size * 0.35,
      text: item.text,
      size,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(cellValueId(item.id)) ?? valueRole,
      opacity,
    });
    shapes.push({
      kind: 'text',
      id: cellIndexId(p),
      x: c.x + c.w / 2,
      y: c.y + c.h + 14,
      text: String(p + opts.base),
      size: 12,
      anchor: 'middle',
      cls: 'index',
      mono: true,
      opacity,
    });
  });
  const rows = Math.max(1, Math.ceil(n / perRow));
  let left = x0;
  if (opts.name) {
    shapes.push({
      kind: 'text',
      id: 'array-name',
      x: x0 - 10,
      y: opts.top + CELL.h / 2 + 5,
      text: opts.name,
      size: 15,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
    left = x0 - 10 - opts.name.length * 9;
  }
  const right = x0 + cols * CELL.w;
  return {
    shapes,
    bounds: { x: left, y: opts.top, w: right - left, h: (rows - 1) * ROW_PITCH + CELL.h + 18 },
    cell,
  };
}
