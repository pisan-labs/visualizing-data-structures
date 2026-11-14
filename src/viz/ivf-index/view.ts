/**
 * IVF: the plane with the points (circles A, B..., each in its list's group color), the list
 * centres (boxes c1, c2...), the borders of their Voronoi cells, and the query (a square). The
 * cells a search probes are tinted; at the end, so is the cell that hides a missed neighbour.
 * Points in lists the search skips are drawn faint. Beside the plane: the lists (each centre,
 * its d² to the query, and its points by name), and the search's top 3 next to brute force's.
 * A laptop puts the panels beside the plane; a phone puts them under it.
 *
 * Shape ids, for marks: p-<id> a point, c-<id> a centre (1-based), q the query.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { text, type Plane, type Vec } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { cRole } from '../k-means/model';
import { borders, cell } from '../_retrieve3/cells';
import { drawAxes, drawPt, field } from '../_retrieve/draw';
import { d2, MAX } from '../_retrieve/points';
import {
  cId,
  cName,
  describe,
  K,
  num,
  ptId,
  QUERY,
  type IvfExtra,
  type IvfSettings,
  type IvfState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const SIZE = 13;
const ROW_H = 18;
const BW = 28;
const BH = 20;
const CW = 14;
const BOX = { xmin: 0, xmax: MAX, ymin: 0, ymax: MAX };
const LISTS_W = 214;
const RESULT_COL = 88;

/** The list each point is in, or -1. */
const listOf = (s: IvfState) => {
  const out = s.points.map(() => -1);
  s.lists.forEach((l, j) => l.forEach((i) => (out[i] = j)));
  return out;
};

/** What the search knows on this step: the lists it probes, and the final answer. */
function searchInfo(s: IvfState, extra: IvfExtra) {
  const last = s.last;
  const probed = extra.probed ?? last?.probed;
  const q = extra.q ?? last?.q;
  const missed = last ? last.truth.filter((i) => !last.found.includes(i)) : [];
  return { last, probed, q, missed };
}

function line(id: string, a: Vec, b: Vec, o: Partial<Shape> = {}): Shape {
  return { kind: 'arrow', id, x1: a.x, y1: a.y, x2: b.x, y2: b.y, head: 'none', ...o } as Shape;
}

