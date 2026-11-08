import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  box,
  drawLines,
  dropPart,
  mid,
  part,
  sideParts,
  stackParts,
  txt,
  type Part,
} from '../_numbers/draw';
import { cellId, describe, firstMultiple, type SieveSettings, type SieveState } from './model';

const CELL = 40;
const SIZE = 17;

/** The numbers 1..n in rows of `cols`, so multiples of a number line up in columns. */
function gridPart(s: SieveState, cols: number, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const n = Math.max(s.n, 30);
  for (let k = 1; k <= Math.max(1, s.n); k++) {
    const x = ((k - 1) % cols) * CELL;
    const y = Math.floor((k - 1) / cols) * CELL;
    const id = cellId(k);
    const st = s.status[k];
    const crossed = st === 'crossed';
    const role =
      roles.get(id) ??
      (k === s.p ? 'active' : st === 'prime' ? 'found' : k === 1 ? undefined : undefined);
    shapes.push(
      box(id, x + 2, y + 2, CELL - 4, CELL - 4, {
        role,
        opacity: crossed && !roles.get(id) ? 0.55 : k === 1 ? 0.4 : 1,
      }),
    );
    shapes.push(
      txt(`${id}-t`, x + CELL / 2, mid(y, CELL, SIZE), String(k), SIZE, {
        anchor: 'middle',
        weight: st === 'prime' ? 'bold' : 'normal',
        role: role ?? (crossed ? 'stale' : undefined),
        opacity: k === 1 ? 0.6 : 1,
      }),
    );
    if (crossed)
      shapes.push({
        kind: 'arrow',
        id: `${id}-x`,
        x1: x + 7,
        y1: y + CELL - 7,
        x2: x + CELL - 7,
        y2: y + 7,
        head: 'none',
        role: roles.get(id) === 'remove' ? 'error' : undefined,
        opacity: 0.8,
      });
  }
  const rows = Math.ceil(n / cols);
  return { shapes, w: cols * CELL, h: rows * CELL };
}

export function view(
  step: Step<SieveState, undefined>,
  settings: SieveSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const title = s.n ? `sieve of 2 to ${s.n}` : 'sieve of Eratosthenes';
  const head = part([txt('sv-title', 0, 18, title, 17, { weight: 'bold' })], {
    x: 0,
    y: 0,
    w: title.length * 17 * 0.6,
    h: 26,
  });
  const count = (x: string) => s.status.filter((v, k) => k >= 2 && v === x).length;
  const notes: { text: string; role?: MarkRole; bold?: boolean }[] = [];
  if (s.p !== null) {
    const from = firstMultiple(s.p, settings.start);
    notes.push({ text: `p = ${s.p}`, bold: true, role: 'active' });
    notes.push({ text: from <= s.n ? `from ${from}, step ${s.p}` : `${from} > ${s.n}` });
  } else notes.push({ text: s.done ? 'done' : s.n ? 'ready' : 'no run yet', bold: true });
  notes.push({ text: `primes: ${count('prime')}`, role: 'found' });
  notes.push({ text: `crossed out: ${count('crossed')}` });
  notes.push({ text: `cross-outs: ${s.marks}` });
  if (s.n) notes.push({ text: `√${s.n} ≈ ${Math.sqrt(s.n).toFixed(1)}` });
  const lines = drawLines('sv-note', 0, 0, notes, 15, { room: 6, width: 160 });
  const notePart = part(lines.shapes, lines.bounds);

  const arrangement = (cols: number, wide: boolean) => {
    const grid = gridPart(s, cols, roles);
    if (wide) {
      const left = stackParts([head, grid], 8);
      return sideParts([asPart(left), dropPart(notePart, ZOOM_DROP + 8)], 28);
    }
    return stackParts([head, grid, notePart], 12);
  };
  // Rows of 10 line multiples of 2, 5 and 10 up in columns; a wide stage takes rows of 20.
  const place = pickLayout(stage, [
    arrangement(10, true),
    arrangement(20, true),
    arrangement(10, false),
    arrangement(15, true),
  ]);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
