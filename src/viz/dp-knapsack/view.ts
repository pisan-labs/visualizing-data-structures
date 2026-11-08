import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { describe, type KnapExtra, type KnapSettings, type KnapState } from './model';

const STRIP_H = 38;
const STRIP_GAP = 10;
const PITCH = 64;
/**
 * Narrower cells a narrow stage (a phone in portrait) may draw larger with. They keep a height
 * of at least CELL_H_MIN, so a one-digit value (28 units) still has room above and below, and
 * two-digit values still get 21 units.
 */
const NARROW = [44, 40, 36, 32];
const CELL_H_MIN = 36;

/**
 * The K table: one row per item (its weight and value beside it), one column per capacity.
 * A cell reads the cell above (skip the item) and, if the item fits, the cell one row up and
 * w columns left (take it, +v). The walk back climbs one row per item; the items it takes,
 * and what greedy by value per weight would take, line up under the table.
 *
 * A large capacity makes the table wide; on a narrow stage the cells get narrower when that
 * draws the table larger. Their values stay large (valueSize fits them to the cell).
 */
export function view(
  step: Step<KnapState, KnapExtra>,
  _settings: KnapSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.items.length;
  const W = state.W;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const tracing = extra.taken !== undefined;
  const frameFor = (cellW: number | undefined, strips: boolean): TableFrame => ({
    rows: n + 1,
    cols: W + 1,
    colHeads: 2,
    rowHeads: [30, 40, 44],
    // The strips only exist while tracing back, a separate operation; filling gets the room.
    below: strips ? 2 * STRIP_H + STRIP_GAP + 4 : 0,
    cellW,
    cellH: cellW && Math.max(CELL_H_MIN, Math.round(cellW * 0.8)),
  });
  // The usual cells first (with no stage, or a wide one, they are what is drawn), then
  // narrower ones, judged with the strips, so filling and tracing back draw the same cells.
  const narrow = stage && stage.w < stage.h ? NARROW : [];
  const cellW = pickLayout(
    stage,
    [undefined, ...narrow].map((w) => {
      const g = tableGeometry(frameFor(w, true));
      return { w, bounds: { x: 0, y: 0, w: g.width, h: g.height } };
    }),
  ).w;
  const frame = frameFor(cellW, tracing);
  const g = tableGeometry(frame);
  const links: TableLink[] = (extra.reads ?? []).map((r) => ({
    id: r.take ? 'take' : 'skip',
    from: r.from,
    to: r.to,
    role: r.win ? 'active' : undefined,
    label: r.label,
  }));
  const { shapes, bounds } = tableScene(frame, {
    values: state.K.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [Array<string>(W + 1).fill(''), Array.from({ length: W + 1 }, (_, c) => String(c))],
    colStyles: ['label', 'index'],
    rowHeads: [
      Array.from({ length: n + 1 }, (_, i) => String(i)),
      ['', ...state.items.map((it) => String(it.w))],
      ['', ...state.items.map((it) => String(it.v))],
    ],
    rowStyles: ['index', 'label', 'label'],
    corner: [
      ['i', 'w', 'v'],
      ['', '', 'c'],
    ],
    links,
    path: extra.path,
    roles,
  });
  const out: Shape[] = shapes;
  if (tracing) {
    // As wide as the table lets the boxes be: narrow cells need not mean narrow item boxes.
    const pitch = Math.min(
      PITCH,
      Math.max(g.cellW + 10, Math.floor((g.gridRight - g.gridLeft) / Math.max(1, n))),
    );
    const x = (k: number) => g.gridLeft + (k + 0.5) * pitch;
    const box = (k: number) => {
      const it = state.items[k - 1]!;
      return `${it.w}:${it.v}`;
    };
    const opts = (label: string) => ({ w: pitch - 6, h: STRIP_H, label, labelX: g.gridLeft - 10 });
    out.push(
      ...boxRow(
        'take',
        g.belowTop,
        (extra.taken ?? []).map((k, p) => ({
          text: box(k),
          x: x(p),
          role: 'found' as MarkRole,
          from: { x: g.headX(1), y: g.cy(k) },
        })),
        opts('taken'),
      ),
    );
    if (extra.greedy)
      out.push(
        ...boxRow(
          'greedy',
          g.belowTop + STRIP_H + STRIP_GAP,
          extra.greedy.picks.map((k, p) => ({ text: box(k), x: x(p) })),
          opts('greedy'),
        ),
      );
  }
  return { shapes: out, bounds, label: label(step) };
}

function label(step: Step<KnapState, KnapExtra>): string {
  const parts = [describe(step.state)];
  const taken = step.extra?.taken;
  if (taken)
    parts.push(taken.length ? `Items taken so far: ${taken.join(', ')}.` : 'No items taken yet.');
  const g = step.extra?.greedy;
  if (g)
    parts.push(
      `Greedy by value per weight takes ${g.picks.length ? g.picks.join(', ') : 'nothing'}, worth ${g.value}.`,
    );
  return parts.join(' ');
}
