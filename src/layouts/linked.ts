/**
 * Linked nodes with named pointers: the shared layout for every page built from nodes and
 * pointers. Linked lists use it now; stacks and queues on lists, hash chaining, skip lists and
 * LRU caches can reuse it.
 *
 * What it draws
 * - A node is a box with a value field and pointer fields: [value | next] (`single`),
 *   [prev | value | next] (`double`), or a value alone (`plain`, for drawings where arrows leave
 *   from the border, such as a cycle drawn as a ring).
 * - A non-null pointer field holds a dot, and its arrow runs from the dot to the node it points
 *   at. A null pointer field has a slash through it.
 * - Named pointers (head, tail, cur, prev, next, new...) are labels with an arrow to their node,
 *   above or below it. Labels on the same node and side sit side by side. A null named pointer
 *   points at the word "null", drawn before the first node or after the last.
 * - `pending` nodes (made, not linked in yet) are dashed. `garbage` nodes (nothing points at
 *   them) are greyed and captioned "garbage" until the caller drops them (garbage collection).
 *
 * Chains: `drawChain` puts the nodes in slots in the order given, `cols` per row, rows top to
 * bottom and each row left to right. Four columns keep values readable on a phone in portrait;
 * longer lists wrap onto more rows. Links between neighbours are straight. Every other link is
 * routed around the nodes along lanes: to the start of the next row, over a node that is being
 * skipped, back to the front of a circular list. Fields on the right send their arrows right.
 * A `flipped` node swaps its fields, so a node whose next points back (halfway through a
 * reversal) still gets a short straight arrow. Ids stay stable, so when a link changes target
 * its arrow swings over to the new node instead of fading out and in.
 *
 * Free drawings: `drawNode`, `drawLink`, `straightLink` and `pointerLabel` draw the same parts at
 * positions the caller chooses (a cycle drawn as a ring, the levels of a skip list).
 *
 * Shape ids, for marks (pass the step's marks in as `roles`):
 * - node box `id`, value text `${id}.v`;
 * - the link out of field f of node id: `${id}.${f}`, for example `n7.next`. That is the
 *   segment with the arrowhead, or the slash when the field is null;
 * - named pointer label `p:${name}` (`pointerId(name)`).
 *
 * Example:
 *   const { shapes, bounds } = drawChain(
 *     {
 *       kind: 'single',
 *       nodes: [{ id: 'n1', text: '10' }, { id: 'n2', text: '20' }],
 *       links: [
 *         { from: 'n1', field: 'next', to: 'n2' },
 *         { from: 'n2', field: 'next', to: null },
 *       ],
 *       pointers: [{ name: 'head', to: 'n1', side: 'above' }],
 *     },
 *     new Map(step.marks.map((m) => [m.id, m.role])),
 *   );
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export interface Pt {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NodeKind = 'single' | 'double' | 'plain';
export type Field = 'next' | 'prev';
export type NodeStatus = 'live' | 'pending' | 'garbage';
/** Mark id to role, usually `new Map(step.marks.map((m) => [m.id, m.role]))`. */
export type Roles = ReadonlyMap<string, MarkRole>;

export interface ChainNode {
  id: string;
  /** What the value field shows. */
  text: string;
  /** Default 'live'. */
  status?: NodeStatus;
  /** Swap the pointer fields: next on the left (and prev on the right). */
  flipped?: boolean;
  /** A sentinel: the value field shows `text` as a grey label instead of data. */
  sentinel?: boolean;
}

export interface ChainLink {
  from: string;
  field: Field;
  /** Target node id, or null. */
  to: string | null;
  dashed?: boolean;
}

export interface NamedPointer {
  name: string;
  /** Target node id, or null. */
  to: string | null;
  side: 'above' | 'below';
  /** Where the "null" of a null pointer goes: before the first node or after the last. */
  nullAt?: 'before' | 'after';
}

export interface ChainSpec {
  kind: 'single' | 'double';
  /** In slot order. */
  nodes: ChainNode[];
  links: ChainLink[];
  pointers?: NamedPointer[];
  /** Nodes per row. Default 4. */
  cols?: number;
  /** Rows to leave room for even when fewer are in use, so the camera holds still. Default 2. */
  minRows?: number;
}

export interface ChainScene {
  shapes: Shape[];
  bounds: Bounds;
  /** Where each node ended up, for views that add their own shapes. */
  boxes: Map<string, Box>;
}

