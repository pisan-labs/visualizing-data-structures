import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  box,
  drawCounts,
  dropPart,
  mid,
  part,
  pickReadable,
  sideParts,
  stackParts,
  txt,
  type Part,
} from '../_numbers/draw';
import { cellId, describe, exactCounts, PERMS, type FySettings, type FyState } from './model';

const CELL = 54;
const SIZE = 20;

/** The array, with the unshuffled part outlined and i and j pointed at. */
function arrayPart(s: FyState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const n = s.items.length;
  const top = 30;
  const done = s.done;
  // The part still unshuffled: [done, n) going forward, [0, done) going backward.
  if (done !== null) {
    const [lo, hi] = s.direction === 'forward' ? [done, n] : [0, done];
    if (hi > lo) {
      shapes.push(
        box('region', lo * CELL - 3, top - 3, (hi - lo) * CELL + 6, CELL + 6, {
          cls: 'ghost',
          r: 6,
        }),
      );
      shapes.push(
        txt('region-label', ((lo + hi) / 2) * CELL, top - 10, 'unshuffled', 14, {
          anchor: 'middle',
          cls: 'label',
        }),
      );
    }
  }
  s.items.forEach((item, pos) => {
    const final = done !== null && (s.direction === 'forward' ? pos < done : pos >= done);
    const role = roles.get(cellId(pos)) ?? (final ? 'done' : undefined);
    shapes.push(box(cellId(pos), pos * CELL + 3, top + 3, CELL - 6, CELL - 6, { role }));
    shapes.push(
      txt(`item-${item.uid}`, pos * CELL + CELL / 2, mid(top, CELL, SIZE), item.v, SIZE, {
        anchor: 'middle',
        weight: 'bold',
        role,
      }),
    );
    shapes.push(
      txt(`idx-${pos}`, pos * CELL + CELL / 2, top + CELL + 18, String(pos), 14, {
        anchor: 'middle',
        cls: 'index',
      }),
    );
  });
  // Pointers under the indices.
  for (const [name, at] of [
    ['i', s.i],
    ['j', s.j],
  ] as const) {
    if (at === null) continue;
    const same = name === 'j' && s.i === s.j;
    shapes.push(
      txt(
        `ptr-${name}`,
        at * CELL + CELL / 2 + (same ? 14 : name === 'i' && s.i === s.j ? -14 : 0),
        top + CELL + 40,
        name,
        16,
        {
          anchor: 'middle',
          weight: 'bold',
          role: name === 'i' ? 'active' : 'compare',
        },
      ),
    );
  }
  return { shapes, w: Math.max(4, n) * CELL, h: top + CELL + 48 };
}

function countsPart(
  s: FyState,
  settings: FySettings,
  roles: ReadonlyMap<string, MarkRole>,
): Part | null {
  if (!s.counts) return null;
  const method = s.method ?? settings.method;
  const exact = exactCounts({ ...settings, method });
  const runs = exact.reduce((a, b) => a + b, 0);
  // Bars for the orders the method favors, when it favors any.
  const most = Math.max(...exact);
  const highlight = new Map<number, MarkRole>();
  if (method === 'naive') exact.forEach((c, k) => c === most && highlight.set(k, 'compare'));
  const d = drawCounts('counts', 0, 0, PERMS, s.counts, s.trials / 6, {
    h: 120,
    barW: 46,
    gap: 12,
    size: 15,
    title: `${s.trials} shuffles of 1 2 3 (${method === 'naive' ? 'naive' : 'Fisher-Yates'})`,
    roles,
    highlight,
  });
  const note = txt(
    'counts-note',
    0,
    d.bounds.y + d.bounds.h + 16,
    method === 'naive' ? `odds: ${exact.map((c) => `${c}/${runs}`).join(' ')}` : 'odds: 1/6 each',
    14,
    { cls: 'label' },
  );
  return part([...d.shapes, note], { ...d.bounds, h: d.bounds.h + 24 });
}

export function view(
  step: Step<FyState, undefined>,
  settings: FySettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const arr = arrayPart(s, roles);
  const counts = countsPart(s, settings, roles);
  const options = counts
    ? [
        { ...sideParts([arr, dropPart(counts, ZOOM_DROP)], 40), font: 14 },
        { ...stackParts([arr, counts], 24), font: 14 },
      ]
    : [{ ...stackParts([arr], 0), font: 14 }];
  const place = pickReadable(stage, options);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
