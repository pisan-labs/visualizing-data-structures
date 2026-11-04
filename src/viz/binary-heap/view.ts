import type { MarkRole, Step } from '../../engine/types';
import { labelSize, padBounds, unionBounds } from '../../layouts/binary-tree';
import {
  arrayRowLength,
  drawHeapArray,
  drawHeapTree,
  heapLayout,
  TREE_INDEX_ROOM,
} from '../../layouts/heap';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { conv, describe, type HeapExtra, type HeapSettings, type HeapState } from './model';

const R = 17;
const LEVEL_GAP = 52;
/** Room between the tree (or the empty-heap label) and the array. */
const ARRAY_GAP = 22;
/**
 * A key on its way out (or refused) waits in a box level with the root, on its left. The root
 * row of a heap is empty there, and the box costs no height. The box ends this far left of the
 * root's center.
 */
const BOX_RIGHT = -(R + 16);
const BOX_W = 56;

export function view(step: Step<HeapState, HeapExtra>, settings: HeapSettings): Scene {
  const { state: s } = step;
  const extra = step.extra;
  const K = conv(settings);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = s.items.length;
  const layout = heapLayout(n, { radius: R, gap: 8, levelGap: LEVEL_GAP });
  const values = s.items.map((it) => ({ id: it.uid, text: String(it.key) }));
  const shapes: Shape[] = drawHeapTree(layout, values, { roles, base: K.base });
  const boxes: Bounds[] = [];

  let treeBottom: number;
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
    treeBottom = R;
  } else {
    treeBottom = layout.bounds.y + layout.bounds.h + TREE_INDEX_ROOM;
    boxes.push({ ...layout.bounds, h: treeBottom - layout.bounds.y });
  }

  const array = drawHeapArray(values, {
    roles,
    base: K.base,
    top: treeBottom + ARRAY_GAP,
    perRow: arrayRowLength(layout.height),
    name: 'A',
  });
  shapes.push(...array.shapes);
  boxes.push(array.bounds);
  if (n === 0) {
    shapes.push({
      kind: 'text',
      id: 'array-empty',
      x: -14,
      y: treeBottom + ARRAY_GAP + 20,
      text: 'no keys (n = 0)',
      size: 14,
      cls: 'label',
    });
    boxes.push({ x: -14, y: treeBottom + ARRAY_GAP, w: 110, h: 30 });
  }

  // Every step of an operation keeps room for the box, so the camera holds still. A plain
  // picture (no step data, as in practice questions) leaves it out.
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
    const labelW = Math.max(8, shown?.label.length ?? 8) * 9;
    // Clear of the "empty heap" label when there is no root.
    const right = n === 0 ? -52 : BOX_RIGHT;
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

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s, settings),
  };
}
