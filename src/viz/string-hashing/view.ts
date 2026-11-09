/**
 * The string with its indices and letter values, then the prefix hashes H[k] and the powers
 * P[k] = b^k mod p. H[k] is the hash of the first k characters, so it sits on the boundary
 * before s[k], half a cell off the characters: H[0] before the first, H[n] after the last.
 * Hashing every window adds a lane of window hashes under each window's first character, with
 * equal hashes in the same group color and collisions dashed. The substrings being hashed or
 * compared are tinted, and the result goes in a box under the table.
 *
 * The table runs across on a wide stage (a laptop) and down on a tall one (a phone): lanes
 * become columns. pickLayout keeps the one drawn larger; with no stage, across.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { groupRole } from '../../engine/types';
import { describe, moduli, val, type HashSettings, type HashStep } from './model';

type LaneKind = 'index' | 'char' | 'value' | 'number';

interface Lane {
  id: string;
  name: string;
  kind: LaneKind;
  /** Boundary lanes (H, P, k) sit half a cell before their position. */
  stagger: boolean;
  /** Thickness across (row height) and down (column width). */
  across: number;
  down: number;
  gapBefore?: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Geometry {
  cell(lane: string, pos: number): Box;
  name(lane: string): { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  caption: { x: number; y: number };
  result: Box;
  bounds: Bounds;
  /** The box around s[from..to] over the char and value lanes. */
  span(from: number, to: number): Box;
}

const PAD = 12;
const CAPTION = 22;
const RESULT_H = 46;

/**
 * The lanes this state needs: the string always; the prefix table once its build has begun;
 * the window hashes once they have. `short` names fit a column (the table drawn down).
 */
function lanesFor(
  settings: HashSettings,
  table: boolean,
  k: number | null,
  short: boolean,
): Lane[] {
  const dbl = settings.hashes === 'double';
  const lanes: Lane[] = [
    { id: 'i', name: 'i', kind: 'index', stagger: false, across: 24, down: 30 },
    { id: 's', name: 's', kind: 'char', stagger: false, across: 46, down: 42 },
    { id: 'v', name: short ? 'val' : 'value', kind: 'value', stagger: false, across: 38, down: 40 },
  ];
  if (table) {
    lanes.push(
      {
        id: 'H',
        name: dbl ? 'H₁' : 'H',
        kind: 'number',
        stagger: true,
        across: 44,
        down: 58,
        gapBefore: 12,
      },
      { id: 'P', name: dbl ? 'P₁' : 'P', kind: 'number', stagger: true, across: 44, down: 58 },
    );
    if (dbl)
      lanes.push(
        { id: 'H2', name: 'H₂', kind: 'number', stagger: true, across: 44, down: 58 },
        { id: 'P2', name: 'P₂', kind: 'number', stagger: true, across: 44, down: 58 },
      );
    lanes.push({ id: 'k', name: 'k', kind: 'index', stagger: true, across: 24, down: 30 });
  }
  if (k !== null) {
    lanes.push({
      id: 'w',
      name: dbl ? 'w₁' : short ? 'win' : 'window',
      kind: 'number',
      stagger: false,
      across: 44,
      down: 58,
      gapBefore: 14,
    });
    if (dbl)
      lanes.push({ id: 'w2', name: 'w₂', kind: 'number', stagger: false, across: 44, down: 58 });
  }
  return lanes;
}

/** Lanes stacked top to bottom; positions run left to right. */
function across(n: number, lanes: Lane[]): Geometry {
  const pitch = Math.max(34, Math.min(52, Math.floor(640 / (n + 1))));
  const nameW = 78;
  const x0 = PAD + nameW + pitch / 2;
  const top = new Map<string, number>();
  let y = PAD + CAPTION + 14;
  for (const l of lanes) {
    y += l.gapBefore ?? 2;
    top.set(l.id, y);
    y += l.across;
  }
  const lane = (id: string) => lanes.find((l) => l.id === id)!;
  const cell = (id: string, pos: number): Box => {
    const l = lane(id);
    const x = x0 + (pos - (l.stagger ? 0.5 : 0)) * pitch;
    return { x: x + 1, y: top.get(id)!, w: pitch - 2, h: l.across - 4 };
  };
  const right = x0 + (n + 0.5) * pitch + PAD;
  const resultY = y + 14;
  return {
    cell,
    name: (id) => ({
      x: PAD + nameW - 8,
      y: top.get(id)! + lane(id).across / 2 + 4,
      anchor: 'end',
    }),
    caption: { x: PAD, y: PAD + CAPTION },
    result: {
      x: x0 - pitch / 2,
      y: resultY,
      w: Math.max(240, right - PAD - (x0 - pitch / 2)),
      h: RESULT_H,
    },
    bounds: { x: 0, y: 0, w: Math.max(right, x0 + 240), h: resultY + RESULT_H + PAD },
    span: (from, to) => {
      const a = cell('s', from);
      const b = cell('v', to);
      return { x: a.x - 3, y: a.y - 3, w: b.x + b.w - a.x + 6, h: b.y + b.h - a.y + 6 };
    },
  };
}

/** Lanes side by side as columns; positions run top to bottom. */
function down(n: number, lanes: Lane[]): Geometry {
  const pitch = Math.max(26, Math.min(40, Math.floor(470 / (n + 1))));
  const left = new Map<string, number>();
  let x = PAD;
  for (const l of lanes) {
    x += l.gapBefore ? l.gapBefore / 2 : 2;
    left.set(l.id, x);
    x += l.down;
  }
  const right = x + PAD;
  const nameY = PAD + CAPTION + 30;
  const y0 = nameY + 10 + pitch / 2;
  const lane = (id: string) => lanes.find((l) => l.id === id)!;
  const cell = (id: string, pos: number): Box => {
    const l = lane(id);
    const y = y0 + (pos - (l.stagger ? 0.5 : 0)) * pitch;
    return { x: left.get(id)! + 1, y: y + 1, w: l.down - 2, h: pitch - 2 };
  };
  const bottom = y0 + (n + 0.5) * pitch;
  const resultY = bottom + 14;
  const w = Math.max(right, 300);
  return {
    cell,
    name: (id) => ({ x: left.get(id)! + lane(id).down / 2, y: nameY, anchor: 'middle' }),
    caption: { x: PAD, y: PAD + CAPTION },
    result: { x: PAD, y: resultY, w: w - 2 * PAD, h: RESULT_H },
    bounds: { x: 0, y: 0, w, h: resultY + RESULT_H + PAD },
    span: (from, to) => {
      const a = cell('s', from);
      const b = cell('v', to);
      return { x: a.x - 3, y: a.y - 3, w: b.x + b.w - a.x + 6, h: b.y + b.h - a.y + 6 };
    },
  };
}

const FONT: Record<LaneKind, number> = { index: 17, char: 24, value: 18, number: 20 };

export function view(step: HashStep, settings: HashSettings, stage?: StageSize): Scene {
  const st = step.state;
  const extra = step.extra ?? {};
  const n = st.s.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const table = st.H[0]!.some((h) => h !== null);
  const k = st.win ? st.win.k : null;
  const wide = {
    g: across(n, lanesFor(settings, table, k, false)),
    lanes: lanesFor(settings, table, k, false),
  };
  const tall = {
    g: down(n, lanesFor(settings, table, k, true)),
    lanes: lanesFor(settings, table, k, true),
  };
  const pick = pickLayout(stage, [
    { ...wide, bounds: wide.g.bounds },
    { ...tall, bounds: tall.g.bounds },
  ]);
  const { g, lanes } = pick;
  const shapes: Shape[] = [];
  const ms = moduli(settings);

  shapes.push({
    kind: 'text',
    id: 'caption',
    x: g.caption.x,
    y: g.caption.y,
    text: `b = ${settings.b}, p = ${settings.p}${ms.length > 1 ? `, p₂ = ${settings.p2}` : ''}; a = 1, …, z = 26`,
    size: 20,
    anchor: 'start',
    cls: 'label',
  });
  for (const l of lanes) {
    const at = g.name(l.id);
    shapes.push({
      kind: 'text',
      id: `name-${l.id}`,
      ...at,
      text: l.name,
      size: l.kind === 'index' ? 17 : 20,
      mono: true,
      weight: l.kind === 'index' ? 'normal' : 'bold',
      cls: 'label',
    });
  }

  const put = (
    lane: Lane,
    pos: number,
    text: string,
    id: string,
    role?: MarkRole,
    cls?: string,
  ) => {
    const box = g.cell(lane.id, pos);
    const r = roles.get(id) ?? role;
    if (lane.kind !== 'index')
      shapes.push({
        kind: 'rect',
        id,
        ...box,
        r: 3,
        cls: cls ?? (text ? 'cell live' : 'cell'),
        role: r,
      });
    if (!text) return;
    const fit = Math.floor((box.w - 6) / (Math.max(1, text.length) * 0.6));
    const size = Math.min(FONT[lane.kind], lane.kind === 'index' ? 99 : fit);
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: box.x + box.w / 2,
      y: box.y + box.h / 2 + size * 0.36,
      text,
      size,
      anchor: 'middle',
      mono: true,
      weight: lane.kind === 'char' ? 'bold' : 'normal',
      cls: lane.kind === 'index' ? 'index' : undefined,
      role: lane.kind === 'index' ? undefined : r,
    });
  };

  const lane = (id: string) => lanes.find((l) => l.id === id)!;
  for (let i = 0; i < n; i++) {
    put(lane('i'), i, String(i), `i-${i}`);
    put(lane('s'), i, st.s[i]!, `s-${i}`);
    put(lane('v'), i, String(val(st.s[i]!)), `v-${i}`);
  }
  const tables: [string, (number | null)[] | undefined][] = [
    ['H', st.H[0]],
    ['P', st.P[0]],
    ...(ms.length > 1
      ? ([
          ['H2', st.H[1]],
          ['P2', st.P[1]],
        ] as [string, (number | null)[] | undefined][])
      : []),
  ];
  if (table)
    for (let k = 0; k <= n; k++) {
      for (const [id, xs] of tables) {
        const v = xs?.[k];
        put(lane(id), k, v === null || v === undefined ? '' : String(v), `${id}-${k}`);
      }
      put(lane('k'), k, String(k), `k-${k}`);
    }

  if (st.win) {
    const { h } = st.win;
    const k = st.win.k;
    const count = n - k + 1;
    // Group equal hashes (on every modulus): a color per group, dashed where strings differ.
    const key = (w: number) => h.map((xs) => xs[w]).join(',');
    const groups = new Map<string, number[]>();
    for (let w = 0; w < count; w++)
      if (h[0]![w] !== null) groups.set(key(w), [...(groups.get(key(w)) ?? []), w]);
    const color = new Map<number, MarkRole>();
    const dashed = new Set<number>();
    let gk = 0;
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      gk++;
      const words = new Set(members.map((w) => st.s.slice(w, w + k)));
      for (const w of members) {
        color.set(w, groupRole(gk));
        if (words.size > 1) dashed.add(w);
      }
    }
    for (let w = 0; w < count; w++) {
      ['w', 'w2'].slice(0, ms.length).forEach((id, t) => {
        const v = h[t]?.[w];
        const text = v === null || v === undefined ? '' : String(v);
        put(
          lane(id),
          w,
          text,
          t === 0 ? `w-${w}` : `w2-${w}`,
          color.get(w),
          text ? (dashed.has(w) ? 'cell live ghost' : 'cell live') : 'cell',
        );
      });
    }
  }

  const spanRole: Record<string, MarkRole> = { 'span-1': 'active', 'span-2': 'visit' };
  for (const sp of extra.spans ?? []) {
    const box = g.span(sp.from, sp.to);
    const role = roles.get(sp.id) ?? spanRole[sp.id]!;
    shapes.push({
      kind: 'polygon',
      id: sp.id,
      points: [
        { x: box.x, y: box.y },
        { x: box.x + box.w, y: box.y },
        { x: box.x + box.w, y: box.y + box.h },
        { x: box.x, y: box.y + box.h },
      ],
      role,
      z: 1.5,
    });
    shapes.push({
      kind: 'rect',
      id: `${sp.id}-box`,
      ...box,
      r: 5,
      cls: 'ghost',
      role,
      z: 1.6,
    });
  }

  if (extra.result) {
    const box = g.result;
    const role = roles.get('result') ?? extra.result.role;
    shapes.push({ kind: 'rect', id: 'result', ...box, r: 8, cls: 'cell live', role });
    const size = Math.min(22, Math.floor((box.w - 16) / (extra.result.text.length * 0.6)));
    shapes.push({
      kind: 'text',
      id: 'result-t',
      x: box.x + box.w / 2,
      y: box.y + box.h / 2 + size * 0.36,
      text: extra.result.text,
      size,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role,
    });
  }

  return { shapes, bounds: g.bounds, label: label(step) };
}

function label(step: HashStep): string {
  const e = step.extra ?? {};
  const parts = [describe(step.state)];
  for (const sp of e.spans ?? [])
    parts.push(`Substring s[${sp.from}..${sp.to}] = ${step.state.s.slice(sp.from, sp.to + 1)}.`);
  if (e.result) parts.push(`Result: ${e.result.text}.`);
  return parts.join(' ');
}