function drawPlane(s: IvfState, roles: Roles, extra: IvfExtra): Block {
  const plane: Plane = field(30, 30, 14);
  const shapes: Shape[] = [];
  drawAxes(shapes, plane, 'g');
  const { last, probed, q, missed } = searchInfo(s, extra);
  const where = listOf(s);
  const centres = s.centres;

  // Tinted cells: the lists searched, and at the end the lists that hid a true neighbour.
  const tint = new Map<number, MarkRole>();
  for (const j of probed ?? []) tint.set(j, 'found');
  for (const i of missed) if (where[i]! >= 0 && !tint.has(where[i]!)) tint.set(where[i]!, 'error');
  for (const [j, role] of tint) {
    const poly = cell(centres, j, BOX);
    if (poly.length >= 3)
      shapes.push({
        kind: 'polygon',
        id: `cell-${centres[j]!.id}`,
        points: poly.map((p) => plane.at(p)),
        role,
      });
  }
  for (const b of borders(centres, BOX))
    shapes.push(
      line(`vb-${centres[b.i]!.id}-${centres[b.j]!.id}`, plane.at(b.a), plane.at(b.b), {
        opacity: 0.75,
      }),
    );

  // Where moved centres came from, while k-means trains.
  for (const m of extra.moved ?? []) {
    const c = centres.find((o) => o.id === m.id);
    if (!c) continue;
    const a = plane.at(m.from);
    const b = plane.at(c);
    shapes.push({
      kind: 'rect',
      id: `cg-${m.id}`,
      x: a.x - BW / 2,
      y: a.y - BH / 2,
      w: BW,
      h: BH,
      r: 4,
      cls: 'ghost',
    });
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > BW) {
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const t = Math.min((BW / 2 + 2) / Math.abs(ux || 1e-9), (BH / 2 + 2) / Math.abs(uy || 1e-9));
      shapes.push({
        kind: 'arrow',
        id: `cm-${m.id}`,
        x1: a.x,
        y1: a.y,
        x2: b.x - ux * t,
        y2: b.y - uy * t,
        role: 'active',
      });
    }
  }

  // Lines from the query: to every centre while it picks lists, to the point being measured,
  // and at the end to each true neighbour it missed.
  if (q) {
    const qa = plane.at(q);
    if (extra.centreD && extra.scanning === undefined)
      centres.forEach((c, j) =>
        shapes.push(
          line(`qc-${c.id}`, qa, plane.at(c), {
            dashed: !probed?.includes(j),
            role: probed?.includes(j) ? 'found' : 'compare',
          }),
        ),
      );
    if (extra.seen !== undefined)
      shapes.push(line('qs', qa, plane.at(s.points[extra.seen]!), { role: 'active' }));
    if (last && !extra.q)
      for (const i of missed)
        shapes.push(line(`qm-${i}`, qa, plane.at(s.points[i]!), { role: 'error', dashed: true }));
  }

  const top = new Set((extra.top ?? []).map(([, i]) => i));
  // A label goes above right of its dot, unless a centre's box or the query is there.
  const boxes = [
    ...centres.map((c) => ({ at: plane.at(c), w: BW / 2 + 2, h: BH / 2 + 2 })),
    ...(q ? [{ at: plane.at(q), w: 9, h: 9 }] : []),
  ];
  const clear = (x: number, y: number) =>
    boxes.every(
      (b) => x + 9 < b.at.x - b.w || x > b.at.x + b.w || y < b.at.y - b.h || y - 11 > b.at.y + b.h,
    );
  const spot = (p: Vec) => {
    const a = plane.at(p);
    const tries: [number, number][] = [
      [7, -11],
      [-16, -11],
      [7, 18],
      [-16, 18],
    ];
    return tries.find(([dx, dy]) => clear(a.x + dx, a.y + dy)) ?? tries[0]!;
  };
  s.points.forEach((p, i) => {
    const j = where[i]!;
    const group = j >= 0 && centres[j] ? cRole(centres[j]!.id) : undefined;
    let base: MarkRole | undefined = group;
    if (last && !extra.q) {
      const f = last.found.includes(i);
      const t = last.truth.includes(i);
      base = f && t ? 'found' : t ? 'error' : f ? 'compare' : group;
    } else if (top.has(i)) base = 'found';
    const skipped = probed !== undefined && j >= 0 && !probed.includes(j) && base !== 'error';
    const [dx, dy] = spot(p);
    drawPt(shapes, plane, {
      id: ptId(p),
      at: p,
      r: 6,
      role: roles.get(ptId(p)) ?? base,
      label: p.name,
      opacity: skipped ? 0.45 : undefined,
      dx,
      dy,
    });
  });

  for (const c of centres) {
    const at = plane.at(c);
    const id = cId(c.id);
    shapes.push({
      kind: 'rect',
      id,
      x: at.x - BW / 2,
      y: at.y - BH / 2,
      w: BW,
      h: BH,
      r: 4,
      cls: 'live',
      role: roles.get(id) ?? cRole(c.id),
      z: 3,
    });
    shapes.push({
      ...text(`${id}-l`, { x: at.x, y: at.y + 5 }, cName(c.id), {
        size: SIZE,
        bold: true,
        anchor: 'middle',
        cls: '',
      }),
      z: 4,
    });
  }

  if (q) {
    const at = plane.at(q);
    const w = 12;
    shapes.push({
      kind: 'rect',
      id: QUERY,
      x: at.x - w / 2,
      y: at.y - w / 2,
      w,
      h: w,
      r: 1,
      cls: 'live',
      role: roles.get(QUERY) ?? 'active',
      z: 5,
    });
    shapes.push({
      ...text(`${QUERY}-l`, { x: at.x + 9, y: at.y + 16 }, 'q', {
        size: SIZE,
        bold: true,
        cls: '',
      }),
      z: 5,
    });
  }

  const r = plane.rect;
  return { shapes, bounds: { x: 0, y: 0, w: r.x + r.w + 12, h: r.y + r.h + 24 } };
}

/** The lists: a row per centre (its color, where it is, d² to the query) and its points. */
function drawLists(s: IvfState, roles: Roles, extra: IvfExtra): Block {
  const shapes: Shape[] = [];
  const { last, probed, missed } = searchInfo(s, extra);
  const centreD = extra.centreD ?? last?.centreD;
  shapes.push(text('ls-h', { x: 0, y: 14 }, 'lists', { size: SIZE, bold: true }));
  if (centreD)
    shapes.push(
      text('ls-hd', { x: LISTS_W - 4, y: 14 }, 'd² to q', {
        size: SIZE,
        anchor: 'end',
        bold: true,
      }),
    );
  const top = new Set((extra.top ?? []).map(([, i]) => i));
  const scanned = new Set(extra.scanned ?? []);
  const slots = Math.max(1, s.centres.length);
  s.centres.forEach((c, j) => {
    const y = 22 + j * (2 * ROW_H + 6);
    const on = probed?.includes(j);
    shapes.push({
      kind: 'rect',
      id: `ls-r-${c.id}`,
      x: -4,
      y,
      w: LISTS_W + 4,
      h: 2 * ROW_H + 4,
      r: 3,
      cls: on ? 'live' : 'ghost',
      role: on ? 'found' : undefined,
      opacity: on ? 1 : 0,
    });
    shapes.push({
      kind: 'rect',
      id: `ls-c-${c.id}`,
      x: 0,
      y: y + 4,
      w: CW,
      h: CW,
      r: 2,
      cls: 'live',
      role: roles.get(cId(c.id)) ?? cRole(c.id),
    });
    shapes.push(
      text(`ls-t-${c.id}`, { x: CW + 6, y: y + 16 }, `${cName(c.id)} (${num(c.x)}, ${num(c.y)})`, {
        size: SIZE,
        mono: true,
        cls: '',
      }),
    );
    if (centreD)
      shapes.push(
        text(`ls-d-${c.id}`, { x: LISTS_W - 4, y: y + 16 }, num(centreD[j]!), {
          size: SIZE,
          mono: true,
          anchor: 'end',
          cls: '',
        }),
      );
    const members = s.lists[j] ?? [];
    if (!members.length)
      shapes.push(
        text(`ls-e-${c.id}`, { x: CW + 6, y: y + 16 + ROW_H }, 'empty', {
          size: SIZE,
          role: 'stale',
        }),
      );
    members.forEach((i, k) => {
      const p = s.points[i]!;
      let role: MarkRole | undefined;
      if (last && !extra.q) {
        if (missed.includes(i)) role = 'error';
        else if (last.found.includes(i)) role = 'found';
        else if (!on) role = 'stale';
      } else if (extra.seen === i) role = 'active';
      else if (top.has(i)) role = 'found';
      else if (probed && !on) role = 'stale';
      else if (scanned.has(i)) role = undefined;
      shapes.push(
        text(`ls-p-${p.id}`, { x: CW + 6 + k * 16, y: y + 16 + ROW_H }, p.name, {
          size: SIZE,
          bold: true,
          mono: true,
          role,
          cls: role ? undefined : '',
        }),
      );
    });
  });
  const h = 22 + slots * (2 * ROW_H + 6);
  return { shapes, bounds: { x: 0, y: 0, w: LISTS_W, h } };
}