/** Sizes in scene units. Values sit in `value`, pointers in `field`; `gap` is between nodes. */
export const NODE = {
  single: { value: 42, field: 22, h: 40, gap: 32 },
  double: { value: 40, field: 18, h: 40, gap: 28 },
  plain: { value: 44, field: 0, h: 36, gap: 28 },
} as const;

/** Room above and below each row for pointer labels, captions and routing lanes. */
const ABOVE = 36;
const BELOW = 38;
/** Left and right margins: routing gutters and "null" markers live here. */
const MARGIN = 44;
const PAD = 6;
/**
 * Empty band across the top of the scene. On a phone the drawing fills the stage's width, and
 * the stage's zoom buttons (top right) would cover the first row's pointer labels.
 */
export const CONTROLS_BAND = 40;
/** Distance between parallel routes. */
const LANE = 7;
const LABEL_SIZE = 15;
/** Monospace advance as a fraction of the font size. */
const CHAR = 0.6;
/** Every link is drawn as this many points, so any route can morph into any other. */
const ROUTE_POINTS = 6;

/** Paint order: links over node boxes, dots over links, text on top. */
const Z_LINK = 1.4;
const Z_DOT = 1.6;

export const pointerId = (name: string) => `p:${name}`;
export const linkId = (node: string, field: Field) => `${node}.${field}`;

export function nodeWidth(kind: NodeKind): number {
  const s = NODE[kind];
  return kind === 'double' ? s.value + 2 * s.field : s.value + s.field;
}

/** Font size for a value, so up to five characters fit in the value field. */
export function valueFontSize(text: string): number {
  return text.length <= 2 ? 18 : text.length === 3 ? 17 : text.length === 4 ? 14 : 12;
}

/** Left edge of a field inside its node, or null if the node has no such field. */
function fieldLeft(kind: NodeKind, flipped: boolean, field: Field): number | null {
  const s = NODE[kind];
  if (kind === 'plain') return null;
  if (kind === 'single') return field === 'prev' ? null : flipped ? 0 : s.value;
  const right = s.field + s.value;
  if (field === 'next') return flipped ? 0 : right;
  return flipped ? right : 0;
}

/** Left edge of the value field inside its node. */
function valueLeft(kind: NodeKind, flipped: boolean): number {
  if (kind === 'single') return flipped ? NODE.single.field : 0;
  return kind === 'double' ? NODE.double.field : 0;
}

/**
 * Where an arrow leaves a field (the dot) and which way it naturally goes. In doubly linked
 * nodes, arrows going right run above the middle and arrows going left below it, so the two
 * arrows between neighbours never overlap.
 */
export function fieldAnchor(
  kind: NodeKind,
  box: Box,
  flipped: boolean,
  field: Field,
): { p: Pt; side: 'left' | 'right' } {
  const cy = box.y + box.h / 2;
  const left = fieldLeft(kind, flipped, field);
  if (left === null) return { p: { x: box.x + box.w, y: cy }, side: 'right' };
  const side = left === 0 ? 'left' : 'right';
  const dy = kind === 'double' ? (side === 'right' ? -8 : 8) : 0;
  return { p: { x: box.x + left + NODE[kind].field / 2, y: cy + dy }, side };
}

/** The box, field dividers, value and (for garbage) caption of one node. */
export function drawNode(node: ChainNode, box: Box, kind: NodeKind, roles: Roles): Shape[] {
  const s = NODE[kind];
  const status = node.status ?? 'live';
  const faded = status === 'garbage' ? 0.55 : undefined;
  const role = roles.get(node.id);
  const flipped = !!node.flipped;
  const shapes: Shape[] = [
    {
      kind: 'rect',
      id: node.id,
      ...box,
      r: kind === 'plain' ? 10 : 5,
      cls: status === 'live' ? 'cell live' : 'cell ghost',
      role,
      opacity: faded,
    },
  ];
  const dividers =
    kind === 'single'
      ? [flipped ? s.field : s.value]
      : kind === 'double'
        ? [s.field, s.field + s.value]
        : [];
  dividers.forEach((dx, i) =>
    shapes.push({
      kind: 'arrow',
      id: `${node.id}.d${i}`,
      x1: box.x + dx,
      y1: box.y,
      x2: box.x + dx,
      y2: box.y + box.h,
      head: 'none',
      dashed: status !== 'live',
      opacity: faded,
      z: 1.2,
    }),
  );
  const vx = box.x + valueLeft(kind, flipped) + s.value / 2;
  shapes.push({
    kind: 'text',
    id: `${node.id}.v`,
    x: vx,
    y: box.y + box.h / 2 + (node.sentinel ? 5 : 6),
    text: node.text,
    size: node.sentinel ? 14 : valueFontSize(node.text),
    anchor: 'middle',
    weight: node.sentinel ? 'normal' : 'bold',
    mono: node.sentinel,
    cls: node.sentinel ? 'label' : undefined,
    role: status === 'garbage' ? 'stale' : role,
    opacity: faded,
  });
  if (status === 'garbage') {
    shapes.push({
      kind: 'text',
      id: `${node.id}.gc`,
      x: box.x + box.w / 2,
      y: box.y + box.h + 15,
      text: 'garbage',
      size: 12,
      anchor: 'middle',
      role: 'stale',
    });
  }
  return shapes;
}

