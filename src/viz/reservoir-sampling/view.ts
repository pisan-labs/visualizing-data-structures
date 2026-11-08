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
import {
  describe,
  MAX_STREAM,
  slotId,
  streamId,
  TRIAL_N,
  type ResSettings,
  type ResState,
} from './model';

const CELL = 44;
const SLOT = 64;

/** The stream so far, `perRow` items to a row, and the reservoir's slots under it. */
function mainPart(s: ResState, perRow: number, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const rows = Math.ceil(MAX_STREAM / perRow);
  const top = 26;
  shapes.push(txt('stream-title', 0, 16, 'stream', 15, { cls: 'label' }));
  const pos = (idx: number) => ({
    x: (idx % perRow) * CELL,
    y: top + Math.floor(idx / perRow) * (CELL + 20),
  });
  const kept = new Set(s.slots.filter((u): u is number => u !== null));
  s.stream.forEach((item, idx) => {
    const p = pos(idx);
    const id = streamId(item.uid);
    const role = roles.get(id) ?? (kept.has(item.uid) ? 'found' : undefined);
    const gone = !kept.has(item.uid) && idx + 1 !== s.at;
    shapes.push(box(id, p.x + 2, p.y + 2, CELL - 4, CELL - 4, { role, opacity: gone ? 0.5 : 1 }));
    shapes.push(
      txt(
        `${id}-t`,
        p.x + CELL / 2,
        mid(p.y, CELL, 17),
        item.v,
        Math.min(17, 36 / (item.v.length * 0.6)),
        {
          anchor: 'middle',
          weight: 'bold',
          role: role ?? (gone ? 'stale' : undefined),
        },
      ),
    );
    shapes.push(
      txt(`${id}-i`, p.x + CELL / 2, p.y + CELL + 13, String(idx + 1), 13, {
        anchor: 'middle',
        cls: 'index',
      }),
    );
  });
  const streamH = top + rows * (CELL + 20);
  // The reservoir.
  const ry = streamH + 34;
  shapes.push(txt('res-title', 0, ry - 10, `reservoir (k = ${s.k})`, 15, { cls: 'label' }));
  const at = s.at ? s.stream[s.at - 1] : undefined;
  s.slots.forEach((uid, k) => {
    const x = k * (SLOT + 10);
    const id = slotId(k);
    const role = roles.get(id);
    shapes.push(box(id, x, ry, SLOT, SLOT, { role, r: 6 }));
    if (uid === null) return;
    const item = s.stream.find((it) => it.uid === uid)!;
    const from = pos(s.stream.indexOf(item));
    shapes.push(
      txt(
        `r-${uid}`,
        x + SLOT / 2,
        mid(ry, SLOT, 22),
        item.v,
        Math.min(22, 52 / (item.v.length * 0.6)),
        {
          anchor: 'middle',
          weight: 'bold',
          role,
          enterFrom: { x: from.x + CELL / 2, y: from.y + CELL / 2 + 8 },
        },
      ),
    );
  });
  // The chance the newest item had.
  if (at && s.at && s.at > s.k) {
    shapes.push(
      txt(
        'chance',
        0,
        ry + SLOT + 26,
        `item ${s.at}: chance ${s.k}/${s.at}${s.action === 'keep' ? ', kept' : s.action === 'skip' ? ', skipped' : ''}`,
        15,
        {
          role: s.action === 'keep' ? 'found' : undefined,
        },
      ),
    );
  }
  const w = Math.max(perRow * CELL, s.k * (SLOT + 10), 300);
  return { shapes, w, h: ry + SLOT + 34 };
}

function countsPart(s: ResState, roles: ReadonlyMap<string, MarkRole>): Part | null {
  if (!s.counts) return null;
  const d = drawCounts(
    'counts',
    0,
    0,
    Array.from({ length: TRIAL_N }, (_, i) => String(i + 1)),
    s.counts,
    (s.trials * s.k) / TRIAL_N,
    { h: 120, barW: 34, gap: 8, size: 14, title: `kept, over ${s.trials} trials`, roles },
  );
  return part(d.shapes, d.bounds);
}

export function view(
  step: Step<ResState, undefined>,
  _settings: ResSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const counts = countsPart(s, roles);
  const options = [16, 8].flatMap((perRow) => {
    const main = mainPart(s, perRow, roles);
    if (!counts) return [{ ...stackParts([main], 0), font: 13 }];
    // Trials on an empty stream: the chart alone.
    if (!s.stream.length) return [{ ...stackParts([counts], 0), font: 13 }];
    return [
      { ...sideParts([main, dropPart(counts, ZOOM_DROP)], 36), font: 13 },
      { ...stackParts([main, counts], 20), font: 13 },
    ];
  });
  const place = pickReadable(stage, options);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
