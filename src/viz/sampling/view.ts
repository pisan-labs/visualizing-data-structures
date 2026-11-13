/**
 * Sampling: the candidate words down the left, most likely first, then the logits, the logits
 * divided by T, the probabilities p as bars, the survivors renormalized (p′) and how often each
 * word has been drawn. The cut is a dashed line under the last word kept; for the draw the p′
 * bars slide end to end so they tile 0 to 1, and the line of u crosses the word drawn. A laptop
 * draws one row of columns; a phone puts p′ and the counts under the rest.
 */
import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene } from '../../render/scene';
import { round3, short } from '../_lm/numbers';
import { drawTable, type Column, type Cut, type Row } from '../_decode/bars';
import { shadeOf } from '../_matrix/matrix';
import { byProbability } from '../_decode/draw';
import {
  describe,
  type Pass,
  type SampExtra,
  type SampSettings,
  type SampState,
  type SampWork,
} from './model';

const TRACK = 150;
const STAGES: SampWork['stage'][] = ['z', 'p', 'cut', 'q', 'draw'];

function cutLabel(settings: SampSettings): string {
  switch (settings.strategy) {
    case 'greedy':
      return 'greedy';
    case 'pure':
      return 'keep all';
    case 'top-k':
      return `top-k, k = ${settings.k}`;
    case 'top-p':
      return `top-p, Σ ≥ ${settings.p}`;
    case 'min-p':
      return `min-p, ≥ ${settings.minP} × top`;
  }
}

export function view(
  step: Step<SampState, SampExtra>,
  settings: SampSettings,
  stage?: StageSize,
): Scene {
  const { state } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const work = step.extra?.work;
  const pass: Pass | undefined = work?.pass ?? state.pass;
  // How far the columns are filled: 0 logits only, then z, p, cut, q, draw.
  const reached = work
    ? STAGES.indexOf(work.stage) + 1
    : state.pass
      ? state.drawn
        ? STAGES.length
        : 2
      : 0;
  const order = byProbability(state.logits);
  const rows: Row[] = order.map((i) => ({ key: String(i), label: state.words[i]! }));
  const at = (r: number) => order[r]!;
  const pos = new Map(order.map((i, r) => [i, r]));
  const kept = (i: number) => !pass || reached < 3 || (pos.get(i) ?? 0) < pass.keep;
  const greedy = settings.strategy === 'greedy';

  const top = Math.max(0, ...state.logits.map(Math.abs));
  const zTop = pass ? Math.max(0, ...pass.z.map(Math.abs)) : 0;
  const most = Math.max(0, ...state.tally);

  const logit: Column = {
    kind: 'cells',
    id: 'l',
    title: 'logit',
    cell: (r) => ({ text: short(state.logits[at(r)]!), shade: shadeOf(state.logits[at(r)]!, top) }),
  };
  const z: Column = {
    kind: 'cells',
    id: 'z',
    title: '÷T',
    cell: (r) =>
      pass && reached >= 1
        ? { text: short(pass.z[at(r)]!), shade: shadeOf(pass.z[at(r)]!, zTop) }
        : null,
  };
  const p: Column = {
    kind: 'bars',
    id: 'p',
    title: 'p',
    track: TRACK,
    bar: (r) =>
      pass && reached >= 2
        ? { value: pass.p[at(r)]!, text: short(pass.p[at(r)]!), dim: !kept(at(r)) }
        : null,
  };
  const stacked = !!pass && reached >= 5 && !greedy;
  const q: Column = {
    kind: 'bars',
    id: 'q',
    title: 'p′',
    track: TRACK,
    draws: true,
    bar: (r) => {
      if (!pass || reached < 4 || greedy) return null;
      const i = at(r);
      if (!kept(i)) return { value: 0, text: '0', dim: true };
      return { value: pass.q[i]!, text: short(pass.q[i]!), offset: stacked ? pass.from[r]! : 0 };
    },
    u:
      stacked && pass.u !== null
        ? { value: pass.u, label: `u = ${round3(pass.u)}`, rows: [0, pass.keep - 1] }
        : undefined,
  };
  const n: Column = {
    kind: 'cells',
    id: 'n',
    title: 'drawn',
    cell: (r) => {
      const c = state.tally[at(r)]!;
      return most > 0 ? { text: String(c), shade: shadeOf(c, most), dim: c === 0 } : null;
    },
  };
  const cut: Cut | null =
    pass && reached >= 3 && pass.keep < rows.length
      ? { after: pass.keep - 1, label: cutLabel(settings) }
      : null;

  const arrangements = [
    [[logit, z, p, q, n]],
    [
      [logit, z, p],
      [q, n],
    ],
  ].map((groups) => drawTable(groups, rows, roles, { stage, cut, labelW: 70 }));
  const best = pickLayout(stage, arrangements);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(state) };
}
