import type { MarkRole, StageSize, Step } from '../../engine/types';
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
import { panelPlace, pickLayout, translate } from '../_stage/arrange';
import {
  R,
  describe,
  frameMatrix,
  inverseMatrix,
  type CoordExtra,
  type CoordSettings,
  type CoordState,
} from './model';

/** The panel's width, 2×2 and homogeneous: two matrices, or the longest readout. */
const PANEL_W = { plain: 400, homo: 456 };
/** Room for the longest readout, "p = (…) in the world = (…) in B". */
const READOUT_W = 400;

/**
 * The plane, with the matrices and the readout under it, or beside it on a wide, short stage
 * when that draws larger. The panel's room is fixed, so the choice holds through a run.
 */
export function view(
  step: Step<CoordState, CoordExtra>,
  settings: CoordSettings,
  stage?: StageSize,
): Scene {
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

  // The matrices under the plane, side by side; on a narrow stage the inverse may go under
  // the frame's matrix instead, so the panel is no wider than the plane.
  const x0 = plane.rect.x;
  const below = plane.rect.y + plane.rect.h;
  const homo = settings.form === 'homogeneous';
  const drawPanel = (stacked: boolean) => {
    const panel: Shape[] = [];
    const y0 = below + 26;
    const nameY = homo ? 40 : 28;
    const rowH = homo ? 90 : 66;
    panel.push(
      text('m-name', { x: x0, y: y0 + nameY }, homo ? 'T =' : 'M =', { size: 15, mono: true }),
    );
    const m = drawMatrix(panel, { id: 'm', x: x0 + 36, y: y0, rows: frameMatrix(s, settings) });
    const ix = stacked ? x0 : m.x + m.w + 24;
    const iy = stacked ? y0 + rowH : y0;
    if (extra.inverse) {
      panel.push(
        text('inv', { x: ix, y: iy + nameY }, homo ? 'T⁻¹ =' : 'M⁻¹ =', {
          size: 15,
          mono: true,
          role: roles.get('inv'),
        }),
      );
      drawMatrix(panel, {
        id: 'mi',
        x: ix + 52,
        y: iy,
        rows: inverseMatrix(s, settings),
        role: roles.get('inv'),
      });
    }
    const yb = y0 + rowH * (stacked ? 2 : 1);
    const line =
      s.p && s.local
        ? `p = ${fmtVec(s.p)} in the world = ${fmtVec(s.local)} in B`
        : s.local
          ? `(a, b) = ${fmtVec(s.local)} in B`
          : 'world grid: solid · frame B grid: dashed';
    panel.push(text('readout', { x: x0, y: yb }, line, { size: 14, bold: !!s.p }));
    return { panel, yb };
  };

  const side = drawPanel(false);
  const usual = { x: 0, y: 0, w: homo ? 486 : plane.rect.x + plane.rect.w + 20, h: side.yb + 16 };
  const main = { x: 0, y: 0, w: plane.rect.x + plane.rect.w, h: below + 8 };
  // Room for both matrices and the longest readout, whatever this step shows.
  const box = { x: x0, y: below, w: homo ? PANEL_W.homo : PANEL_W.plain, h: side.yb + 6 - below };
  const at = panelPlace(stage, usual, main, box);
  // Stacked: as wide as the plane or the longest readout, one matrix row taller.
  const stackedYb = below + 26 + (homo ? 180 : 132);
  const narrowW = Math.max(plane.rect.x + plane.rect.w + 20, x0 + READOUT_W);
  const narrow = { x: 0, y: 0, w: narrowW, h: stackedYb + 16 };
  const pick = pickLayout(stage, [at, { dx: 0, dy: 0, bounds: narrow, beside: false }]);
  const { panel } = pick === at ? side : drawPanel(true);
  shapes.push(...translate(panel, pick.dx, pick.dy));
  return { shapes, bounds: pick.bounds, label: describe(s) };
}
