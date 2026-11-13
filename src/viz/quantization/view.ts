/**
 * Quantization: panels of numbers with the matrix rows down the left. W (the weights), s (the
 * scale of each group: one for the matrix, one per row, or one per block), z (the zero point,
 * for zero-point codes), the codes, ŵ (the weights decoded) and the error ŵ − W. With blocks,
 * a line splits each row of the 6-wide panels into its two blocks.
 *
 * A laptop draws W, s (z) and the codes in one row and ŵ and the error in a second; a phone
 * puts one or two panels to a row. W and ŵ share one shading scale, so their colors compare.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  BLOCK,
  COLS,
  describe,
  fine,
  groupCells,
  ROWS,
  sig3,
  type QuantSettings,
  type QuantState,
} from './model';

const WIDE = 50;
const DEC = 56;
const SCALE = 64;
const HEADS = Array.from({ length: COLS }, (_, c) => String(c + 1));
const LABELS = Array.from({ length: ROWS }, (_, r) => `row ${r + 1}`);

const maxAbs = (xs: readonly number[]) => Math.max(0, ...xs.map(Math.abs));

export function view(step: Step<QuantState, unknown>, settings: QuantSettings, stage?: StageSize): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const w = s.w;
  const top = w ? maxAbs(w.flat()) : 0;
  const k = groupCells(settings).filter((g) => g.r === 0).length;
  const blockHeads = k > 1 ? Array.from({ length: k }, (_, i) => `${i * BLOCK + 1}–${i * BLOCK + BLOCK}`) : undefined;
  // Where each group's scale is drawn: every row for the whole matrix, else its own row.
  const groupAt = (r: number, c: number) =>
    s.groups.find((g) => g.k === c && (settings.group === 'tensor' || g.r === r));

  const W: Panel = {
    id: 'W',
    title: 'W',
    rows: ROWS,
    cols: COLS,
    cellW: WIDE,
    colHeads: HEADS,
    cell: (r, c): CellLook | null =>
      w ? { text: short(w[r]![c]!), shade: shadeOf(w[r]![c]!, top) } : null,
  };
  const scale: Panel = {
    id: 's',
    title: 's',
    rows: ROWS,
    cols: k,
    cellW: SCALE,
    colHeads: blockHeads,
    cell: (r, c): CellLook | null => {
      const g = groupAt(r, c);
      if (!g) return null;
      return { text: sig3(g.s), dim: settings.group === 'tensor' && r > 0 };
    },
  };
  const zero: Panel = {
    id: 'z',
    title: 'z',
    rows: ROWS,
    cols: k,
    cellW: WIDE,
    colHeads: blockHeads,
    cell: (r, c): CellLook | null => {
      const g = groupAt(r, c);
      if (!g) return null;
      return { text: String(g.z), dim: settings.group === 'tensor' && r > 0 };
    },
  };
  const zOf = (r: number, c: number) =>
    s.groups.find((g) => g.cells.some(([gr, gc]) => gr === r && gc === c))?.z ?? 0;
  const signed = s.q.flatMap((row, r) => row.flatMap((q, c) => (q === null ? [] : [q - zOf(r, c)])));
  const qTop = maxAbs(signed);
  const codes: Panel = {
    id: 'q',
    title: 'codes',
    rows: ROWS,
    cols: COLS,
    cellW: WIDE,
    colHeads: HEADS,
    cell: (r, c): CellLook | null => {
      const q = s.q[r]![c];
      return q === null || q === undefined ? null : { text: String(q), shade: shadeOf(q - zOf(r, c), qTop) };
    },
  };
  const deq = s.deq;
  const err = deq && w ? deq.map((row, r) => row.map((x, c) => x - w[r]![c]!)) : null;
  const eTop = err ? maxAbs(err.flat()) : 0;
  const dec: Panel = {
    id: 'd',
    title: 'ŵ',
    rows: ROWS,
    cols: COLS,
    cellW: DEC,
    colHeads: HEADS,
    cell: (r, c): CellLook | null =>
      deq ? { text: fine(deq[r]![c]!), shade: shadeOf(deq[r]![c]!, top) } : null,
  };
  const error: Panel = {
    id: 'e',
    title: 'error ŵ − W',
    rows: ROWS,
    cols: COLS,
    cellW: DEC,
    colHeads: HEADS,
    cell: (r, c): CellLook | null =>
      err ? { text: fine(err[r]![c]!), shade: shadeOf(err[r]![c]!, eTop) } : null,
  };
  const zp = settings.scheme === 'zeropoint';
  const consts = zp ? [scale, zero] : [scale];
  const arrangements: Panel[][][] = [
    [[W, ...consts, codes], [dec, error]],
    [[W, ...consts], [codes, dec, error]],
    [[W, scale], zp ? [codes, zero] : [codes], [dec], [error]],
    [[W, ...consts], [codes], [dec], [error]],
  ];
  const drawn = arrangements.map((groups) => {
    const d = drawPanelRows(groups, LABELS, roles, stage);
    return { shapes: [...d.shapes, ...blockLines(d.shapes, settings)], bounds: d.bounds };
  });
  const best = pickLayout(stage, drawn);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s, settings) };
}

/** With blocks, a line between the two blocks of each 6-wide panel, behind the cells. */
function blockLines(shapes: readonly Shape[], settings: QuantSettings): Shape[] {
  if (settings.group !== '3') return [];
  const rect = (id: string) => shapes.find((sh) => sh.id === id && sh.kind === 'rect');
  return ['W', 'q', 'd', 'e'].flatMap((p) => {
    const a = rect(`${p}-0-${BLOCK}`);
    const b = rect(`${p}-${ROWS - 1}-${BLOCK}`);
    if (a?.kind !== 'rect' || b?.kind !== 'rect') return [];
    return [
      {
        kind: 'arrow' as const,
        id: `blk-${p}`,
        x1: a.x,
        y1: a.y - 4,
        x2: a.x,
        y2: b.y + b.h + 4,
        head: 'none' as const,
        z: 1.5,
      },
    ];
  });
}
