/**
 * Drawing for a circular array (queue and deque pages): the same array either as a ring, which
 * shows why the indices wrap, or as a row, which is how it sits in memory. Both draw the cells,
 * their indices, a front and a rear pointer, the wraparound (a seam on the ring, a return path
 * under the row), a value waiting to go in and a value coming out.
 */
import type { MarkRole, StageSize, Value } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';
import { ZOOM_BUTTONS, zoomCorner } from '../render/stage';

export interface CellValue {
  uid: number;
  value: Value;
}

export type CircularLayout = 'ring' | 'row';

export interface CircularDrawing {
  layout: CircularLayout;
  capacity: number;
  slots: (CellValue | null)[];
  /** Whether cell i is drawn as part of the structure (anything else is free or a leftover). */
  live(i: number): boolean;
  front: number;
  rear: number;
  /** More readouts, such as "count = 3": in the middle of the ring, or under the row. */
  readouts: { id: string; text: string }[];
  roles: Map<string, MarkRole>;
  /** A value waiting to be stored in cell `at`. */
  incoming?: { uid: number; value: Value; error?: boolean; at: number };
  /** A copy of a value on its way out of cell `from`. */
  out?: { value: Value; from: number; label: string };
  /** The screen the view draws for, if known: the row keeps clear of its zoom buttons. */
  stage?: StageSize;
}

/** Font size for a value inside a cell, by length. */
export const valueSize = (text: string) => (text.length <= 3 ? 22 : text.length <= 5 ? 17 : 14);

const LABEL = 15;
const BOX_W = 68;
const BOX_H = 40;

interface Point {
  x: number;
  y: number;
}

interface Box extends Point {
  w: number;
  h: number;
}

interface PointerGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tx: number;
  ty: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  head: boolean;
}

interface Geometry {
  cell(i: number): Box;
  index(i: number): Point;
  indexSize: number;
  /** Multiplier for label sizes, so a long row still has readable text on a phone. */
  font: number;
  pointer(i: number, which: 'front' | 'rear', text: string): PointerGeometry;
  /** Row labels carry their values ("front = 3"); ring labels stay short to fit side by side. */
  pointerText(which: 'front' | 'rear', value: number): string;
  readout(k: number): Point & { anchor: 'start' | 'middle' };
  inBox(at: number): Point;
  outBox(from: number): Point;
  wrap: Segment[];
  name?: Point & { anchor: 'start' | 'middle' | 'end' };
  bounds: Bounds;
}

/** Distance along the ray o + t*u at which it leaves the box (the ray starts outside or inside). */
function exitDistance(o: Point, u: Point, b: Box): number {
  let t = Infinity;
  if (Math.abs(u.x) > 1e-9) t = Math.min(t, Math.max((b.x - o.x) / u.x, (b.x + b.w - o.x) / u.x));
  if (Math.abs(u.y) > 1e-9) t = Math.min(t, Math.max((b.y - o.y) / u.y, (b.y + b.h - o.y) / u.y));
  return t;
}

const textWidth = (text: string, size: number) => text.length * size * 0.6;

/** A value's font size, scaled up for long rows but never wider than the space it sits in. */
const fit = (text: string, scale: number, room: number) =>
  Math.min(valueSize(text) * scale, (room - 8) / (0.6 * Math.max(1, text.length)));

/**
 * The ring: index 0 at the top, indices increasing clockwise, index labels inside the ring,
 * pointers outside it. The middle holds the value going in or out, and the readouts.
 */
function ring(n: number): Geometry {
  const W = 58;
  const H = 44;
  const R = Math.max(120, 13 * n);
  const cx = R + 100;
  const cy = R + 96;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const cell = (i: number): Box => {
    const a = angle(i);
    return { x: cx + R * Math.cos(a) - W / 2, y: cy + R * Math.sin(a) - H / 2, w: W, h: H };
  };
  const seam = angle(0) - Math.PI / n;
  const su = { x: Math.cos(seam), y: Math.sin(seam) };
  return {
    cell,
    index(i) {
      const a = angle(i);
      const u = { x: Math.cos(a), y: Math.sin(a) };
      const e = Math.min(
        Math.abs(u.x) > 1e-9 ? W / 2 / Math.abs(u.x) : Infinity,
        Math.abs(u.y) > 1e-9 ? H / 2 / Math.abs(u.y) : Infinity,
      );
      const d = R - e - 15;
      return { x: cx + d * u.x, y: cy + d * u.y + 5 };
    },
    indexSize: 15,
    font: 1,
    pointer(i, which, text) {
      const a = angle(i);
      const u = { x: Math.cos(a), y: Math.sin(a) };
      const t = { x: -u.y, y: u.x };
      // Front sits on the counterclockwise side of its cell and rear on the clockwise side, each
      // with its label further out on its own side, so the two never cover each other.
      const s = which === 'front' ? -1 : 1;
      const off = s * (8 + 15 * Math.abs(u.y));
      const o = { x: cx + off * t.x, y: cy + off * t.y };
      const exit = exitDistance(o, u, cell(i));
      const tail = exit + 34;
      const radial = 4 + 6 * Math.abs(u.y);
      const side = s * (Math.abs(u.y) * (textWidth(text, LABEL) / 2 + 3) + Math.abs(u.x) * 12);
      const tx = o.x + (tail + radial) * u.x + side * t.x;
      const ty = o.y + (tail + radial) * u.y + side * t.y;
      return {
        x1: o.x + tail * u.x,
        y1: o.y + tail * u.y,
        x2: o.x + (exit + 7) * u.x,
        y2: o.y + (exit + 7) * u.y,
        tx,
        ty: ty + 5,
      };
    },
    pointerText: (which) => which,
    readout: (k) => ({ x: cx, y: cy + 45 + k * 21, anchor: 'middle' }),
    inBox: () => ({ x: cx, y: cy - 6 }),
    outBox: () => ({ x: cx, y: cy - 6 }),
    wrap: [
      {
        x1: cx + (R - 18) * su.x,
        y1: cy + (R - 18) * su.y,
        x2: cx + (R + 18) * su.x,
        y2: cy + (R + 18) * su.y,
        head: false,
      },
    ],
    bounds: { x: 0, y: 0, w: 2 * cx, h: cy + R + 80 },
  };
}

