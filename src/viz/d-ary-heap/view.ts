import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { labelSize, padBounds, unionBounds } from '../../layouts/binary-tree';
import { layoutForest } from '../../layouts/forest';
import { CELL, drawHeapArray, drawHeapTree } from '../../layouts/heap';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  arity,
  childrenOf,
  conv,
  describe,
  parentOf,
  type DHeapExtra,
  type DHeapSettings,
  type DHeapState,
} from './model';

const R = 16;
const LEVEL_GAP = 54;
const ARRAY_GAP = 26;
const BOX_W = 56;

/** The tree of positions 0..n − 1 with d children each, root at (0, 0). */
export function dAryLayout(n: number, d: number, gap = 6) {
  const f = layoutForest(n > 0 ? [0] : [], (p) => childrenOf(p, d, n), {
    radius: R,
    gap,
    levelGap: LEVEL_GAP,
  });
  const rx = n > 0 ? f.nodes.get(0)!.x : 0;
  const bounds: Bounds =
    n > 0 ? { ...f.bounds, x: f.bounds.x - rx } : { x: -R, y: -R, w: 2 * R, h: 2 * R };
  return {
    n,
    radius: R,
    bounds,
    at: (p: number) => {
      const c = f.nodes.get(p);
      return c ? { x: c.x - rx, y: c.y } : { x: 0, y: 0 };
    },
  };
}

/** Array under the tree (the usual), or beside it on a wide stage. */
export function view(
  step: Step<DHeapState, DHeapExtra>,
  settings: DHeapSettings,
  stage?: StageSize,
): Scene {
  const under = draw(step, settings, false);
  if (!stage) return under;
  return pickLayout(stage, [under, draw(step, settings, true)]);
}

function draw(step: Step<DHeapState, DHeapExtra>, settings: DHeapSettings, beside: boolean): Scene {
  const { state: s, extra } = step;
  const K = conv(settings);
  const d = arity(settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = s.items.length;
  const layout = dAryLayout(n, d);
  const values = s.items.map((it) => ({ id: it.uid, text: String(it.key) }));
  const todo = extra?.todo;
  const shapes: Shape[] = drawHeapTree(layout, values, {
    roles,
    parent: (p) => parentOf(p, d),
    opacity: (p) => (todo !== undefined && p < todo ? 0.55 : undefined),
  });
  const boxes: Bounds[] = [];
  if (n === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'empty heap',
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role: roles.get('empty'),
    });
    boxes.push({ x: -44, y: -R, w: 88, h: 2 * R });
  } else boxes.push(layout.bounds);
  const treeBottom = n === 0 ? R : layout.bounds.y + layout.bounds.h;
  const treeW = Math.max(layout.bounds.w, 8 * CELL.w);

  // The array: under the tree, as wide as the tree (at least 8 cells a row), or beside it.
  const perRow = beside ? Math.max(4, Math.min(8, Math.ceil(n / 2))) : Math.floor(treeW / CELL.w);
  const array = drawHeapArray(values, { roles, base: K.base, top: 0, perRow, name: 'A' });
  let arrShapes = array.shapes;
  let arrBounds = array.bounds;
  if (n === 0) {
    arrShapes = [
      ...arrShapes,
      {
        kind: 'text',
        id: 'array-empty',
        x: -14,
        y: 20,
        text: 'no keys (n = 0)',
        size: 14,
        cls: 'label',
      },
    ];
    arrBounds = unionBounds(arrBounds, { x: -14, y: 0, w: 110, h: 30 });
  }
  const dx = beside ? layout.bounds.x + layout.bounds.w + 40 - arrBounds.x : 0;
  const dy = beside ? Math.max(layout.bounds.y, 30) : treeBottom + ARRAY_GAP;
  shapes.push(...translate(arrShapes, dx, dy));
  boxes.push({ ...arrBounds, x: arrBounds.x + dx, y: arrBounds.y + dy });

  // A key on its way out, or a refused argument, in a box level with the root, on its left.
  if (extra !== undefined) {
    const shown = extra.out
      ? { id: 'out', label: extra.out.label, text: String(extra.out.key), role: roles.get('out') }
      : extra.arg
        ? {
            id: 'arg',
            label: extra.arg.label,
            text: extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text,
            role: roles.get('arg-box'),
          }
        : null;
    const w = Math.max(BOX_W, (shown?.text.length ?? 0) * 10 + 18);
    const labelW = Math.max(4, shown?.label.length ?? 4) * 9;
    const right = n === 0 ? -52 : -(R + 16);
    const left = right - w - 8 - labelW;
    boxes.push({ x: left, y: -18, w: -left, h: 36 });
    if (shown) {
      const x = right - w;
      shapes.push({
        kind: 'text',
        id: `${shown.id}-label`,
        x: x - 8,
        y: 5,
        text: shown.label,
        size: 15,
        anchor: 'end',
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: `${shown.id}-box`,
        x,
        y: -16,
        w,
        h: 32,
        r: 6,
        cls: 'ghost',
        role: shown.role,
      });
      const size = labelSize(shown.text);
      const from = extra.out?.from;
      const p = from === undefined ? -1 : s.items.findIndex((it) => it.uid === from);
      const src = p >= 0 ? layout.at(p) : undefined;
      shapes.push({
        kind: 'text',
        id: shown.id,
        x: x + w / 2,
        y: size * 0.35,
        text: shown.text,
        size,
        anchor: 'middle',
        weight: 'bold',
        role: shown.role,
        z: 3,
        enterFrom: src && { x: src.x, y: src.y + size * 0.35 },
      });
    }
  }
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s, settings) };
}
