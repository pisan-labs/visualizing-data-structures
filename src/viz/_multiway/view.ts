/**
 * The drawing shared by the B-tree and 2-4 tree pages: the tree from src/layouts/multiway.ts,
 * the nodes read so far outlined, and a band above the tree with the operation's argument.
 * A plain state (no step data, as in practice pictures) leaves the band out.
 */
import type { MarkRole, Step } from '../../engine/types';
import {
  CELL,
  NODE_H,
  NODE_PAD,
  drawMultiway,
  keyCell,
  layoutMultiway,
  nodeWidth,
  padBounds,
  unionBounds,
  type MultiwayLayout,
} from '../../layouts/multiway';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { BExtra, BState } from './btree';

/** Top of the band above the tree that holds the argument. */
export const BAND_Y = -(NODE_H + 24);
/** The narrowest a scene gets, so a small tree is not blown up to fill the stage. */
const MIN_W = 300;

export function layoutOf(s: BState, gap = 8): MultiwayLayout<number> {
  return layoutMultiway(
    s.root,
    { kids: (u) => s.nodes[u]!.kids, width: (u) => nodeWidth(s.nodes[u]!.keys.length) },
    { gap, levelGap: 56 },
  );
}

/** The argument as a key in a small frame at (x, y): it slides into the tree when inserted. */
export function argShapes(
  arg: NonNullable<BExtra['arg']>,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  /** Prefix for the shape ids, so a page can show two arguments. */
  prefix = 'arg',
): { shapes: Shape[]; box: Bounds } {
  const shapes: Shape[] = [];
  const long = arg.uid === undefined && arg.text.length > 3;
  const w = long ? Math.max(nodeWidth(1), arg.text.length * 8 + 14) : nodeWidth(1);
  const bx = x + 18;
  shapes.push({
    kind: 'text',
    id: `${prefix}-label`,
    x,
    y: y + NODE_H / 2 + 5,
    text: arg.name,
    size: 15,
    cls: 'label',
    mono: true,
  });
  shapes.push({
    kind: 'rect',
    id: `${prefix}-box`,
    x: bx,
    y,
    w,
    h: NODE_H,
    r: 6,
    cls: 'ghost',
    role: roles.get(`${prefix}-box`) ?? (arg.error ? 'error' : undefined),
  });
  if (long) {
    shapes.push({
      kind: 'text',
      id: `key-${prefix}`,
      x: bx + w / 2,
      y: y + NODE_H / 2 + 5,
      text: arg.text,
      size: 13,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`${prefix}-box`) ?? (arg.error ? 'error' : undefined),
    });
  } else {
    const id = arg.uid ?? prefix;
    shapes.push(
      ...keyCell({ id, text: arg.text }, bx + NODE_PAD, y + NODE_PAD, {
        role: roles.get(`cell-${id}`),
        textRole: roles.get(`key-${id}`) ?? (arg.error ? 'error' : undefined),
      }),
    );
  }
  return { shapes, box: { x, y, w: bx + w - x, h: NODE_H } };
}

export function multiwayView(step: Step<BState, BExtra>, label: (s: BState) => string): Scene {
  const { state: s } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const layout = layoutOf(s);
  const path = new Set(extra.path ?? []);
  const shapes: Shape[] = drawMultiway(layout, {
    keys: (u) =>
      s.nodes[u]!.keys.map((k) => ({
        id: k.uid,
        text: String(k.key),
        ghost: k.uid === extra.ghost,
      })),
    roles,
    nodeRole: (u) => (path.has(u) ? 'visit' : undefined),
  });

  const boxes: Bounds[] = [];
  const tree = layout.bounds;
  const cx = s.root === null ? 0 : tree.x + tree.w / 2;
  if (s.root === null) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: NODE_H / 2 + 5,
      text: 'empty tree',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -50, y: 0, w: 100, h: NODE_H });
  } else {
    boxes.push(tree);
  }
  const left = Math.min(s.root === null ? -50 : tree.x, cx - MIN_W / 2);
  const right = Math.max(s.root === null ? 50 : tree.x + tree.w, cx + MIN_W / 2);

  // Every step of an operation keeps the band above the tree, so the camera holds still.
  if (step.extra !== undefined) {
    boxes.push({ x: left, y: BAND_Y, w: right - left, h: NODE_H });
    if (extra.arg) shapes.push(...argShapes(extra.arg, left, BAND_Y, roles).shapes);
  } else {
    boxes.push({ x: left, y: 0, w: right - left, h: CELL });
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: label(s) };
}
