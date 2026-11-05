import type { MarkRole, Step } from '../../engine/types';
import {
  binaryRow,
  cellRow,
  columns,
  monoWidth,
  pitchFor,
  spanBox,
  FONT,
} from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import {
  coverOf,
  describe,
  levelOf,
  low,
  type FenExtra,
  type FenSettings,
  type FenState,
} from './model';

const PAD = 10;
/** Height of a box in the staircase, and the distance from one level to the next. */
const BOX_H = 36;
const LEVEL = 42;
/** Height of the T and A cells. */
const ROW_H = 40;

/**
 * Top to bottom: the implicit tree as a staircase of boxes, T[i] drawn over the values it
 * covers, A[i − (i & −i) + 1 .. i], one level per lowest set bit (odd i at the bottom); T as
 * the flat array it is in memory; A; and the indices in decimal and in binary, with the
 * lowest set bit boxed. Column i is index i in all of them.
 *
 * Hops between boxes are arrows. Up (add, build): from the right edge of T[i] to T[i + (i & −i)],
 * through the columns i + 1 .. i + (i & −i), where no other box is. Down (queries): from the
 * left edge of T[i] to T[i − (i & −i)], through the column where that box ends, where no box is
 * either.
 *
 * Every step of an operation keeps room for the caption line at the top, so the camera holds
 * still; a plain picture (no step data: the starting step, practice questions) leaves it out.
 */
export function view(step: Step<FenState, FenExtra>, _settings: FenSettings): Scene {
  const s = step.state;
  const plain = step.extra === undefined;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = s.a.length - 1;
  const top = Math.floor(Math.log2(n));
  const pitch = pitchFor(n);
  const nameX = PAD + monoWidth('T', FONT.name);
  // Index i is column i: column 0 is never drawn.
  const cols = columns(n + 1, { pitch, x0: nameX + 10 - pitch });
  const width = cols.x(n + 1) + PAD;
  const top0 = plain ? 8 : 40;
  const levelTop = (k: number) => top0 + (top - k) * LEVEL;

  const shapes: Shape[] = [];
  if (extra.caption) {
    shapes.push({
      kind: 'text',
      id: 'caption',
      x: PAD,
      y: 28,
      text: extra.caption,
      size: FONT.label,
      mono: true,
      weight: 'bold',
    });
  }

  const box = (i: number) => {
    const [lo, hi] = coverOf(i);
    const y = levelTop(levelOf(i));
    return { lo, hi, x1: cols.x(lo) + 3, x2: cols.x(hi + 1) - 3, y1: y, y2: y + BOX_H };
  };
  for (let i = 1; i <= n; i++) {
    const b = box(i);
    shapes.push(
      ...spanBox(cols, {
        id: `box-${i}`,
        lo: b.lo,
        hi: b.hi,
        top: b.y1,
        h: BOX_H,
        label: low(i) >= 4 ? `T[${i}]` : undefined,
        labelAt: 'left',
        valueSize: 22,
        value: String(s.t[i]),
        role: roles.get(`box-${i}`),
      }),
    );
  }

  for (const h of extra.hops ?? []) {
    const from = box(h.from);
    const up = h.dir === 'up';
    const to = box(up ? h.from + low(h.from) : h.from - low(h.from));
    const mid = (from.y1 + from.y2) / 2;
    // Up: land under the columns from.hi + 1 .. to.hi. Down: under the column where `to` ends.
    const x2 = up ? (cols.x(from.hi + 1) + cols.x(to.hi + 1)) / 2 : cols.cx(to.hi);
    shapes.push({
      kind: 'arrow',
      id: `hop-${h.dir}-${h.from}`,
      x1: up ? from.x2 : from.x1,
      y1: mid,
      x2,
      y2: to.y2 + 1,
      role: h.role,
      z: 3,
    });
  }

  const tTop = levelTop(0) + BOX_H + 10;
  const t = cellRow(cols, {
    id: 't',
    from: 1,
    to: n,
    top: tTop,
    h: ROW_H,
    text: (i) => String(s.t[i]),
    roles,
    index: false,
    name: 'T',
    nameX,
  });
  const a = cellRow(cols, {
    id: 'a',
    from: 1,
    to: n,
    top: tTop + ROW_H + 4,
    h: ROW_H,
    text: (i) => String(s.a[i]),
    roles,
    name: 'A',
    nameX,
  });
  const b = binaryRow(cols, { id: 'bin', from: 1, to: n, bits: top + 1, top: a.bottom - 2, roles });
  shapes.push(...t.shapes, ...a.shapes, ...b.shapes);
  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: b.bottom + 6 },
    label: describe(s),
  };
}