/**
 * How much lower the row starts so the boxes above it (a value going in or out, with its label)
 * clear the stage's zoom buttons. With the row at its highest, the labels' tops are `top` units
 * from the drawing's top and the boxes reach `reach` units from its left; the drawing is
 * `width` by `height`. Nothing when the buttons have a strip of their own (a phone) or the row
 * is drawn narrower than the stage, clear of them. With no stage, enough for a row as wide as a
 * phone's drawing (362 px) under the buttons.
 */
function buttonsDrop(
  width: number,
  height: number,
  top: number,
  reach: number,
  stage?: StageSize,
): number {
  if (!stage) return Math.max(0, Math.ceil((ZOOM_BUTTONS.size * width) / 362) - 6);
  const corner = zoomCorner(stage);
  let drop = 0;
  for (let i = 0; corner && i < 4; i++) {
    const s = Math.min(stage.w / width, stage.h / (height + drop));
    const margin = Math.max(0, (stage.w - width * s) / 2);
    if (margin + reach * s <= stage.w - corner.w || (top + drop) * s >= corner.h - 0.5) break;
    drop = Math.ceil(corner.h / s - top);
  }
  return drop;
}

function row(n: number, readouts: number, stage?: StageSize): Geometry {
  const x0 = 46;
  const w = 62;
  const h = 50;
  const width = x0 + n * w + 46;
  // Past 8 cells a phone shrinks the row below readable sizes, so the labels grow with it.
  const font = Math.max(1, width / 588);
  const height = 156 + h + 116 + (readouts ? 52 : 18);
  // Keep the value boxes (and their labels) below the zoom buttons.
  const y0 = 156 + buttonsDrop(width, height, 24 - 14 * font, width - 43, stage);
  const xOf = (i: number) => x0 + i * w;
  const right = xOf(n);
  const under = y0 + h + 116;
  const mid = y0 + h - 10;
  return {
    cell: (i) => ({ x: xOf(i), y: y0, w, h }),
    index: (i) => ({ x: xOf(i) + w / 2, y: y0 + h + 21 }),
    indexSize: 15,
    font,
    pointer(i, which, text) {
      const x = xOf(i) + w / 2;
      // Labels at either end stay inside the dashed return path.
      const half = textWidth(text, LABEL * font) / 2;
      const tx = Math.max(x0 - 16 + half, Math.min(right + 16 - half, x));
      return which === 'front'
        ? { x1: x, y1: y0 - 42, x2: x, y2: y0 - 6, tx, ty: y0 - 50 }
        : { x1: x, y1: y0 + h + 72, x2: x, y2: y0 + h + 30, tx, ty: y0 + h + 92 };
    },
    pointerText: (which, value) => `${which} = ${value}`,
    readout: (k) => ({ x: x0 + k * 170, y: under + 36, anchor: 'start' }),
    inBox: (at) => ({ x: xOf(at) + w / 2, y: y0 - 100 }),
    outBox: (from) => ({ x: xOf(from) + w / 2, y: y0 - 100 }),
    wrap: [
      { x1: right, y1: mid, x2: right + 24, y2: mid, head: false },
      { x1: right + 24, y1: mid, x2: right + 24, y2: under, head: false },
      { x1: right + 24, y1: under, x2: x0 - 24, y2: under, head: false },
      { x1: x0 - 24, y1: under, x2: x0 - 24, y2: mid, head: false },
      { x1: x0 - 24, y1: mid, x2: x0 - 4, y2: mid, head: true },
    ],
    name: { x: x0 - 10, y: y0 + 17, anchor: 'end' },
    bounds: { x: 0, y: 0, w: right + 46, h: under + (readouts ? 52 : 18) },
  };
}

