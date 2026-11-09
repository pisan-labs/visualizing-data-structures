import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  fitCellW,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
  valueSize,
} from '../../layouts/table';
import { describe, type ChangeExtra, type ChangeSettings, type ChangeState } from './model';

const STRIP_H = 40;
const STRIP_GAP = 12;

const show = (v: number | null | undefined) =>
  v === null || v === undefined ? null : v === Infinity ? '∞' : String(v);

/**
 * Fewest coins: F over the coin row, amounts under them, arcs over F from the cells a value
 * reads (one lane per coin), and under the table the coins the traceback takes and what greedy
 * would pay. Number of ways: one row per prefix of the coins.
 */
export function view(
  step: Step<ChangeState, ChangeExtra>,
  settings: ChangeSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const amounts = Array.from({ length: state.amount + 1 }, (_, a) => String(a));
  const label = describe(state, settings);

  if (settings.goal === 'ways') {
    const waysOf = (cellW: number | undefined): TableFrame => ({
      rows: state.table.length,
      cols: state.amount + 1,
      colHeads: 1,
      rowHeads: [62],
      ...(cellW ? { cellW } : {}),
    });
    const frame = waysOf(fitCellW(stage, waysOf, (w) => [20, valueSize('00', w)]));
    const links: TableLink[] = (extra.reads ?? []).map((r, k) => ({
      id: `read-${k}`,
      from: r.from,
      to: r.to,
      role: 'active',
    }));
    const { shapes, bounds } = tableScene(frame, {
      values: state.table.map((row) => row.map(show)),
      colHeads: [amounts],
      rowHeads: [['none', ...state.coins.map((c) => `≤${c}`)]],
      corner: [['a']],
      links,
      roles,
    });
    return { shapes, bounds, label };
  }

  const frameOf = (cellW: number | undefined): TableFrame => ({
    rows: 2,
    cols: state.amount + 1,
    colHeads: 1,
    colHeadsAt: 'below',
    rowHeads: [72],
    arcLanes: Math.max(1, state.coins.length),
    below: 2 * STRIP_H + STRIP_GAP,
    ...(cellW ? { cellW } : {}),
  });
  // On a phone, narrower cells draw the arc labels (16 units) larger; values and coins stay
  // two digits wide.
  const frame = frameOf(
    fitCellW(stage, frameOf, (w) => [16, valueSize('00', w), valueSize('00', Math.min(w - 6, 46))]),
  );
  const g = tableGeometry(frame);
  const links: TableLink[] = [];
  for (const r of extra.reads ?? []) {
    links.push({
      id: `read-${r.coin}`,
      from: r.from,
      to: r.to,
      route: 'arc',
      lane: state.coins.indexOf(r.coin ?? 0),
      role: r.win ? 'active' : undefined,
      label: `c=${r.coin}`,
    });
  }
  // The traceback hops left by the coin it pays: one lane, each hop labeled.
  const back = extra.back ?? [];
  for (let k = 0; k + 1 < back.length; k++) {
    links.push({
      id: `back-${k}`,
      from: [0, back[k]!],
      to: [0, back[k + 1]!],
      route: 'arc',
      lane: 0,
      role: 'active',
      label: `−${back[k]! - back[k + 1]!}`,
    });
  }
  const { shapes, bounds } = tableScene(frame, {
    values: [
      (state.table[0] ?? []).map(show),
      (state.table[1] ?? []).map((v) => (v === 0 ? '–' : show(v))),
    ],
    colHeads: [amounts],
    rowHeads: [['F', 'coin']],
    links,
    roles,
  });
  const out: Shape[] = shapes;
  // An arc that reads the cell next door is narrower than its label, which then sits right on
  // the arrowhead and the other arcs coming down into the same cell: put the label beside the
  // arc's left end instead, level with it. Only in the lowest lane, which has nothing below it.
  for (const r of extra.reads ?? []) {
    if (Math.abs(r.to[1] - r.from[1]) !== 1 || state.coins.indexOf(r.coin ?? 0) !== 0) continue;
    const over = out.find((sh) => sh.id === `link-read-${r.coin}-over`);
    const label = out.find((sh) => sh.id === `link-read-${r.coin}-label`);
    if (over?.kind !== 'arrow' || label?.kind !== 'text') continue;
    label.x = Math.min(over.x1, over.x2) - 6;
    label.y = over.y1 + 5;
    label.anchor = 'end';
  }
  const x = (k: number) => g.gridLeft + (k + 0.5) * g.cellW;
  const w = Math.min(g.cellW - 6, 46);
  const opts = (label: string) => ({ w, h: STRIP_H, label, labelX: g.gridLeft - 10 });
  if (extra.taken?.length) {
    out.push(
      ...boxRow(
        'paid',
        g.belowTop,
        extra.taken.map((t, k) => ({
          text: String(t.coin),
          x: x(k),
          role: 'found' as MarkRole,
          from: { x: g.cx(t.at), y: g.cy(1) },
        })),
        opts('paid'),
      ),
    );
  }
  if (extra.greedy) {
    const y = g.belowTop + STRIP_H + STRIP_GAP;
    const picks = extra.greedy.picks.map((c, k) => ({ text: String(c), x: x(k) }));
    out.push(...boxRow('greedy', y, picks, opts('greedy')));
    if (extra.greedy.stuck) {
      out.push({
        kind: 'text',
        id: 'greedy-stuck',
        x: x(picks.length) - w / 2,
        y: y + STRIP_H / 2 + 6,
        text: 'stuck',
        size: 18,
        role: 'error',
      });
    }
  }
  return { shapes: out, bounds, label: describeExtra(label, extra) };
}

function describeExtra(label: string, extra: ChangeExtra): string {
  const parts = [label];
  if (extra.taken?.length) parts.push(`Paid so far: ${extra.taken.map((t) => t.coin).join(', ')}.`);
  if (extra.greedy)
    parts.push(
      `Greedy pays ${extra.greedy.picks.join(', ') || 'nothing'}${extra.greedy.stuck ? ' and gets stuck' : ''}.`,
    );
  return parts.join(' ');
}
