/**
 * k-means: the plane with the points (circles, named A, B...) and the centres (squares c1, c2...,
 * each cluster in its own group color), a thin spoke from every point to its centre so the
 * clusters read without color, and a table of the points (coordinates, cluster, squared distance
 * to their centre; while k-means++ draws, D² and its running total) with the centres under it.
 * A laptop puts the table beside the plane; a phone puts it under.
 *
 * Shape ids, for marks: p-<id> a point, c-<id> a centre (1-based).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { text, type Plane } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { drawAxes, drawPt, field } from '../_retrieve/draw';
import { d2 } from '../_retrieve/points';
import {
  cId,
  cName,
  cRole,
  describe,
  MAX_K,
  num,
  ptId,
  type KmExtra,
  type KmSettings,
  type KmState,
} from './model';

type Roles = ReadonlyMap<string, MarkRole>;

interface Block {
  shapes: Shape[];
  bounds: Bounds;
}

const SIZE = 13;
const ROW_H = 20;
const COLS = [28, 64, 46, 52];
const CW = 14;

function drawPlane(s: KmState, roles: Roles, extra: KmExtra, unit: number): Block {
  const plane: Plane = field(unit, 30, 14);
  const shapes: Shape[] = [];
  drawAxes(shapes, plane, 'g');
  const probe = extra.probe;

  // Spokes: every assigned point to its centre.
  s.points.forEach((p, i) => {
    const a = s.assign[i];
    if (a === null || a === undefined || !s.centres[a]) return;
    const c = s.centres[a]!;
    const from = plane.at(p);
    const to = plane.at(c);
    shapes.push({
      kind: 'arrow',
      id: `sp-${p.id}`,
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y,
      head: 'none',
      role: cRole(c.id),
      opacity: probe?.point === i ? 0 : 0.4,
    });
  });

  // The point being assigned: a dashed line to every centre, the nearest solid.
  if (probe) {
    const p = s.points[probe.point]!;
    const from = plane.at(p);
    s.centres.forEach((c, j) => {
      const to = plane.at(c);
      shapes.push({
        kind: 'arrow',
        id: `pr-${c.id}`,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
        head: 'none',
        dashed: j !== probe.best,
        role: j === probe.best ? 'found' : 'compare',
        z: 0,
      });
    });
  }

  // Where moved centres came from.
  for (const m of extra.moved ?? []) {
    const c = s.centres.find((o) => o.id === m.id);
    if (!c) continue;
    const a = plane.at(m.from);
    const b = plane.at(c);
    shapes.push({
      kind: 'rect',
      id: `cg-${m.id}`,
      x: a.x - CW / 2,
      y: a.y - CW / 2,
      w: CW,
      h: CW,
      r: 2,
      cls: 'ghost',
    });
    if (Math.hypot(b.x - a.x, b.y - a.y) > CW)
      shapes.push({ kind: 'arrow', id: `cm-${m.id}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, role: 'active' });
  }

  s.points.forEach((p, i) => {
    const a = s.assign[i];
    const group = a === null || a === undefined || !s.centres[a] ? undefined : cRole(s.centres[a]!.id);
    drawPt(shapes, plane, {
      id: ptId(p),
      at: p,
      r: 6,
      role: roles.get(ptId(p)) ?? group,
      label: p.name,
    });
  });

  for (const c of s.centres) {
    const q = plane.at(c);
    const id = cId(c.id);
    shapes.push({
      kind: 'rect',
      id,
      x: q.x - CW / 2,
      y: q.y - CW / 2,
      w: CW,
      h: CW,
      r: 2,
      cls: 'live',
      role: roles.get(id) ?? cRole(c.id),
      z: 3,
    });
    shapes.push(
      text(`${id}-l`, { x: q.x + 10, y: q.y + 17 }, cName(c.id), { size: SIZE, bold: true, cls: '' }),
    );
  }

  const r = plane.rect;
  return { shapes, bounds: { x: 0, y: 0, w: r.x + r.w + 12, h: r.y + r.h + 24 } };
}

function drawTable(s: KmState, roles: Roles, extra: KmExtra): Block {
  const shapes: Shape[] = [];
  const xs = COLS.reduce<number[]>((acc, w, i) => [...acc, acc[i]! + w], [0]);
  const width = xs.at(-1)!;
  const draw = extra.draw?.mode === 'd2' ? extra.draw : undefined;
  const heads = ['pt', '(x, y)', draw ? 'D²' : 'c', draw ? 'Σ D²' : 'd²'];
  heads.forEach((h, c) =>
    shapes.push(
      text(`th-${c}`, { x: c === 0 ? 2 : xs[c]! + COLS[c]! / 2, y: 14 }, h, {
        size: SIZE,
        bold: true,
        anchor: c === 0 ? 'start' : 'middle',
      }),
    ),
  );
  const top = 20;
  s.points.forEach((p, i) => {
    const y = top + i * ROW_H;
    const role = roles.get(ptId(p));
    shapes.push({
      kind: 'rect',
      id: `tr-${p.id}`,
      x: 0,
      y,
      w: width,
      h: ROW_H,
      r: 2,
      cls: role ? 'live' : 'ghost',
      role,
      opacity: role && role !== 'stale' && role !== 'compare' ? 1 : 0,
    });
    const a = s.assign[i];
    const c = a === null || a === undefined ? undefined : s.centres[a];
    const cells = draw
      ? [String(draw.dd![i]), String(draw.cum![i])]
      : [c ? cName(c.id) : '', c ? num(d2(p, c)) : ''];
    const row = [p.name, `(${p.x}, ${p.y})`, ...cells];
    row.forEach((t, k) =>
      shapes.push(
        text(`td-${p.id}-${k}`, { x: k === 0 ? 4 : xs[k]! + COLS[k]! / 2, y: y + 15 }, t, {
          size: SIZE,
          bold: k === 0,
          anchor: k === 0 ? 'start' : 'middle',
          mono: k > 1,
          cls: '',
        }),
      ),
    );
  });
  const h = top + Math.max(1, s.points.length) * ROW_H;
  return { shapes, bounds: { x: 0, y: 0, w: width, h } };
}

/** The centres: a square in the cluster's color, its name, where it is and how many points. */
function drawCentres(s: KmState, roles: Roles): Block {
  const shapes: Shape[] = [];
  shapes.push(text('ch', { x: 0, y: 14 }, 'centres', { size: SIZE, bold: true }));
  const assigned = s.assign.some((a) => a !== null);
  s.centres.forEach((c, j) => {
    const y = 22 + j * ROW_H;
    const id = `cl-${c.id}`;
    shapes.push({
      kind: 'rect',
      id,
      x: 0,
      y: y + 3,
      w: CW,
      h: CW,
      r: 2,
      cls: 'live',
      role: roles.get(cId(c.id)) ?? cRole(c.id),
    });
    const n = s.assign.filter((a) => a === j).length;
    shapes.push(
      text(
        `${id}-t`,
        { x: CW + 6, y: y + 15 },
        `${cName(c.id)} (${num(c.x)}, ${num(c.y)})${assigned ? ` · ${n}` : ''}`,
        { size: SIZE, mono: true, cls: '' },
      ),
    );
  });
  return { shapes, bounds: { x: 0, y: 0, w: 150, h: 22 + MAX_K * ROW_H } };
}

