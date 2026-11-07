import type { MarkRole, StageSize, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type Cell,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { placeStrip } from '../_dp/strip';
import { describe, type LcsExtra, type LcsSettings, type LcsState } from './model';

const STRIP_H = 42;
/** Room for the strip's label (LCS) left of its boxes. */
const LABEL_W = 44;

/** Which neighbor a read comes from, so each arrow keeps its id as the fill moves along. */
function direction(from: Cell, to: Cell): string {
  if (from[0] < to[0] && from[1] < to[1]) return 'diag';
  return from[0] < to[0] ? 'up' : 'left';
}

/**
 * The c table with X down the side and Y across the top, indices outside the characters. The
 * cell being filled reads its neighbors (arrows beside the values); the traceback is a path of
 * arrows back from the bottom-right corner, and the LCS collects under the table (right of it
 * on a wide, short stage, when that draws larger).
 */
export function view(
  step: Step<LcsState, LcsExtra>,
  _settings: LcsSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const m = state.x.length;
  const n = state.y.length;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const L = extra.length ?? 0;
  const full: TableFrame = {
    rows: m + 1,
    cols: n + 1,
    colHeads: 2,
    rowHeads: [30, 36],
    // The LCS strip only exists while tracing back, a separate operation; filling gets the room.
    below: L ? STRIP_H + 4 : 0,
  };
  const pitch = Math.min(tableGeometry(full).cellW, 50);
  const place = placeStrip(full, L * pitch, LABEL_W, stage);
  const { frame, g } = place;
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
  if (L) {
    const x = (k: number) => place.left + (k + 0.5) * pitch;
    const boxes = Array.from(
      { length: L },
      () =>
        null as null | { text: string; x: number; role: MarkRole; from: { x: number; y: number } },
    );
    for (const f of extra.found ?? [])
      boxes[f.k] = { text: f.ch, x: x(f.k), role: 'found', from: { x: g.headX(1), y: g.cy(f.i) } };
    out.push(
      ...boxRow('lcs', place.top, boxes, {
        w: pitch - 6,
        h: STRIP_H,
        label: 'LCS',
        labelX: x(0) - pitch / 2 - 8,
      }),
    );
  }
  return { shapes: out, bounds: place.beside ? place.bounds : bounds, label: label(step) };
}

function label(step: Step<LcsState, LcsExtra>): string {
  const found = [...(step.extra?.found ?? [])].sort((a, b) => a.k - b.k).map((f) => f.ch);
  const parts = [describe(step.state)];
  if (step.extra?.length !== undefined)
    parts.push(found.length ? `LCS found so far: ${found.join(' ')}.` : 'No LCS characters yet.');
  return parts.join(' ');
}
