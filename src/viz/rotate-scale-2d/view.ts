import type { MarkRole, Step } from '../../engine/types';
import {
  add,
  drawGrid,
  drawMatrix,
  drawPoint,
  drawPolygon,
  drawVector,
  makePlane,
  text,
  type Vec,
} from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import { R, describe, init, matRows, type RsExtra, type RsSettings, type RsState } from './model';

export function view(step: Step<RsState, RsExtra>, settings: RsSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: -R, xmax: R, ymin: -R, ymax: R, unit: 19, x: 30, y: 14 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g', labelEvery: 5 });
  const O = { x: 0, y: 0 };
  const key = (pts: Vec[]) => pts.map((at, i) => ({ key: i, at }));

  // Where the shape started, faint.
  drawPolygon(shapes, plane, {
    id: 'base',
    pts: key(init(settings).pts),
    dashed: true,
    opacity: 0.4,
  });

  // Everything applied so far: the images of e1, e2 and of the unit square.
  const m1 = { x: s.m[0], y: s.m[2] };
  const m2 = { x: s.m[1], y: s.m[3] };
  const t = s.t;
  drawPolygon(shapes, plane, {
    id: 'sq',
    pts: key([t, add(t, m1), add(add(t, m1), m2), add(t, m2)]),
    dashed: true,
    opacity: 0.55,
  });
  drawVector(shapes, plane, {
    id: 'm1',
    from: t,
    to: add(t, m1),
    role: roles.get('m1'),
    label: 'Me₁',
    size: 12,
  });
  drawVector(shapes, plane, {
    id: 'm2',
    from: t,
    to: add(t, m2),
    role: roles.get('m2'),
    label: 'Me₂',
    size: 12,
  });

  // The operation's own matrix acting on e1 and e2.
  if (extra.basis && extra.op) {
    const [a, b, c, d] = extra.op.m;
    drawVector(shapes, plane, {
      id: 'b1',
      from: O,
      to: { x: a, y: c },
      role: 'active',
      label: `${extra.op.name}e₁`,
    });
    drawVector(shapes, plane, {
      id: 'b2',
      from: O,
      to: { x: b, y: d },
      role: 'active',
      label: `${extra.op.name}e₂`,
    });
  }

  const shown = extra.shifted ?? s.pts;
  const role = roles.get('sh');
  drawPolygon(shapes, plane, {
    id: 'sh',
    pts: key(shown),
    role: role === 'error' ? 'error' : role ? 'active' : undefined,
  });
  shown.forEach((p, i) =>
    drawPoint(shapes, plane, {
      id: `pt-${i}`,
      at: p,
      r: i === 0 ? 5 : 3.5,
      role: i === 0 ? 'found' : undefined,
    }),
  );
  const a0 = plane.at(shown[0]!);
  shapes.push(
    text('sh', { x: a0.x + 8, y: a0.y + 16 }, 'A', { size: 14, bold: true, role: role ?? 'found' }),
  );

  if (extra.compare) {
    const { rs, sr } = extra.compare;
    drawPolygon(shapes, plane, { id: 'rs-e', pts: key(rs), role: 'active', dashed: true });
    shapes.push(
      text(
        'rs',
        { x: plane.rect.x, y: plane.rect.y + plane.rect.h + 112 },
        'dashed blue: rotate, then scale',
        {
          size: 12,
          bold: true,
          role: roles.get('rs') ?? 'active',
        },
      ),
    );
    if (sr.length) {
      drawPolygon(shapes, plane, { id: 'sr-e', pts: key(sr), role: 'error', dashed: true });
      shapes.push(
        text(
          'sr',
          { x: plane.rect.x, y: plane.rect.y + plane.rect.h + 130 },
          'dashed red: scale, then rotate',
          {
            size: 12,
            bold: true,
            role: roles.get('sr') ?? 'error',
          },
        ),
      );
    }
  }

  drawPoint(shapes, plane, {
    id: 'pivot',
    at: s.pivot,
    r: 4,
    role: roles.get('pivot') ?? (settings.about === 'pivot' ? 'active' : undefined),
    label: 'c',
    opacity: settings.about === 'pivot' || roles.has('pivot') ? 1 : 0.4,
    dx: 7,
    dy: -6,
  });

  // Matrices under the plane: the operation's and the running total.
  const y0 = plane.rect.y + plane.rect.h + 24;
  let x = plane.rect.x;
  if (extra.op) {
    shapes.push(text('op-name', { x, y: y0 + 28 }, `${extra.op.name} =`, { size: 15, mono: true }));
    const b = drawMatrix(shapes, {
      id: 'op',
      x: x + 34,
      y: y0,
      rows: matRows(extra.op.m, settings),
      role: 'active',
    });
    x = b.x + b.w + 22;
  } else if (extra.compare) {
    shapes.push(
      text('op-name', { x, y: y0 + 28 }, settings.convention === 'column' ? 'SR =' : 'RS =', {
        size: 15,
        mono: true,
      }),
    );
    const b = drawMatrix(shapes, {
      id: 'op',
      x: x + 44,
      y: y0,
      rows: matRows(extra.compare.rsM, settings),
      role: 'active',
    });
    x = b.x + b.w + 22;
  }
  shapes.push(text('m-name', { x, y: y0 + 28 }, 'M =', { size: 15, mono: true }));
  drawMatrix(shapes, { id: 'mt', x: x + 34, y: y0, rows: matRows(s.m, settings) });
  const note = settings.convention === 'row' ? "row vectors: p' = p M" : "column vectors: p' = M p";
  shapes.push(
    text('conv', { x: plane.rect.x, y: y0 + 74 }, `${note}${s.t.x || s.t.y ? ' + t' : ''}`, {
      size: 13,
    }),
  );

  return {
    shapes,
    bounds: { x: 0, y: 0, w: plane.rect.x + plane.rect.w + 24, h: y0 + 114 },
    label: describe(s),
  };
}