export function view(step: Step<KmState, KmExtra>, _settings: KmSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const table = drawTable(s, roles, extra);
  const centres = drawCentres(s, roles);
  const rows = Math.max(1, s.points.length);
  const tableH = 20 + rows * ROW_H;

  const compose = (parts: [Block, number, number][]): Block => {
    const shapes = parts.flatMap(([b, dx, dy]) => translate(b.shapes, dx, dy));
    const x2 = Math.max(...parts.map(([b, dx]) => dx + b.bounds.w));
    const y2 = Math.max(...parts.map(([b, , dy]) => dy + b.bounds.h));
    return { shapes, bounds: { x: -8, y: -8, w: x2 + 16, h: y2 + 16 } };
  };

  const wide = (() => {
    const p = drawPlane(s, roles, extra, 30);
    const tx = p.bounds.w + 14;
    return compose([
      [p, 0, 0],
      [table, tx, 6],
      [centres, tx + table.bounds.w + 18, 6],
    ]);
  })();
  const wideStacked = (() => {
    const p = drawPlane(s, roles, extra, 30);
    const tx = p.bounds.w + 14;
    return compose([
      [p, 0, 0],
      [table, tx, 6],
      [centres, tx, 6 + tableH + 12],
    ]);
  })();
  const tall = (() => {
    const p = drawPlane(s, roles, extra, 30);
    const below = p.bounds.h + 4;
    return compose([
      [p, 0, 0],
      [table, 0, below],
      [centres, table.bounds.w + 16, below],
    ]);
  })();
  const best = pickLayout(stage, [wide, wideStacked, tall]);
  return { shapes: best.shapes, bounds: best.bounds, label: describe(s) };
}
