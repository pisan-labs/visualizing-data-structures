import type { MarkRole, StageSize, Step } from '../../engine/types';
import { panelPlace, pickLayout, translate } from '../../layouts/arrange';
import { drawMatrix, text, textW } from '../../layouts/plane';
import {
  column3,
  drawAxes3,
  drawPoint3,
  project,
  drawSegment3,
  drawVector3,
  makeSpace,
  mat3Rows,
  type Mat3,
  type Vec3,
} from '../../layouts/space';
import type { Scene, Shape } from '../../render/scene';
import { R, SHAPES, describe, type Rs3Extra, type Rs3Settings, type RsState } from './model';

const O: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * The 3D drawing, with the matrices under it, or beside it on a wide, short stage when that
 * draws larger. On a narrow stage the scene may be only as wide as the drawing, the matrices
 * one under the other. The panel's rows are reserved, so the choice holds.
 */
export function view(
  step: Step<RsState, Rs3Extra>,
  settings: Rs3Settings,
  stage?: StageSize,
): Scene {
  const usual = draw(step, settings, stage, false);
  return stage ? pickLayout(stage, [usual, draw(step, settings, stage, true)]) : usual;
}

function draw(
  step: Step<RsState, Rs3Extra>,
  settings: Rs3Settings,
  stage: StageSize | undefined,
  narrow: boolean,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const iso = settings.projection !== 'oblique';
  // The scene is at least 480 wide, so two 3×3 matrices fit side by side; centre the drawing.
  // Narrow, it is as wide as the drawing, and the matrices go one under the other.
  const probe = makeSpace({ kind: settings.projection, reach: R + 0.3, unit: iso ? 34 : 38 });
  const width = narrow ? probe.plane.rect.w + 40 : Math.max(probe.plane.rect.w + 40, 480);
  const space = makeSpace({
    kind: settings.projection,
    reach: R + 0.3,
    unit: iso ? 34 : 38,
    x: (width - probe.plane.rect.w) / 2,
    y: 0,
  });
  const pl = space.plane;
  const x0 = 16;
  const shapes: Shape[] = [];
  drawAxes3(shapes, space, { id: 'ax', reach: 3.4, floor: 3 });
  const def = SHAPES[settings.shape] ?? SHAPES.cube;

  const edges = (id: string, pts: Vec3[], role?: MarkRole, dashed?: boolean, opacity?: number) => {
    for (const [i, j] of def.edges)
      drawSegment3(shapes, space, {
        id: `${id}-${i}-${j}`,
        a: pts[i]!,
        b: pts[j]!,
        role,
        dashed,
        opacity,
      });
  };

  // Where the shape started, faint.
  edges('base', def.pts, undefined, true, 0.35);

  // A vector's label sits past its tip by half its own width and a gap, so the arrowhead stays
  // clear (the default offset suits one-letter labels).
  const past = (to: Vec3, label: string) => {
    const a = pl.at(project(O, space.kind));
    const b = pl.at(project(to, space.kind));
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const k = textW(label, 14) / 2 + 9;
    return { dx: ((b.x - a.x) / d) * k, dy: ((b.y - a.y) / d) * k + 5 };
  };

  // Everything applied so far: where M sends e1, e2, e3.
  (['m1', 'm2', 'm3'] as const).forEach((id, j) =>
    drawVector3(shapes, space, {
      id,
      from: O,
      to: column3(s.m, j),
      role: roles.get(id),
      label: `Me${'₁₂₃'[j]}`,
      ...past(column3(s.m, j), `Me${'₁₂₃'[j]}`),
      size: 14,
      opacity: roles.has(id) ? 1 : 0.75,
    }),
  );

  // The operation's own matrix acting on e1, e2, e3.
  if (extra.basis && extra.op) {
    const m = extra.op.m;
    (['b1', 'b2', 'b3'] as const).forEach((id, j) =>
      drawVector3(shapes, space, {
        id,
        from: O,
        to: column3(m, j),
        role: 'active',
        label: `${extra.op!.name}e${'₁₂₃'[j]}`,
        ...past(column3(m, j), `${extra.op!.name}e${'₁₂₃'[j]}`),
        size: 14,
      }),
    );
  }

  if (extra.compare) {
    edges('xy-e', extra.compare.xy, 'active', true);
    if (extra.compare.yx.length) edges('yx-e', extra.compare.yx, 'error', true);
  }

  const role = roles.get('sh');
  edges('sh', s.pts, role === 'error' ? 'error' : role ? 'active' : undefined);
  s.pts.forEach((p, i) =>
    drawPoint3(shapes, space, {
      id: `pt-${i}`,
      at: p,
      r: i === def.a ? 5 : 3,
      role: i === def.a ? 'found' : undefined,
    }),
  );
  const a = space.at(s.pts[def.a]!);
  shapes.push(
    text('sh', { x: a.x + 8, y: a.y - 8 }, 'A', { size: 14, bold: true, role: role ?? 'found' }),
  );

  const below = pl.rect.y + pl.rect.h;
  // What goes under the drawing: the comparison's legend, the matrices and the convention.
  const panel: Shape[] = [];
  if (extra.compare) {
    panel.push(
      text('xy', { x: x0, y: below + 4 }, 'dashed blue: about x, then about y', {
        size: 14,
        bold: true,
        role: roles.get('xy') ?? 'active',
      }),
    );
    if (extra.compare.yx.length)
      panel.push(
        text('yx', { x: x0, y: below + 22 }, 'dashed red: about y, then about x', {
          size: 14,
          bold: true,
          role: roles.get('yx') ?? 'error',
        }),
      );
  }

  // Matrices under the drawing: the running total M, then the operation's matrix.
  const y0 = below + 38;
  const rowH = 3 * 22 + 4;
  const transpose = settings.convention === 'row';
  let x = x0;
  let used = 1;
  let y = y0;
  let right = width;
  const place = (id: string, name: string, m: Mat3, mRole?: MarkRole, nameRole?: MarkRole) => {
    const rows = mat3Rows(m, transpose);
    const nameW = textW(`${name} =`, 15) + 6;
    const est =
      nameW +
      [0, 1, 2]
        .map((j) => Math.max(24, ...rows.map((r) => textW(r[j]!, 14))) + 14)
        .reduce((p, q) => p + q, 0) +
      10;
    if (x > x0 && x + est > width - 4) {
      x = x0;
      used++;
      y += rowH + 16;
    }
    panel.push(
      text(`${id}-name`, { x, y: y + rowH / 2 + 5 }, `${name} =`, {
        size: 15,
        mono: true,
        role: nameRole,
      }),
    );
    const b = drawMatrix(panel, { id, x: x + nameW, y, rows, role: mRole });
    right = Math.max(right, b.x + b.w + 12);
    x = b.x + b.w + 22;
  };
  place('mt', 'M', s.m);
  if (extra.op) place('op', extra.op.name, extra.op.m, 'active', 'active');
  // Room for the rows this setting usually needs, so the framing stays still.
  const yb = y0 + Math.max(used, narrow ? 2 : 1) * (rowH + 16) + 8;
  panel.push(
    text(
      'conv',
      { x: x0, y: yb },
      `${transpose ? "row vectors: p' = p M" : "column vectors: p' = M p"} · ${iso ? 'isometric' : 'oblique'} view`,
      { size: 14 },
    ),
  );

  const usual = { x: 0, y: 0, w: right, h: yb + 14 };
  const main = { x: pl.rect.x, y: 0, w: pl.rect.w, h: below + 8 };
  const panelBox = { x: x0, y: below - 10, w: right - 12 - x0, h: yb + 14 - below };
  const at = panelPlace(narrow ? undefined : stage, usual, main, panelBox);
  shapes.push(...translate(panel, at.dx, at.dy));
  return { shapes, bounds: at.bounds, label: describe(s) };
}
