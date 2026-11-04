/**
 * Bars layout: an array drawn as bars (height follows the value) or as cells (boxes with the
 * value inside), for the sorting and searching pages. Heap sort, counting sort, radix sort and
 * bucket sort can reuse it.
 *
 * Call `barsScene(frame, content)` from a view and wrap the result in a Scene with a label.
 *
 * - `frame` fixes the framing. Keep it the same for every step of a run, so the camera stays
 *   still while values move: the mode, the number of slots, the largest value, which rows to
 *   draw, and which lanes to reserve (call stack, region labels, a lifted value, pointer lanes).
 * - `content` is what this step shows:
 *   - `rows`: values by index. Row "a" is the array; a second row (say "aux") is an auxiliary
 *     array, aligned by index under the first, e.g. L and R while merging.
 *   - `ghosts`: old copies still in memory (after a shift or a copy), drawn faded.
 *   - `pointers`: named indices (i, j, lo, mid, hi, pivot, min, key...) drawn as arrows under
 *     their row. Labels that would overlap move to a second lane. Positions -1 and `slots`
 *     (one past the end) are allowed, and so are fractions.
 *   - `regions`: shaded index ranges. `done` (final positions; values inside are drawn as done),
 *     `window` (the active subarray, dashed) or `plain` (a gray band, e.g. "sorted so far" or
 *     "<= pivot"), with optional labels.
 *   - `faded`: index ranges that are out of play (eliminated halves); their values fade.
 *   - `calls`: the call stack, outermost first, as nested brackets in the top lane. The last
 *     one is the running call. Brackets get thinner as the stack gets deeper.
 *   - `held`: a value lifted out of the array (insertion sort's key) or a value being looked
 *     for, drawn as a tile above a slot.
 *   - `roles`: the step's marks by shape id.
 *
 * Shape ids (use them as mark ids):
 * - `v<uid>`: a value. Marking it colors both its bar or tile (`bar-<uid>`) and its number.
 *   A value keeps its uid wherever it goes (a swap, the aux row, the held lane), so it
 *   visibly travels.
 * - `slot-<row>-<i>` and `idx-<row>-<i>`: a slot and its index label.
 * - `ghost-<row>-<i>` (and `ghostbar-<row>-<i>` in bars mode): an old copy.
 * - `ptr-<name>` and `ptr-<name>-arrow`: a pointer. Marking `ptr-<name>` colors both.
 * - `region-<id>` and `region-<id>-label`: a region.
 * - `call-<depth>`: a bracket in the call stack.
 * - `row-<row>`: a row's name. `held-label` (and `held-box`/`held-value` for a held value
 *   without a uid).
 *
 * Sizes are in scene units. Pitch, fonts and margins are chosen so 20 two-digit values stay
 * readable on a phone in portrait (about 11px on screen) and on a 1366x768 laptop.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type BarsMode = 'bars' | 'cells';

export interface BarsFrame {
  mode: BarsMode;
  /** Slots per row. Sets the width. */
  slots: number;
  /** Largest value; bar heights are drawn relative to it. */
  max: number;
  /** Row ids, top to bottom. Default ['a']. */
  rows?: string[];
  /** Reserve the top lane for the call stack. */
  calls?: boolean;
  /** Lanes for region labels above the first row: 0, 1 or 2. */
  regionLanes?: number;
  /** Reserve a lane above the first row for a lifted value. */
  held?: boolean;
  /** Pointer label lanes under each row. Default 2. */
  pointerLanes?: number;
}

export interface BarItem {
  uid: number;
  value: number;
}

export interface BarsRow {
  id: string;
  /** Short name drawn left of the row, such as "A". */
  label?: string;
  /** Live values by index; null leaves the slot empty. */
  items: readonly (BarItem | null)[];
  /** Old copies still in memory, drawn faded. */
  ghosts?: readonly { index: number; value: number }[];
  /** Slots that exist (outline and index label). Default 0 to items.length - 1. */
  from?: number;
  to?: number;
  /** Text under each slot. Default: the index. */
  indexLabel?: (i: number) => string;
}

