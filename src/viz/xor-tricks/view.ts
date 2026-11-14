/**
 * The drawing, top to bottom:
 *
 * - A, with its indices (src/layouts/columns.ts). For two singles, each value takes its
 *   group's color once it is placed.
 * - The bits panel (XOR): the place value of each bit over its column, then up to three rows of
 *   bits with a name on the left and the value in decimal on the right. One XOR is three rows:
 *   the target, the operand (its 1s marked) and the result, where a 1 that came in is new and a
 *   1 that cancelled is marked removed. The splitting bit of two singles is outlined in every row.
 * - The naive way: the hash map (or set) as a two-row table, keys in the order they first
 *   appeared.
 *
 * Each operation fixes its frame (how many rows, how many map slots), so the camera holds
 * still while it runs.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { groupRole } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { cellRow, columns, FONT, monoWidth, type Cols } from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import { bin, bitsFor, describe, type XExtra, type XSettings, type XStep } from './model';

const PAD = 10;
const BIT_PITCHES = [48, 44, 40];
const A_PITCHES = [64, 56, 50];
const ROW_H = 40;
const DEC = 20;
const WEIGHT = 18;

export function view(step: XStep, _settings: XSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const rowsN = e?.frame.rows ?? 0;
  const slots = e?.frame.map ?? 0;
  const bits = e?.bits ?? bitsFor(Math.max(n, ...s.a));
  const names = [...(e?.rows.map((r) => r.name) ?? []), 'A', 'key', e?.mapName ?? ''];
  const nameX = PAD + Math.max(...names.map((t) => monoWidth(t, FONT.name)));

  const top = stage?.strip ? 16 : 46;
  const groupsRow = e?.groups ? 26 : 0;
  const options = A_PITCHES.flatMap((ap) =>
    BIT_PITCHES.map((bp) => {
      const aW = nameX + 12 + n * ap;
      const bW = nameX + 12 + bits * bp + 12 + monoWidth('= 63', DEC);
      const mW = nameX + 12 + slots * ap;
      const w = Math.max(aW, rowsN ? bW : 0, mW) + PAD;
      const h =
        top +
        44 +
        FONT.index +
        8 +
        groupsRow +
        (rowsN ? 22 + WEIGHT + 6 + rowsN * ROW_H : 0) +
        (slots ? 44 + 88 : 0) +
        PAD +
        4;
      return { ap, bp, bounds: { x: 0, y: 0, w, h } };
    }),
  );
  const { ap, bp, bounds } = pickBest(options, stage);
  const shapes: Shape[] = [];

  const cols = columns(n, { pitch: ap, x0: nameX + 12 });
  const groups = e?.groups;
  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top,
    text: (i) => String(s.a[i]),
    roles,
    baseRole: (i) => {
      const g = groups?.[i];
      return g === null || g === undefined ? undefined : groupRole(g + 1);
    },
    name: 'A',
    nameX,
  });
  shapes.push(...a.shapes);
  let y = a.bottom;
  if (groups) {
    // The group in words too, so color is not the only cue.
    groups.forEach((g, i) => {
      if (g === null) return;
      shapes.push({
        kind: 'text',
        id: `grp-${i}`,
        x: cols.cx(i),
        y: y + 14,
        text: `g${g}`,
        size: 19,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: groupRole(g + 1),
      });
    });
    y += groupsRow;
  }

  if (e && rowsN) y = bitsPanel(shapes, e, roles, y, nameX, bp, bits);
  if (e && slots) mapTable(shapes, e, roles, y, nameX, ap);

  return { shapes, bounds, label: label(step) };
}

function bitsPanel(
  shapes: Shape[],
  e: XExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  nameX: number,
  pitch: number,
  bits: number,
): number {
  const cols: Cols = columns(bits, { pitch, x0: nameX + 12 });
  const wy = top + 22 + WEIGHT;
  for (let c = 0; c < bits; c++)
    shapes.push({
      kind: 'text',
      id: `w-${c}`,
      x: cols.cx(c),
      y: wy,
      text: String(1 << (bits - 1 - c)),
      size: WEIGHT,
      anchor: 'middle',
      mono: true,
      cls: 'index',
      role: e.low === c ? 'found' : undefined,
    });
  let y = wy + 6;
  for (let k = 0; k < e.frame.rows; k++) {
    const row = e.rows[k];
    const value = row?.value ?? null;
    const digits = value === null ? null : bin(value, bits);
    const r = cellRow(cols, {
      id: `bit${k}`,
      from: 0,
      to: bits - 1,
      top: y,
      h: ROW_H - 4,
      text: (c) => (digits ? digits[c] : null),
      cellClass: () => (digits ? 'live' : 'cell'),
      roles,
      baseRole: (c) => row?.roles?.[c] ?? (e.low === c && digits ? 'compare' : undefined),
      valueSize: 22,
      index: false,
      name: row?.name ?? '',
      nameX,
    });
    shapes.push(...r.shapes);
    if (value !== null)
      shapes.push({
        kind: 'text',
        id: `bit${k}-dec`,
        x: cols.x(bits) + 12,
        y: y + (ROW_H - 4) / 2 + DEC * 0.36,
        text: `= ${value}`,
        size: DEC,
        mono: true,
        weight: 'bold',
        role: roles.get(`bit${k}-dec`),
      });
    y += ROW_H;
  }
  return y;
}

function mapTable(
  shapes: Shape[],
  e: XExtra,
  roles: ReadonlyMap<string, MarkRole>,
  top: number,
  nameX: number,
  pitch: number,
) {
  const map = e.map ?? [];
  const cols = columns(Math.max(1, e.frame.map), { pitch, x0: nameX + 12 });
  shapes.push({
    kind: 'text',
    id: 'map-title',
    x: PAD,
    y: top + 30,
    text: e.mapName === 'seen' ? 'set seen' : 'map count: value → times seen',
    size: 20,
    mono: true,
    cls: 'label',
  });
  const keys = cellRow(cols, {
    id: 'mk',
    from: 0,
    to: map.length - 1,
    top: top + 44,
    text: (i) => String(map[i]!.key),
    index: false,
    roles,
    name: 'key',
    nameX,
  });
  shapes.push(...keys.shapes);
  if (e.mapName !== 'seen') {
    const vals = cellRow(cols, {
      id: 'mv',
      from: 0,
      to: map.length - 1,
      top: keys.bottom,
      text: (i) => String(map[i]!.value),
      index: false,
      roles,
      name: e.mapName ?? 'count',
      nameX,
    });
    shapes.push(...vals.shapes);
  } else {
    // A set has keys only; keep the value cells as ids for marks, drawn as ticks.
    const vals = cellRow(cols, {
      id: 'mv',
      from: 0,
      to: map.length - 1,
      top: keys.bottom,
      text: () => '✓',
      index: false,
      roles,
      name: 'in',
      nameX,
    });
    shapes.push(...vals.shapes);
  }
}

function label(step: XStep): string {
  const parts = [describe(step.state)];
  const e = step.extra;
  if (e) {
    for (const r of e.rows)
      if (r.value !== null)
        parts.push(`${r.name} = ${r.value} (${bin(r.value, e.bits)} in binary).`);
    if (e.map?.length)
      parts.push(
        e.mapName === 'seen'
          ? `The set holds ${e.map.map((m) => m.key).join(', ')}.`
          : `The counts: ${e.map.map((m) => `${m.key}: ${m.value}`).join(', ')}.`,
      );
    if (e.g) parts.push(`Group 0 so far: ${e.g[0]}; group 1 so far: ${e.g[1]}.`);
  }
  return parts.join(' ');
}