/** Shapes for a circular array. Shape ids: cell-i, idx-i, v<uid>, front, rear, wrap, out... */
export function drawCircular(d: CircularDrawing): { shapes: Shape[]; bounds: Bounds } {
  const n = d.capacity;
  const g = d.layout === 'row' ? row(n, d.readouts.length, d.stage) : ring(n);
  const role = (id: string) => d.roles.get(id);
  const f = g.font;
  const shapes: Shape[] = [];

  // The wraparound sits underneath everything else.
  const wrapRole = role('wrap');
  g.wrap.forEach((s, k) => {
    shapes.push({
      kind: 'arrow',
      id: k === 0 ? 'wrap' : `wrap-${k + 1}`,
      x1: s.x1,
      y1: s.y1,
      x2: s.x2,
      y2: s.y2,
      head: s.head ? 'end' : 'none',
      dashed: true,
      role: wrapRole,
      cls: 'wrap',
    });
  });

  for (let i = 0; i < n; i++) {
    const c = g.cell(i);
    const live = d.live(i);
    shapes.push({
      kind: 'rect',
      id: `cell-${i}`,
      ...c,
      role: role(`cell-${i}`),
      cls: live ? 'cell live' : 'cell',
    });
    const ix = g.index(i);
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: ix.x,
      y: ix.y,
      text: String(i),
      size: g.indexSize * f,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
    const slot = d.slots[i];
    if (slot) {
      const text = String(slot.value);
      shapes.push({
        kind: 'text',
        id: `v${slot.uid}`,
        x: c.x + c.w / 2,
        y: c.y + c.h / 2 + 7,
        text,
        size: fit(text, f, c.w),
        anchor: 'middle',
        weight: 'bold',
        role: role(`v${slot.uid}`) ?? (live ? undefined : 'stale'),
      });
    }
  }

  if (g.name) {
    shapes.push({
      kind: 'text',
      id: 'name',
      ...g.name,
      text: 'A',
      size: 16 * f,
      cls: 'label',
      mono: true,
    });
  }

  for (const which of ['front', 'rear'] as const) {
    const at = d[which];
    const text = g.pointerText(which, at);
    const p = g.pointer(at, which, text);
    shapes.push({
      kind: 'arrow',
      id: `${which}-arrow`,
      x1: p.x1,
      y1: p.y1,
      x2: p.x2,
      y2: p.y2,
      role: role(which),
    });
    shapes.push({
      kind: 'text',
      id: which,
      x: p.tx,
      y: p.ty,
      text,
      size: LABEL * f,
      anchor: 'middle',
      mono: true,
      role: role(which),
      cls: 'pointer',
    });
  }

  d.readouts.forEach((r, k) => {
    const at = g.readout(k);
    shapes.push({
      kind: 'text',
      id: r.id,
      x: at.x,
      y: at.y,
      text: r.text,
      size: LABEL * f,
      anchor: at.anchor,
      mono: true,
      role: role(r.id),
      cls: 'label',
    });
  });

  if (d.incoming) {
    const { uid, value, error, at } = d.incoming;
    const box = g.inBox(at);
    const text = String(value);
    shapes.push(
      {
        kind: 'rect',
        id: 'in-box',
        x: box.x - BOX_W / 2,
        y: box.y - BOX_H / 2 - 4,
        w: BOX_W,
        h: BOX_H,
        r: 8,
        cls: 'ghost',
        role: error ? 'error' : undefined,
      },
      {
        kind: 'text',
        id: 'in-label',
        x: box.x,
        y: box.y - 32,
        text: 'x',
        size: 14 * f,
        anchor: 'middle',
        cls: 'label',
        mono: true,
      },
      {
        kind: 'text',
        id: `v${uid}`,
        x: box.x,
        y: box.y + 3,
        text,
        size: fit(text, f, BOX_W),
        anchor: 'middle',
        weight: 'bold',
        role: role(`v${uid}`),
      },
    );
  }

  if (d.out) {
    const { value, from, label } = d.out;
    const c = g.cell(from);
    const box = g.outBox(from);
    const text = String(value);
    shapes.push(
      {
        kind: 'rect',
        id: 'out-box',
        x: box.x - BOX_W / 2,
        y: box.y - BOX_H / 2 - 4,
        w: BOX_W,
        h: BOX_H,
        r: 8,
        cls: 'ghost',
        role: role('out'),
      },
      {
        kind: 'text',
        id: 'out-label',
        x: box.x,
        y: box.y - 32,
        text: label,
        size: 14 * f,
        anchor: 'middle',
        cls: 'label',
        mono: true,
      },
      {
        kind: 'text',
        id: 'out',
        x: box.x,
        y: box.y + 3,
        text,
        size: fit(text, f, BOX_W),
        anchor: 'middle',
        weight: 'bold',
        role: role('out'),
        z: 3,
        enterFrom: { x: c.x + c.w / 2, y: c.y + c.h / 2 + 7 },
      },
    );
  }

  return { shapes, bounds: g.bounds };
}
