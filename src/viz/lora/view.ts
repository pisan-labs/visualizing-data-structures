/**
 * LoRA: the frozen W, a plus sign, then the adapter drawn as a matrix product by hand: B to the
 * left of ΔW and A above it, so row i of B and column j of A meet at ΔW's cell (i, j). D, the
 * target, sits to the right of ΔW on the same rows, shaded on the same scale, so the two compare
 * at a glance. After a merge, W shows W + ΔW.
 *
 * A laptop draws it all in one row; a phone puts the product on top and W and D under it, side
 * by side or one under the other.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { short } from '../_lm/numbers';
import {
  CELL_H,
  drawGrid,
  gridWidth,
  headRoom,
  shadeOf,
  type CellLook,
  type Grid,
} from '../_dist/cells';
import { describe, DIM, type LoraSettings, type LoraState } from './model';

const GAP = 26;
const PLUS_W = 34;
/** Between A's last row and ΔW's title: room for B's title and column numbers. */
const A_GAP = 22;
const HEADS = Array.from({ length: DIM }, (_, c) => String(c + 1));

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

function numbers(m: readonly (readonly number[])[] | null, top: number) {
  return (r: number, c: number): CellLook | null => {
    const v = m?.[r]?.[c];
    if (v === undefined || !Number.isFinite(v)) return m ? { text: '', cls: 'ghost' } : null;
    return { text: short(v), shade: shadeOf(v, top) };
  };
}

interface Parts {
  W: Grid;
  B: Grid;
  A: Grid;
  dW: Grid;
  D: Grid;
}

function parts(s: LoraState, settings: LoraSettings): Parts {
  const r = settings.rank;
  const ranks = Array.from({ length: r }, (_, k) => String(k + 1));
  const shownW = s.merged ?? s.w;
  const both = Math.max(maxAbs(s.target), s.dw ? maxAbs(s.dw) : 0);
  return {
    W: {
      id: 'W',
      title: s.merged ? 'W + ΔW (merged)' : 'W (frozen)',
      rows: DIM,
      cols: DIM,
      colHeads: HEADS,
      rowHeads: HEADS,
      cell: numbers(shownW, maxAbs(shownW)),
    },
    B: {
      id: 'B',
      title: 'B',
      rows: DIM,
      cols: r,
      colHeads: ranks,
      cell: numbers(s.b, maxAbs(s.b)),
    },
    A: {
      id: 'A',
      title: 'A',
      rows: r,
      cols: DIM,
      colHeads: HEADS,
      rowHeads: ranks,
      cell: numbers(s.a, maxAbs(s.a)),
    },
    dW: {
      id: 'dW',
      title: 'ΔW = (α/r)·B·A',
      rows: DIM,
      cols: DIM,
      cell: s.dw ? numbers(s.dw, both) : () => ({ text: '', cls: 'ghost' }),
    },
    D: {
      id: 'D',
      title: 'D (target)',
      rows: DIM,
      cols: DIM,
      colHeads: HEADS,
      cell: numbers(s.target, both),
    },
  };
}

/**
 * The product block with B's cells starting at x and ΔW's cells at row `y`: A above ΔW, B to
 * the left. Returns ΔW's cells' left edge too.
 */
function product(
  out: Shape[],
  p: Parts,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): { boxes: Bounds[]; right: number } {
  const xd = x + gridWidth(p.B) + GAP;
  const ya = y - headRoom(p.dW) - A_GAP - p.A.rows * CELL_H;
  const boxes = [
    drawGrid(out, p.B, x, y, roles),
    drawGrid(out, p.A, xd, ya, roles),
    drawGrid(out, p.dW, xd, y, roles),
  ];
  return { boxes, right: xd + gridWidth(p.dW) };
}

/** How far above ΔW's cells the product block reaches. */
const productTop = (p: Parts) => headRoom(p.dW) + A_GAP + p.A.rows * CELL_H + headRoom(p.A);

function plus(out: Shape[], x: number, y: number) {
  out.push({
    kind: 'text',
    id: 'plus',
    x,
    y: y + (DIM * CELL_H) / 2 + 8,
    text: '+',
    size: 24,
    anchor: 'middle',
    weight: 'bold',
  });
}

/** Everything in one row: W + B·A, then D. */
function wide(p: Parts, roles: ReadonlyMap<string, MarkRole>) {
  const out: Shape[] = [];
  const y = productTop(p);
  const xw = 30;
  const boxes = [drawGrid(out, p.W, xw, y, roles)];
  const xb = xw + gridWidth(p.W) + PLUS_W;
  plus(out, xw + gridWidth(p.W) + PLUS_W / 2, y);
  const prod = product(out, p, xb, y, roles);
  boxes.push(...prod.boxes, drawGrid(out, p.D, prod.right + GAP + 8, y, roles));
  return { shapes: out, bounds: padBounds(unionBounds(...boxes), 12) };
}

/** The product on top; W and D under it, side by side (`stack` false) or one under the other. */
function tall(p: Parts, roles: ReadonlyMap<string, MarkRole>, stack: boolean) {
  const out: Shape[] = [];
  const y = productTop(p) + 4;
  const prod = product(out, p, 30, y, roles);
  const boxes = [...prod.boxes];
  const y2 = y + DIM * CELL_H + 22 + headRoom(p.W);
  boxes.push(drawGrid(out, p.W, 30, y2, roles));
  if (stack) {
    const y3 = y2 + DIM * CELL_H + 22 + headRoom(p.D);
    boxes.push(drawGrid(out, p.D, 30, y3, roles));
  } else boxes.push(drawGrid(out, p.D, 30 + gridWidth(p.W) + GAP + 8, y2, roles));
  return { shapes: out, bounds: padBounds(unionBounds(...boxes), 12) };
}

export function view(
  step: Step<LoraState, unknown>,
  settings: LoraSettings,
  stage?: StageSize,
): Scene {
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const p = parts(step.state, settings);
  const best = pickLayout(stage, [wide(p, roles), tall(p, roles, false), tall(p, roles, true)]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(step.state, settings) };
}
