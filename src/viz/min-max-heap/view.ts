import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { labelSize, padBounds, unionBounds } from '../../layouts/binary-tree';
import {
  arrayRowLength,
  drawHeapArray,
  drawHeapTree,
  heapLayout,
  TREE_INDEX_ROOM,
} from '../../layouts/heap';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { describe, sideOf, type MMExtra, type MMSettings, type MMState, type Side } from './model';

const R = 17;
const LEVEL_GAP = 52;
const ARRAY_GAP = 22;
const BOX_W = 56;

/** Array under the tree (the usual), or beside it on a wide stage. */
export function view(step: Step<MMState, MMExtra>, settings: MMSettings, stage?: StageSize): Scene {
  const under = draw(step, settings, false);
  if (!stage) return under;
  return pickLayout(stage, [under, draw(step, settings, true)]);
}

function draw(step: Step<MMState, MMExtra>, settings: MMSettings, beside: boolean): Scene {
  const { state: s, extra } = step;
  const root: Side = settings.root === 'max' ? 'max' : 'min';
  const base = settings.index === 'zero' ? 0 : 1;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = s.items.length;
  const layout = heapLayout(n, { radius: R, gap: 8, levelGap: LEVEL_GAP });
  const values = s.items.map((it) => ({ id: it.uid, text: String(it.key) }));
  const todo = extra?.todo;
  const shapes: Shape[] = drawHeapTree(layout, values, {
    roles,
    base,
    opacity: (p) => (todo !== undefined && p < todo ? 0.55 : undefined),
  });
  const boxes: Bounds[] = [];
  let treeBottom = R;
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
  } else {
    treeBottom = layout.bounds.y + layout.bounds.h + TREE_INDEX_ROOM;
    boxes.push({ ...layout.bounds, h: treeBottom - layout.bounds.y });
    // "min" and "max" beside each level, right of the tree.
    const right = layout.bounds.x + layout.bounds.w + 10;
    for (let d = 0; d <= layout.height; d++) {
      const side = sideOf(2 ** d - 1, root);
      // A faint band behind each max level, so the alternation shows at a glance.
      if (side === 'max') {
        const x1 = layout.bounds.x - 6;
        const x2 = right + 40;
        const y1 = d * LEVEL_GAP - R - 5;
        const y2 = d * LEVEL_GAP + R + 5;
        shapes.push({
          kind: 'polygon',
          id: `band-${d}`,
          points: [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
          ],
        });
      }
      shapes.push({
        kind: 'text',
        id: `level-${d}`,
        x: right,
        y: d * LEVEL_GAP + 5,
        text: side,
        size: 14,
        cls: 'label',
        mono: true,
      });
    }
    boxes.push({ x: right, y: -10, w: 40, h: 20 });
  }

  const perRow = beside ? 8 : arrayRowLength(layout.height);
  const array = drawHeapArray(values, { roles, base, top: 0, perRow, name: 'A' });
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
  const treeRight = n === 0 ? 44 : layout.bounds.x + layout.bounds.w + 44;
  const dx = beside ? treeRight + 30 - arrBounds.x : 0;
  const dy = beside ? 30 : treeBottom + ARRAY_GAP;
  shapes.push(...translate(arrShapes, dx, dy));
  boxes.push({ ...arrBounds, x: arrBounds.x + dx, y: arrBounds.y + dy });

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
