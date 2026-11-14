/**
 * The drawing, top to bottom:
 *
 * - what is asked ("range additions: difference array"), while a batch runs;
 * - the updates, as chips ("A[1..6] += 2"): queued ones in a plain picture, the batch while it
 *   runs, with the finished ones marked done;
 * - a bracket lane over A: the update being applied;
 * - A, with its indices;
 * - the pattern: D, n + 1 cells (the last, D[n], is the spare past the end, drawn empty), then
 *   run, the running sum of D, filled by the final pass.
 *
 * Both approaches use the same column pitch, so compare mode lines A up on both sides. Each
 * batch fixes its frame, so the camera holds still while it runs.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import {
  bracket,
  cellRow,
  chip,
  chipSize,
  columns,
  FONT,
  monoWidth,
  pitchFor,
} from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { describe, fmt, updateText, type DSettings, type DStep, type Update } from './model';

const PAD = 10;
const LANE = 34;
const CHIP = FONT.chip;
const CHIP_LINE = 38;

interface Placed {
  x: number;
  line: number;
  w: number;
}

/** Chips placed left to right from `left`, wrapping before `right`. */
function flow(texts: string[], left: number, right: number): Placed[] {
  const out: Placed[] = [];
  let x = left;
  let line = 0;
  for (const t of texts) {
    const w = chipSize(t, CHIP).w;
    if (x > left && x + w > right) {
      x = left;
      line++;
    }
    out.push({ x, line, w });
    x += w + 10;
  }
  return out;
}

export function view(step: DStep, settings: DSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';

  const nameX = PAD + monoWidth('run', FONT.name);
  // A phone's stage is narrow: the narrowest pitch keeps the text large enough there.
  const narrow = stage !== undefined && stage.w < 600;
  const cols = columns(n, { pitch: narrow ? 44 : pitchFor(n + 1), x0: nameX + 12 });
  const heading = e
    ? naive
      ? 'range additions: add to every cell'
      : 'range additions: difference array'
    : '';
  const updates: Update[] = e ? e.batch : s.updates;
  const texts = updates.map(updateText);
  const width = Math.max(
    cols.x(n + 1) + PAD,
    PAD + monoWidth(heading, FONT.label) + PAD,
    ...texts.map((t) => PAD + chipSize(t, CHIP).w + PAD),
  );

  const shapes: Shape[] = [];
  let y = 16;
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
    y = 40;
  }

  // The updates.
  const placed = flow(texts, PAD, width - PAD);
  placed.forEach((p, k) => {
    const id = `u-${k}`;
    shapes.push(
      ...chip({
        id,
        x: p.x + p.w / 2,
        y: y + p.line * CHIP_LINE + 14,
        text: texts[k]!,
        size: CHIP,
        role: roles.get(id) ?? (e && k < e.done ? 'done' : undefined),
      }),
    );
  });
  if (placed.length) y += (Math.max(...placed.map((p) => p.line)) + 1) * CHIP_LINE;

  // The update being applied, over A.
  if (e) {
    const barY = y + LANE - 6;
    y += LANE;
    const u = e.cur === undefined ? undefined : e.batch[e.cur];
    if (u) {
      shapes.push(
        ...bracket(cols, {
          id: 'br-cur',
          lo: u.l,
          hi: u.r,
          y: barY,
          ticks: 'down',
          label: u.x < 0 ? `−${-u.x}` : `+${u.x}`,
          role: roles.get('br-cur') ?? 'active',
          clamp: { min: PAD, max: width - PAD },
        }),
      );
    }
  }

  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top: y + 10,
    text: (i) => fmt(s.a[i]!),
    roles,
    name: 'A',
    nameX,
  });
  shapes.push(...a.shapes);
  let bottom = a.bottom;

  if (e?.d) {
    const d = e.d;
    const dRow = cellRow(cols, {
      id: 'd',
      from: 0,
      to: n,
      top: bottom + 12,
      text: (i) => fmt(d[i]!),
      // D[n] is the spare past the end: drawn as an empty cell.
      cellClass: (i) => (i === n ? 'cell' : 'live'),
      roles,
      name: 'D',
      nameX,
    });
    shapes.push(...dRow.shapes);
    bottom = dRow.bottom;
    if (e.run) {
      const run = e.run;
      const rRow = cellRow(cols, {
        id: 'run',
        from: 0,
        to: n - 1,
        top: bottom + 4,
        text: (i) => (run[i] === null || run[i] === undefined ? null : fmt(run[i]!)),
        cellClass: (i) => (run[i] === null || run[i] === undefined ? 'cell' : 'live'),
        index: false,
        roles,
        name: 'run',
        nameX,
      });
      shapes.push(...rRow.shapes);
      bottom = rRow.bottom;
    }
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom + PAD },
    label: label(step),
  };
}

function label(step: DStep): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  if (e.cur !== undefined)
    parts.push(`Applying update ${e.cur + 1}: ${updateText(e.batch[e.cur]!)}.`);
  if (e.d) parts.push(`D holds ${e.d.map(fmt).join(', ')}.`);
  if (e.run) {
    const known = e.run.filter((v): v is number => v !== null);
    if (known.length) parts.push(`Running sums of D so far: ${known.map(fmt).join(', ')}.`);
  }
  return parts.join(' ');
}
