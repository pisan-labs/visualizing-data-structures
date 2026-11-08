import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  ARG_BAND,
  argAndFormula,
  CELL_H,
  indexLabel,
  noteLabel,
  slotGrid,
} from '../hash-open/grid';
import {
  bitId,
  describe,
  keyId,
  type BloomExtra,
  type BloomSettings,
  type BloomState,
} from './model';

const MARGIN = 14;
const MIN_W = 300;
const CHIP_H = 30;
const CHIP_GAP = 8;
const SET_LABEL = 34;

const chipW = (x: number) => (String(x).length <= 2 ? 40 : 48);

/** Where each key's chip goes, in rows that wrap at width w. */
function chipRows(keys: number[], w: number) {
  const out: { x: number; row: number }[] = [];
  let x = SET_LABEL;
  let row = 0;
  for (const k of keys) {
    const cw = chipW(k);
    if (x + cw > w && x > SET_LABEL) {
      row++;
      x = SET_LABEL;
    }
    out.push({ x, row });
    x += cw + CHIP_GAP;
  }
  return { at: out, rows: Math.max(1, row + 1) };
}

interface Layout {
  cols: number;
  W: number;
  gridX: number;
  gridH: number;
  chipTop: number;
  bounds: { x: number; y: number; w: number; h: number };
}

function layout(state: BloomState, cols: number): Layout {
  const g = slotGrid(state.m, 0, 0, cols);
  const W = Math.max(MIN_W, 2 * MARGIN + g.width);
  const chipTop = ARG_BAND + g.height + 10;
  const { rows } = chipRows(state.keys, W - 2 * MARGIN);
  const h = chipTop + rows * (CHIP_H + CHIP_GAP) + 6;
  return {
    cols,
    W,
    gridX: (W - g.width) / 2,
    gridH: g.height,
    chipTop,
    bounds: { x: 0, y: 0, w: W, h },
  };
}

export function view(
  step: Step<BloomState, BloomExtra>,
  _settings: BloomSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const options = [...new Set([16, 8, 12, 6, 4].map((c) => Math.min(c, state.m)))];
  const L = pickBest(
    options.map((c) => layout(state, c)),
    stage,
  );
  const g = slotGrid(state.m, L.gridX, ARG_BAND, L.cols);
  const shapes: Shape[] = [];

  for (let j = 0; j < state.m; j++) {
    const box = g.cell(j);
    const id = bitId(j);
    const on = state.bits[j] === 1;
    shapes.push(indexLabel(box, j));
    shapes.push({
      kind: 'rect',
      id,
      ...box,
      r: 4,
      cls: on ? 'cell live' : 'cell',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `bv-${j}`,
      x: box.x + box.w / 2,
      y: box.y + CELL_H / 2 + 7,
      text: on ? '1' : '0',
      size: 19,
      anchor: 'middle',
      weight: on ? 'bold' : 'normal',
      mono: true,
      cls: on ? undefined : 'label',
    });
    const hs = extra.hits?.[j];
    if (hs?.length) shapes.push(noteLabel(box, `hit-${j}`, hs.map((i) => `h${i}`).join(',')));
  }

  // The set S of keys inserted, as chips.
  const top = L.chipTop;
  shapes.push({
    kind: 'text',
    id: 'set-label',
    x: MARGIN,
    y: top + 20,
    text: 'S:',
    size: 15,
    cls: 'label',
    mono: true,
  });
  const chips = chipRows(state.keys, L.W - 2 * MARGIN);
  if (state.keys.length === 0)
    shapes.push({
      kind: 'text',
      id: 'set-empty',
      x: MARGIN + SET_LABEL,
      y: top + 20,
      text: 'no keys yet',
      size: 14,
      cls: 'label',
    });
  state.keys.forEach((x, q) => {
    const at = chips.at[q]!;
    const cx = MARGIN + at.x;
    const cy = top + at.row * (CHIP_H + CHIP_GAP);
    const id = keyId(x);
    shapes.push({
      kind: 'rect',
      id,
      x: cx,
      y: cy,
      w: chipW(x),
      h: CHIP_H,
      r: 15,
      cls: 'cell live',
      role: roles.get(id),
      enterFrom: { x: MARGIN, y: 6 },
    });
    shapes.push({
      kind: 'text',
      id: `kt-${x}`,
      x: cx + chipW(x) / 2,
      y: cy + 21,
      text: String(x),
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      enterFrom: { x: MARGIN + 26, y: 28 },
    });
  });

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), () => 'arg'),
  );

  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: L.bounds, label };
}
