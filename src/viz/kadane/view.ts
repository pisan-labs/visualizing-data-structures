/**
 * The drawing, top to bottom:
 *
 * - what is asked ("maximum subarray"), left, clear of the zoom buttons on the right;
 * - two bracket lanes over A: the best so far (top) and the run or pair being looked at;
 * - A, with its indices;
 * - the pattern: run[j] under each A[j], the best sum of a subarray ending there, with a cut on
 *   the fence where each run restarts, so the runs read as stretches between cuts;
 * - every pair of ends: the triangle of sums, row i holding the sums of A[i..j] for j ≥ i. Each
 *   column's largest entry is the pattern's run[j].
 *
 * The frame is fixed for the whole operation, so the camera holds still while it runs. A plain
 * picture (the start, a load, practice) draws A alone.
 */
import type { MarkRole } from '../../engine/types';
import { bracket, cellRow, columns, FONT, monoWidth, pitchFor, type Cols } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { describe, fmt, span, type KExtra, type KSettings, type KStep } from './model';

const PAD = 10;
/** Height of a bracket lane with a label above the bar. */
const LANE = 34;
const LANES_TOP = 40;
const TITLE = 22;
const TRI_ROW = 40;
const TRI_CELL = 36;

export function view(step: KStep, settings: KSettings): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';

  const nameX = PAD + monoWidth(naive ? 'i=11' : 'run', FONT.name);
  const cols = columns(n, { pitch: pitchFor(n), x0: nameX + 12 });
  const heading = e ? (settings.empty ? 'maximum subarray, empty allowed' : 'maximum subarray') : '';
  const title = e && naive ? 'sum of A[i..j]: row i, column j' : '';
  const width = Math.max(
    cols.x(n) + PAD,
    PAD + monoWidth(heading, FONT.label) + PAD,
    PAD + monoWidth(title, TITLE) + PAD,
  );
  const clamp = { min: PAD, max: width - PAD };

  const shapes: Shape[] = [];
  let aTop = 16;
  if (e) {
    shapes.push({
      kind: 'text',
      id: 'heading',
      x: PAD,
      y: 26,
      text: heading,
      size: FONT.label,
      weight: 'bold',
      mono: true,
    });
    const bestY = LANES_TOP + LANE - 6;
    const curY = LANES_TOP + 2 * LANE - 6;
    aTop = LANES_TOP + 2 * LANE + 10;
    const b = e.best;
    if (b && b.hi >= b.lo) {
      shapes.push(
        ...bracket(cols, {
          id: 'br-best',
          lo: b.lo,
          hi: b.hi,
          y: bestY,
          ticks: 'down',
          label: `best = ${fmt(b.sum)}`,
          role: roles.get('br-best') ?? 'found',
          clamp,
        }),
      );
    } else if (b) {
      shapes.push({
        kind: 'text',
        id: 'best-empty',
        x: PAD,
        y: bestY - 8,
        text: 'best = 0, empty',
        size: FONT.label,
        weight: 'bold',
        mono: true,
        role: 'found',
      });
    }
    if (e.cur) {
      shapes.push(
        ...bracket(cols, {
          id: 'br-cur',
          lo: e.cur.lo,
          hi: e.cur.hi,
          y: curY,
          ticks: 'down',
          label: `${naive ? 'sum' : 'run'} = ${fmt(e.cur.sum)}`,
          role: roles.get('br-cur') ?? (naive ? 'visit' : 'active'),
          clamp,
        }),
      );
    }
  }

  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top: aTop,
    text: (i) => fmt(s.a[i]!),
    roles,
    name: 'A',
    nameX,
  });
  shapes.push(...a.shapes);
  let bottom = a.bottom;

  if (e) {
    bottom = naive
      ? triangle(shapes, cols, e, roles, bottom)
      : running(shapes, cols, e, roles, aTop, bottom, nameX);
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom + PAD },
    label: label(step, settings),
  };
}

/** The pattern: run[j] under A[j], and a cut where each run restarts. Returns the bottom. */
function running(
  shapes: Shape[],
  cols: Cols,
  e: KExtra,
  roles: ReadonlyMap<string, MarkRole>,
  aTop: number,
  top: number,
  nameX: number,
): number {
  const run = e.run ?? [];
  const r = cellRow(cols, {
    id: 'r',
    from: 0,
    to: cols.n - 1,
    top: top + 4,
    text: (j) => (run[j] === null || run[j] === undefined ? null : fmt(run[j]!)),
    cellClass: (j) => (run[j] === null || run[j] === undefined ? 'cell' : 'live'),
    baseRole: (j) => (e.best && e.best.hi === j && run[j] === e.best.sum ? 'found' : undefined),
    index: false,
    roles,
    name: 'run',
    nameX,
  });
  shapes.push(...r.shapes);
  for (const st of e.starts ?? []) {
    if (st === 0) continue;
    const id = `cut-${st}`;
    shapes.push({
      kind: 'rect',
      id,
      x: cols.x(st) - 3,
      y: aTop - 6,
      w: 6,
      h: r.bottom - aTop + 12,
      r: 2,
      cls: 'live',
      role: roles.get(id) ?? 'remove',
    });
  }
  return r.bottom;
}

/** Every pair of ends: the triangle of sums. Returns the bottom. */
function triangle(
  shapes: Shape[],
  cols: Cols,
  e: KExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
): number {
  const n = cols.n;
  const tri = e.tri ?? [];
  const titleY = top + 22;
  shapes.push({
    kind: 'text',
    id: 'tri-title',
    x: PAD,
    y: titleY,
    text: 'sum of A[i..j]: row i, column j',
    size: TITLE,
    cls: 'label',
    mono: true,
  });
  const b = e.best;
  let y = titleY + 12;
  for (let i = 0; i < n; i++) {
    const row = tri[i] ?? [];
    const r = cellRow(cols, {
      id: `t-${i}`,
      from: i,
      to: n - 1,
      top: y,
      h: TRI_CELL,
      text: (j) => (row[j] === null || row[j] === undefined ? null : fmt(row[j]!)),
      cellClass: (j) => (row[j] === null || row[j] === undefined ? 'cell' : 'live'),
      baseRole: (j) => (b && b.lo === i && b.hi === j ? 'found' : undefined),
      valueSize: 22,
      index: false,
      roles,
      name: `i=${i}`,
      nameX: cols.x(i) - 8,
    });
    shapes.push(...r.shapes);
    y += TRI_ROW;
  }
  return y - (TRI_ROW - TRI_CELL);
}

function label(step: KStep, settings: KSettings): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  if (e.run) {
    const known = e.run.filter((v): v is number => v !== null);
    if (known.length) parts.push(`Best sums ending at each value so far: ${known.map(fmt).join(', ')}.`);
    const restarts = (e.starts ?? []).filter((x) => x > 0);
    if (restarts.length) parts.push(`Runs restarted at ${restarts.map((x) => `A[${x}]`).join(', ')}.`);
  }
  if (e.tri) {
    const done = e.tri.flat().filter((v) => v !== null).length;
    parts.push(`${done} subarray sums computed.`);
  }
  if (e.cur) parts.push(`Looking at ${span(e.cur)}, sum ${fmt(e.cur.sum)}.`);
  if (e.best)
    parts.push(
      e.best.hi < e.best.lo
        ? 'Best so far: the empty subarray, sum 0.'
        : `Best so far: ${span(e.best)}, sum ${fmt(e.best.sum)}.`,
    );
  else parts.push(settings.empty ? '' : 'No best yet.');
  return parts.filter(Boolean).join(' ');
}
