/**
 * Two pictures. While transforming: the rotations as a matrix, one row per rotation (rows belong
 * to their rotation, so they slide into sorted order), with F and L tinted, the start of each
 * rotation on the right, and L as it is read, beside or under the matrix. While inverting: F,
 * a column of dots for the middle nobody knows, and L, each character numbered by its copy; the
 * LF arrow from L[r] to the same copy in F; and the text, filled in from the right.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { padBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  cellId,
  describe,
  fId,
  lId,
  lOutId,
  outId,
  ranks,
  rowId,
  type BwtExtra,
  type BwtSettings,
  type BwtState,
} from './model';

const P = 34;
const CH = 32;
const LEFT = 40;
const TOP = 34;
const CHAR = 20;

type Roles = ReadonlyMap<string, MarkRole>;

function cell(
  shapes: Shape[],
  id: string,
  x: number,
  y: number,
  ch: string,
  roles: Roles,
  o: { cls?: string; role?: MarkRole; opacity?: number } = {},
) {
  const role = roles.get(id) ?? o.role;
  shapes.push({
    kind: 'rect',
    id,
    x,
    y,
    w: P,
    h: CH - 2,
    r: 2,
    cls: o.cls ?? 'cell live',
    role,
    opacity: o.opacity,
  });
  if (ch)
    shapes.push({
      kind: 'text',
      id: `${id}-c`,
      x: x + P / 2,
      y: y + CH / 2 + 6,
      text: ch,
      size: CHAR,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`${id}-c`) ?? role,
      opacity: o.opacity,
    });
}

const label = (
  id: string,
  x: number,
  y: number,
  text: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape => ({ kind: 'text', id, x, y, text, size: 16, mono: true, cls: 'label', ...o });

const tint = (id: string, x: number, y: number, w: number, h: number, role: MarkRole): Shape => ({
  kind: 'polygon',
  id,
  points: [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ],
  role,
  z: 1.2,
});

interface Part {
  shapes: Shape[];
  bounds: Bounds;
}

/** A labeled row of cells: L as it is read, or the text being recovered. */
function cellRow(
  name: string,
  id: (j: number) => string,
  chars: (string | null)[],
  roles: Roles,
  note?: string,
): Part {
  const shapes: Shape[] = [];
  shapes.push(
    label(`${name}-name`, LEFT - 8, 20 + CH / 2 + 6, name, {
      anchor: 'end',
      size: 18,
      weight: 'bold',
    }),
  );
  chars.forEach((c, j) =>
    cell(shapes, id(j), LEFT + j * P, 20, c ?? '', roles, c === null ? { cls: 'cell' } : {}),
  );
  chars.forEach((_, j) =>
    shapes.push(
      label(`${name}-i${j}`, LEFT + j * P + P / 2, 14, String(j), {
        anchor: 'middle',
        size: 14,
        cls: 'index',
      }),
    ),
  );
  let h = 20 + CH;
  if (note) {
    shapes.push(label(`${name}-note`, LEFT, 20 + CH + 26, note, { size: 18 }));
    h += 32;
  }
  return { shapes, bounds: { x: 0, y: 0, w: LEFT + chars.length * P, h } };
}

function matrix(st: BwtState, roles: Roles): Part {
  const n = st.s.length;
  const shapes: Shape[] = [];
  const sorted = st.phase === 'sorted';
  const right = LEFT + n * P;
  shapes.push(label('t-name', LEFT, 20, sorted ? 'sorted rotations' : 'rotations', { size: 16 }));
  shapes.push(label('hd-start', right + 30, 20, 'start', { anchor: 'middle', size: 15 }));
  if (sorted) {
    const h = n * CH;
    shapes.push(tint('col-f', LEFT, TOP + 4, P, h - 2, 'visit'));
    shapes.push(tint('col-l', right - P, TOP + 4, P, h - 2, 'active'));
    shapes.push(
      label('hd-F', LEFT + P / 2, TOP + 4 + h + 20, 'F', {
        anchor: 'middle',
        size: 18,
        weight: 'bold',
      }),
    );
    shapes.push(
      label('hd-L', right - P / 2, TOP + 4 + h + 20, 'L', {
        anchor: 'middle',
        size: 18,
        weight: 'bold',
      }),
    );
  }
  st.order.forEach((k, r) => {
    const y = TOP + 4 + r * CH;
    for (let j = 0; j < n; j++)
      cell(shapes, cellId(k, j), LEFT + j * P, y, st.s[(k + j) % n]!, roles);
    shapes.push(
      label(rowId(k), right + 30, y + CH / 2 + 6, String(k), {
        anchor: 'middle',
        role: roles.get(rowId(k)),
        cls: 'index',
        size: 16,
      }),
    );
  });
  for (let r = 0; r < st.order.length; r++)
    shapes.push(
      label(`ri-${r}`, LEFT - 10, TOP + 4 + r * CH + CH / 2 + 6, String(r), {
        anchor: 'end',
        cls: 'index',
        size: 15,
      }),
    );
  return { shapes, bounds: { x: 0, y: 0, w: right + 52, h: TOP + 4 + n * CH + 30 } };
}

