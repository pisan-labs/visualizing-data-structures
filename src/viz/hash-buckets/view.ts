import type { MarkRole, Step } from '../../engine/types';
import type { Box } from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import { ARG_BAND, argAndFormula, keySize, noteLabel } from '../hash-open/grid';
import {
  bucketId,
  describe,
  ovId,
  slotId,
  type BucketExtra,
  type BucketSettings,
  type BucketState,
  type Item,
} from './model';

/**
 * Buckets side by side (two rows when there are more than 6), each a framed column of b slots
 * with its index above. The overflow area is a framed row below, and each overflow key shows
 * the bucket it belongs to.
 */
const MARGIN = 14;
const MIN_W = 420;
const CELL_W = 52;
const CELL_H = 40;
const VGAP = 4;
const PAD = 5;
const COL = CELL_W + 2 * PAD + 6;
const LABEL = 18;
const ROW_GAP = 12;
const MAX_COLS = 6;
const OV_LABEL = 22;
const OV_PITCH = CELL_W + 6;
const OV_ROW = CELL_H + 20;

export function view(step: Step<BucketState, BucketExtra>, settings: BucketSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const { B, b } = state;
  const rows = Math.ceil(B / MAX_COLS);
  const cols = Math.ceil(B / rows);
  const tableW = cols * COL - 6;
  const W = Math.max(MIN_W, 2 * MARGIN + tableW);
  const x0 = (W - tableW) / 2;
  const frameH = b * CELL_H + (b - 1) * VGAP + 2 * PAD;
  const band = LABEL + frameH;
  const shapes: Shape[] = [];

  const frame = (i: number): Box => ({
    x: x0 + (i % cols) * COL,
    y: ARG_BAND + Math.floor(i / cols) * (band + ROW_GAP) + LABEL,
    w: CELL_W + 2 * PAD,
    h: frameH,
  });

  const keyText = (item: Item, box: Box): Shape => {
    const text = String(item.key);
    return {
      kind: 'text',
      id: `v${item.uid}`,
      x: box.x + box.w / 2,
      y: box.y + box.h / 2 + 7,
      text,
      size: keySize(text),
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`v${item.uid}`),
    };
  };

  for (let i = 0; i < B; i++) {
    const f = frame(i);
    const id = bucketId(i);
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: f.x + f.w / 2,
      y: f.y - 6,
      text: String(i),
      size: 14,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id,
      ...f,
      r: 7,
      cls: 'ghost',
      role: roles.get(id) ?? (extra.bucket === i ? 'active' : undefined),
      z: 0.5,
    });
    for (let s = 0; s < b; s++) {
      const box = { x: f.x + PAD, y: f.y + PAD + s * (CELL_H + VGAP), w: CELL_W, h: CELL_H };
      const item = state.buckets[i]![s] ?? null;
      shapes.push({
        kind: 'rect',
        id: slotId(i, s),
        ...box,
        r: 4,
        cls: item ? 'cell live' : 'cell',
        role: roles.get(slotId(i, s)),
      });
      if (item) shapes.push(keyText(item, box));
    }
  }

  let H = ARG_BAND + rows * (band + ROW_GAP) - ROW_GAP;
  if (settings.overflow === 'area') {
    const perRow = Math.max(1, Math.floor((W - 2 * MARGIN - 12) / OV_PITCH));
    const n = state.overflow.length;
    const ovRows = Math.max(1, Math.ceil(n / perRow));
    const top = H + 16;
    shapes.push({
      kind: 'text',
      id: 'ov-label',
      x: MARGIN,
      y: top + 14,
      text: n ? 'overflow area' : 'overflow area (empty)',
      size: 14,
      cls: 'label',
    });
    const area: Box = {
      x: MARGIN,
      y: top + OV_LABEL,
      w: W - 2 * MARGIN,
      h: ovRows * OV_ROW + 8,
    };
    shapes.push({ kind: 'rect', id: 'ov-frame', ...area, r: 7, cls: 'ghost', z: 0.5 });
    state.overflow.forEach((item, p) => {
      const box = {
        x: area.x + 6 + (p % perRow) * OV_PITCH,
        y: area.y + 6 + Math.floor(p / perRow) * OV_ROW,
        w: CELL_W,
        h: CELL_H,
      };
      shapes.push({
        kind: 'rect',
        id: ovId(p),
        ...box,
        r: 4,
        cls: 'cell live',
        role: roles.get(ovId(p)),
      });
      shapes.push(keyText(item, box));
      shapes.push(noteLabel({ ...box, y: box.y - 2 }, `ov-note-${p}`, `→ ${item.key % B}`));
    });
    H = area.y + area.h;
  }

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), (u) => `v${u}`),
  );

  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: { x: 0, y: 0, w: W, h: H + 8 }, label };
}
