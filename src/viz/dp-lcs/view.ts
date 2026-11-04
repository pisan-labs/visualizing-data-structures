import type { MarkRole, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type Cell,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { describe, type LcsExtra, type LcsSettings, type LcsState } from './model';

const STRIP_H = 42;

/** Which neighbor a read comes from, so each arrow keeps its id as the fill moves along. */
function direction(from: Cell, to: Cell): string {
  if (from[0] < to[0] && from[1] < to[1]) return 'diag';
  return from[0] < to[0] ? 'up' : 'left';
}

/**
 * The c table with X down the side and Y across the top, indices outside the characters. The
 * cell being filled reads its neighbors (arrows beside the values); the traceback is a path of
 * arrows back from the bottom-right corner, and the LCS collects under the table.
 */
export function view(step: Step<LcsState, LcsExtra>, _settings: LcsSettings): Scene {
  const { state, extra = {} } = step;
  const m = state.x.length;
  const n = state.y.length;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const frame: TableFrame = {
    rows: m + 1,
    cols: n + 1,
    colHeads: 2,
    rowHeads: [30, 36],
    // The LCS strip only exists while tracing back, a separate operation; filling gets the room.
    below: extra.length ? STRIP_H + 4 : 0,
  };
  const g = tableGeometry(frame);
  const links: TableLink[] = (extra.reads ?? []).map((r) => ({
    id: direction(r.from, r.to),
    from: r.from,
    to: r.to,
    role: r.win ? 'active' : undefined,
  }));
  const { shapes, bounds } = tableScene(frame, {
    values: state.c.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [Array.from({ length: n + 1 }, (_, j) => String(j)), ['', ...state.y]],
    rowHeads: [Array.from({ length: m + 1 }, (_, i) => String(i)), ['', ...state.x]],
    corner: [
      ['', 'j'],
      ['i', ''],
    ],
    links,
    path: extra.path,
    roles,
  });
  const out: Shape[] = shapes;
  if (extra.length) {
    const L = extra.length;
    const pitch = Math.min(g.cellW, 50);
    const mid = (g.gridLeft + g.gridRight) / 2;
    const x = (k: number) => mid + (k - (L - 1) / 2) * pitch;
    const boxes = Array.from(
      { length: L },
      () =>
        null as null | { text: string; x: number; role: MarkRole; from: { x: number; y: number } },
    );
    for (const f of extra.found ?? [])
      boxes[f.k] = { text: f.ch, x: x(f.k), role: 'found', from: { x: g.headX(1), y: g.cy(f.i) } };
    out.push(
      ...boxRow('lcs', g.belowTop, boxes, {
        w: pitch - 6,
        h: STRIP_H,
        label: 'LCS',
        labelX: x(0) - pitch / 2 - 8,
      }),
    );
  }
  return { shapes: out, bounds, label: label(step) };
}

function label(step: Step<LcsState, LcsExtra>): string {
  const found = [...(step.extra?.found ?? [])].sort((a, b) => a.k - b.k).map((f) => f.ch);
  const parts = [describe(step.state)];
  if (step.extra?.length !== undefined)
    parts.push(found.length ? `LCS found so far: ${found.join(' ')}.` : 'No LCS characters yet.');
  return parts.join(' ');
}
