import type { MarkRole, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type RowBox,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import { describe, type EditExtra, type EditSettings, type EditState } from './model';

const BOX_H = 34;
const GAP = 6;
const ALIGN_H = 3 * BOX_H + 2 * GAP;

const OP_NAME = { M: 'match', S: 'substitute', D: 'delete', I: 'insert' } as const;

/**
 * The D table with the source word down the side and the target across the top. While
 * filling, a cell reads three neighbors (substitute or match, delete, insert); the walk back
 * is a path of arrows to D[0][0], and the alignment builds under the table from the right:
 * the source characters, the edit, and the target characters, with gaps for inserts and
 * deletes.
 */
export function view(step: Step<EditState, EditExtra>, _settings: EditSettings): Scene {
  const { state, extra = {} } = step;
  const m = state.a.length;
  const n = state.b.length;
  const roles = new Map<string, MarkRole>(step.marks.map((mk) => [mk.id, mk.role]));
  const frame: TableFrame = {
    rows: m + 1,
    cols: n + 1,
    colHeads: 2,
    rowHeads: [30, 36],
    // The alignment only exists while tracing back, a separate operation; filling gets the room.
    below: extra.width ? ALIGN_H + 4 : 0,
  };
  const g = tableGeometry(frame);
  const links: TableLink[] = (extra.reads ?? []).map((r) => ({
    id: r.op === 'M' || r.op === 'S' ? 'diag' : r.op === 'D' ? 'up' : 'left',
    from: r.from,
    to: r.to,
    role: r.win ? 'active' : undefined,
  }));
  const { shapes, bounds } = tableScene(frame, {
    values: state.d.map((r) => r.map((v) => (v === null ? null : String(v)))),
    colHeads: [Array.from({ length: n + 1 }, (_, j) => String(j)), ['', ...state.b]],
    rowHeads: [Array.from({ length: m + 1 }, (_, i) => String(i)), ['', ...state.a]],
    corner: [
      ['', 'j'],
      ['i', ''],
    ],
    links,
    path: extra.path,
    roles,
  });
  const out: Shape[] = shapes;
  const width = extra.width ?? 0;
  if (width) {
    const pitch = Math.min(46, Math.floor((g.width - 130) / width));
    const mid = (g.gridLeft + g.gridRight) / 2;
    const x = (k: number) => mid + (k - (width - 1) / 2) * pitch;
    const top: (RowBox | null)[] = Array(width).fill(null);
    const ops: (RowBox | null)[] = Array(width).fill(null);
    const bottom: (RowBox | null)[] = Array(width).fill(null);
    for (const { col, k } of extra.columns ?? []) {
      const at = x(k);
      top[k] = col.from
        ? { text: col.from, x: at, from: { x: g.headX(1), y: g.cy(col.i) } }
        : { text: '–', x: at, bare: true };
      bottom[k] = col.to
        ? { text: col.to, x: at, from: { x: g.cx(col.j), y: g.headY(1) - 8 } }
        : { text: '–', x: at, bare: true };
      ops[k] = { text: col.op, x: at, bare: true, role: col.op === 'M' ? undefined : 'active' };
    }
    const opts = (label: string) => ({
      w: pitch - 6,
      h: BOX_H,
      label,
      labelX: x(0) - pitch / 2 - 8,
      size: Math.min(22, pitch - 14),
    });
    const y = g.belowTop;
    out.push(...boxRow('al-a', y, top, opts('from')));
    out.push(...boxRow('al-op', y + BOX_H + GAP, ops, opts('edit')));
    out.push(...boxRow('al-b', y + 2 * (BOX_H + GAP), bottom, opts('to')));
  }
  return { shapes: out, bounds, label: label(step) };
}

function label(step: Step<EditState, EditExtra>): string {
  const parts = [describe(step.state)];
  const cols = [...(step.extra?.columns ?? [])].sort((p, q) => p.k - q.k);
  if (cols.length)
    parts.push(
      `Alignment so far: ${cols
        .map(({ col }) =>
          col.op === 'I'
            ? `insert ${col.to}`
            : col.op === 'D'
              ? `delete ${col.from}`
              : `${col.from} to ${col.to} (${OP_NAME[col.op]})`,
        )
        .join(', ')}.`,
    );
  return parts.join(' ');
}
