/**
 * Drawing for the heap pattern pages: rows of values and heap panels in which every value keeps
 * one identity, so it travels from a row into a heap and on to another row.
 *
 * - A value with uid u is drawn as its text `key-u`, everywhere: in a row it sits on a tile
 *   `tile-u`, in a heap on a circle `node-u` (src/layouts/heap.ts draws those). Mark a value by
 *   `key-u`; `valueRoles` passes the role on to its tile and its circle.
 * - Slots, edges and index labels belong to places, so they stay put while values move:
 *   `<row>-<i>` is slot i of a row, `<row>-<i>-i` its index label, `<row>-name` the row's name.
 *   A heap panel's edges and labels start with its prefix.
 * - `pointers` draws named indices (i, j, p, r) as arrows under a row, in lanes so labels never
 *   overlap; `<row>-ptr-<name>` is the label and `<row>-ptr-<name>-a` its arrow.
 */
import type { Mark, MarkRole } from '../../engine/types';
import { keyShapeId, nodeShapeId } from '../../layouts/binary-tree';
import { bracket, columns, monoWidth } from '../../layouts/columns';
import { drawHeapTree, heapLayout } from '../../layouts/heap';
import type { Bounds, Shape } from '../../render/scene';
import type { HItem } from './heap';

export type Roles = ReadonlyMap<string, MarkRole>;

export const PITCH = 48;
export const CELL_H = 44;
export const FONT = { value: 22, index: 16, name: 20, label: 19, pointer: 18, title: 18 };
/** Room an index label takes under a row. */
export const INDEX_ROOM = 22;
/** Room one pointer name takes. */
export const LANE = 22;

export const keyId = (uid: number) => keyShapeId(uid);
export const tileId = (uid: number) => `tile-${uid}`;

export const mark = (id: string, role: MarkRole): Mark => ({ id, role });
/** Mark a value wherever it is drawn. */
export const value = (item: HItem | { uid: number }, role: MarkRole): Mark =>
  mark(keyId(item.uid), role);

/** The step's marks, with a value's role passed on to its tile and its circle. */
export function valueRoles(marks: readonly Mark[]): Map<string, MarkRole> {
  const roles = new Map<string, MarkRole>();
  for (const m of marks) roles.set(m.id, m.role);
  for (const m of marks) {
    const uid = /^key-(\d+)$/.exec(m.id)?.[1];
    if (uid === undefined) continue;
    if (!roles.has(tileId(Number(uid)))) roles.set(tileId(Number(uid)), m.role);
    if (!roles.has(nodeShapeId(Number(uid)))) roles.set(nodeShapeId(Number(uid)), m.role);
  }
  return roles;
}

const valueSize = (text: string, room: number) =>
  Math.min(FONT.value, Math.max(13, (room - 6) / (0.6 * Math.max(1, text.length))));

export interface RowOptions {
  id: string;
  /** Values by slot; null leaves a slot empty. */
  items: readonly (HItem | null)[];
  /** Slots drawn (default items.length). */
  slots?: number;
  x0: number;
  top: number;
  pitch?: number;
  h?: number;
  roles: Roles;
  /** Name drawn left of the row, right-aligned at nameX (default x0 − 10). */
  name?: string;
  nameX?: number;
  nameRole?: MarkRole;
  /** Index label under slot i (default i); false draws none. */
  index?: false | ((i: number) => string);
  /** A value drawn as out of play (gray). */
  stale?(item: HItem, i: number): boolean;
  /** Role of slot i's box when no mark names it. */
  slotRole?(i: number): MarkRole | undefined;
  /** Role of a value when no mark names it. */
  valueRole?(item: HItem, i: number): MarkRole | undefined;
}

export interface Row {
  shapes: Shape[];
  /** Under the index labels (or the cells, with none). */
  bottom: number;
  right: number;
  /** Center x of slot i. */
  cx(i: number): number;
}

