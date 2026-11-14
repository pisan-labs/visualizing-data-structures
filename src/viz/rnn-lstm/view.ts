/**
 * Recurrent networks, unrolled down the page: one row per word in reading order, the words down
 * the left, then panels of numbers. The plain RNN shows x (the embedding), what is left of the
 * old memory (w·h), what the word brings (x·U), the new memory h, this step's slope w(1 − h²)
 * and the pull of word 1. The LSTM shows x, its gates f, i and the candidate g, the cell c, the
 * output gate o, its output h and the pull. Cells are shaded by value and always show the
 * number. A laptop draws the panels in one row; a phone stacks them in two.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene } from '../../render/scene';
import { short } from '../_lm/numbers';
import { drawPanelRows, shadeOf, type CellLook, type Panel } from '../_matrix/matrix';
import {
  describe,
  isLstm,
  wordName,
  type LstmRow,
  type RnnExtra,
  type RnnRow,
  type RnnSettings,
  type RnnState,
  type Row,
} from './model';

const FEATURE_HEADS = ['anim', 'thing', 'act', 'small'];

/** Which part of a word's reading reveals each panel's cell. */
const REVEAL: Record<string, string> = {
  push: 'push',
  input: 'push',
  factor: 'pull',
  f: 'f',
  i: 'g',
  g: 'g',
  c: 'c',
  o: 'h',
  h: 'h',
  pull: 'pull',
};

type Field = 'push' | 'input' | 'h' | 'factor' | 'pull' | 'f' | 'i' | 'g' | 'c' | 'o';

const valueOf = (r: Row, f: Field): number =>
  r.kind === 'rnn' ? (r[f as keyof RnnRow] as number) : (r[f as keyof LstmRow] as number);

function rowsShown(state: RnnState, extra: RnnExtra): (Row | undefined)[] {
  const out: (Row | undefined)[] = state.words.map((_, t) => state.rows[t]);
  if (extra.row && extra.t !== undefined) out[extra.t] = extra.row;
  return out;
}

function valuePanel(
  id: Field,
  title: string,
  rows: readonly (Row | undefined)[],
  extra: RnnExtra,
  scale: number,
): Panel {
  return {
    id,
    title,
    rows: rows.length,
    cols: 1,
    cell(t): CellLook | null {
      const r = rows[t];
      if (!r) return null;
      if (t === extra.t && !extra.shown?.includes(REVEAL[id] ?? id)) return null;
      // Word 1 has no factor: its pull starts at 1.
      if (id === 'factor' && t === 0) return { text: '–', dim: true };
      const v = valueOf(r, id);
      return { text: short(v), shade: shadeOf(v, scale) };
    },
  };
}

const maxAbsOf = (rows: readonly (Row | undefined)[], f: Field) =>
  Math.max(1, ...rows.filter((r): r is Row => !!r).map((r) => Math.abs(valueOf(r, f))));

export function view(
  step: Step<RnnState, RnnExtra>,
  _settings: RnnSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const rows = rowsShown(state, extra);
  const n = state.words.length;
  const labels = state.words.map((_, t) => wordName(state.words, t));
  const x: Panel = {
    id: 'x',
    title: 'x',
    rows: n,
    cols: 4,
    colHeads: FEATURE_HEADS,
    cell: (t, c) => {
      const v = state.x[t]![c]!;
      return { text: short(v), shade: shadeOf(v, 1) };
    },
  };
  const p = (id: Field, title: string) => valuePanel(id, title, rows, extra, maxAbsOf(rows, id));
  const lstm = isLstm(state.model);
  const groups: Panel[][] = lstm
    ? [
        [x, p('f', 'f'), p('i', 'i'), p('g', 'g')],
        [p('c', 'c'), p('o', 'o'), p('h', 'h'), p('pull', '∂c/∂c₁')],
      ]
    : [
        [x, p('push', 'w·h'), p('input', 'x·U')],
        [p('h', 'h'), p('factor', 'w(1−h²)'), p('pull', '∂h/∂h₁')],
      ];
  const arrangements = [[groups.flat()], groups].map((g) => drawPanelRows(g, labels, roles, stage));
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
