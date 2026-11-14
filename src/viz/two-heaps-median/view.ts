/**
 * The drawing, top to bottom:
 *
 * - the stream so far, in the order the values came, with the newest marked, and under each
 *   value the median right after it;
 * - two heaps: the low half (a max-heap) on the left and the high half (a min-heap) on the right,
 *   their sizes in their titles; or, the naive way, the sorted list S with its middle marked.
 *
 * The stream row draws copies (ids by position, `in-<i>`), so a value's own shape lives in a heap
 * or in S. Both heaps reserve room for 7 values, as many as either holds in a stream of 12, so
 * the heaps never move. Without step data (the start, practice pictures) both structures are
 * rebuilt from the stream.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { monoWidth } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { drawRow, FONT, heading, heapPanel, PITCH, union, valueRoles } from '../_heaps2/draw';
import { fullSize } from '../_heaps2/heap';
import { approachOf } from '../_patterns/kit';
import {
  describe,
  MAX_STREAM,
  replay,
  type MedianExtra,
  type MedianSettings,
  type MedianState,
} from './model';

const PAD = 14;
const X0 = PAD + 74;
const HEAD_Y = 26;
const CELL = 40;
const HEAP_CAP = fullSize(Math.ceil(MAX_STREAM / 2));
const HEAP_GAP = 48;
/** Values to a line of the stream on a tall stage. */
const TALL_ROW = 6;

type MedianStep = Step<MedianState, MedianExtra>;

/** Height of one line of the stream: values, then medians. */
const LINE = CELL + 52;

/** The stream and the median after each value, as rows of copies, `perRow` to a line. */
function streamRows(
  keys: readonly number[],
  medians: readonly (number | null)[],
  cur: number,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  slots: number,
  perRow: number,
): { shapes: Shape[]; bottom: number; right: number } {
  const shapes: Shape[] = [];
  const name = (id: string, text: string, y: number) =>
    shapes.push({
      kind: 'text',
      id,
      x: X0 - 10,
      y,
      text,
      size: FONT.name,
      anchor: 'end',
      cls: 'label',
      mono: true,
      role: roles.get(id),
    });
  const lines = Math.max(1, Math.ceil(slots / perRow));
  for (let l = 0; l < lines; l++) {
    const y = top + l * LINE;
    name(l ? `in-name-${l}` : 'in-name', 'in', y + CELL / 2 + 7);
    name(l ? `med-name-${l}` : 'med-name', 'median', y + CELL + 30);
  }
  for (let i = 0; i < slots; i++) {
    const x = X0 + (i % perRow) * PITCH;
    const y = top + Math.floor(i / perRow) * LINE;
    const role: MarkRole | undefined = i === cur ? 'active' : undefined;
    shapes.push({
      kind: 'rect',
      id: `in-${i}`,
      x,
      y,
      w: PITCH,
      h: CELL,
      r: 0,
      role,
      cls: i < keys.length ? 'live' : undefined,
    });
    if (i < keys.length)
      shapes.push({
        kind: 'text',
        id: `in-${i}-t`,
        x: x + PITCH / 2,
        y: y + CELL / 2 + 7,
        text: String(keys[i]),
        size: FONT.value - 2,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role,
      });
    const m = medians[i];
    if (m !== null && m !== undefined) {
      const text = String(m);
      shapes.push({
        kind: 'text',
        id: `med-${i}`,
        x: x + PITCH / 2,
        y: y + CELL + 30,
        text,
        size: text.length > 3 ? 15 : 18,
        anchor: 'middle',
        mono: true,
        role: i === cur ? 'found' : undefined,
      });
    }
  }
  return {
    shapes,
    bottom: top + (lines - 1) * LINE + CELL + 40,
    right: X0 + Math.min(slots, perRow) * PITCH,
  };
}

export function view(step: MedianStep, settings: MedianSettings, stage?: StageSize): Scene {
  const wide = draw(step, settings, false);
  if (!stage) return wide;
  return pickLayout(stage, [wide, draw(step, settings, true)]);
}

