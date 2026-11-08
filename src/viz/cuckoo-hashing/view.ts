import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  ARG_BAND,
  argAndFormula,
  gridWidth,
  indexLabel,
  keySize,
  noteLabel,
  slotGrid,
} from '../hash-open/grid';
import {
  cellId,
  describe,
  h,
  type CuckooExtra,
  type CuckooSettings,
  type CuckooState,
} from './model';

const MARGIN = 14;
const MIN_W = 320;
const TITLE = 22;
const GAP = 12;
const QUEUE = 40;

function layout(m: number, cols: number) {
  const g = slotGrid(m, 0, 0, cols);
  const W = Math.max(MIN_W, 2 * MARGIN + g.width);
  const tableH = TITLE + g.height;
  return {
    cols,
    W,
    tableH,
    bounds: { x: 0, y: 0, w: W, h: ARG_BAND + 2 * tableH + GAP + QUEUE },
  };
}

export function view(
  step: Step<CuckooState, CuckooExtra>,
  _settings: CuckooSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const m = state.m;
  const L = pickBest(
    [...new Set([m, 8, 6].map((c) => Math.min(c, m)))].map((c) => layout(m, c)),
    stage,
  );
  const shapes: Shape[] = [];
  const x0 = (L.W - gridWidth(m, L.cols)) / 2;

  ([0, 1] as const).forEach((side) => {
    const top = ARG_BAND + side * (L.tableH + GAP);
    const other = side === 0 ? 1 : 0;
    shapes.push({
      kind: 'text',
      id: `title-${side}`,
      x: x0,
      y: top + 15,
      text: side === 0 ? `T1: h1(k) = k mod ${m}` : `T2: h2(k) = ⌊k/${m}⌋ mod ${m}`,
      size: 14,
      mono: true,
      cls: 'label',
    });
    const g = slotGrid(m, x0, top + TITLE, L.cols);
    for (let j = 0; j < m; j++) {
      const box = g.cell(j);
      const cell = state.t[side][j] ?? null;
      const id = cellId(side, j);
      shapes.push(indexLabel(box, j, `t${side + 1}`));
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
        // Where the key would go if it were kicked out.
        shapes.push(noteLabel(box, `alt-${side}-${j}`, `T${other + 1}:${h(other, cell.key, m)}`));
      }
    }
  });

  // Keys waiting to go back in during a rehash.
  const qy = ARG_BAND + 2 * L.tableH + GAP + 8;
  const perRow = Math.max(1, Math.floor((L.W - 2 * MARGIN) / 40));
  const queueRows = Math.ceil((extra.queue?.length ?? 0) / perRow);
  (extra.queue ?? []).forEach((cell, q) => {
    const text = String(cell.key);
    shapes.push({
      kind: 'text',
      id: `v${cell.uid}`,
      x: MARGIN + 18 + (q % perRow) * 40,
      y: qy + 18 + Math.floor(q / perRow) * 24,
      text,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      cls: 'label',
    });
  });
  if (extra.queue?.length)
    shapes.push({
      kind: 'text',
      id: 'queue-label',
      x: MARGIN,
      y: qy,
      text: 'waiting:',
      size: 13,
      cls: 'label',
    });

  shapes.push(
    ...argAndFormula(extra.hand, extra.formula, MARGIN, roles.get('arg-box'), (u) => `v${u}`),
  );
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  const bounds = { ...L.bounds, h: L.bounds.h + Math.max(0, queueRows - 1) * 24 };
  return { shapes, bounds, label };
}
