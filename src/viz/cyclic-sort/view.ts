/**
 * The drawing: the phase at the top left ("cyclic sort: v goes to A[v − 1]"), clear of the zoom
 * buttons; A as bars or cells with i and the home slot (or selection sort's i, j and min) under
 * it; and, through the whole operation, two lines under the array for what the scan finds:
 * the missing numbers and the repeats. Values already home are drawn as done. A plain picture
 * (the start, a load, practice) draws A alone.
 */
import type { MarkRole } from '../../engine/types';
import { barsScene, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { listText, type CyclicSettings, type CyclicStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;

const HEADING = 21;
const FOUND = 21;
const LINE = 30;

export function view(step: CyclicStep, settings: CyclicSettings): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, n),
    pointerLanes: e ? 2 : 0,
  };
  const bars = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items: s.a.map((x) => (live(x) ? x : null)) }],
    pointers: e?.pointers,
    roles,
  });
  const shapes: Shape[] = [...bars.shapes];
  let h = bars.bounds.h;
  if (e) {
    shapes.push({
      kind: 'text',
      id: 'heading',
      x: 10,
      y: 28,
      text: e.heading,
      size: HEADING,
      weight: 'bold',
      mono: true,
    });
    const y = bars.bounds.h + 12;
    const lines: [string, string][] = [
      ['missing', e.found ? listText(e.found.missing) : '(after the sort)'],
      ['repeated', e.found ? listText(e.found.repeated) : '(after the sort)'],
    ];
    lines.forEach(([name, text], k) => {
      shapes.push(
        {
          kind: 'text',
          id: `${name}-name`,
          x: 10,
          y: y + k * LINE,
          text: `${name}:`,
          size: FOUND,
          cls: 'label',
          mono: true,
        },
        {
          kind: 'text',
          id: `${name}-list`,
          x: 10 + 10 * FOUND * 0.6,
          y: y + k * LINE,
          text,
          size: FOUND,
          weight: 'bold',
          mono: true,
          role: e.found && e.found[name as 'missing' | 'repeated'].length ? 'found' : undefined,
        },
      );
    });
    h = y + LINE + 10;
  }
  return { shapes, bounds: { ...bars.bounds, h }, label: label(step) };
}

function label(step: CyclicStep): string {
  const e = step.extra;
  const parts = [describeArray(step.state)];
  if (!e) return parts[0]!;
  if (e.pointers.length) parts.push(`${e.pointers.map((p) => `${p.name} at ${p.at}`).join(', ')}.`);
  if (e.found)
    parts.push(
      `Missing so far: ${listText(e.found.missing)}. Repeated so far: ${listText(e.found.repeated)}.`,
    );
  return parts.join(' ');
}
