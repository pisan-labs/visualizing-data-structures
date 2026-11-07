import type { MarkRole, Step, StageSize } from '../../engine/types';
import { drawRow, placePanels, unionBounds, padBounds } from '../../layouts/graph';
import {
  drawGrid,
  drawPoint,
  drawPolygon,
  drawSegment,
  makePlane,
  text,
} from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import {
  MAX,
  describe,
  ptId,
  turnKind,
  type HPt,
  type HullExtra,
  type HullSettings,
  type HullState,
} from './model';

const PANEL_W = 430;

export function view(
  step: Step<HullState, HullExtra>,
  settings: HullSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 32, x: 34, y: 16 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g' });

  const pt = new Map<number, HPt>(s.points.map((p) => [p.id, p]));
  const P = (id: number) => pt.get(id)!;
  const dropped = new Set(s.dropped);
  const onChain = new Set([...s.stack, ...s.lower]);
  const onHull = new Set(s.hull ?? []);

  // The polar sort: a faint ray from p0 to every point.
  if (extra.rays && s.pivot !== null) {
    for (const id of s.order.slice(1)) {
      drawSegment(shapes, plane, {
        id: `ray-${id}`,
        a: P(s.pivot),
        b: P(id),
        dashed: true,
        opacity: 0.45,
      });
    }
  }

  // The chain (the stack), then the finished hull, share edge ids so edges stay put.
  if (s.lower.length > 1)
    drawPolygon(shapes, plane, {
      id: 'ch',
      pts: s.lower.map((id) => ({ key: id, at: P(id) })),
      closed: false,
    });
  if (s.stack.length > 1)
    drawPolygon(shapes, plane, {
      id: 'ch',
      pts: s.stack.map((id) => ({ key: id, at: P(id) })),
      closed: s.hull !== null,
    });

  if (extra.candidate !== undefined && extra.current !== undefined && !extra.turn) {
    drawSegment(shapes, plane, {
      id: 'cand',
      a: P(extra.current),
      b: P(extra.candidate),
      role: 'active',
      dashed: true,
    });
  }

  if (extra.turn) {
    const { a, b, c, cross } = extra.turn;
    const role: MarkRole = cross > 0 ? 'active' : 'error';
    if (extra.current !== undefined) {
      // Gift wrapping: is r to the right of p → q?
      drawSegment(shapes, plane, { id: 'cand', a: P(a), b: P(b), role: 'active', dashed: true });
      drawSegment(shapes, plane, { id: 'try', a: P(a), b: P(c), role, z: 0 });
    } else {
      drawSegment(shapes, plane, { id: 'try-ab', a: P(a), b: P(b), role, z: 0 });
      drawSegment(shapes, plane, { id: 'try', a: P(b), b: P(c), role, dashed: true, z: 0 });
    }
  }

  // Points last so they sit on top of the lines.
  const order = new Map(s.order.map((id, i) => [id, i]));
  for (const p of s.points) {
    const id = ptId(p.id);
    let role: MarkRole | undefined = onHull.has(p.id)
      ? 'done'
      : onChain.has(p.id)
        ? 'visit'
        : s.pivot === p.id && s.hull === null
          ? 'found'
          : undefined;
    role = roles.get(id) ?? role;
    const faded = dropped.has(p.id) && !roles.has(id);
    const repeat = s.points.some((q) => q.id < p.id && q.x === p.x && q.y === p.y);
    drawPoint(shapes, plane, {
      id,
      at: p,
      r: 6,
      role,
      label: p.name,
      size: 14,
      labelRole: role === 'visit' ? undefined : role,
      opacity: faded ? 0.35 : undefined,
      dx: repeat ? -9 : 8,
      dy: repeat ? 18 : -8,
      anchor: repeat ? 'end' : 'start',
    });
    const k = order.get(p.id);
    if (k !== undefined && settings.algorithm !== 'jarvis' && !dropped.has(p.id)) {
      const c = plane.at(p);
      shapes.push(
        text(`ord-${p.id}`, { x: c.x + 8, y: c.y + 17 }, String(k), { size: 10, opacity: 0.9 }),
      );
    }
  }

  const graph = {
    x: 0,
    y: 0,
    w: plane.rect.x + plane.rect.w + 14,
    h: plane.rect.y + plane.rect.h + 22,
  };
  const panel = placePanels(shapes, graph, stage, (out, x, y) => {
    const rowLabel =
      s.hull !== null
        ? 'hull'
        : settings.algorithm === 'jarvis'
          ? 'hull so far'
          : settings.algorithm === 'monotone'
            ? s.lower.length
              ? 'upper U'
              : 'lower L'
            : 'stack S';
    const cells = s.stack.map((id) => ({
      key: String(id),
      text: P(id).name,
      role: roles.get(ptId(id)) ?? (s.hull !== null ? ('done' as const) : undefined),
    }));
    let yy = y;
    drawRow(out, {
      id: 'stk',
      label: rowLabel,
      cells,
      x,
      y: yy,
      perRow: 11,
      labelW: 96,
      cellW: 26,
      empty: 'empty',
    });
    yy += 34;
    if (settings.algorithm === 'monotone') {
      if (s.lower.length && s.hull === null)
        drawRow(out, {
          id: 'low',
          label: 'lower L',
          cells: s.lower.map((id) => ({ key: String(id), text: P(id).name })),
          x,
          y: yy,
          perRow: 11,
          labelW: 96,
          cellW: 26,
        });
      yy += 34;
    }
    if (extra.turn) {
      const { a, b, c, cross } = extra.turn;
      const kind = turnKind(cross);
      out.push(
        text(
          'turn',
          { x, y: yy + 16 },
          `TURN(${P(a).name}, ${P(b).name}, ${P(c).name}) = ${cross}: ${kind === 'collinear' ? 'collinear' : `${kind} turn`}`,
          { size: 14, role: roles.get('turn') ?? (cross > 0 ? 'new' : 'error'), bold: true },
        ),
      );
    }
    out.push(
      text(
        'counts',
        { x, y: yy + 40 },
        `${s.tests} turn test${s.tests === 1 ? '' : 's'}${settings.algorithm === 'jarvis' ? '' : `, ${s.pops} pop${s.pops === 1 ? '' : 's'}`}`,
        { size: 13 },
      ),
    );
    return { x, y, w: PANEL_W, h: settings.algorithm === 'monotone' ? 124 : 90 };
  });

  return {
    shapes,
    bounds: padBounds(unionBounds(graph, panel), 8),
    label: describe(s),
  };
}
