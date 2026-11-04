/**
 * Drawing pieces shared by the balanced-tree pages: the band above the tree with the operation's
 * argument, a node lifted out during delete, the "nil" marker, the inorder output row, and a
 * caption. Each page lays out its tree with src/layouts/binary-tree and adds its own labels.
 */
import type { MarkRole } from '../../engine/types';
import {
  keyShapeId,
  labelSize,
  nilSpot,
  nodeShapeId,
  trimmedLine,
  type TreeLayout,
} from '../../layouts/binary-tree';
import type { Bounds, Shape } from '../../render/scene';
import { edgeMark, type Side, type TreeExtra, type TreeNode } from './tree-kit';

export const R = 17;
/** Center line of the band above the tree that holds the argument and lifted nodes. */
export const HY = -(R + 30);
const CELL = { w: 34, h: 26, pitch: 37 };
const LABEL_W = 62;

/** Deep trees get closer levels so they still fit a short screen. */
export function levelGapFor(height: number): number {
  return height <= 4 ? 56 : Math.max(40, 56 - 3 * (height - 4));
}

export type Roles = Map<string, MarkRole>;

export function rolesOf(marks: { id: string; role: MarkRole }[]): Roles {
  return new Map(marks.map((m) => [m.id, m.role]));
}

/** The horizontal extent of the drawing and the boxes that frame it. */
export interface Frame {
  left: number;
  right: number;
  argBox: { x: number; y: number; w: number; h: number };
  boxes: Bounds[];
}

export function frameOf(tree: TreeLayout<number>, half = 110): Frame {
  const left = Math.min(tree.bounds.x, -half);
  const right = Math.max(tree.bounds.x + tree.bounds.w, half);
  return {
    left,
    right,
    argBox: { x: left + 24, y: HY - 15, w: 56, h: 30 },
    // The band above the tree is always there, so the camera stays put between operations.
    boxes: [{ x: left, y: HY - 16, w: right - left, h: 32 }],
  };
}

/** Where a key typed for insert starts its slide into its new node. */
export const argCenter = (f: Frame) => ({ x: f.argBox.x + f.argBox.w / 2, y: HY });

/** Edges along the path walked so far are drawn active, like the nodes on it. */
export function markPath(
  roles: Roles,
  nodes: Record<number, TreeNode>,
  path: number[] | undefined,
): Set<number> {
  const on = new Set(path ?? []);
  for (const u of path ?? []) {
    const p = nodes[u]?.parent;
    const id = edgeMark(u, 'active').id;
    if (p !== null && p !== undefined && on.has(p) && !roles.has(id)) roles.set(id, 'active');
  }
  return on;
}

export function drawEmpty(shapes: Shape[], f: Frame): void {
  shapes.push({
    kind: 'text',
    id: 'empty',
    x: 0,
    y: 5,
    text: 'empty tree',
    size: 15,
    anchor: 'middle',
    cls: 'label',
  });
  f.boxes.push({ x: -50, y: -R, w: 100, h: 2 * R });
}

/** The operation's argument, in a box at the top left. Returns where the band is free again. */
export function drawArg(shapes: Shape[], roles: Roles, f: Frame, arg: TreeExtra['arg']): number {
  if (!arg) return f.left;
  const { name, text, uid, error } = arg;
  const w = argWidth(f, text);
  shapes.push({
    kind: 'text',
    id: 'arg-label',
    x: f.left + 4,
    y: HY + 5,
    text: name,
    size: 15,
    cls: 'label',
    mono: true,
  });
  shapes.push({
    kind: 'rect',
    id: 'arg-box',
    x: f.argBox.x,
    y: f.argBox.y,
    w,
    h: f.argBox.h,
    r: 6,
    cls: 'ghost',
    role: roles.get('arg-box') ?? (error ? 'error' : undefined),
  });
  const id = uid !== undefined ? keyShapeId(uid) : 'arg';
  const size = labelSize(text);
  shapes.push({
    kind: 'text',
    id,
    x: f.argBox.x + w / 2,
    y: HY + size * 0.35,
    text,
    size,
    anchor: 'middle',
    weight: 'bold',
    role: roles.get(id),
  });
  return f.argBox.x + w + 14;
}

const argWidth = (f: Frame, text: string) => Math.max(f.argBox.w, text.length * 9.5 + 16);

/** A node lifted out of the tree waits in the band above the root. */
export function drawHeld(
  shapes: Shape[],
  roles: Roles,
  uid: number,
  text: string,
  cls = 'live',
  keyCls?: string,
): void {
  const role = roles.get(nodeShapeId(uid));
  shapes.push({ kind: 'circle', id: nodeShapeId(uid), x: 0, y: HY, r: R, cls, role });
  shapes.push({
    kind: 'text',
    id: keyShapeId(uid),
    x: 0,
    y: HY + labelSize(text) * 0.35,
    text,
    size: labelSize(text),
    anchor: 'middle',
    weight: 'bold',
    cls: keyCls,
    role: roles.get(keyShapeId(uid)) ?? role,
  });
}