/** Wide: the stream on one line and the heaps side by side. Tall: lines of 6, heaps stacked. */
function draw(step: MedianStep, settings: MedianSettings, tall: boolean): Scene {
  const s = step.state;
  const roles = valueRoles(step.marks);
  const n = s.stream.length;
  const keys = s.stream.map((x) => x.key);
  const even = settings.even === 'lower' ? 'lower' : 'mean';
  const e: MedianExtra =
    step.extra ??
    (() => {
      const r = replay(s.stream, even);
      return { low: r.low, high: r.high, sorted: r.sorted, cur: -1, medians: r.medians };
    })();
  const naive = approachOf(settings) === 'naive';
  const perRow = tall ? TALL_ROW : MAX_STREAM;
  const shapes: Shape[] = [];
  const medianNow = e.medians[n - 1];
  const text =
    n === 0
      ? 'running median: no values yet'
      : medianNow === null || medianNow === undefined
        ? `running median: adding ${keys[n - 1]}`
        : `running median of ${n}: ${medianNow}`;
  shapes.push(heading('heading', text, PAD, HEAD_Y));
  const headW = PAD + monoWidth(text, FONT.label) + PAD;
  const slots = Math.max(n, 1);
  const rows = streamRows(keys, e.medians, e.cur, roles, HEAD_Y + 18, slots, perRow);
  shapes.push(...rows.shapes);
  let bottom = rows.bottom;
  let right = rows.right;

  if (naive) {
    // S, perRow slots to a line: s-<i> on the first, s1-<i> on the next.
    let top = bottom + 22;
    for (let from = 0, l = 0; from < slots; from += perRow, l++) {
      const to = Math.min(slots, from + perRow);
      const row = drawRow({
        id: l ? `s${l}` : 's',
        items: e.sorted.slice(from, to),
        slots: to - from,
        x0: X0,
        top,
        roles,
        name: l ? undefined : 'S',
        index: (i) => String(from + i),
      });
      shapes.push(...row.shapes);
      bottom = row.bottom;
      right = Math.max(right, row.right);
      top = row.bottom + 8;
    }
  } else {
    // Room for the wider of the tree and its longest title.
    const probe = heapPanel({
      prefix: 'lo',
      items: [],
      capacity: HEAP_CAP,
      cx: 0,
      top: 0,
      roles,
      title: 'high half: min-heap (12)',
    });
    const half = probe.bounds.w / 2;
    const top = bottom + 12;
    const low = heapPanel({
      prefix: 'lo',
      items: e.low,
      capacity: HEAP_CAP,
      cx: PAD + half,
      top,
      roles,
      title: `low half: max-heap (${e.low.length})`,
    });
    const high = heapPanel({
      prefix: 'hi',
      items: e.high,
      capacity: HEAP_CAP,
      cx: tall ? PAD + half : PAD + 3 * half + HEAP_GAP,
      top: tall ? low.bounds.y + low.bounds.h + 10 : top,
      roles,
      title: `high half: min-heap (${e.high.length})`,
    });
    shapes.push(...low.shapes, ...high.shapes);
    const b = union(low.bounds, high.bounds);
    bottom = b.y + b.h;
    right = Math.max(right, b.x + b.w);
  }
  return {
    shapes,
    bounds: { x: 0, y: 0, w: Math.max(right + PAD, headW), h: bottom + PAD },
    label: labelOf(step, e),
  };
}

function labelOf(step: MedianStep, e: MedianExtra): string {
  const parts = [describe(step.state)];
  if (e.low.length || e.high.length)
    parts.push(
      `Low half (max-heap): ${e.low.map((x) => x.key).join(', ') || 'empty'}. High half (min-heap): ${e.high.map((x) => x.key).join(', ') || 'empty'}.`,
    );
  if (e.sorted.length) parts.push(`Sorted list: ${e.sorted.map((x) => x.key).join(', ')}.`);
  const m = e.medians[step.state.stream.length - 1];
  if (m !== null && m !== undefined) parts.push(`Median: ${m}.`);
  return parts.join(' ');
}