/** The search's top K so far; at the end, next to brute force's. */
function drawResult(s: IvfState, extra: IvfExtra): Block {
  const shapes: Shape[] = [];
  const { last } = searchInfo(s, extra);
  const nm = (i: number) => s.points[i]!.name;
  const col = (c: number, head: string, rows: [string, MarkRole | undefined][]) => {
    shapes.push(text(`rs-h${c}`, { x: c * RESULT_COL, y: 14 }, head, { size: SIZE, bold: true }));
    rows.forEach(([t, role], r) =>
      shapes.push(
        text(`rs-${c}-${r}`, { x: c * RESULT_COL, y: 34 + r * ROW_H }, t, {
          size: SIZE,
          mono: true,
          role,
          cls: role ? undefined : '',
        }),
      ),
    );
  };
  if (extra.top) {
    col(
      0,
      `top ${K} so far`,
      extra.top.map(([d, i]) => [`${nm(i)} ${num(d)}`, undefined]),
    );
  } else if (last) {
    const q = last.q;
    col(
      0,
      `IVF (${last.dists})`,
      last.found.map((i) => [
        `${nm(i)} ${num(d2(q, s.points[i]!))}`,
        last.truth.includes(i) ? undefined : 'compare',
      ]),
    );
    col(
      1,
      `exact (${s.points.length})`,
      last.truth.map((i) => [
        `${nm(i)} ${num(d2(q, s.points[i]!))}${last.found.includes(i) ? '' : ' ✗'}`,
        last.found.includes(i) ? undefined : 'error',
      ]),
    );
    const hit = last.found.filter((i) => last.truth.includes(i)).length;
    const total = Math.min(K, s.points.length);
    shapes.push(
      text(
        'rs-r',
        { x: 0, y: 34 + K * ROW_H + 8 },
        `recall ${hit}/${total}${hit === total ? ', exact' : ''}`,
        {
          size: SIZE,
          bold: true,
        },
      ),
    );
  }
  return { shapes, bounds: { x: 0, y: 0, w: 2 * RESULT_COL, h: 34 + K * ROW_H + 12 } };
}

export function view(
  step: Step<IvfState, IvfExtra>,
  _settings: IvfSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = drawPlane(s, roles, extra);
  const lists = drawLists(s, roles, extra);
  const result = drawResult(s, extra);

  const compose = (parts: [Block, number, number][]): Block => {
    const shapes = parts.flatMap(([b, dx, dy]) => translate(b.shapes, dx, dy));
    const x2 = Math.max(...parts.map(([b, dx]) => dx + b.bounds.w));
    const y2 = Math.max(...parts.map(([b, , dy]) => dy + b.bounds.h));
    return { shapes, bounds: { x: -8, y: -8, w: x2 + 16, h: y2 + 16 } };
  };
  // Below the stage's zoom buttons, which sit over the top right corner on a laptop.
  const ly = stage?.strip ? 8 : ZOOM_DROP + 14;
  const tx = plane.bounds.w + 14;
  const wide = compose([
    [plane, 0, 0],
    [lists, tx, ly],
    [result, tx + LISTS_W + 18, ly],
  ]);
  const below = plane.bounds.h + 4;
  const tall = compose([
    [plane, 0, 0],
    [lists, 4, below],
    [result, LISTS_W + 20, below],
  ]);
  const best = pickLayout(stage, [wide, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
