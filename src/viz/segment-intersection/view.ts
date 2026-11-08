import type { MarkRole, Step, StageSize } from '../../engine/types';
import { drawRow, padBounds, placePanels, unionBounds } from '../../layouts/graph';
import { drawGrid, drawPoint, drawSegment, makePlane, text } from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import {
  MAX,
  byId,
  describe,
  ptText,
  segId,
  type SIExtra,
  type SISettings,
  type SIState,
} from './model';
import { toNum } from './rat';

const QUEUE_SHOWN = 4;

export function view(step: Step<SIState, SIExtra>, settings: SISettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 30, x: 34, y: 16 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g' });

  if (s.sweep) {
    const x = toNum(s.sweep.x);
    drawSegment(shapes, plane, {
      id: 'sweep',
      a: { x, y: 0 },
      b: { x, y: MAX },
      role: 'active',
      dashed: true,
    });
  }

  const inStatus = new Set(s.status);
  const passed = new Set(s.passed);
  for (const g of s.segs) {
    const id = segId(g.id);
    const role = roles.get(id) ?? (inStatus.has(g.id) ? 'visit' : undefined);
    const dim = passed.has(g.id) && !roles.has(id) ? 0.4 : undefined;
    drawSegment(shapes, plane, { id, a: g.p, b: g.q, role, opacity: dim });
    for (const [k, v] of [
      ['p', g.p],
      ['q', g.q],
    ] as const)
      drawPoint(shapes, plane, { id: `${id}-${k}`, at: v, r: 4, role, opacity: dim });
    // The name beside the left end, nudged off the line.
    const up = g.q.y >= g.p.y;
    const c = plane.at(g.p);
    shapes.push(
      text(`${id}-l`, { x: c.x - 6, y: c.y + (up ? 17 : -8) }, g.name, {
        size: 15,
        bold: true,
        anchor: 'end',
        role: role === 'visit' ? undefined : role,
        opacity: dim,
      }),
    );
  }

  // Crossings waiting in the queue, then those reported.
  for (const e of s.queue) {
    if (!e.cross) continue;
    drawPoint(shapes, plane, {
      id: `qx-${e.x.n}_${e.x.d}-${e.y.n}_${e.y.d}`,
      at: { x: toNum(e.x), y: toNum(e.y) },
      r: 7,
      role: 'compare',
      cls: 'ring',
    });
  }
  if (extra.at)
    drawPoint(shapes, plane, {
      id: 'probe',
      at: { x: toNum(extra.at.x), y: toNum(extra.at.y) },
      r: 7,
      role: 'compare',
      cls: 'ring',
    });
  s.hits.forEach((h, i) =>
    drawPoint(shapes, plane, {
      id: `hit-${i}`,
      at: { x: toNum(h.x), y: toNum(h.y) },
      r: 6,
      role: 'found',
    }),
  );
  if (s.sweep)
    drawPoint(shapes, plane, {
      id: 'event',
      at: { x: toNum(s.sweep.x), y: toNum(s.sweep.y) },
      r: 8,
      role: 'active',
      cls: 'ring',
    });

  const graph = {
    x: 0,
    y: 0,
    w: plane.rect.x + plane.rect.w + 14,
    h: plane.rect.y + plane.rect.h + 22,
  };
  const panel = placePanels(shapes, graph, stage, (out, x, y) => {
    drawRow(out, {
      id: 'st',
      label: 'status',
      cells: s.status.map((id) => ({
        key: String(id),
        text: byId(s, id).name,
        role: roles.get(segId(id)),
      })),
      x,
      y,
      perRow: 8,
      labelW: 74,
      cellW: 28,
      empty: 'empty',
      ends: s.status.length > 1 ? ['bottom', 'top'] : undefined,
    });
    let yy = y + 58;
    out.push(
      text('q-h', { x, y: yy }, settings.mode === 'any' ? 'end points to come' : 'event queue', {
        size: 14,
      }),
    );
    yy += 22;
    const shown = s.queue.slice(0, QUEUE_SHOWN).map((e) => `${ptText(e)}${e.cross ? '×' : ''}`);
    const more = s.queue.length > QUEUE_SHOWN ? ` +${s.queue.length - QUEUE_SHOWN} more` : '';
    const lines = shown.length
      ? [shown.slice(0, 2).join(' '), shown.slice(2).join(' ') + more]
      : [s.sweep ? 'empty' : '(press Sweep)', ''];
    lines.forEach((l, i) =>
      out.push(text(`q-list-${i}`, { x, y: yy + i * 20 }, l, { size: 14, mono: true })),
    );
    yy += 48;
    const found =
      settings.mode === 'any'
        ? s.answer === null
          ? `${s.tests} test${s.tests === 1 ? '' : 's'}`
          : `${s.answer ? 'yes, they intersect' : 'no intersection'}; ${s.tests} test${s.tests === 1 ? '' : 's'}`
        : `${s.hits.length} found; ${s.tests} test${s.tests === 1 ? '' : 's'}`;
    out.push(text('counts', { x, y: yy }, found, { size: 14, bold: true }));
    return { x, y, w: 330, h: yy - y + 8 };
  });

  return { shapes, bounds: padBounds(unionBounds(graph, panel), 8), label: describe(s) };
}
