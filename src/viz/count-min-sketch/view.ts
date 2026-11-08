import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { ARG_BAND, argAndFormula } from '../hash-open/grid';
import {
  cellId,
  describe,
  estimateOf,
  itemId,
  type CmsExtra,
  type CmsSettings,
  type CmsState,
} from './model';

const MARGIN = 14;
const CW = 46;
const CH = 40;
const GAP = 6;
const ROW_LABEL = 36;
const INDEX = 18;
const TABLE_W = 168;
const LINE = 25;
/** Items listed before "… n more", besides the ones the step points at. */
const MAX_ROWS = 8;

const counterSize = (v: number) => (v < 100 ? 18 : 15);

/** The counter grid at (0, 0): row labels, column indexes, counters. */
function grid(state: CmsState, roles: Map<string, MarkRole>, read: Set<string>): Shape[] {
  const out: Shape[] = [];
  for (let j = 0; j < state.w; j++)
    out.push({
      kind: 'text',
      id: `col-${j}`,
      x: ROW_LABEL + j * (CW + GAP) + CW / 2,
      y: 13,
      text: String(j),
      size: 13,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
  state.rows.forEach((row, i) => {
    const y = INDEX + i * (CH + GAP);
    out.push({
      kind: 'text',
      id: `rowlab-${i}`,
      x: 0,
      y: y + CH / 2 + 6,
      text: `h${i + 1}`,
      size: 15,
      cls: 'label',
      mono: true,
    });
    row.forEach((v, j) => {
      const id = cellId(i, j);
      const x = ROW_LABEL + j * (CW + GAP);
      out.push({
        kind: 'rect',
        id,
        x,
        y,
        w: CW,
        h: CH,
        r: 4,
        cls: v ? 'cell live' : 'cell',
        role: roles.get(id) ?? (read.has(`${i}-${j}`) ? 'visit' : undefined),
      });
      out.push({
        kind: 'text',
        id: `cv-${i}-${j}`,
        x: x + CW / 2,
        y: y + CH / 2 + 6,
        text: String(v),
        size: counterSize(v),
        anchor: 'middle',
        weight: v ? 'bold' : 'normal',
        cls: v ? undefined : 'label',
      });
    });
  });
  return out;
}

const gridW = (w: number) => ROW_LABEL + w * (CW + GAP) - GAP;
const gridH = (d: number) => INDEX + d * (CH + GAP) - GAP;

/** The items seen, most frequent first, with true count and estimate, at (0, 0). */
function table(
  state: CmsState,
  roles: Map<string, MarkRole>,
  forced: number[],
): { shapes: Shape[]; h: number } {
  const sorted = [...state.counts].sort((a, b) => b[1] - a[1]);
  const shown = sorted.slice(0, MAX_ROWS);
  for (const x of forced) {
    const row = sorted.find(([y]) => y === x);
    if (row && !shown.includes(row)) shown.push(row);
  }
  const out: Shape[] = [];
  const head = (id: string, x: number, text: string) =>
    out.push({ kind: 'text', id, x, y: 16, text, size: 14, anchor: 'end', cls: 'label' });
  head('th-x', 44, 'x');
  head('th-true', 102, 'true');
  head('th-est', 160, 'est.');
  shown.forEach(([x, k], q) => {
    const y = 24 + q * LINE;
    const id = itemId(x);
    const role = roles.get(id);
    out.push({
      kind: 'rect',
      id,
      x: 0,
      y,
      w: TABLE_W,
      h: LINE - 3,
      r: 4,
      role,
      opacity: role ? 1 : 0,
    });
    const est = estimateOf(state, x);
    const cell = (suffix: string, cx: number, text: string, bold = false) =>
      out.push({
        kind: 'text',
        id: `${suffix}-${x}`,
        x: cx,
        y: y + 16,
        text,
        size: 14,
        anchor: 'end',
        weight: bold ? 'bold' : 'normal',
        mono: true,
        role: suffix === 'te' && est > k ? 'error' : undefined,
      });
    cell('tx', 44, String(x), true);
    cell('tt', 102, String(k));
    cell('te', 160, est > k ? `${est} +${est - k}` : String(est));
  });
  let h = 24 + shown.length * LINE;
  if (sorted.length > shown.length) {
    out.push({
      kind: 'text',
      id: 'th-more',
      x: 0,
      y: h + 14,
      text: `… ${sorted.length - shown.length} more`,
      size: 13,
      cls: 'label',
    });
    h += 22;
  }
  if (state.counts.length === 0)
    out.push({
      kind: 'text',
      id: 'th-none',
      x: 0,
      y: 42,
      text: 'nothing added',
      size: 14,
      cls: 'label',
    });
  return { shapes: out, h: Math.max(h, 50) };
}

export function view(
  step: Step<CmsState, CmsExtra>,
  _settings: CmsSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const forced = [
    ...(extra.focus !== undefined ? [extra.focus] : []),
    ...(state.heavy ?? []),
    ...step.marks.filter((m) => m.id.startsWith('it-')).map((m) => Number(m.id.slice(3))),
  ];
  const g = grid(state, roles, new Set(extra.read ?? []));
  const t = table(state, roles, forced);
  const gw = gridW(state.w);
  const gh = gridH(state.d);
  const top = ARG_BAND;
  // Choose the arrangement for a full table, so it does not flip while the table grows.
  const arrange = (th: number) => {
    const besideW = Math.max(420, MARGIN + gw + 30 + TABLE_W + MARGIN);
    const underW = Math.max(420, 2 * MARGIN + gw);
    return [
      {
        bounds: { x: 0, y: 0, w: besideW, h: top + Math.max(gh, th) + 10 },
        tx: MARGIN + gw + 30,
        ty: top,
      },
      {
        bounds: { x: 0, y: 0, w: underW, h: top + gh + 18 + th + 10 },
        tx: MARGIN,
        ty: top + gh + 18,
      },
    ];
  };
  const full = arrange(24 + MAX_ROWS * LINE + 22);
  const which = full.indexOf(pickLayout(stage, full));
  const L = arrange(t.h)[which]!;
  const shapes: Shape[] = [
    ...translate(g, MARGIN, top),
    ...translate(t.shapes, L.tx, L.ty),
    ...argAndFormula(extra.arg, extra.formula, MARGIN, roles.get('arg-box'), () => 'arg'),
  ];
  const label = [describe(state), extra.formula ? `${extra.formula}.` : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: L.bounds, label };
}
