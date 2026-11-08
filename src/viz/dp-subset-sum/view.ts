import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import type { Scene, Shape } from '../../render/scene';
import { describe, tf, type SubsetExtra, type SubsetSettings, type SubsetState } from './model';

const STRIP_H = 40;
const PITCH = 56;
/** Narrower cells a narrow stage (a phone in portrait) may draw larger with. */
const NARROW = [44, 40, 36, 32];
const CELL_H_MIN = 36;

/**
 * The S table: one row per number (the number beside it), one column per sum. A cell reads the
 * cell above (leave the number out) and, if the number fits, the cell one row up and x columns
 * left (take it, +x). The walk back climbs one row per number; the numbers it takes line up
 * under the table.
 */
export function view(
  step: Step<SubsetState, SubsetExtra>,
  _settings: SubsetSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.xs.length;
  const T = state.T;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const tracing = extra.taken !== undefined;
  const frameFor = (cellW: number | undefined, strip: boolean): TableFrame => ({
    rows: n + 1,
    cols: T + 1,
    colHeads: 1,
    rowHeads: [30, 40],
    below: strip ? STRIP_H + 4 : 0,
    cellW,
    cellH: cellW && Math.max(CELL_H_MIN, Math.round(cellW * 0.8)),
  });
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
    values: state.S.map((r) => r.map((v) => (v === null ? null : tf(v)))),
    colHeads: [Array.from({ length: T + 1 }, (_, t) => String(t))],
    colStyles: ['index'],
    rowHeads: [Array.from({ length: n + 1 }, (_, i) => String(i)), ['', ...state.xs.map(String)]],
    rowStyles: ['index', 'label'],
    corner: [['i', 'x']],
    links,
    path: extra.path,
    roles: new Map(
      [...roles].concat(
        // True cells read as reachable: draw them in the "done" color unless marked.
        state.S.flatMap((r, i) =>
          r.flatMap((v, t) =>
            v && !roles.has(`cell-${i}-${t}`) ? [[`val-${i}-${t}`, 'done' as MarkRole]] : [],
          ),
        ) as [string, MarkRole][],
      ),
    ),
  });
  const out: Shape[] = shapes;
  if (tracing) {
    const pitch = Math.min(
      PITCH,
      Math.max(g.cellW + 6, Math.floor((g.gridRight - g.gridLeft) / Math.max(1, n))),
    );
    const x = (k: number) => g.gridLeft + (k + 0.5) * pitch;
    out.push(
      ...boxRow(
        'take',
        g.belowTop,
        (extra.taken ?? []).map((i, p) => ({
          text: String(state.xs[i - 1]),
          x: x(p),
          role: 'found' as MarkRole,
          from: { x: g.headX(1), y: g.cy(i) },
        })),
        { w: pitch - 6, h: STRIP_H, label: 'taken', labelX: g.gridLeft - 10 },
      ),
    );
  }
  return { shapes: out, bounds, label: label(step) };
}

function label(step: Step<SubsetState, SubsetExtra>): string {
  const parts = [describe(step.state)];
  const taken = step.extra?.taken;
  if (taken)
    parts.push(
      taken.length
        ? `Numbers taken so far: ${taken.map((i) => step.state.xs[i - 1]).join(', ')}.`
        : 'No numbers taken yet.',
    );
  return parts.join(' ');
}
