import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { binary } from '../_hashing/family';
import { ARG_BAND, argAndFormula, CELL_H, indexLabel, slotGrid } from '../hash-open/grid';
import {
  describe,
  HASH_BITS,
  regId,
  regs,
  type HllExtra,
  type HllSettings,
  type HllState,
} from './model';

const MARGIN = 14;
const MIN_W = 320;
const BIT_W = 20;
const BIT_H = 28;
const BIT_GAP = 2;
/** The row of hash bits: a label line and the bits. */
const BITS_BAND = 58;
const CALC_LINE = 22;
const CALC_BAND = 3 * CALC_LINE + 8;

function layout(m: number, cols: number) {
  const g = slotGrid(m, 0, 0, cols);
  const bitsW = HASH_BITS * (BIT_W + BIT_GAP) - BIT_GAP;
  const W = Math.max(MIN_W, 2 * MARGIN + Math.max(g.width, bitsW));
  const regTop = ARG_BAND + BITS_BAND;
  const calcTop = regTop + g.height + 4;
  return {
    cols,
    W,
    gridX: (W - g.width) / 2,
    bitsX: (W - bitsW) / 2,
    regTop,
    calcTop,
    bounds: { x: 0, y: 0, w: W, h: calcTop + CALC_BAND },
  };
}

export function view(
  step: Step<HllState, HllExtra>,
  _settings: HllSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const m = regs(state);
  const L = pickBest(
    [...new Set([8, 16, 12, 4].map((c) => Math.min(c, m)))].map((c) => layout(m, c)),
    stage,
  );
  const shapes: Shape[] = [];

  // The hash, bit by bit.
  const hash = extra.hash;
  if (hash) {
    const bits = binary(hash.value, HASH_BITS);
    const y = ARG_BAND + 18;
    const showIndex = hash.show !== 'bits';
    const rhoEnd = hash.show === 'rho' && hash.rho ? state.b + hash.rho : -1;
    for (let i = 0; i < HASH_BITS; i++) {
      const x = L.bitsX + i * (BIT_W + BIT_GAP);
      const inIndex = showIndex && i < state.b;
      const inRho = i >= state.b && i < rhoEnd;
      shapes.push({
        kind: 'rect',
        id: `hb-${i}`,
        x,
        y,
        w: BIT_W,
        h: BIT_H,
        r: 3,
        cls: 'cell',
        role: inIndex ? 'visit' : inRho ? (i === rhoEnd - 1 ? 'found' : 'compare') : undefined,
      });
      shapes.push({
        kind: 'text',
        id: `hbt-${i}`,
        x: x + BIT_W / 2,
        y: y + 20,
        text: bits[i]!,
        size: 15,
        anchor: 'middle',
        mono: true,
        weight: inIndex || inRho ? 'bold' : 'normal',
      });
    }
    if (showIndex)
      shapes.push({
        kind: 'text',
        id: 'hb-index',
        x: L.bitsX + (state.b * (BIT_W + BIT_GAP)) / 2,
        y: y - 5,
        text: 'register',
        size: 13,
        anchor: 'middle',
        cls: 'label',
      });
    if (rhoEnd > 0)
      shapes.push({
        kind: 'text',
        id: 'hb-rho',
        x: L.bitsX + state.b * (BIT_W + BIT_GAP),
        y: y - 5,
        text: `ρ = ${hash.rho}`,
        size: 13,
        cls: 'label',
      });
  }

  const g = slotGrid(m, L.gridX, L.regTop, L.cols);
  for (let j = 0; j < m; j++) {
    const box = g.cell(j);
    const v = state.M[j]!;
    const id = regId(j);
    shapes.push(indexLabel(box, j));
    shapes.push({
      kind: 'rect',
      id,
      ...box,
      r: 4,
      cls: v ? 'cell live' : 'cell',
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `rv-${j}`,
      x: box.x + box.w / 2,
      y: box.y + CELL_H / 2 + 7,
      text: String(v),
      size: 19,
      anchor: 'middle',
      weight: v ? 'bold' : 'normal',
      cls: v ? undefined : 'label',
    });
  }

  (extra.calc ?? []).forEach((line, q) =>
    shapes.push({
      kind: 'text',
      id: `calc-${q}`,
      x: MARGIN,
      y: L.calcTop + 16 + q * CALC_LINE,
      text: line,
      size: 14,
      mono: true,
    }),
  );

  shapes.push(
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), () => 'arg'),
  );
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: L.bounds, label };
}