export interface BarsPointer {
  name: string;
  at: number;
  /** Row id. Default "a". */
  row?: string;
  role?: MarkRole;
}

export type RegionTone = 'done' | 'window' | 'plain';

export interface BarsRegion {
  id: string;
  row?: string;
  from: number;
  to: number;
  tone: RegionTone;
  label?: string;
}

export interface BarsCall {
  from: number;
  to: number;
}

export interface BarsHeld {
  /** The value's uid, so it keeps its identity on its way out of and back into the array. */
  uid?: number;
  value: number;
  /** Slot it hovers over; fractions are fine. */
  at: number;
  label: string;
  role?: MarkRole;
}

export interface BarsContent {
  rows: readonly BarsRow[];
  pointers?: readonly BarsPointer[];
  regions?: readonly BarsRegion[];
  calls?: readonly BarsCall[];
  held?: BarsHeld;
  faded?: readonly { row?: string; from: number; to: number }[];
  roles?: ReadonlyMap<string, MarkRole>;
}

const PAD = 10;
/** The stage's zoom buttons sit over the top right corner; keep content below them. */
const PAD_TOP = 46;
const MIN_W = 520;
const FONT = { value: 25, index: 22, pointer: 24, label: 22, held: 21 };
const BAR_H = 190;
const BAR_H_TWO_ROWS = 128;
const MIN_BAR = 6;
const CELL_H = 50;
const CALLS_H = 112;
const CALL_ROW_MAX = 24;
const REGION_LANE = 30;
const HELD_H = 90;
const ARROW_H = 24;
const POINTER_LANE = 28;
const ROW_GAP = 36;

/** Distance between slot centers. Wide for a few values, 38 units for 20. */
export function pitchFor(slots: number): number {
  return Math.max(38, Math.min(64, Math.floor(760 / (slots + 1))));
}

/** Rough width of a label in scene units (digits and lowercase letters of a system font). */
export function textWidth(text: string, size: number): number {
  return text.length * size * 0.58;
}

interface RowGeometry {
  top: number;
  /** Bars: the baseline. Cells: the bottom of the cells. */
  bottom: number;
  valueY: number;
  indexY: number;
  arrowTop: number;
  arrowBottom: number;
  lane(k: number): number;
}

export interface BarsGeometry {
  pitch: number;
  width: number;
  height: number;
  /** Left edge of slot i. */
  left(i: number): number;
  /** Center of slot i. */
  center(i: number): number;
  row(id: string): RowGeometry;
  callsTop: number;
  regionLane(k: number): number;
  heldTop: number;
  barHeight: number;
}

/** Where everything goes for a given frame. Exported for views that add their own shapes. */
export function barsGeometry(frame: BarsFrame): BarsGeometry {
  const rows = frame.rows ?? ['a'];
  const pitch = pitchFor(frame.slots);
  const width = Math.max(MIN_W, (frame.slots + 1) * pitch + 2 * PAD);
  const x0 = (width - frame.slots * pitch) / 2;
  const lanes = frame.pointerLanes ?? 2;
  const barHeight = rows.length > 1 ? BAR_H_TWO_ROWS : BAR_H;

  // Top to bottom: call stack, lifted value, region labels (right on top of their bands), rows.
  let y = PAD_TOP;
  const callsTop = y;
  if (frame.calls) y += CALLS_H;
  const heldTop = y;
  if (frame.held) y += HELD_H;
  const regionTop = y;
  y += (frame.regionLanes ?? 0) * REGION_LANE;

  const geo = new Map<string, RowGeometry>();
  rows.forEach((id, k) => {
    // Lower rows get room above them for their region labels (L and R while merging).
    y += k > 0 ? ROW_GAP : 8;
    const top = y;
    const bars = frame.mode === 'bars';
    const bottom = top + (bars ? barHeight : CELL_H);
    const valueY = bars ? bottom + 31 : top + CELL_H / 2 + 10;
    const indexY = bars ? valueY + 28 : bottom + 27;
    const arrowTop = indexY + 7;
    const arrowBottom = arrowTop + ARROW_H;
    geo.set(id, {
      top,
      bottom,
      valueY,
      indexY,
      arrowTop,
      arrowBottom,
      lane: (n) => arrowBottom + 23 + n * POINTER_LANE,
    });
    y = arrowBottom + 8 + lanes * POINTER_LANE;
  });

  return {
    pitch,
    width,
    height: y + PAD,
    left: (i) => x0 + i * pitch,
    center: (i) => x0 + (i + 0.5) * pitch,
    row: (id) => geo.get(id) ?? geo.get(rows[0]!)!,
    callsTop,
    regionLane: (k) => regionTop + 22 + k * REGION_LANE,
    heldTop,
    barHeight,
  };
}

