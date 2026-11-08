import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type Cell,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { placeStrip } from '../../layouts/table-strip';
import type { Scene, Shape } from '../../render/scene';
import { describe, type PalExtra, type PalSettings, type PalState } from './model';

const STRIP_H = 42;
const LABEL_W = 44;

function direction(from: Cell, to: Cell): string {
  if (from[0] > to[0] && from[1] < to[1]) return 'diag';
  return from[0] > to[0] ? 'down' : 'left';
}

/**
 * The upper triangle of L: row i and column j stand for the piece s[i..j], with the string
 * down the side and across the top. Diagonals fill from the main one outwards; a cell reads the
 * cell below (drop the left end), to the left (drop the right end) or down-left (both ends
 * match, +2). The walk back starts in the top-right corner, and the palindrome fills in from
 * both ends under the table (right of it on a wide, short stage).
 */
export function view(
  step: Step<PalState, PalExtra>,
  _settings: PalSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.s.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const length = extra.length ?? 0;
  const full: TableFrame = {
    rows: n,
    cols: n,
    colHeads: 2,
    rowHeads: [30, 36],
    below: length ? STRIP_H + 4 : 0,
  };
  const pitch = Math.min(tableGeometry(full).cellW, 50);
  const place = placeStrip(full, length * pitch, LABEL_W, stage);
  const { frame, g } = place;
  const links: TableLink[] = (extra.reads ?? []).map((r) => ({
    id: direction(r.from, r.to),
    from: r.from,
    to: r.to,
    role: r.win ? 'active' : undefined,
    label: r.label,
  }));
  const chars = [...state.s];
  const { shapes, bounds } = tableScene(frame, {
    values: state.L.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [chars.map((_, j) => String(j + 1)), chars],
    rowHeads: [chars.map((_, i) => String(i + 1)), chars],
    corner: [
      ['', 'j'],
      ['i', ''],
    ],
    links,
    path: extra.path,
    roles,
  });
  // The lower triangle is never used: draw it faint.
  for (const sh of shapes) {
    const m = /^cell-(\d+)-(\d+)$/.exec(sh.id);
    if (m && Number(m[2]) < Number(m[1])) sh.opacity = 0.35;
  }
  const out: Shape[] = shapes;
  if (length) {
    const x = (k: number) => place.left + (k + 0.5) * pitch;
    const boxes: (null | {
      text: string;
      x: number;
      role: MarkRole;
      from: { x: number; y: number };
    })[] = Array.from({ length }, () => null);
    for (const f of extra.found ?? [])
      boxes[f.k] = { text: f.ch, x: x(f.k), role: 'found', from: { x: g.headX(1), y: g.cy(f.i) } };
    out.push(
      ...boxRow('pal', place.top, boxes, {
        w: pitch - 6,
        h: STRIP_H,
        label: 'LPS',
        labelX: x(0) - pitch / 2 - 8,
      }),
    );
  }
  return { shapes: out, bounds: place.beside ? place.bounds : bounds, label: label(step) };
}

function label(step: Step<PalState, PalExtra>): string {
  const parts = [describe(step.state)];
  const { length, found } = step.extra ?? {};
  if (length !== undefined) {
    const slots = Array.from({ length }, () => '_');
    for (const f of found ?? []) slots[f.k] = f.ch;
    parts.push(`Palindrome so far: ${slots.join(' ')}.`);
  }
  return parts.join(' ');
}