/**
 * A link drawn through `points` (2 to 6 of them; the last gets the arrowhead). Shorter routes
 * are padded at the start, so every link is the same 5 segments and any route morphs smoothly
 * into any other. The segment with the head has the link's id; the others `${id}~0`...
 */
export function drawLink(
  id: string,
  points: Pt[],
  opts: { role?: MarkRole; dashed?: boolean; opacity?: number; head?: boolean } = {},
): Shape[] {
  const first = points[0]!;
  const pts = [...Array<Pt>(Math.max(0, ROUTE_POINTS - points.length)).fill(first), ...points];
  const out: Shape[] = [];
  for (let k = 0; k < ROUTE_POINTS - 1; k++) {
    const a = pts[k]!;
    const b = pts[k + 1]!;
    const last = k === ROUTE_POINTS - 2;
    // Stretch inner segments by a hair so corners join without a notch.
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = len ? (b.x - a.x) / len : 0;
    const uy = len ? (b.y - a.y) / len : 0;
    const startExt = len && k > 0 && !samePoint(pts[k - 1]!, a) ? 1 : 0;
    const endExt = len && !last ? 1 : 0;
    out.push({
      kind: 'arrow',
      id: last ? id : `${id}~${k}`,
      x1: a.x - ux * startExt,
      y1: a.y - uy * startExt,
      x2: b.x + ux * endExt,
      y2: b.y + uy * endExt,
      head: last && opts.head !== false ? 'end' : 'none',
      role: opts.role,
      dashed: opts.dashed,
      opacity: opts.opacity,
      z: Z_LINK,
    });
  }
  return out;
}

const samePoint = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;

/** The dot in a non-null pointer field. */
function dot(id: string, p: Pt, role?: MarkRole, opacity?: number): Shape {
  return {
    kind: 'circle',
    id: `${id}:dot`,
    x: p.x,
    y: p.y,
    r: 3.5,
    cls: 'arrowhead',
    role,
    opacity,
    z: Z_DOT,
  };
}

/** Slash through a null field, drawn as a link so it can swing out into an arrow later. */
function nullSlash(kind: NodeKind, box: Box, flipped: boolean, field: Field) {
  const left = fieldLeft(kind, flipped, field) ?? box.w;
  const cx = box.x + left + NODE[kind].field / 2;
  const cy = box.y + box.h / 2;
  const half = Math.min(NODE[kind].field / 2 - 4, 7);
  return [
    { x: cx - half, y: cy + 11 },
    { x: cx + half, y: cy - 11 },
  ];
}

/** Where a straight line from the centre of `b` towards `toward` leaves `b`. */
export function boxExit(b: Box, toward: Pt, pad = 0): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const sx = dx ? (b.w / 2 + pad) / Math.abs(dx) : Infinity;
  const sy = dy ? (b.h / 2 + pad) / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: cx + dx * t, y: cy + dy * t };
}

const centre = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** A straight link from border to border, for free drawings. */
export function straightLink(
  id: string,
  from: Box,
  to: Box,
  opts: { role?: MarkRole; dashed?: boolean; opacity?: number } = {},
): Shape[] {
  return drawLink(id, [boxExit(from, centre(to)), boxExit(to, centre(from), 1)], opts);
}

/**
 * A named pointer for free drawings: its label at `at` and an arrow from the label to `target`.
 * Ids `p:${name}` and `p:${name}:a`.
 */