/** One row of slots, with each value on its own tile. */
export function drawRow(o: RowOptions): Row {
  const pitch = o.pitch ?? PITCH;
  const h = o.h ?? CELL_H;
  const slots = o.slots ?? o.items.length;
  const shapes: Shape[] = [];
  const x = (i: number) => o.x0 + i * pitch;
  for (let i = 0; i < slots; i++) {
    const id = `${o.id}-${i}`;
    shapes.push({
      kind: 'rect',
      id,
      x: x(i),
      y: o.top,
      w: pitch,
      h,
      r: 0,
      role: o.roles.get(id) ?? o.slotRole?.(i),
    });
    const item = o.items[i];
    if (item) {
      const text = String(item.key);
      const size = valueSize(text, pitch);
      const stale = o.stale?.(item, i) ?? false;
      const role = o.roles.get(keyId(item.uid)) ?? (stale ? 'stale' : o.valueRole?.(item, i));
      shapes.push({
        kind: 'rect',
        id: tileId(item.uid),
        x: x(i) + 3,
        y: o.top + 3,
        w: pitch - 6,
        h: h - 6,
        r: 4,
        cls: stale ? undefined : 'live',
        role: o.roles.get(tileId(item.uid)) ?? (role === 'stale' ? undefined : role),
      });
      shapes.push({
        kind: 'text',
        id: keyId(item.uid),
        x: x(i) + pitch / 2,
        y: o.top + h / 2 + size * 0.36,
        text,
        size,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role,
      });
    }
    if (o.index !== false) {
      shapes.push({
        kind: 'text',
        id: `${id}-i`,
        x: x(i) + pitch / 2,
        y: o.top + h + FONT.index + 2,
        text: o.index ? o.index(i) : String(i),
        size: FONT.index,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    }
  }
  if (o.name) {
    shapes.push({
      kind: 'text',
      id: `${o.id}-name`,
      x: o.nameX ?? o.x0 - 10,
      y: o.top + h / 2 + FONT.name * 0.36,
      text: o.name,
      size: FONT.name,
      anchor: 'end',
      cls: 'label',
      mono: true,
      role: o.roles.get(`${o.id}-name`) ?? o.nameRole,
    });
  }
  return {
    shapes,
    bottom: o.top + h + (o.index === false ? 0 : INDEX_ROOM),
    right: x(slots),
    cx: (i) => x(i) + pitch / 2,
  };
}

export interface Pointer {
  name: string;
  at: number;
  role?: MarkRole;
}

/**
 * Pointers under a row, from `top` down: an arrow up to the slot and the name under it. Two at
 * one slot take two lanes. Returns the shapes and the y under the lowest lane used, which is at
 * most `lanes` lanes down, so a frame can reserve the room.
 */
export function pointers(
  row: string,
  ps: readonly Pointer[],
  o: { x0: number; top: number; pitch?: number },
): { shapes: Shape[]; lanes: number } {
  const pitch = o.pitch ?? PITCH;
  const used = new Map<number, number>();
  const shapes: Shape[] = [];
  let lanes = 0;
  for (const p of ps) {
    const lane = used.get(p.at) ?? 0;
    used.set(p.at, lane + 1);
    lanes = Math.max(lanes, lane + 1);
    const cx = o.x0 + (p.at + 0.5) * pitch;
    // Pointers at one slot share the arrow (drawn on top of each other) and stack their names.
    shapes.push({
      kind: 'arrow',
      id: `${row}-ptr-${p.name}-a`,
      x1: cx,
      y1: o.top + ARROW,
      x2: cx,
      y2: o.top,
      role: p.role,
    });
    shapes.push({
      kind: 'text',
      id: `${row}-ptr-${p.name}`,
      x: cx,
      y: o.top + ARROW + FONT.pointer + lane * LANE,
      text: p.name,
      size: FONT.pointer,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: p.role,
    });
  }
  return { shapes, lanes };
}

/** Height of the arrow under a slot. */
const ARROW = 18;

/** Height of `lanes` pointer lanes, the arrow included. */
export const pointerRoom = (lanes: number) => (lanes > 0 ? ARROW + lanes * LANE + 4 : 0);

/** A bracket over slots lo..hi of a row, with a label above it. */
export function runBracket(o: {
  id: string;
  lo: number;
  hi: number;
  x0: number;
  y: number;
  pitch?: number;
  label?: string;
  role?: MarkRole;
  clamp?: { min: number; max: number };
}): Shape[] {
  const cols = columns(Math.max(o.hi + 1, 1), { pitch: o.pitch ?? PITCH, x0: o.x0 });
  return bracket(cols, {
    id: o.id,
    lo: o.lo,
    hi: o.hi,
    y: o.y,
    ticks: 'down',
    label: o.label,
    role: o.role,
    labelSize: FONT.label,
    clamp: o.clamp,
  });
}

/** Room a bracket with a label takes above a row. */
export const BRACKET_ROOM = 34;

export interface HeapPanelOptions {
  /** Starts the ids of the panel's edges and labels: `<prefix>-hedge-<p>`, `<prefix>-title`. */
  prefix: string;
  items: readonly HItem[];
  /** The slots the layout reserves, so the panel keeps its size while the heap grows. */
  capacity: number;
  /** Center x of the root, and the top of the panel (its title, then the tree). */
  cx: number;
  top: number;
  roles: Roles;
  title?: string;
  /** A small label under each value (the list it came from). */
  label?(item: HItem): string | undefined;
  R?: number;
  gap?: number;
  levelGap?: number;
  /** Role of a value's circle when no mark names it. */
  baseRole?(item: HItem, p: number): MarkRole | undefined;
}

export interface HeapPanel {
  shapes: Shape[];
  bounds: Bounds;
  /** Center of position p. */
  at(p: number): { x: number; y: number };
}

export const HEAP_R = 22;
const TITLE_ROOM = 34;
const LABEL_SIZE = 16;

/** A heap drawn as a tree, with a title above it. */
export function heapPanel(o: HeapPanelOptions): HeapPanel {
  const R = o.R ?? HEAP_R;
  const raw = heapLayout(Math.max(1, o.capacity), {
    radius: R,
    gap: o.gap ?? (o.label ? 24 : 10),
    // A label under each value needs room between the edges below it.
    levelGap: o.levelGap ?? (o.label ? 70 : 58),
  });
  const dy = o.top + TITLE_ROOM + R;
  const at = (p: number) => {
    const c = raw.at(p);
    return { x: c.x + o.cx, y: c.y + dy };
  };
  const shapes: Shape[] = [];
  const labelRoom = o.label ? LABEL_SIZE + 4 : 0;
  const left = raw.bounds.x + o.cx;
  const w = raw.bounds.w;
  const titleW = o.title ? monoWidth(o.title, FONT.title) : 0;
  const bx = Math.min(left, o.cx - titleW / 2);
  const bw = Math.max(left + w, o.cx + titleW / 2) - bx;
  const bounds: Bounds = {
    x: bx,
    y: o.top,
    w: bw,
    h: TITLE_ROOM + raw.bounds.h + labelRoom,
  };
  if (o.title) {
    shapes.push({
      kind: 'text',
      id: `${o.prefix}-title`,
      x: o.cx,
      y: o.top + FONT.title,
      text: o.title,
      size: FONT.title,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
  }
  if (o.items.length === 0) {
    const c = at(0);
    shapes.push({
      kind: 'circle',
      id: `${o.prefix}-empty`,
      x: c.x,
      y: c.y,
      r: R,
      cls: 'ghost',
      role: o.roles.get(`${o.prefix}-empty`),
    });
    shapes.push({
      kind: 'text',
      id: `${o.prefix}-empty-t`,
      x: c.x,
      y: c.y + 5,
      text: 'empty',
      size: 16,
      anchor: 'middle',
      cls: 'label',
    });
    return { shapes, bounds, at };
  }
  const tree = drawHeapTree(
    { n: o.items.length, at, radius: R },
    o.items.map((it) => ({ id: it.uid, text: String(it.key) })),
    {
      roles: o.roles,
      baseRole: o.baseRole ? (p) => o.baseRole!(o.items[p]!, p) : undefined,
    },
  );
  for (const s of tree)
    shapes.push(s.id.startsWith('hedge-') ? { ...s, id: `${o.prefix}-${s.id}` } : s);
  if (o.label) {
    o.items.forEach((it, p) => {
      const text = o.label!(it);
      if (!text) return;
      const c = at(p);
      shapes.push({
        kind: 'text',
        id: `lab-${it.uid}`,
        x: c.x,
        y: c.y + R + LABEL_SIZE + 1,
        text,
        size: LABEL_SIZE,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    });
  }
  return { shapes, bounds, at };
}

/** A heading in the top left corner, clear of the zoom buttons on the right. */
export function heading(id: string, text: string, x: number, y: number): Shape {
  return {
    kind: 'text',
    id,
    x,
    y,
    text,
    size: FONT.label,
    weight: 'bold',
    mono: true,
  };
}

/** The box around several boxes. */
export function union(...bs: Bounds[]): Bounds {
  const x1 = Math.min(...bs.map((b) => b.x));
  const y1 = Math.min(...bs.map((b) => b.y));
  const x2 = Math.max(...bs.map((b) => b.x + b.w));
  const y2 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Shapes moved by (dx, dy). */
export { translate } from '../../layouts/arrange';
