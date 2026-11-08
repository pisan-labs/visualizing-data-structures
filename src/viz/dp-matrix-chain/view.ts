import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { tableGeometry, tableScene, type TableFrame, type TableLink } from '../../layouts/table';
import { textWidth } from '../../layouts/text';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  describe,
  nOf,
  tokensText,
  type ChainExtra,
  type ChainSettings,
  type ChainState,
} from './model';

const EXPR = 24;
const EXPR_H = 48;
const GAP = 24;

/** The s table's shapes get their own ids, s-cell-i-j and so on. */
const prefixed = (shapes: Shape[], p: string): Shape[] =>
  shapes.map((s) => ({ ...s, id: `${p}${s.id}` }));

/**
 * Two tables over the chains Ai..Aj (row i, column j, upper triangle): m, the fewest scalar
 * multiplications, with each matrix's dimensions beside its row, and s, where the best order
 * splits the chain. They fill by chain length, diagonal by diagonal; a cell reads m[i][k] in its
 * row and m[k + 1][j] in its column. Side by side on a wide stage, one above the other on a
 * tall one. Under them, the order as nested brackets, split by split.
 */
export function view(
  step: Step<ChainState, ChainExtra>,
  _settings: ChainSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = nOf(state);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const idx = Array.from({ length: n }, (_, i) => String(i + 1));
  const mFrame: TableFrame = { rows: n, cols: n, colHeads: 1, rowHeads: [30, 66] };
  const sFrame: TableFrame = { rows: n, cols: n, colHeads: 1, rowHeads: [34] };
  const links: TableLink[] = [];
  if (extra.at && extra.k) {
    const [i, j] = extra.at;
    const k = extra.k;
    const role: MarkRole | undefined = k === extra.bestK ? 'active' : undefined;
    links.push({ id: 'left', from: [i, k - 1], to: [i, j], role });
    links.push({ id: 'right', from: [k, j], to: [i, j], role });
  }
  const faint = (shapes: Shape[], upperOnly: boolean) => {
    for (const sh of shapes) {
      const m = /^cell-(\d+)-(\d+)$/.exec(sh.id);
      if (m && (Number(m[2]) < Number(m[1]) || (upperOnly && m[1] === m[2]))) sh.opacity = 0.35;
    }
    return shapes;
  };
  const sRoles = new Map<string, MarkRole>();
  for (const [id, r] of roles) if (id.startsWith('s-')) sRoles.set(id.slice(2), r);
  const mPart = tableScene(mFrame, {
    values: state.m.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [idx],
    rowHeads: [idx, state.p.slice(1).map((d, i) => `${state.p[i]}×${d}`)],
    rowStyles: ['index', 'label'],
    corner: [['m', 'j']],
    links,
    roles,
  });
  const sPart = tableScene(sFrame, {
    values: state.s.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [idx],
    rowHeads: [idx],
    rowStyles: ['index'],
    corner: [['s']],
    roles: sRoles,
  });
  const mShapes = faint(mPart.shapes, false);
  const sShapes = prefixed(faint(sPart.shapes, true), 's-');
  const mg = tableGeometry(mFrame);
  const sg = tableGeometry(sFrame);
  // Trim the side margins tableGeometry keeps for its minimum width.
  const mLeft = mg.gridLeft - 30 - 66 - 10;
  const mRight = mg.gridRight + 10;
  const sLeft = sg.gridLeft - 34 - 10;
  const sRight = sg.gridRight + 10;
  const text = extra.tokens ? tokensText(extra.tokens) : '';
  const exprW = text ? textWidth(text, EXPR, true) + 20 : 0;

  type Option = { bounds: Bounds; dx: number; dy: number; ex: number; ey: number };
  const options: Option[] = [];
  {
    // Side by side.
    const dx = mRight + GAP - sLeft;
    // Lower, so its column headers clear the zoom buttons over the top right corner.
    const dy = mg.gridTop - sg.gridTop + (stage && !stage.strip ? ZOOM_DROP : 0);
    const right = sRight + dx;
    const bottom = Math.max(mg.gridBottom, sg.gridBottom + dy) + 10;
    const w = Math.max(right - mLeft, exprW);
    options.push({
      bounds: { x: mLeft, y: 0, w, h: bottom + EXPR_H },
      dx,
      dy,
      ex: mLeft + w / 2,
      ey: bottom + EXPR_H / 2 + 8,
    });
  }
  {
    // Stacked: s under m, its grid under m's grid.
    const dx = mg.gridLeft - sg.gridLeft;
    const dy = mg.gridBottom + GAP - (sg.gridTop - 34);
    const bottom = sg.gridBottom + dy + 10;
    const w = Math.max(mRight - mLeft, exprW);
    options.push({
      bounds: { x: mLeft, y: 0, w, h: bottom + EXPR_H },
      dx,
      dy,
      ex: mLeft + w / 2,
      ey: bottom + EXPR_H / 2 + 8,
    });
  }
  const o = pickBest(options, stage);
  const out: Shape[] = [...mShapes, ...translate(sShapes, o.dx, o.dy)];
  if (text)
    out.push({
      kind: 'text',
      id: 'order',
      x: o.ex,
      y: o.ey,
      text,
      size: EXPR,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role: extra.tokens!.some((t) => t.kind === 'range') ? undefined : 'found',
    });
  return { shapes: out, bounds: o.bounds, label: label(step) };
}

function label(step: Step<ChainState, ChainExtra>): string {
  const parts = [describe(step.state)];
  if (step.extra?.tokens) parts.push(`Order so far: ${tokensText(step.extra.tokens)}.`);
  return parts.join(' ');
}
