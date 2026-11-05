import type { MarkRole, Step } from '../../engine/types';
import {
  add,
  drawFrameGrid,
  drawGrid,
  drawMatrix,
  drawPoint,
  drawVector,
  fmtVec,
  makePlane,
  mul,
  text,
} from '../../layouts/plane';
import type { Scene, Shape } from '../../render/scene';
import {
  R,
  describe,
  frameMatrix,
  inverseMatrix,
  type CoordExtra,
  type CoordSettings,
  type CoordState,
} from './model';

export function view(step: Step<CoordState, CoordExtra>, settings: CoordSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: -R, xmax: R, ymin: -R, ymax: R, unit: 26, x: 30, y: 14 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g', labelEvery: 4 });
  drawFrameGrid(shapes, plane, { id: 'f', origin: s.o, u: s.u, v: s.v, opacity: 0.35 });

  // Frame B: its two axes through o (long, faint), and u, v as unit arrows.
  drawVector(shapes, plane, {
    id: 'u',
    from: s.o,
    to: add(s.o, s.u),
    role: roles.get('u'),
    label: 'u',
  });
  drawVector(shapes, plane, {
    id: 'v',
    from: s.o,
    to: add(s.o, s.v),
    role: roles.get('v'),
    label: 'v',
  });
  drawPoint(shapes, plane, {
    id: 'o',
    at: s.o,
    r: 5,
    role: roles.get('o'),
    label: 'o',
    dx: -8,
    dy: 16,
    anchor: 'end',
    size: 14,
  });

  if (extra.d && s.p) {
    drawVector(shapes, plane, {
      id: 'd',
      from: s.o,
      to: s.p,
      role: roles.get('d'),
      dashed: true,
      label: 'd',
      size: 13,
    });
  }

  if (extra.walk && s.local) {
    const a = add(s.o, mul(s.u, s.local.x));
    drawVector(shapes, plane, { id: 'pa', from: s.o, to: a, role: roles.get('pa') ?? 'active' });
    if (extra.walk === 2) {
      drawVector(shapes, plane, {
        id: 'pb',
        from: a,
        to: add(a, mul(s.v, s.local.y)),
        role: roles.get('pb') ?? 'active',
        dashed: true,
      });
    }
  }

  if (s.p) {
    drawPoint(shapes, plane, {
      id: 'p',
      at: s.p,
      r: 6,
      role: roles.get('p') ?? 'found',
      label: 'p',
      size: 15,
    });
  }

  // The matrices under the plane.
  const y0 = plane.rect.y + plane.rect.h + 26;
  const x0 = plane.rect.x;
  const homo = settings.form === 'homogeneous';
  shapes.push(
    text('m-name', { x: x0, y: y0 + (homo ? 40 : 28) }, homo ? 'T =' : 'M =', {
      size: 15,
      mono: true,
    }),
  );
  const m = drawMatrix(shapes, { id: 'm', x: x0 + 36, y: y0, rows: frameMatrix(s, settings) });
  const ix = m.x + m.w + 24;
  if (extra.inverse) {
    shapes.push(
      text('inv', { x: ix, y: y0 + (homo ? 40 : 28) }, homo ? 'T⁻¹ =' : 'M⁻¹ =', {
        size: 15,
        mono: true,
        role: roles.get('inv'),
      }),
    );
    drawMatrix(shapes, {
      id: 'mi',
      x: ix + 52,
      y: y0,
      rows: inverseMatrix(s, settings),
      role: roles.get('inv'),
    });
  }
  const yb = y0 + (homo ? 90 : 66);
  const line =
    s.p && s.local
      ? `p = ${fmtVec(s.p)} in the world = ${fmtVec(s.local)} in B`
      : s.local
        ? `(a, b) = ${fmtVec(s.local)} in B`
        : 'world grid: solid · frame B grid: dashed';
  shapes.push(text('readout', { x: x0, y: yb }, line, { size: 14, bold: !!s.p }));

  return {
    shapes,
    bounds: { x: 0, y: 0, w: homo ? 486 : plane.rect.x + plane.rect.w + 20, h: yb + 16 },
    label: describe(s),
  };
}
