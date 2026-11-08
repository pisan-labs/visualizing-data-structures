import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/calls';
import type { Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  asPart,
  box,
  drawTable,
  dropPart,
  mid,
  monoW,
  part,
  sideParts,
  stackParts,
  txt,
  type Col,
  type Part,
  type TableCell,
} from '../_numbers/draw';
import { bitId, describe, naive, type PowSettings, type PowState } from './model';

const SIZE = 16;
const ROW_H = 28;
const BIT = 34;

/** The exponent's bits as a row of boxes, highest first, with each position under its box. */
export function bitsPart(s: PowState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const k = s.bits.length - 1;
  const lx = 0;
  shapes.push(txt('bits-label', lx, 24, 'b =', SIZE, { cls: 'label' }));
  const x0 = 44;
  s.bits.forEach((bit, j) => {
    const i = k - j;
    const x = x0 + j * BIT;
    const role = roles.get(bitId(i)) ?? (s.at === i ? 'active' : undefined);
    shapes.push(box(bitId(i), x, 4, BIT - 4, 32, { role }));
    shapes.push(
      txt(`${bitId(i)}-t`, x + (BIT - 4) / 2, mid(4, 32, 20), String(bit), 20, {
        anchor: 'middle',
        weight: 'bold',
        role,
      }),
    );
    shapes.push(
      txt(`${bitId(i)}-i`, x + (BIT - 4) / 2, 54, String(i), 15, {
        anchor: 'middle',
        cls: 'index',
      }),
    );
  });
  const w = x0 + Math.max(4, s.bits.length) * BIT;
  return { shapes, w, h: 60 };
}

/** Bars comparing the multiplications used so far with the naive b − 1. */
export function barsPart(s: PowState, roles: ReadonlyMap<string, MarkRole>): Part {
  const shapes: Shape[] = [];
  const used = s.squarings + s.multiplies;
  const nv = naive(s.b);
  const max = Math.max(1, nv, used);
  const W = 200;
  shapes.push(txt('cmp-title', 0, 16, 'multiplications', 15, { cls: 'label' }));
  const rows: [string, string, number, MarkRole | undefined][] = [
    ['cmp-used', 'square and multiply', used, s.done ? 'found' : 'active'],
    ['cmp-naive', 'naive: a·a·…·a', nv, undefined],
  ];
  rows.forEach(([id, label, n, role], r) => {
    const y = 30 + r * 52;
    shapes.push(txt(`${id}-label`, 0, y + 14, label, 14));
    const w = Math.max(n > 0 ? 3 : 1, (n / max) * W);
    shapes.push(box(id, 0, y + 22, w, 18, { r: 1, role: roles.get(id) ?? role }));
    shapes.push(txt(`${id}-n`, w + 6, y + 36, String(n), 15, { weight: 'bold' }));
  });
  return { shapes, w: W + 50, h: 30 + 2 * 52 };
}

export function view(
  step: Step<PowState, undefined>,
  settings: PowSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const ltr = s.bits.length ? s.order === 'ltr' : settings.order === 'ltr';
  const cols: Col[] = ltr
    ? [
        { key: 'i', head: 'i', w: 40 },
        { key: 'bit', head: 'bit', w: 44 },
        { key: 'c', head: 'c', w: 66 },
        { key: 'sq', head: 'd·d mod m', w: 100 },
        { key: 'mul', head: 'd·a mod m', w: 100 },
      ]
    : [
        { key: 'i', head: 'i', w: 40 },
        { key: 'bit', head: 'bit', w: 44 },
        { key: 'pow', head: 'p = a^(2^i)', w: 120 },
        { key: 'mul', head: 'result', w: 90 },
      ];
  const cell = (v: number | null, more: Partial<TableCell> = {}): TableCell => ({
    text: v === null ? '' : String(v),
    ...more,
  });
  const rows = s.rows.map((r) => {
    const row: Record<string, TableCell> = {
      i: { text: String(r.i), bare: true },
      bit: cell(r.bit),
      mul: cell(r.multiplied, { bold: true }),
    };
    if (ltr) {
      row.c = cell(r.c);
      row.sq = cell(r.squared, { bold: true });
    } else row.pow = cell(r.power);
    if (r.bit === 0) row.mul = { text: '–', bare: true };
    return row;
  });
  const table = drawTable('mp', 0, 0, cols, rows, {
    size: SIZE,
    rowH: ROW_H,
    room: Math.max(3, s.bits.length),
    roles,
  });

  const title = s.bits.length
    ? `${s.a}^${s.b} mod ${s.m}${s.done ? ` = ${s.result}` : ''}`
    : 'a^b mod m';
  const head = part(
    [txt('mp-title', 0, 18, title, 17, { weight: 'bold', role: s.done ? 'found' : undefined })],
    {
      x: 0,
      y: 0,
      w: monoW(title, 17),
      h: 26,
    },
  );
  const bits = bitsPart(s, roles);
  const main = stackParts([head, bits, asPart({ shapes: table.shapes, bounds: table.bounds })], 8);
  const bars = barsPart(s, roles);
  const wide = sideParts([asPart(main), dropPart(bars, ZOOM_DROP + 8)], 36);
  const tall = stackParts([asPart(main), bars], 16);
  const place = pickLayout(stage, [wide, tall]);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}
