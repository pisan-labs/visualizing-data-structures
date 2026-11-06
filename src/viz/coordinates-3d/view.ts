import type { MarkRole, Step } from '../../engine/types';
import { drawMatrix, text, textW } from '../../layouts/plane';
import {
  add3,
  drawAxes3,
  drawPoint3,
  drawSegment3,
  drawVector3,
  fmtVec3,
  makeSpace,
  mul3,
  type Vec3,
} from '../../layouts/space';
import type { Scene, Shape } from '../../render/scene';
import {
  R,
  describe,
  frameMatrix,
  inverseMatrix,
  type Coord3Extra,
  type Coord3Settings,
  type Coord3State,
} from './model';

export function view(step: Step<Coord3State, Coord3Extra>, settings: Coord3Settings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const iso = settings.projection !== 'oblique';
  const space = makeSpace({
    kind: settings.projection,
    reach: R,
    unit: iso ? 25 : 32,
    x: 20,
    y: 0,
  });
  const pl = space.plane;
  const shapes: Shape[] = [];
  drawAxes3(shapes, space, { id: 'ax', reach: 3.4, floor: 3 });

  // Frame B's unit box (o + any mix of u, v, w with weights 0 or 1), faint and dashed.
  const corner = (a: number, b: number, c: number): Vec3 =>
    add3(add3(add3(s.o, mul3(s.u, a)), mul3(s.v, b)), mul3(s.w, c));
  const box: [number[], number[]][] = [
    [
      [1, 0, 0],
      [1, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 0, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 1],
      [1, 0, 1],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
    ],
    [
      [1, 1, 0],
      [1, 1, 1],
    ],
    [
      [1, 0, 1],
      [1, 1, 1],
    ],
    [
      [0, 1, 1],
      [1, 1, 1],
    ],
  ];
  box.forEach(([a, b], i) =>
    drawSegment3(shapes, space, {
      id: `box-${i}`,
      a: corner(a[0]!, a[1]!, a[2]!),
      b: corner(b[0]!, b[1]!, b[2]!),
      dashed: true,
      opacity: 0.35,
    }),
  );

  for (const [id, axis] of [
    ['u', s.u],
    ['v', s.v],
    ['w', s.w],
  ] as const) {
    drawVector3(shapes, space, {
      id,
      from: s.o,
      to: add3(s.o, axis),
      role: roles.get(id) ?? 'active',
      label: id,
    });
  }
  drawPoint3(shapes, space, {
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
    drawVector3(shapes, space, {
      id: 'd',
      from: s.o,
      to: s.p,
      role: roles.get('d') ?? 'active',
      dashed: true,
      label: 'd',
      size: 13,
    });
  }

  if (extra.walk && s.local) {
    const q = s.local;
    const a = add3(s.o, mul3(s.u, q.x));
    const b = add3(a, mul3(s.v, q.y));
    const c = add3(b, mul3(s.w, q.z));
    drawVector3(shapes, space, { id: 'pa', from: s.o, to: a, role: roles.get('pa') ?? 'active' });
    if (extra.walk >= 2)
      drawVector3(shapes, space, { id: 'pb', from: a, to: b, role: roles.get('pb') ?? 'active' });
    if (extra.walk >= 3)
      drawVector3(shapes, space, {
        id: 'pc',
        from: b,
        to: c,
        role: roles.get('pc') ?? 'active',
        dashed: true,
      });
  }

  if (s.p) {
    // A drop line to the floor helps the eye place the point in depth.
    drawSegment3(shapes, space, {
      id: 'p-drop',
      a: s.p,
      b: { ...s.p, z: 0 },
      dashed: true,
      opacity: 0.4,
    });
    drawPoint3(shapes, space, {
      id: 'p',
      at: s.p,
      r: 6,
      role: roles.get('p') ?? 'found',
      label: 'p',
      size: 15,
    });
  }

  // The matrices under the drawing.
  const homo = settings.form === 'homogeneous';
  const below = pl.rect.y + pl.rect.h;
  const y0 = below + 16;
  const rowH = (homo ? 4 : 3) * 22 + 4;
  const width = pl.rect.x + pl.rect.w + 20;
  let x = pl.rect.x;
  let y = y0;
  let right = width;
  const place = (id: string, name: string, rows: string[][], role?: MarkRole) => {
    const nameW = textW(`${name} =`, 15) + 6;
    const est =
      nameW +
      rows[0]!
        .map((_, j) => Math.max(24, ...rows.map((r) => textW(r[j]!, 14))) + 14)
        .reduce((p, q) => p + q, 0) +
      10;
    if (x > pl.rect.x && x + est > width - 4) {
      x = pl.rect.x;
      y += rowH + 16;
    }
    shapes.push(
      text(
        id === 'm' ? 'm-name' : id === 'mi' ? 'inv' : `${id}-name`,
        { x, y: y + rowH / 2 + 5 },
        `${name} =`,
        {
          size: 15,
          mono: true,
          role,
        },
      ),
    );
    const b = drawMatrix(shapes, { id, x: x + nameW, y, rows, role });
    right = Math.max(right, b.x + b.w + 12);
    x = b.x + b.w + 22;
  };
  place('m', homo ? 'T' : 'M', frameMatrix(s, settings));
  if (extra.inverse)
    place('mi', homo ? 'T⁻¹' : 'M⁻¹', inverseMatrix(s, settings), roles.get('inv'));
  // Room for two rows of matrices, so the framing stays still from step to step.
  const yb = y0 + 2 * rowH + 16 + 24;
  const [line1, line2] =
    s.p && s.local
      ? [`p = ${fmtVec3(s.p)} in the world`, `   = ${fmtVec3(s.local)} in B`]
      : s.local
        ? [`(a, b, c) = ${fmtVec3(s.local)} in B`, '']
        : ['world axes: solid', 'frame B: u, v, w and its unit box, dashed'];
  shapes.push(text('readout', { x: pl.rect.x, y: yb }, line1, { size: 14, bold: !!s.p }));
  shapes.push(text('readout2', { x: pl.rect.x, y: yb + 19 }, line2, { size: 14, bold: !!s.p }));

  return {
    shapes,
    bounds: { x: 0, y: 0, w: right, h: yb + 32 },
    label: describe(s),
  };
}
