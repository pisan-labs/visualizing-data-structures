/**
 * Self-attention: the words down the left, then six panels of numbers: x (the embeddings), q, k
 * and v (two numbers per word), the attention table (scores, then scaled, masked and finally the
 * weights, one row per word looking, one column per word looked at) and z (the outputs). Cells
 * are shaded by value and always show the number. A laptop draws the panels in one row; a phone
 * stacks them in two or three.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene } from '../../render/scene';
import { short } from '../_lm/numbers';
import { CELL_W, drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  D_K,
  describe,
  project,
  type AttnExtra,
  type AttnResult,
  type AttnSettings,
  type AttnState,
  type CellKind,
  type Projection,
} from './model';

const A_CELL = 54;
const FEATURE_HEADS = ['anim', 'thing', 'act', 'small'];

const maxAbs = (m: readonly (readonly number[])[]) =>
  Math.max(0, ...m.flat().filter(Number.isFinite).map(Math.abs));

function numberPanel(
  id: string,
  title: string,
  m: number[][] | undefined,
  n: number,
  cols: number,
  heads: readonly string[],
  rowsShown = n,
): Panel {
  const top = m ? maxAbs(m) : 0;
  return {
    id,
    title,
    rows: n,
    cols,
    colHeads: heads,
    cell: (r, c) =>
      m && r < rowsShown ? { text: short(m[r]![c]!), shade: shadeOf(m[r]![c]!, top) } : null,
  };
}

const TITLES: Record<CellKind, string> = {
  raw: 'q·k',
  scaled: `q·k / √${D_K}`,
  masked: 'masked',
  weight: 'softmax',
};

function attentionPanel(
  words: readonly string[],
  r: AttnResult | undefined,
  cells: readonly (readonly (CellKind | null)[])[] | undefined,
  stageKind: CellKind,
): Panel {
  const n = words.length;
  const scaleOf = (kind: CellKind) =>
    r ? maxAbs(kind === 'raw' ? r.raw : kind === 'weight' ? r.a : r.scaled) : 0;
  const top: Record<CellKind, number> = {
    raw: scaleOf('raw'),
    scaled: scaleOf('scaled'),
    masked: scaleOf('scaled'),
    weight: 1,
  };
  return {
    id: 'a',
    title: TITLES[stageKind],
    rows: n,
    cols: n,
    cellW: A_CELL,
    colHeads: words,
    cell(i, j): CellLook | null {
      const kind = cells?.[i]?.[j] ?? null;
      if (!r || !kind) return null;
      const hidden = r.causal && j > i;
      if (kind === 'masked') return { text: '−∞', cls: 'ghost', dim: true };
      if (kind === 'weight' && hidden) return { text: '0', cls: 'ghost', dim: true };
      const v = kind === 'raw' ? r.raw[i]![j]! : kind === 'scaled' ? r.scaled[i]![j]! : r.a[i]![j]!;
      // Under the mask the masked stage shows the scaled score of a visible pair.
      const scale = kind === 'weight' ? 1 : top[kind];
      return { text: short(v), shade: shadeOf(v, scale) };
    },
  };
}

export function view(
  step: Step<AttnState, AttnExtra>,
  settings: AttnSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.words.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = extra.work;
  const r = work?.r ?? state.result;

  // What Q, K and V show.
  let p: Projection | undefined = work?.r ?? state.proj;
  let qkv = work ? work.qkv : state.proj ? 3 : 0;
  if (extra.qkv !== undefined) {
    p = project(state.x, state.head);
    qkv = extra.qkv;
  }
  const dims = settings.weights === 'designed' ? FEATURE_HEADS.slice(0, D_K) : ['1', '2'];

  // What the attention table and Z show.
  const done = !work && state.result;
  const cells =
    work?.cells ??
    (done ? Array.from({ length: n }, () => Array<CellKind>(n).fill('weight')) : undefined);
  const stageKind: CellKind = work
    ? work.stage === 'scores'
      ? 'raw'
      : work.stage === 'weights'
        ? 'weight'
        : work.stage
    : 'weight';
  const zRows = work ? work.zRows : done ? n : 0;

  const x = numberPanel('x', 'x', state.x, n, 4, FEATURE_HEADS);
  const q = numberPanel('q', 'q', qkv >= 1 ? p?.q : undefined, n, D_K, dims);
  const k = numberPanel('k', 'k', qkv >= 2 ? p?.k : undefined, n, D_K, dims);
  const v = numberPanel('v', 'v', qkv >= 3 ? p?.v : undefined, n, D_K, dims);
  const a = attentionPanel(state.words, r, cells, stageKind);
  const z = numberPanel('z', 'z', zRows > 0 ? r?.z : undefined, n, D_K, dims, zRows);

  const arrangements = [
    [[x, q, k, v, a, z]],
    [
      [x, q, k, v],
      [a, z],
    ],
    [
      [x, q],
      [k, v],
      [a, z],
    ],
  ].map((groups) => drawPanelRows(groups, state.words, roles, stage));
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}

/** Width of the one-row drawing, for tests. */
export const oneRowWidth = (n: number) => 66 + (4 + 4 * D_K) * CELL_W + n * A_CELL + 5 * 24;
