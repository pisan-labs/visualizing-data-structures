import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  add,
  drawGrid,
  drawMatrix,
  drawPoint,
  drawPolygon,
  drawVector,
  fmtVec,
  makePlane,
  text,
  textW,
  type Vec,
} from '../../layouts/plane';
import type { Mat3 } from '../../layouts/space';
import type { Scene, Shape } from '../../render/scene';
import { panelPlace, translate } from '../_stage/arrange';
import {
  R,
  describe,
  init,
  mat3RowsFor,
  offsetOf,
  rotRowsFor,
  type RtExtra,
  type RtSettings,
  type RtState,
} from './model';

/**
 * The plane, with the matrices (and the legend of a comparison) under it, or beside it on a
 * wide, short stage when that draws larger. Their room is reserved, so the choice holds.
 */
export function view(step: Step<RtState, RtExtra>, settings: RtSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: -R, xmax: R, ymin: -R, ymax: R, unit: 19, x: 30, y: 14 });
  const shapes: Shape[] = [];
  drawGrid(shapes, plane, { id: 'g', labelEvery: 5 });
  const O = { x: 0, y: 0 };
  const key = (pts: Vec[]) => pts.map((at, i) => ({ key: i, at }));

  drawPolygon(shapes, plane, {
    id: 'base',
    pts: key(init(settings).pts),
    dashed: true,
    opacity: 0.4,
  });

  // The motion so far: where the origin goes (t), and where e1, e2 go from there.
  const t = offsetOf(s.m);
  drawVector(shapes, plane, { id: 'ot', from: O, to: t, dashed: true, opacity: 0.5 });
  drawVector(shapes, plane, {
    id: 'm1',
    from: t,
    to: add(t, { x: s.m[0], y: s.m[3] }),
    role: roles.get('m1'),
    label: 'Me₁',
    size: 12,
  });
  drawVector(shapes, plane, {
    id: 'm2',
    from: t,
    to: add(t, { x: s.m[1], y: s.m[4] }),
    role: roles.get('m2'),
    label: 'Me₂',
    size: 12,
  });

  if (extra.t) {
    drawVector(shapes, plane, {
      id: 'tv',
      from: O,
      to: extra.t,
      role: roles.get('tv') ?? 'active',
      label: 't',
    });
  }

  if (extra.ghost) {
    drawPolygon(shapes, plane, {
      id: 'ghost-e',
      pts: key(extra.ghost),
      role: 'active',
      dashed: true,
    });
    const g0 = plane.at(extra.ghost[0]!);
    shapes.push(
      text('ghost', { x: g0.x - 8, y: g0.y + 16 }, 'A', {
        size: 13,
        anchor: 'end',
        bold: true,
        role: roles.get('ghost') ?? 'active',
      }),
    );
  }

  const role = roles.get('sh');
  drawPolygon(shapes, plane, {
    id: 'sh',
    pts: key(s.pts),
    role: role === 'error' ? 'error' : role ? 'active' : undefined,
  });
  s.pts.forEach((p, i) =>
    drawPoint(shapes, plane, {
      id: `pt-${i}`,
      at: p,
      r: i === 0 ? 5 : 3.5,
      role: i === 0 ? 'found' : undefined,
    }),
  );
  const a0 = plane.at(s.pts[0]!);
  shapes.push(
    text('sh', { x: a0.x + 8, y: a0.y + 16 }, 'A', { size: 14, bold: true, role: role ?? 'found' }),
  );

  if (extra.c) {
    drawPoint(shapes, plane, {
      id: 'c',
      at: extra.c,
      r: 4.5,
      role: roles.get('c') ?? 'active',
      label: 'c',
      dx: 7,
      dy: -6,
    });
  }

  const below = plane.rect.y + plane.rect.h;
  // What goes under the plane: the comparison's legend, the matrices and the convention.
  const panel: Shape[] = [];
  let panelRight = plane.rect.x;
  if (extra.compare) {
    const { rt, tr } = extra.compare;
    drawPolygon(shapes, plane, { id: 'rt-e', pts: key(rt), role: 'active', dashed: true });
    panel.push(
      text('rt', { x: plane.rect.x, y: below + 16 }, 'dashed blue: rotate, then translate', {
        size: 12,
        bold: true,
        role: roles.get('rt') ?? 'active',
      }),
    );
    if (tr.length) {
      drawPolygon(shapes, plane, { id: 'tr-e', pts: key(tr), role: 'error', dashed: true });
      panel.push(
        text('tr', { x: plane.rect.x, y: below + 32 }, 'dashed red: translate, then rotate', {
          size: 12,
          bold: true,
          role: roles.get('tr') ?? 'error',
        }),
      );
    }
  }

  // Matrices under the plane: the operation's and the running total.
  const homo = settings.form === 'homogeneous';
  const y0 = below + 44;
  const rowH = homo ? 3 * 22 + 4 : 2 * 22 + 4;
  const width = plane.rect.x + plane.rect.w + 24;
  let x = plane.rect.x;
  let y = y0;
  let right = width;
  const place = (id: string, name: string, m: Mat3, mRole?: MarkRole, nameRole?: MarkRole) => {
    const rows = homo ? mat3RowsFor(m, settings) : rotRowsFor(m, settings);
    const nameW = textW(`${name} =`, 15) + 6;
    const tail = homo ? '' : `+ ${fmtVec(offsetOf(m))}`;
    const est =
      nameW +
      rows[0]!
        .map((_, j) => Math.max(24, ...rows.map((r) => textW(r[j]!, 14))) + 14)
        .reduce((a, b) => a + b, 0) +
      (tail ? textW(tail, 14) + 16 : 0) +
      10;
    if (x > plane.rect.x && x + est > width - 8) {
      x = plane.rect.x;
      y += rowH + 18;
    }
    panel.push(
      text(`${id}-name`, { x, y: y + rowH / 2 + 5 }, `${name} =`, {
        size: 15,
        mono: true,
        role: nameRole,
      }),
    );
    const b = drawMatrix(panel, { id, x: x + nameW, y, rows, role: mRole });
    let end = b.x + b.w;
    if (tail) {
      panel.push(
        text(`${id}-t`, { x: end + 8, y: y + rowH / 2 + 5 }, tail, {
          size: 14,
          mono: true,
          role: mRole,
        }),
      );
      end += textW(tail, 14) + 12;
    }
    right = Math.max(right, end + 12);
    panelRight = Math.max(panelRight, end);
    x = end + 22;
  };
  place('mt', 'M', s.m);
  if (extra.op) place('op', extra.op.name, extra.op.m, 'active', roles.get('op-name') ?? 'active');
  // Room for two rows of matrices, so the framing stays still from step to step.
  const yb = y0 + 2 * rowH + 18 + 26;
  const note = homo
    ? settings.convention === 'row'
      ? "row vectors: (x', y', 1) = (x, y, 1) M"
      : "column vectors: (x', y', 1) = M (x, y, 1)"
    : settings.convention === 'row'
      ? "row vectors: p' = p R + t"
      : "column vectors: p' = R p + t";
  panel.push(text('conv', { x: plane.rect.x, y: yb }, note, { size: 13 }));
  for (const t of [note, 'dashed blue: rotate, then translate'])
    panelRight = Math.max(panelRight, plane.rect.x + textW(t, 13));

  const usual = { x: 0, y: 0, w: right, h: yb + 14 };
  const main = { x: 0, y: 0, w: plane.rect.x + plane.rect.w, h: below + 8 };
  const box = { x: plane.rect.x, y: below, w: panelRight - plane.rect.x, h: yb + 4 - below };
  const at = panelPlace(stage, usual, main, box);
  shapes.push(...translate(panel, at.dx, at.dy));
  return { shapes, bounds: at.bounds, label: describe(s) };
}
