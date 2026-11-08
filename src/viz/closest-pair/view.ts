import type { MarkRole, Step, StageSize } from '../../engine/types';
import { padBounds, placePanels, unionBounds } from '../../layouts/graph';
import { drawGrid, drawPoint, drawSegment, makePlane, text } from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import { drawBox } from '../_spatial/kit';
import {
  MAX,
  byId,
  describe,
  pairs,
  ptId,
  type CPExtra,
  type CPSettings,
  type CPState,
} from './model';

/** Calls on the deepest path for n points (the recursion stops at 3 or fewer). */
function depthFor(n: number): number {
  let d = 1;
  while (n > 3) {
    n = Math.ceil(n / 2);
    d++;
  }
  return d;
}

export function view(step: Step<CPState, CPExtra>, settings: CPSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 32, x: 34, y: 16 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g' });

  const call = s.calls.at(-1);
  const inCall = new Set(call ? s.byX.slice(call.lo, call.hi) : []);
  if (call) {
    const xs = [...inCall].map((id) => byId(s, id).x);
    const bandLo = Math.max(0, Math.min(...xs) - 0.3);
    const bandHi = Math.min(MAX, Math.max(...xs) + 0.3);
    drawBox(shapes, plane, {
      id: 'band',
      lo: { x: bandLo, y: 0 },
      hi: { x: bandHi, y: MAX },
      fill: true,
      noEdges: true,
    });
    if (s.stripD2 !== null && call.xm !== null && s.stripD2 > 0) {
      const d = Math.sqrt(s.stripD2);
      drawBox(shapes, plane, {
        id: 'strip',
        lo: { x: Math.max(bandLo, call.xm - d), y: 0 },
        hi: { x: Math.min(bandHi, call.xm + d), y: MAX },
        fill: 'compare',
        role: 'compare',
        dashed: true,
      });
    }
    if (call.xm !== null)
      drawSegment(shapes, plane, {
        id: 'split',
        a: { x: call.xm, y: 0 },
        b: { x: call.xm, y: MAX },
        role: 'active',
        dashed: true,
      });
  }

  const best = s.answer ?? s.pair;
  if (best)
    drawSegment(shapes, plane, {
      id: 'best',
      a: byId(s, best[0]),
      b: byId(s, best[1]),
      role: 'found',
    });
  if (extra.compare)
    drawSegment(shapes, plane, {
      id: 'cmp',
      a: byId(s, extra.compare[0]),
      b: byId(s, extra.compare[1]),
      role: 'active',
      dashed: true,
    });

  const onBest = new Set(best ?? []);
  for (const p of s.points) {
    const id = ptId(p.id);
    const role = roles.get(id) ?? (onBest.has(p.id) ? 'found' : undefined);
    const faded = call !== undefined && !inCall.has(p.id) && !roles.has(id);
    const repeat = s.points.some((q) => q.id < p.id && q.x === p.x && q.y === p.y);
    drawPoint(shapes, plane, {
      id,
      at: p,
      r: 6,
      role,
      label: p.name,
      size: 15,
      labelRole: role === 'g1' || role === 'g2' ? undefined : role,
      opacity: faded ? 0.35 : undefined,
      dx: repeat ? -9 : 8,
      dy: repeat ? 18 : -8,
      anchor: repeat ? 'end' : 'start',
    });
  }

  const graph = {
    x: 0,
    y: 0,
    w: plane.rect.x + plane.rect.w + 14,
    h: plane.rect.y + plane.rect.h + 22,
  };
  const rows = settings.method === 'brute' ? 0 : depthFor(s.points.length);
  const panel = placePanels(shapes, graph, stage, (out, x, y) => {
    let yy = y + 16;
    if (rows) {
      out.push(text('calls-h', { x, y: yy }, 'calls (outermost first)', { size: 14 }));
      yy += 24;
      s.calls.forEach((c, i) => {
        const ids = s.byX.slice(c.lo, c.hi);
        const label = `${ids.map((id) => byId(s, id).name).join('')}${c.xm !== null ? `  x=${c.xm}` : ''}${c.d2 !== null ? `  δ²=${c.d2}` : ''}`;
        out.push(
          text(`call-${i}`, { x: x + i * 12, y: yy + i * 22 }, label, {
            size: 14,
            mono: true,
            role: i === s.calls.length - 1 ? 'active' : undefined,
          }),
        );
      });
      yy += rows * 22 + 6;
    }
    const n = s.points.length;
    out.push(
      text(
        'counts',
        { x, y: yy },
        `${s.comparisons} comparison${s.comparisons === 1 ? '' : 's'}; brute force: ${pairs(n)}`,
        {
          size: 14,
          bold: true,
        },
      ),
    );
    return { x, y, w: 300, h: yy - y + 8 };
  });

  return {
    shapes,
    bounds: padBounds(unionBounds(graph, panel), 8),
    label: describe(s),
  };
}
