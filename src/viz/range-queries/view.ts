import type { MarkRole, Step } from '../../engine/types';
import {
  bracket,
  cellRow,
  columns,
  monoWidth,
  pitchFor,
  spanArrow,
  FONT,
  type Cols,
} from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { describe, levels, type RQExtra, type RQSettings, type RQState } from './model';

const PAD = 10;
/** Distance between two bracket lanes, and from the last one down to A. */
const LANE = 38;

const roleMap = (step: Step<RQState, RQExtra>) =>
  new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));

/** The bracket that says what an operation is about, above A, when the step has one. */
function rangeShapes(cols: Cols, extra: RQExtra, y: number, width: number): Shape[] {
  const r = extra.range;
  if (!r) return [];
  return bracket(cols, {
    id: 'range',
    lo: r.lo,
    hi: r.hi,
    y,
    ticks: 'down',
    label: r.label,
    role: r.role ?? 'visit',
    clamp: { min: 4, max: width - 4 },
  });
}

/**
 * Prefix sums: A on top, P under it with P[k] centered on fence k (where A[0..k) ends), and
 * between them up to two arrows from fence 0, one per P entry a step uses.
 *
 * Every step of an operation keeps room for the range bracket and the arrows, so the camera
 * holds still. A plain picture (no step data: the starting step, practice questions) leaves
 * that room out.
 */
function prefixView(step: Step<RQState, RQExtra>): Scene {
  const { state: s } = step;
  const plain = step.extra === undefined;
  const extra = step.extra ?? {};
  const roles = roleMap(step);
  const n = s.a.length;
  const pitch = pitchFor(n + 1);
  const nameX = PAD + monoWidth('P', FONT.name);
  const cols = columns(n, { pitch, x0: nameX + 10 + pitch / 2 });
  const width = cols.x(n) + pitch / 2 + PAD;

  // The stage's zoom buttons sit over the top right corner of a wide drawing.
  const rangeY = 68;
  const aTop = plain ? 50 : rangeY + 14;
  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top: aTop,
    text: (i) => String(s.a[i]),
    roles,
    name: 'A',
    nameX,
  });
  const spanY = [a.bottom + 30, a.bottom + 30 + 2 + LANE];
  const pTop = plain ? a.bottom + 14 : spanY[1]! + 18;
  const p = cellRow(cols, {
    id: 'p',
    from: 0,
    to: n,
    shift: -0.5,
    top: pTop,
    text: (k) => (s.p[k] === null || s.p[k] === undefined ? null : String(s.p[k])),
    cellClass: (k) => (s.p[k] === null ? 'cell' : 'live'),
    // Sums reach three digits: let them use more of the cell, so they stay large on a phone.
    valuePad: 6,
    roles,
    name: 'P',
    nameX,
  });
  const shapes: Shape[] = [...rangeShapes(cols, extra, rangeY, width), ...a.shapes, ...p.shapes];
  (extra.spans ?? []).forEach((sp, lane) => {
    shapes.push(
      ...spanArrow(cols, {
        id: `span${lane}`,
        from: 0,
        to: sp.to,
        y: spanY[lane]!,
        label: sp.label,
        role: sp.role,
      }),
    );
  });
  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: p.bottom + 6 },
    label: describe(s, { structure: 'prefix' }),
  };
}

/**
 * Sparse table: brackets for the windows a step uses, A (row k = 0), and rows k = 1 up to
 * ⌊log₂ n⌋ under it, with M[k][i] in the column where its window starts. The drawing is
 * taller than it is wide, so it never reaches the stage's top right corner and needs no room
 * for the zoom buttons. A plain picture leaves out the bracket lanes, as above.
 */
function sparseView(step: Step<RQState, RQExtra>): Scene {
  const { state: s } = step;
  const plain = step.extra === undefined;
  const extra = step.extra ?? {};
  const roles = roleMap(step);
  const n = s.a.length;
  const K = levels(n);
  const pitch = pitchFor(n);
  const nameX = PAD + monoWidth(`k=${Math.max(1, K)}`, FONT.name);
  const cols = columns(n, { pitch, x0: nameX + 10 });
  const width = cols.x(n) + PAD;
  const laneY = [34, 34 + LANE, 34 + 2 * LANE];
  const aTop = plain ? 12 : laneY[2]! + 14;

  const shapes: Shape[] = rangeShapes(cols, extra, laneY[0]!, width);
  (extra.windows ?? []).forEach((w, k) => {
    shapes.push(
      ...bracket(cols, {
        id: `win${k}`,
        lo: w.lo,
        hi: w.hi,
        y: laneY[w.lane + 1]!,
        ticks: 'down',
        label: w.label,
        role: w.role,
        clamp: { min: 4, max: width - 4 },
      }),
    );
  });
  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top: aTop,
    text: (i) => String(s.a[i]),
    roles,
    name: 'A',
    nameX,
  });
  shapes.push(...a.shapes);
  let bottom = a.bottom;
  for (let k = 1; k <= K; k++) {
    const row = s.m[k] ?? [];
    const r = cellRow(cols, {
      id: `m${k}`,
      from: 0,
      to: n - 2 ** k,
      top: bottom + 4,
      h: 40,
      text: (i) => (row[i] === null || row[i] === undefined ? null : String(row[i])),
      cellClass: (i) => (row[i] === null ? 'cell' : 'live'),
      roles,
      index: false,
      name: `k=${k}`,
      nameX,
    });
    shapes.push(...r.shapes);
    bottom = r.bottom;
  }
  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom + 8 },
    label: describe(s, { structure: 'sparse' }),
  };
}

export function view(step: Step<RQState, RQExtra>, settings: RQSettings): Scene {
  return settings.structure === 'sparse' ? sparseView(step) : prefixView(step);
}