export function pointerLabel(name: string, at: Pt, target: Pt, roles: Roles): Shape[] {
  const role = roles.get(pointerId(name));
  const w = name.length * LABEL_SIZE * CHAR;
  const labelBox = { x: at.x - w / 2 - 3, y: at.y - 13, w: w + 6, h: 18 };
  const from = boxExit(labelBox, target);
  return [
    {
      kind: 'text',
      id: pointerId(name),
      x: at.x,
      y: at.y,
      text: name,
      size: LABEL_SIZE,
      anchor: 'middle',
      mono: true,
      role,
    },
    {
      kind: 'arrow',
      id: `${pointerId(name)}:a`,
      x1: from.x,
      y1: from.y,
      x2: target.x,
      y2: target.y,
      role,
      z: Z_LINK,
    },
  ];
}

interface Slot {
  index: number;
  row: number;
  col: number;
  box: Box;
  node: ChainNode;
}

/** Lay out a chain of nodes in rows and draw nodes, links and named pointers. */
export function drawChain(spec: ChainSpec, roles: Roles): ChainScene {
  const kind = spec.kind;
  const s = NODE[kind];
  const w = nodeWidth(kind);
  const pitch = w + s.gap;
  const cols = Math.max(1, spec.cols ?? 4);
  const n = spec.nodes.length;
  const rows = Math.max(1, Math.ceil(n / cols));
  const gapRows = kind === 'double' ? 20 : 14;
  const rowPitch = ABOVE + s.h + BELOW + gapRows;
  const width = 2 * MARGIN + cols * pitch - s.gap;
  // Room for at least minRows rows, so the camera holds still as a short list grows. Fewer rows
  // than that sit in the middle of the room instead of at the top.
  const reserved = Math.max(rows, spec.minRows ?? 2);
  const height = CONTROLS_BAND + 2 * PAD + reserved * rowPitch - gapRows;
  const shiftY = ((reserved - rows) * rowPitch) / 2;

  const rowTop = (r: number) => CONTROLS_BAND + PAD + ABOVE + r * rowPitch;
  const slotBox = (i: number): Box => ({
    x: MARGIN + (i % cols) * pitch,
    y: rowTop(Math.floor(i / cols)),
    w,
    h: s.h,
  });

  const slots = new Map<string, Slot>();
  spec.nodes.forEach((node, index) =>
    slots.set(node.id, {
      index,
      row: Math.floor(index / cols),
      col: index % cols,
      box: slotBox(index),
      node,
    }),
  );

  // Lanes and gutters for routed links. k = 0 for links leaving rightwards, 1 for leftwards.
  const laneAbove = (r: number) => rowTop(r) - 9;
  const laneBelow = (r: number, k: number) => rowTop(r) + s.h + 9 + k * LANE;
  const gapLane = (r: number, k: number) => rowTop(r) + s.h + BELOW + 3 + k * LANE;
  const xLeft = (k: number) => MARGIN - 12 - k * LANE;
  const xOuterLeft = (k: number) => MARGIN - 26 - k * LANE;
  const xRight = (k: number) => width - MARGIN + 12 + k * LANE;
  const xOuterRight = (k: number) => width - MARGIN + 26 + k * LANE;
  const arriveDy = (dir: 'right' | 'left') => (kind === 'double' ? (dir === 'right' ? -8 : 8) : 0);
  const firstInRow = (sl: Slot) => sl.col === 0;
  const lastInRow = (sl: Slot) => sl.col === cols - 1 || sl.index === n - 1;

  function route(src: Slot, field: Field, dst: Slot): Pt[] {
    const { p: P, side } = fieldAnchor(kind, src.box, !!src.node.flipped, field);
    const k = side === 'right' ? 0 : 1;
    const D = dst.box;
    const cy = D.y + D.h / 2;
    const inLeft = { x: D.x, y: cy + arriveDy('right') };
    const inRight = { x: D.x + D.w, y: cy + arriveDy('left') };
    const inTop = { x: D.x + 10, y: D.y };
    const inBottomL = { x: D.x + 10, y: D.y + D.h };
    const inBottomR = { x: D.x + D.w - 10, y: D.y + D.h };

    if (src.row === dst.row) {
      if (side === 'right') {
        if (dst.col === src.col + 1) return [P, { x: D.x, y: P.y }];
        if (dst.col > src.col + 1) {
          const y = laneAbove(src.row);
          return [P, { x: P.x, y }, { x: inTop.x, y }, inTop];
        }
        const y = laneBelow(src.row, k);
        if (firstInRow(dst))
          return [
            P,
            { x: P.x, y },
            { x: xOuterLeft(k), y },
            { x: xOuterLeft(k), y: inLeft.y },
            inLeft,
          ];
        return [P, { x: P.x, y }, { x: inBottomL.x, y }, inBottomL];
      }
      if (dst.col === src.col - 1) return [P, { x: D.x + D.w, y: P.y }];
      const y = laneBelow(src.row, k);
      if (dst.col < src.col - 1) return [P, { x: P.x, y }, { x: inBottomR.x, y }, inBottomR];
      if (lastInRow(dst))
        return [
          P,
          { x: P.x, y },
          { x: xOuterRight(k), y },
          { x: xOuterRight(k), y: inRight.y },
          inRight,
        ];
      return [P, { x: P.x, y }, { x: inBottomR.x, y }, inBottomR];
    }

    if (dst.row > src.row) {
      if (side === 'right') {
        // Wrap: out to the right gutter, down to the gap above the target's row.
        const y = gapLane(dst.row - 1, k);
        const out = [P, { x: xRight(k), y: P.y }, { x: xRight(k), y }];
        if (firstInRow(dst))
          return [...out, { x: xLeft(k), y }, { x: xLeft(k), y: inLeft.y }, inLeft];
        return [...out, { x: inTop.x, y }, inTop];
      }
      const y = laneBelow(dst.row, k);
      const out = [P, { x: xOuterLeft(k), y: P.y }, { x: xOuterLeft(k), y }];
      if (lastInRow(dst))
        return [...out, { x: xOuterRight(k), y }, { x: xOuterRight(k), y: inRight.y }, inRight];
      return [...out, { x: inBottomR.x, y }, inBottomR];
    }

    // The target is on an earlier row.
    if (side === 'left') {
      if (lastInRow(dst)) {
        const y = gapLane(src.row - 1, k);
        return [
          P,
          { x: xLeft(k), y: P.y },
          { x: xLeft(k), y },
          { x: xRight(k), y },
          { x: xRight(k), y: inRight.y },
          inRight,
        ];
      }
      const y = gapLane(dst.row, k);
      return [P, { x: xLeft(k), y: P.y }, { x: xLeft(k), y }, { x: inBottomR.x, y }, inBottomR];
    }
    const y = laneBelow(src.row, k);
    const out = [P, { x: P.x, y }, { x: xOuterLeft(k), y }];
    if (firstInRow(dst)) return [...out, { x: xOuterLeft(k), y: inLeft.y }, inLeft];
    const y2 = gapLane(dst.row, k);
    return [...out, { x: xOuterLeft(k), y: y2 }, { x: inBottomL.x, y: y2 }, inBottomL];
  }

  const shapes: Shape[] = [];
  const boxes = new Map<string, Box>();
  for (const sl of slots.values()) {
    boxes.set(sl.node.id, sl.box);
    shapes.push(...drawNode(sl.node, sl.box, kind, roles));
  }

  for (const link of spec.links) {
    const src = slots.get(link.from);
    if (!src) continue;
    const id = linkId(link.from, link.field);
    const role = roles.get(id);
    const garbage = src.node.status === 'garbage';
    const opacity = garbage ? 0.55 : undefined;
    const dashed = link.dashed || garbage;
    const dst = link.to === null ? undefined : slots.get(link.to);
    if (!dst) {
      const pts = nullSlash(kind, src.box, !!src.node.flipped, link.field);
      shapes.push(...drawLink(id, pts, { role, opacity, head: false }));
      continue;
    }
    const { p } = fieldAnchor(kind, src.box, !!src.node.flipped, link.field);
    shapes.push(dot(id, p, role, opacity));
    shapes.push(...drawLink(id, route(src, link.field, dst), { role, dashed, opacity }));
  }

  // Named pointers, grouped by target and side so labels on one node sit side by side.
  const last = spec.nodes.length ? slots.get(spec.nodes[n - 1]!.id)! : undefined;
  /** Where a "null" marker goes. `narrow` when it sits in a margin, with no room beside it. */
  const nullBox = (where: 'before' | 'after' | 'empty'): Box & { narrow: boolean } => {
    const mw = 36;
    const mh = 22;
    const cy = rowTop(last && where === 'after' ? last.row : 0) + s.h / 2;
    let cx: number;
    let narrow = true;
    if (where === 'empty' || !last) [cx, narrow] = [MARGIN + w / 2, false];
    else if (where === 'before') cx = MARGIN / 2;
    else if (last.col < cols - 1) [cx, narrow] = [last.box.x + pitch + w / 2 - 8, false];
    else cx = width - MARGIN / 2;
    return { x: cx - mw / 2, y: cy - mh / 2, w: mw, h: mh, narrow };
  };
  interface Group {
    target: Box;
    side: 'above' | 'below';
    names: string[];
    /** Stack the labels instead of setting them side by side. */
    stack: boolean;
  }
  const groups = new Map<string, Group>();
  const nullSpots = new Map<string, Box & { narrow: boolean }>();
  for (const ptr of spec.pointers ?? []) {
    let target: Box;
    let key: string;
    let stack = false;
    const dst = ptr.to === null ? undefined : slots.get(ptr.to);
    if (dst) {
      target = dst.box;
      key = dst.node.id;
    } else {
      const where = n === 0 ? 'empty' : (ptr.nullAt ?? 'after');
      key = `null:${where}`;
      const spot = nullSpots.get(key) ?? nullBox(where);
      nullSpots.set(key, spot);
      target = spot;
      stack = spot.narrow;
    }
    const g = groups.get(`${key}|${ptr.side}`) ?? { target, side: ptr.side, names: [], stack };
    g.names.push(ptr.name);
    groups.set(`${key}|${ptr.side}`, g);
  }
  for (const [key, b] of nullSpots) {
    shapes.push({
      kind: 'text',
      id: key,
      x: b.x + b.w / 2,
      y: b.y + b.h / 2 + 5,
      text: 'null',
      size: 14,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  }
  for (const g of groups.values()) {
    const above = g.side === 'above';
    const cx = g.target.x + g.target.w / 2;
    const edge = above ? g.target.y - 1 : g.target.y + g.target.h + 1;
    const textY = above ? g.target.y - 22 : g.target.y + g.target.h + 33;
    const arrowY = above ? g.target.y - 18 : g.target.y + g.target.h + 19;
    const label = (name: string, x: number, y: number): Shape => ({
      kind: 'text',
      id: pointerId(name),
      x,
      y,
      text: name,
      size: LABEL_SIZE,
      anchor: 'middle',
      mono: true,
      role: roles.get(pointerId(name)),
    });
    const arrow = (name: string, x1: number, x2: number, role?: MarkRole): Shape => ({
      kind: 'arrow',
      id: `${pointerId(name)}:a`,
      x1,
      y1: arrowY,
      x2,
      y2: edge,
      role,
      z: Z_LINK,
    });
    if (g.stack) {
      // One arrow, from the label nearest the target, for the whole stack.
      g.names.forEach((name, i) => shapes.push(label(name, cx, textY + (above ? -i : i) * 17)));
      const role = g.names.map((nm) => roles.get(pointerId(nm))).find((r) => r !== undefined);
      shapes.push(arrow(g.names[0]!, cx, cx, role));
      continue;
    }
    const sep = 8;
    const widths = g.names.map((nm) => nm.length * LABEL_SIZE * CHAR);
    const total = widths.reduce((a, b) => a + b, 0) + sep * (g.names.length - 1);
    let x = cx - total / 2;
    g.names.forEach((name, i) => {
      const tx = x + widths[i]! / 2;
      x += widths[i]! + sep;
      const spread = Math.max(-10, Math.min(10, (tx - cx) * 0.4));
      shapes.push(label(name, tx, textY));
      shapes.push(arrow(name, tx, cx + spread, roles.get(pointerId(name))));
    });
  }

  return { shapes, bounds: { x: 0, y: -shiftY, w: width, h: height }, boxes };
}

/**
 * Every node reachable from `roots` by following `targets`. Pages use it to find garbage:
 * nodes that no root and no local pointer can reach.
 */
export function reachable<K>(roots: (K | null | undefined)[], targets: (k: K) => (K | null)[]) {
  const seen = new Set<K>();
  const stack = roots.filter((r): r is K => r !== null && r !== undefined);
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    for (const t of targets(k)) if (t !== null && !seen.has(t)) stack.push(t);
  }
  return seen;
}
