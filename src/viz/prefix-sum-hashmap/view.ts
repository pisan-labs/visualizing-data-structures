/**
 * The drawing, top to bottom:
 *
 * - what is asked ("subarrays with sum k = 3"), left, clear of the zoom buttons on the right;
 * - bracket lanes over A: the subarrays a lookup finds (the pattern), the subarray being summed
 *   (every pair of ends), and the best so far (the longest);
 * - A, with its indices;
 * - the pattern: the running sum after j values on fence j (as on /range-queries/), then the
 *   map as a two-row table, keys in the order they first appeared;
 * - every pair of ends: the triangle of sums, row i holding the sums of A[i..j] for j ≥ i;
 * - the subarrays found so far, as chips.
 *
 * Each operation fixes its frame (bracket lanes, the found list's lines), so the camera holds
 * still while it runs. A plain picture (the start, a load, practice) draws A alone.
 */
import type { MarkRole } from '../../engine/types';
import {
  bracket,
  cellRow,
  chip,
  chipSize,
  columns,
  FONT,
  monoWidth,
  pitchFor,
  type Cols,
} from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import {
  chipId,
  describe,
  LIST_MAX,
  span,
  type PSExtra,
  type PSSettings,
  type PSStep,
  type Span,
} from './model';

const PAD = 10;
/** Height of a bracket lane, with and without a label above the bar. */
const LANE = { label: 34, plain: 15 };
/** Top of the lanes: under the heading. */
const LANES_TOP = 40;
const TITLE = 22;
const CHIP = FONT.label;
const CHIP_LINE = 38;
const TRI_ROW = 40;
const TRI_CELL = 36;

/** The found list's chips for the first `shown` subarrays: past LIST_MAX − 1, one "+m more". */
function chipTexts(all: readonly Span[], shown: number): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (let i = 0; i < shown; i++) {
    const id = chipId(i, all.length);
    if (id === 'f-more') {
      out.push({ id, text: `+${shown - (LIST_MAX - 1)} more` });
      break;
    }
    out.push({ id, text: span(all[i]!) });
  }
  return out;
}

interface Placed {
  id: string;
  text: string;
  x: number;
  line: number;
  w: number;
}

/** Chips placed left to right from `left`, wrapping before `right`. */
function flow(chips: { id: string; text: string }[], left: number, right: number): Placed[] {
  const out: Placed[] = [];
  let x = left;
  let line = 0;
  for (const c of chips) {
    const w = chipSize(c.text, CHIP).w;
    if (x > left && x + w > right) {
      x = left;
      line++;
    }
    out.push({ ...c, x, line, w });
    x += w + 10;
  }
  return out;
}

export function view(step: PSStep, settings: PSSettings): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';
  const count = settings.goal !== 'longest';

  // Row names sit right-aligned at nameX: "A", "sum", "key", "seen", "first", "found", "i=11".
  const nameX = PAD + monoWidth(naive ? 'found' : 'first', FONT.name);
  const pitch = naive ? pitchFor(n) : pitchFor(n + 1);
  const x0 = naive ? nameX + 12 : nameX + 12 + pitch / 2;
  const cols = columns(n, { pitch, x0 });
  const left = naive ? cols.x(0) : cols.x(-0.5);
  const right = naive ? cols.x(n) : cols.x(n + 0.5);
  const titles = !e
    ? []
    : naive
      ? ['sum of A[i..j]: row i, column j']
      : [count ? 'map seen: running sum → times seen' : 'map first: running sum → first j'];
  const heading = e
    ? count
      ? `subarrays with sum k = ${e.k}`
      : `longest subarray with sum k = ${e.k}`
    : '';
  const width = Math.max(
    right + PAD,
    PAD + monoWidth(heading, FONT.label) + PAD,
    ...titles.map((t) => PAD + monoWidth(t, TITLE) + PAD),
  );

  const shapes: Shape[] = [];
  let aTop = 16;
  const laneY: number[] = [];
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
    // Lanes from the top one down to lane 0, right above A.
    let y = LANES_TOP;
    const lanes = e.frame.lanes;
    for (let l = lanes.length - 1; l >= 0; l--) {
      laneY[l] = y + (lanes[l] ? LANE.label - 6 : LANE.plain - 6);
      y += lanes[l] ? LANE.label : LANE.plain;
    }
    aTop = y + 10;
  }

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

  if (e) {
    for (const b of e.brackets) {
      const id = `br-${b.lane}`;
      shapes.push(
        ...bracket(cols, {
          id,
          lo: b.lo,
          hi: b.hi,
          y: laneY[b.lane]!,
          ticks: 'down',
          label: e.frame.lanes[b.lane] ? b.label : undefined,
          role: roles.get(id) ?? b.role,
          clamp: { min: PAD, max: width - PAD },
        }),
      );
    }
    bottom = naive
      ? triangle(shapes, cols, e, roles, bottom)
      : running(shapes, cols, e, roles, bottom, nameX, count);
    bottom = foundRow(
      shapes,
      e,
      step.lines.includes('ret'),
      roles,
      bottom,
      nameX,
      left,
      width - PAD,
    );
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom + PAD },
    label: label(step, settings),
  };
}