/** Assign labels to the first lane where they do not overlap; returns the lane per label. */
function placeLabels(spans: { x: number; w: number }[], lanes: number): number[] {
  const used: [number, number][][] = Array.from({ length: Math.max(1, lanes) }, () => []);
  return spans.map(({ x, w }) => {
    const a = x - w / 2;
    const b = x + w / 2;
    let lane = used.findIndex((list) => list.every(([p, q]) => b <= p || a >= q));
    if (lane < 0) lane = used.length - 1;
    used[lane]!.push([a, b]);
    return lane;
  });
}

export function barsScene(
  frame: BarsFrame,
  content: BarsContent,
): { shapes: Shape[]; bounds: Bounds } {
  const g = barsGeometry(frame);
  const roles = content.roles ?? new Map<string, MarkRole>();
  const shapes: Shape[] = [];
  const bars = frame.mode === 'bars';
  const inset = Math.max(3, Math.round(g.pitch * 0.1));
  const valueW = g.pitch - 2 * inset;
  const max = Math.max(1, frame.max);
  const barH = (v: number) =>
    MIN_BAR + (Math.max(0, Math.min(v, max)) / max) * (g.barHeight - MIN_BAR);
  const clampX = (x: number, w: number) =>
    Math.max(PAD + w / 2, Math.min(g.width - PAD - w / 2, x));
  const firstRow = content.rows[0]?.id ?? 'a';

  const fadedSet = new Set<string>();
  for (const f of content.faded ?? [])
    for (let i = f.from; i <= f.to; i++) fadedSet.add(`${f.row ?? firstRow}:${i}`);
  // Values inside a "done" region are drawn as done unless a mark says otherwise.
  const doneSet = new Set<string>();
  for (const r of content.regions ?? [])
    if (r.tone === 'done')
      for (let i = r.from; i <= r.to; i++) doneSet.add(`${r.row ?? firstRow}:${i}`);

  // Regions: bands behind the values, labels above them.
  const regionLabels: { id: string; text: string; x: number; w: number; row: string }[] = [];
  for (const r of content.regions ?? []) {
    if (r.to < r.from) continue;
    const row = g.row(r.row ?? firstRow);
    const x = g.left(r.from) + 1;
    const w = (r.to - r.from + 1) * g.pitch - 2;
    const y = row.top - 8;
    const h = (bars ? row.valueY + 9 : row.bottom + 8) - y;
    const id = `region-${r.id}`;
    const role = roles.get(id) ?? (r.tone === 'done' ? 'done' : undefined);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y,
      w,
      h,
      r: 8,
      z: 0,
      role,
      cls: r.tone === 'window' ? 'ghost' : undefined,
      opacity: r.tone === 'done' ? 0.4 : r.tone === 'plain' ? 0.75 : 1,
    });
    if (r.label) {
      const lw = textWidth(r.label, FONT.label) + 8;
      regionLabels.push({
        id,
        text: r.label,
        x: clampX(x + w / 2, lw),
        w: lw,
        row: r.row ?? firstRow,
      });
    }
  }
  const topLabels = regionLabels.filter((l) => l.row === firstRow);
  const topLanes = placeLabels(topLabels, frame.regionLanes ?? 1);
  topLabels.forEach((l, k) => {
    const lane = Math.min(topLanes[k]!, Math.max(0, (frame.regionLanes ?? 1) - 1));
    const y = frame.regionLanes ? g.regionLane(lane) : g.row(firstRow).top - 14;
    shapes.push(labelShape(`${l.id}-label`, l.x, y, l.text, roles.get(l.id)));
  });
  for (const l of regionLabels.filter((r) => r.row !== firstRow))
    shapes.push(labelShape(`${l.id}-label`, l.x, g.row(l.row).top - 14, l.text, roles.get(l.id)));

  // The call stack: one bracket per active call, outermost on top.
  const calls = content.calls ?? [];
  if (frame.calls && calls.length) {
    const rowH = Math.min(CALL_ROW_MAX, CALLS_H / calls.length);
    const th = Math.max(3, Math.min(10, rowH * 0.42));
    calls.forEach((c, k) => {
      const empty = c.to < c.from;
      const id = `call-${k}`;
      shapes.push({
        kind: 'rect',
        id,
        x: empty ? g.left(c.from) - 3 : g.left(c.from) + 2,
        y: g.callsTop + k * rowH + (rowH - th) / 2,
        w: empty ? 6 : (c.to - c.from + 1) * g.pitch - 4,
        h: th,
        r: Math.min(3, th / 2),
        role: roles.get(id) ?? (k === calls.length - 1 ? 'active' : undefined),
        cls: k === calls.length - 1 ? undefined : 'cell',
      });
    });
  }

  // Rows: slots, index labels, ghosts and values.
  for (const row of content.rows) {
    const rg = g.row(row.id);
    const from = row.from ?? 0;
    const to = row.to ?? row.items.length - 1;
    for (let i = from; i <= to; i++) {
      const slotId = `slot-${row.id}-${i}`;
      shapes.push(
        bars
          ? {
              kind: 'rect',
              id: slotId,
              x: g.left(i) + inset - 2,
              y: rg.bottom,
              w: valueW + 4,
              h: 6,
              r: 2,
              z: 0.5,
              cls: 'cell',
              role: roles.get(slotId),
            }
          : {
              kind: 'rect',
              id: slotId,
              x: g.left(i),
              y: rg.top,
              w: g.pitch,
              h: CELL_H,
              r: 2,
              z: 0.5,
              cls: 'cell',
              role: roles.get(slotId),
            },
      );
      shapes.push({
        kind: 'text',
        id: `idx-${row.id}-${i}`,
        x: g.center(i),
        y: rg.indexY,
        text: row.indexLabel ? row.indexLabel(i) : String(i),
        size: FONT.index,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    }
    if (row.label) {
      shapes.push({
        kind: 'text',
        id: `row-${row.id}`,
        x: g.left(from) - 8,
        y: rg.valueY,
        text: row.label,
        size: FONT.label,
        anchor: 'end',
        cls: 'label',
        mono: true,
        role: roles.get(`row-${row.id}`),
      });
    }
    for (const ghost of row.ghosts ?? []) {
      const i = ghost.index;
      if (bars) {
        const h = barH(ghost.value);
        shapes.push({
          kind: 'rect',
          id: `ghostbar-${row.id}-${i}`,
          x: g.left(i) + inset,
          y: rg.bottom - h,
          w: valueW,
          h,
          r: 3,
          z: 0.8,
          cls: 'ghost',
        });
      }
      shapes.push({
        kind: 'text',
        id: `ghost-${row.id}-${i}`,
        x: g.center(i),
        y: rg.valueY,
        text: String(ghost.value),
        size: FONT.value,
        anchor: 'middle',
        role: 'stale',
      });
    }
    row.items.forEach((item, i) => {
      if (!item || item.uid === content.held?.uid) return;
      const vid = `v${item.uid}`;
      const faded = fadedSet.has(`${row.id}:${i}`);
      const done = doneSet.has(`${row.id}:${i}`);
      const role = roles.get(vid) ?? (done ? 'done' : faded ? 'stale' : undefined);
      const opacity = faded && !roles.has(vid) ? 0.35 : undefined;
      const h = bars ? barH(item.value) : CELL_H - 6;
      shapes.push({
        kind: 'rect',
        id: `bar-${item.uid}`,
        x: bars ? g.left(i) + inset : g.left(i) + 2,
        y: bars ? rg.bottom - h : rg.top + 3,
        w: bars ? valueW : g.pitch - 4,
        h,
        r: bars ? 3 : 5,
        cls: 'cell live',
        role: role === 'stale' ? undefined : role,
        opacity,
      });
      shapes.push({
        kind: 'text',
        id: vid,
        x: g.center(i),
        y: rg.valueY,
        text: String(item.value),
        size: FONT.value,
        anchor: 'middle',
        weight: 'bold',
        role,
        opacity,
      });
    });
  }

  // A value lifted out of the array, hovering over a slot.
  const held = content.held;
  if (frame.held && held) {
    const cx = g.center(held.at);
    const w = Math.max(valueW, textWidth(String(held.value), FONT.value) + 12);
    const x = clampX(cx, w);
    const role = held.uid !== undefined ? (roles.get(`v${held.uid}`) ?? held.role) : held.role;
    shapes.push({
      kind: 'rect',
      id: held.uid !== undefined ? `bar-${held.uid}` : 'held-box',
      x: x - w / 2,
      y: g.heldTop + 36,
      w,
      h: 44,
      r: 6,
      cls: 'cell live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: held.uid !== undefined ? `v${held.uid}` : 'held-value',
      x,
      y: g.heldTop + 67,
      text: String(held.value),
      size: FONT.value,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    shapes.push({
      kind: 'text',
      id: 'held-label',
      x,
      y: g.heldTop + 27,
      text: held.label,
      size: FONT.held,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
  }

  // Pointers: an arrow up to the slot and a label below, per row.
  const byRow = new Map<string, BarsPointer[]>();
  for (const p of content.pointers ?? []) {
    const id = p.row ?? firstRow;
    byRow.set(id, [...(byRow.get(id) ?? []), p]);
  }
  for (const [rowId, list] of byRow) {
    const rg = g.row(rowId);
    const spans = list.map((p) => {
      const w = textWidth(p.name, FONT.pointer) + 10;
      return { x: clampX(g.center(p.at), w), w };
    });
    const lanes = placeLabels(spans, frame.pointerLanes ?? 2);
    list.forEach((p, k) => {
      const id = `ptr-${p.name}`;
      const role = roles.get(id) ?? p.role;
      const cx = g.center(p.at);
      shapes.push({
        kind: 'arrow',
        id: `${id}-arrow`,
        x1: cx,
        y1: rg.arrowBottom,
        x2: cx,
        y2: rg.arrowTop,
        role,
      });
      shapes.push({
        kind: 'text',
        id,
        x: spans[k]!.x,
        y: rg.lane(lanes[k]!),
        text: p.name,
        size: FONT.pointer,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role,
        cls: 'pointer',
      });
    });
  }

  return { shapes, bounds: { x: 0, y: 0, w: g.width, h: g.height } };
}

function labelShape(id: string, x: number, y: number, text: string, role?: MarkRole): Shape {
  return {
    kind: 'text',
    id,
    x,
    y,
    text,
    size: FONT.label,
    anchor: 'middle',
    cls: 'label',
    role,
  };
}