/** An empty child the walk fell into. */
export function drawNil(
  shapes: Shape[],
  roles: Roles,
  tree: TreeLayout<number>,
  nil: { parent: number; side: Side } | undefined,
  f: Frame,
): void {
  if (!nil) return;
  const p = tree.nodes.get(nil.parent);
  if (!p) return;
  const spot = nilSpot(tree, nil.parent, nil.side);
  const size = 12;
  shapes.push({
    kind: 'arrow',
    id: 'nil-edge',
    ...trimmedLine(p, spot, R, size / 2),
    head: 'none',
    dashed: true,
    role: roles.get('nil'),
  });
  shapes.push({
    kind: 'rect',
    id: 'nil',
    x: spot.x - size / 2,
    y: spot.y - size / 2,
    w: size,
    h: size,
    r: 2,
    cls: 'ghost',
    role: roles.get('nil'),
  });
  shapes.push({
    kind: 'text',
    id: 'nil-label',
    x: spot.x + (nil.side === 'left' ? -size / 2 - 3 : size / 2 + 3),
    y: spot.y + 4,
    text: 'nil',
    size: 12,
    anchor: nil.side === 'left' ? 'end' : 'start',
    mono: true,
    cls: 'label',
  });
  f.boxes.push({ x: spot.x - 30, y: spot.y - size / 2, w: 60, h: size + 2 });
}

/** The keys inorder has written so far, in a row of cells under everything else. */
export function drawOutput(
  shapes: Shape[],
  roles: Roles,
  tree: TreeLayout<number>,
  nodes: Record<number, TreeNode>,
  output: number[] | undefined,
  f: Frame,
): void {
  if (!output) return;
  const y0 = Math.max(...f.boxes.map((b) => b.y + b.h)) + 24;
  const perRow = Math.max(8, Math.floor((f.right - f.left - LABEL_W) / CELL.pitch));
  shapes.push({
    kind: 'text',
    id: 'output-label',
    x: f.left,
    y: y0 + CELL.h / 2 + 5,
    text: 'output',
    size: 14,
    cls: 'label',
    mono: true,
  });
  output.forEach((uid, i) => {
    const node = nodes[uid];
    if (!node) return;
    const from = tree.nodes.get(uid);
    const x = f.left + LABEL_W + (i % perRow) * CELL.pitch;
    const y = y0 + Math.floor(i / perRow) * (CELL.h + 8);
    const text = String(node.key);
    shapes.push({
      kind: 'rect',
      id: `outc-${uid}`,
      x,
      y,
      w: CELL.w,
      h: CELL.h,
      r: 5,
      cls: 'live',
      enterFrom: from && { x: from.x - CELL.w / 2, y: from.y - CELL.h / 2 },
    });
    shapes.push({
      kind: 'text',
      id: `out-${uid}`,
      x: x + CELL.w / 2,
      y: y + CELL.h / 2 + 5,
      text,
      size: text.length <= 2 ? 15 : 13,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`out-${uid}`),
      enterFrom: from && { x: from.x, y: from.y + 5 },
    });
  });
  const rows = Math.max(1, Math.ceil(output.length / perRow));
  f.boxes.push({ x: f.left, y: y0, w: LABEL_W + perRow * CELL.pitch, h: rows * (CELL.h + 8) });
}

/**
 * A short caption in the band above the tree, such as "LR case", starting at x. It stays on the
 * left: the stage's zoom buttons cover the top right corner on a phone.
 */
export function drawCaption(
  shapes: Shape[],
  x: number,
  id: string,
  text: string | undefined,
  role?: MarkRole,
): void {
  if (!text) return;
  shapes.push({ kind: 'text', id, x, y: HY + 5, text, size: 15, weight: 'bold', role });
}

/**
 * Small print under the tree (a legend), left-aligned. The parts share one line when it fits the
 * width of the drawing, and otherwise go one per line, so a legend never makes a small tree
 * shrink on a phone.
 */
export function drawNote(shapes: Shape[], f: Frame, id: string, parts: string[], below: number) {
  const width = (t: string) => t.length * 6.6;
  const one = parts.join(' ');
  const lines = width(one) <= f.right - f.left ? [one] : parts;
  lines.forEach((text, i) => {
    const y = below + 22 + i * 17;
    shapes.push({ kind: 'text', id: `${id}-${i}`, x: f.left, y, text, size: 13, cls: 'label' });
    f.boxes.push({ x: f.left, y: y - 13, w: width(text), h: 17 });
  });
}
