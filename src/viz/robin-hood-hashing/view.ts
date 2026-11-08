import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  ARG_BAND,
  argAndFormula,
  indexLabel,
  keySize,
  noteLabel,
  slotGrid,
} from '../hash-open/grid';
import {
  cellId,
  describe,
  dist,
  type RobinExtra,
  type RobinSettings,
  type RobinState,
} from './model';

const MARGIN = 14;
const MIN_W = 320;

function layout(m: number, cols: number) {
  const g = slotGrid(m, 0, 0, cols);
  const W = Math.max(MIN_W, 2 * MARGIN + g.width);
  return {
    cols,
    W,
    gx: (W - g.width) / 2,
    bounds: { x: 0, y: 0, w: W, h: ARG_BAND + g.height + 6 },
  };
}

export function view(
  step: Step<RobinState, RobinExtra>,
  _settings: RobinSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const m = state.m;
  const L = pickBest(
    [...new Set([m, 8, 6].map((c) => Math.min(c, m)))].map((c) => layout(m, c)),
    stage,
  );
  const g = slotGrid(m, L.gx, ARG_BAND, L.cols);
  const shapes: Shape[] = [];
  for (let j = 0; j < m; j++) {
    const box = g.cell(j);
    const cell = state.slots[j] ?? null;
    const id = cellId(j);
    shapes.push(indexLabel(box, j));
    shapes.push({
      kind: 'rect',
      id,
      ...box,
      r: 4,
      cls: cell ? 'cell live' : 'cell',
      role: roles.get(id),
    });
    if (cell) {
      const text = String(cell.key);
      shapes.push({
        kind: 'text',
        id: `v${cell.uid}`,
        x: box.x + box.w / 2,
        y: box.y + box.h / 2 + 7,
        text,
        size: keySize(text),
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`v${cell.uid}`),
      });
      shapes.push(noteLabel(box, `d-${j}`, `d=${dist(cell.key, j, m)}`));
    }
  }
  shapes.push(
    ...argAndFormula(extra.hand, extra.formula, MARGIN, roles.get('arg-box'), (u) => `v${u}`),
  );
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: L.bounds, label };
}
