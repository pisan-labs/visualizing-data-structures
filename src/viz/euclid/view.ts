import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { padBounds } from '../../layouts/calls';
import type { Scene } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  dropPart,
  drawLines,
  drawTable,
  part,
  sideParts,
  stackParts,
  txt,
  type Col,
  type TableCell,
} from '../_numbers/draw';
import { describe, fib, lameBound, lameK, type EuclidSettings, type EuState } from './model';

const SIZE = 16;
const ROW_H = 28;
const NOTE = 15;

const n = (v: number | null) => (v === null ? '' : String(v).replace('-', '−'));

export function view(
  step: Step<EuState, undefined>,
  settings: EuclidSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const ext = s.kind ? s.extended : settings.version === 'extended';
  const cols: Col[] = [
    { key: 'k', head: 'call', w: 50 },
    { key: 'a', head: 'a', w: 62 },
    { key: 'b', head: 'b', w: 62 },
    { key: 'q', head: '⌊a/b⌋', w: 62 },
    { key: 'r', head: 'a mod b', w: 76 },
  ];
  if (ext) cols.push({ key: 'x', head: 'x', w: 66 }, { key: 'y', head: 'y', w: 66 });

  const tableX = 0;
  const tableY = 0;
  // Where a cell's center will be, to slide a value from one row into the next.
  const probe = drawTable('eu', tableX, tableY, cols, [], {
    size: SIZE,
    rowH: ROW_H,
    room: 0,
    roles,
  });
  const rows = s.rows.map((r, i) => {
    const cell = (text: string, more: Partial<TableCell> = {}): TableCell => ({ text, ...more });
    const row: Record<string, TableCell> = {
      k: cell(String(i + 1), { bare: true }),
      a: cell(n(r.a), i > 0 ? { from: probe.at(i - 1, 'b') } : {}),
      b: cell(n(r.b), i > 0 ? { from: probe.at(i - 1, 'r') } : {}),
      q: cell(r.b === 0 ? '–' : n(r.q)),
      r: cell(r.b === 0 ? '–' : n(r.r)),
    };
    if (ext) {
      row.x = cell(n(r.x), { bold: true });
      row.y = cell(n(r.y), { bold: true });
    }
    return row;
  });
  const table = drawTable('eu', tableX, tableY, cols, rows, {
    size: SIZE,
    rowH: ROW_H,
    room: Math.max(3, s.total),
    roles,
  });

  const title = !s.kind
    ? ext
      ? 'extended Euclid: (d, x, y)'
      : 'Euclid: gcd(a, b)'
    : s.kind === 'inverse'
      ? `inverse of ${s.a0} mod ${s.b0}`
      : `${ext ? 'extEuclid' : 'euclid'}(${s.a0}, ${s.b0})`;
  const head = part([txt('eu-title', 0, 18, title, SIZE, { weight: 'bold' })], {
    x: 0,
    y: 0,
    w: title.length * SIZE * 0.6,
    h: 26,
  });

  // Notes: the result, the identity, and how the number of calls compares with Lamé's bound.
  const notes: { text: string; role?: MarkRole; bold?: boolean }[] = [];
  if (s.kind) {
    const top = s.rows[0]!;
    const k = Math.max(0, s.rows.length - 1);
    if (s.d !== null)
      notes.push({ text: `gcd = ${s.d}`, bold: true, role: s.done ? 'found' : undefined });
    else notes.push({ text: 'gcd = ?' });
    if (ext && top.x !== null)
      notes.push({ text: `${s.a0}·${par(top.x)} + ${s.b0}·${par(top.y!)} = ${s.d}` });
    if (s.kind === 'inverse' && s.done)
      notes.push(
        s.inverse === null
          ? { text: `no inverse: gcd ≠ 1`, role: 'error' }
          : { text: `${s.a0}⁻¹ ≡ ${s.inverse} (mod ${s.b0})`, role: 'found', bold: true },
      );
    notes.push({ text: `calls: ${k} of at most ${lameBound(s.a0, s.b0)}` });
    const small = Math.min(s.a0, s.b0);
    if (small > 0) {
      const K = lameK(small);
      notes.push({
        text: `Lamé: F(${K + 1}) = ${fib(K + 1)} ≤ ${small} < F(${K + 2}) = ${fib(K + 2)}`,
      });
    }
  } else {
    notes.push({ text: 'gcd = ?' });
  }
  const lines = drawLines('eu-note', 0, 0, notes, NOTE, { room: 5 });
  const notePart = part(lines.shapes, lines.bounds);
  const tablePart = part(table.shapes, table.bounds);

  const left = stackParts([head, tablePart], 6);
  const wide = sideParts([part(left.shapes, left.bounds), dropPart(notePart, ZOOM_DROP + 8)], 28);
  const tall = stackParts([head, tablePart, notePart], 12);
  const place = pickLayout(stage, [wide, tall]);
  return { shapes: place.shapes, bounds: padBounds(place.bounds, 12), label: describe(s) };
}

const par = (v: number) => (v < 0 ? `(${n(v)})` : n(v));