function title(shapes: Shape[], id: string, text: string, y: number) {
  shapes.push({ kind: 'text', id, x: PAD, y, text, size: TITLE, cls: 'label', mono: true });
}

/** The pattern: running sums on the fences, then the map. Returns the bottom. */
function running(
  shapes: Shape[],
  cols: Cols,
  e: PSExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  nameX: number,
  count: boolean,
): number {
  const n = cols.n;
  const sums = e.sums ?? [];
  const p = cellRow(cols, {
    id: 'p',
    from: 0,
    to: n,
    shift: -0.5,
    top: top + 12,
    text: (j) => (sums[j] === null || sums[j] === undefined ? null : String(sums[j])),
    cellClass: (j) => (sums[j] === null || sums[j] === undefined ? 'cell' : 'live'),
    valuePad: 6,
    roles,
    name: 'sum',
    nameX,
  });
  shapes.push(...p.shapes);
  const titleY = p.bottom + 26;
  title(
    shapes,
    'map-title',
    count ? 'map seen: running sum → times seen' : 'map first: running sum → first j',
    titleY,
  );
  const map = e.map ?? [];
  const last = map.length - 1;
  const keys = cellRow(cols, {
    id: 'mk',
    from: 0,
    to: last,
    shift: -0.5,
    top: titleY + 12,
    text: (i) => String(map[i]!.key),
    valuePad: 6,
    index: false,
    roles,
    name: 'key',
    nameX,
  });
  const values = cellRow(cols, {
    id: 'mv',
    from: 0,
    to: last,
    shift: -0.5,
    top: keys.bottom,
    text: (i) => String(map[i]!.value),
    valuePad: 6,
    index: false,
    roles,
    name: count ? 'seen' : 'first',
    nameX,
  });
  shapes.push(...keys.shapes, ...values.shapes);
  return values.bottom;
}

/** Every pair of ends: the triangle of sums. Returns the bottom. */
function triangle(
  shapes: Shape[],
  cols: Cols,
  e: PSExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
): number {
  const n = cols.n;
  const tri = e.tri ?? [];
  const titleY = top + 22;
  title(shapes, 'tri-title', 'sum of A[i..j]: row i, column j', titleY);
  let y = titleY + 12;
  for (let i = 0; i < n; i++) {
    const row = tri[i] ?? [];
    const r = cellRow(cols, {
      id: `t-${i}`,
      from: i,
      to: n - 1,
      top: y,
      h: TRI_CELL,
      text: (j) => (row[j] === null || row[j] === undefined ? null : String(row[j])),
      cellClass: (j) => (row[j] === null || row[j] === undefined ? 'cell' : 'live'),
      baseRole: (j) => (row[j] === e.k ? 'found' : undefined),
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

/** The subarrays found so far. Returns the bottom. */
function foundRow(
  shapes: Shape[],
  e: PSExtra,
  final: boolean,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  nameX: number,
  left: number,
  right: number,
): number {
  const y0 = top + 16;
  shapes.push({
    kind: 'text',
    id: 'found-name',
    x: nameX,
    y: y0 + 20,
    text: 'found',
    size: FONT.name,
    anchor: 'end',
    cls: 'label',
    mono: true,
  });
  const frame = flow(chipTexts(e.frame.all, e.frame.all.length), left, right);
  const lines = Math.max(1, ...frame.map((c) => c.line + 1));
  if (e.found.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'f-none',
      x: left,
      y: y0 + 20,
      text: final ? 'none' : 'none yet',
      size: CHIP,
      cls: 'label',
      mono: true,
    });
  }
  const placed = new Map(frame.map((c) => [c.id, c]));
  for (const c of chipTexts(e.frame.all, e.found.length)) {
    const at = placed.get(c.id)!;
    const isBest = e.best && c.text === span(e.best);
    shapes.push(
      ...chip({
        id: c.id,
        x: at.x + at.w / 2,
        y: y0 + at.line * CHIP_LINE + 14,
        text: c.text,
        size: CHIP,
        role: roles.get(c.id) ?? (isBest ? 'found' : undefined),
      }),
    );
  }
  return y0 + lines * CHIP_LINE - 6;
}

function label(step: PSStep, settings: PSSettings): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  if (e.sums) {
    const known = e.sums.filter((v): v is number => v !== null);
    parts.push(`Running sums so far: ${known.join(', ')}.`);
  }
  if (e.map) {
    const name = settings.goal === 'longest' ? 'first' : 'seen';
    parts.push(`The map ${name} holds ${e.map.map((m) => `${m.key}: ${m.value}`).join(', ')}.`);
  }
  if (e.tri) {
    const done = e.tri.flat().filter((v) => v !== null).length;
    parts.push(`${done} subarray sums computed.`);
  }
  parts.push(
    e.found.length
      ? `Found ${e.found.length} with sum ${e.k}: ${e.found.slice(0, 6).map(span).join(', ')}${e.found.length > 6 ? ', …' : ''}.`
      : `None found with sum ${e.k} yet.`,
  );
  if (e.best) parts.push(`Best: ${span(e.best)}.`);
  return parts.join(' ');
}