function inverse(st: BwtState, roles: Roles, extra: BwtExtra): Part {
  const inv = st.inv!;
  const n = inv.l.length;
  const shapes: Shape[] = [];
  const MID = Math.round(P * 1.4);
  const fx = LEFT;
  const lx = LEFT + P + MID;
  const rl = ranks(inv.l);
  const rf = ranks(inv.f);
  shapes.push(label('t-name', LEFT, 20, 'from L alone', { size: 16 }));
  shapes.push(
    label('hd-F', fx + P / 2, TOP + 4 + n * CH + 20, 'F', {
      anchor: 'middle',
      size: 18,
      weight: 'bold',
    }),
  );
  shapes.push(
    label('hd-L', lx + P / 2, TOP + 4 + n * CH + 20, 'L', {
      anchor: 'middle',
      size: 18,
      weight: 'bold',
    }),
  );
  const visited = new Set(inv.path);
  for (let r = 0; r < n; r++) {
    const y = TOP + 4 + r * CH;
    const here = inv.row === r;
    shapes.push(
      label(`ri-${r}`, LEFT - 10, y + CH / 2 + 6, String(r), {
        anchor: 'end',
        cls: 'index',
        size: 15,
      }),
    );
    cell(
      shapes,
      fId(r),
      fx,
      y,
      inv.sorted ? inv.f[r]! : '',
      roles,
      inv.sorted ? { role: here ? 'active' : undefined } : { cls: 'cell' },
    );
    shapes.push(
      label(`mid-${r}`, fx + P + MID / 2, y + CH / 2 + 6, '···', { anchor: 'middle', size: 16 }),
    );
    cell(shapes, lId(r), lx, y, inv.l[r]!, roles, {
      role: here ? 'active' : visited.has(r) && !inv.done ? 'visit' : undefined,
    });
    if (inv.ranked) {
      shapes.push(
        label(`${lId(r)}-k`, lx + P + 4, y + CH / 2 + 6, String(rl[r]), { size: 14, cls: 'index' }),
      );
      shapes.push(
        label(`${fId(r)}-k`, fx + P - 3, y + CH - 6, String(rf[r]), {
          size: 12,
          cls: 'index',
          anchor: 'end',
        }),
      );
    }
  }
  if (extra.lf) {
    const y1 = TOP + 4 + extra.lf.from * CH + CH / 2 - 1;
    const y2 = TOP + 4 + extra.lf.to * CH + CH / 2 - 1;
    shapes.push({
      kind: 'arrow',
      id: 'lf',
      x1: lx - 2,
      y1,
      x2: fx + P + 3,
      y2,
      role: 'active',
      z: 2.5,
    });
  }
  return { shapes, bounds: { x: 0, y: 0, w: lx + P + 26, h: TOP + 4 + n * CH + 30 } };
}

export function view(
  step: Step<BwtState, BwtExtra>,
  settings: BwtSettings,
  stage?: StageSize,
): Scene {
  const st = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = st.s.length;
  let main: Part;
  let panel: Part;
  if (st.phase === 'inverse' && st.inv) {
    main = inverse(st, roles, step.extra ?? {});
    const tl = st.text.length;
    const out = Array.from({ length: tl }, (_, j): string | null => {
      const k = j - (tl - st.inv!.out.length);
      return k >= 0 ? st.inv!.out[k]! : null;
    });
    panel = cellRow(
      'text',
      outId,
      out,
      roles,
      st.index !== null ? `index = ${st.index}` : undefined,
    );
  } else {
    main = matrix(st, roles);
    const l = Array.from({ length: n }, (_, j): string | null => st.l[j] ?? null);
    const note = settings.end === 'index' && st.index !== null ? `index = ${st.index}` : undefined;
    panel = cellRow('L', lOutId, l, roles, note ?? (settings.end === 'index' ? ' ' : undefined));
  }
  const gap = 30;
  const beside = {
    dx: main.bounds.w + gap,
    dy: TOP + 4,
    bounds: {
      x: 0,
      y: 0,
      w: main.bounds.w + gap + panel.bounds.w,
      h: Math.max(main.bounds.h, TOP + 4 + panel.bounds.h),
    },
  };
  const below = {
    dx: 0,
    dy: main.bounds.h + 16,
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(main.bounds.w, panel.bounds.w),
      h: main.bounds.h + 16 + panel.bounds.h,
    },
  };
  const pick = pickBest([beside, below], stage);
  const shapes = [...main.shapes, ...translate(panel.shapes, pick.dx, pick.dy)];
  return { shapes, bounds: padBounds(pick.bounds, 14), label: describe(st) };
}
