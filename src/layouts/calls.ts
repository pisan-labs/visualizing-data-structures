/**
 * Call stack and recursion tree, shared by the recursion pages (factorial, string reversal,
 * Fibonacci, the recursion DAG, N-Queens, backtracking) and meant for the dynamic programming,
 * backtracking and Master theorem pages that come later.
 *
 * Everything is drawn with monospace text, whose width is predictable (0.6 em per character in
 * every monospace font we meet), so boxes can be sized to their labels without measuring.
 *
 * CALL STACK
 *
 *   drawCallStack(frames, options) -> { shapes, bounds, boxes }
 *     frames   oldest first. The last frame is the newest and is drawn on top, so the stack
 *              grows upward like a pile of plates. Each frame is
 *                { id, callId?, call, locals?, line?, status, returns?, received? }
 *              id        the frame's stable id, usually its call's id. Shapes are keyed by it,
 *                        so a frame keeps its shapes for as long as it lives and the renderer
 *                        animates it. When one frame is reused for several calls (tail calls
 *                        optimized), keep id and set callId to the call it holds now.
 *              call      the call as written, e.g. "factorial(4)".
 *              locals    other local variables, already formatted, e.g. 'rest = "cb"'. They
 *                        follow the call on the first row.
 *              line      the line the frame is running or waiting on, e.g.
 *                        "waits: 4 * factorial(3)".
 *              status    running (the top frame: role active), waiting (paused at a call),
 *                        returning (role done), error (role error, e.g. the call that did not
 *                        fit), caller (the program that made the first call, drawn dashed).
 *              returns   a value this frame is handing back, drawn as a token at its right end.
 *              received  { from, value }: the value that call `from` just returned. The token
 *                        keeps the shape ids of `from`'s token, so between the step where `from`
 *                        returns and the step where its frame is gone, the renderer slides the
 *                        value from the returning frame down into its caller.
 *     options  x, y      top-left corner of the area the stack may use.
 *              width     frame width. frameWidth() works out the narrowest that fits.
 *              room      how many frames to make room for. Keep it the same for every step of
 *                        an operation (the deepest the stack will get, plus one so the newest
 *                        frame stays clear of the stage's zoom buttons), so the camera stays
 *                        still while frames come and go. Frames sit at the bottom of the area.
 *              rows      1: the line follows the call on one row (default). 2: the line goes on
 *                        a second row, for long lines.
 *              lineX     where the line starts, from the frame's left edge (rows = 1), so the
 *                        lines of all frames line up. Default: after the longest call.
 *              title     text above the stack. Default "call stack".
 *              size      font size. Default 12.5.
 *              roles     the step's marks by shape id; a mark on a frame overrides its status.
 *     Returns the shapes, the bounds of the whole reserved area (title included) and the box of
 *     every frame drawn, by frame id.
 *     Shape ids: frameShapeId(id) for the box, with "-call", "-vars" and "-line" for its texts;
 *     returnShapeId(callId) for the token of that call's return value, with "-text";
 *     "stack-title".
 *
 *   frameWidth(heads, lines, tokenLines, size) -> { width, lineX }: the narrowest frame for a
 *   run, from every call (with locals) and every line a frame will show, so it stays put.
 *   callStackHeight(room, size, rows): the height drawCallStack will use.
 *
 * RECURSION TREE
 *
 *   layoutCallTree(calls, options) -> CallTreeLayout
 *     Lay out the finished tree once, with every call it will ever have, and draw any moment of
 *     it with drawCallTree: positions then never move as the tree grows, and only the calls made
 *     so far are drawn. A call is
 *       { id, parent, label, value?, tag?, tagRole?, edge?, state }
 *     parent    the caller's id, or null for the first call. Children are ordered as they come in
 *               the list, so list calls in the order they happen and the tree reads in that
 *               order: top to bottom, left to right.
 *     label     the call as written, e.g. "fib(3)".
 *     value     what it returned, e.g. "= 2": a second line in the box, or after the label when
 *               the boxes have one line.
 *     tag       a short label in a badge on the box's top-right corner: "2nd" for a repeated
 *               subproblem, "memo" for a call the memo answered, "pruned"... Marks like these
 *               must be words, not only a color. tagRole colors the badge (default compare).
 *     edge      a short label on the edge from the parent, e.g. "take 3".
 *     state     current (running: role active), open (on the stack, waiting for a call it
 *               made: role visit), done (returned: drawn dimmed), cut (stopped early, by a memo
 *               or by pruning: dashed; give it a tag that says why), error.
 *     The layout sizes each box from the label, value and tag of the call passed to it, so pass
 *     the finished calls. Options: size (font, default 12.5), gap (between neighbors, default
 *     10), levelGap (center to center, default 56), twoLines (value under the label; default
 *     true), minW (narrowest box, default 34).
 *     The algorithm is a tidy tree for any number of children: each subtree is laid out on its
 *     own, then the children of a node are packed left to right as close as their outlines
 *     allow at every depth, and the parent is centered over its first and last child.
 *     Returns the center and size of every box (root at x = 0, y = 0), the number of levels,
 *     and the tight bounds.
 *
 *   drawCallTree(layout, calls, options) -> Shape[]
 *     calls     the calls to draw now (any subset of the laid-out ones, usually the calls made
 *               so far), with their current state, value and tag.
 *     options   dx, dy (offset added to every position), roles (marks by shape id),
 *               levelNotes (text drawn right of each level, e.g. the work done on that level in
 *               a Master theorem tree), pathActive (draw the edges into open and current calls
 *               as active, so the path from the root to the running call is the call stack;
 *               default true).
 *     Shape ids: callShapeId(id) for the box, with "-label", "-value", "-edge" (the edge from
 *     its parent), "-edgelabel", "-tag" (the badge) and "-tagtext"; "level-<d>" for notes.
 *     A new call slides out of its parent.
 *
 *   callNodeShapes(box, call, roles, options) draws one box the same way, for layouts that
 *   place nodes themselves (a memoized DAG, a table of subproblems). options: size, twoLines,
 *   enterFrom, and shapeId (the box's id, default callShapeId(call.id); the label, value and
 *   tag ids add "-label", "-value", "-tag" and "-tagtext" to it).
 *   callTreeBounds(layout, dx, dy, levelNotes): the bounds after an offset, notes included.
 *
 * Helpers: monoWidth(text, size), fitSize(text, width, size, min), unionBounds, padBounds.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

/** Width of monospace text: 0.6 em per character. */
export function monoWidth(text: string, size: number): number {
  return [...text].length * size * 0.6;
}

/** The largest font size up to `size` (and at least `min`) at which `text` fits in `width`. */
export function fitSize(text: string, width: number, size: number, min = 9): number {
  const w = monoWidth(text, size);
  if (w <= width) return size;
  return Math.max(min, Math.floor(((size * width) / w) * 10) / 10);
}

/** The smallest box holding all of the given boxes. Empty boxes (w = h = 0) are ignored. */
export function unionBounds(...boxes: Bounds[]): Bounds {
  const real = boxes.filter((b) => b.w > 0 || b.h > 0);
  if (real.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...real.map((b) => b.x));
  const y = Math.min(...real.map((b) => b.y));
  const r = Math.max(...real.map((b) => b.x + b.w));
  const bottom = Math.max(...real.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bottom - y };
}

/** Grow bounds by `margin` on every side. */
export function padBounds(b: Bounds, margin: number): Bounds {
  return { x: b.x - margin, y: b.y - margin, w: b.w + 2 * margin, h: b.h + 2 * margin };
}

const smaller = (size: number) => Math.round(size * 0.92 * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Call stack

export type FrameStatus = 'running' | 'waiting' | 'returning' | 'error' | 'caller';

export interface StackFrame {
  id: string;
  callId?: string;
  call: string;
  locals?: string;
  line?: string;
  status: FrameStatus;
  returns?: string;
  received?: { from: string; value: string };
}

export interface CallStackOptions {
  x: number;
  y: number;
  width: number;
  room: number;
  rows?: 1 | 2;
  lineX?: number;
  title?: string;
  size?: number;
  roles?: ReadonlyMap<string, MarkRole>;
}

export interface StackDrawing {
  shapes: Shape[];
  bounds: Bounds;
  boxes: Map<string, Bounds>;
}

export const frameShapeId = (id: string) => `frame-${id}`;
export const returnShapeId = (id: string) => `ret-${id}`;

const FRAME_ROLE: Record<FrameStatus, MarkRole | undefined> = {
  running: 'active',
  waiting: undefined,
  returning: 'done',
  error: 'error',
  caller: undefined,
};

/** Frame geometry for a font size and row count. */
export function frameMetrics(size = 12.5, rows: 1 | 2 = 1) {
  const h = rows === 1 ? Math.round(size * 1.95) : Math.round(size * 3.3);
  return { h, pitch: h + 4, title: Math.round(size * 2) };
}

/** Height of the area drawCallStack uses for `room` frames, title included. */
export function callStackHeight(room: number, size = 12.5, rows: 1 | 2 = 1): number {
  const m = frameMetrics(size, rows);
  return m.title + Math.max(1, room) * m.pitch - 4;
}

/** Width of a return token holding `text`. */
export function tokenWidth(text: string, size = 12.5): number {
  return Math.round(monoWidth(text, size) + size * 1.1);
}

/** Width of a frame's first row before its line: the call and, after it, the locals. */
export function frameHeadWidth(f: Pick<StackFrame, 'call' | 'locals'>, size = 12.5): number {
  return monoWidth(f.call, size) + (f.locals ? size * 0.8 + monoWidth(f.locals, smaller(size)) : 0);
}

/**
 * The narrowest frame that fits a run: `heads` are every call (with its locals) a frame will
 * show, `lines` every line shown without a token, and `tokenLines` the [line, value] pairs a
 * frame shows next to a return token.
 */
export function frameWidth(
  heads: Pick<StackFrame, 'call' | 'locals'>[],
  lines: string[],
  tokenLines: [string, string][],
  size = 12.5,
  rows: 1 | 2 = 1,
): { width: number; lineX: number } {
  const small = smaller(size);
  const pad = Math.round(size * 0.6);
  const head = Math.max(0, ...heads.map((h) => frameHeadWidth(h, size)));
  const plain = Math.max(0, ...lines.map((l) => monoWidth(l, small)));
  const withToken = Math.max(
    0,
    ...tokenLines.map(([l, v]) => monoWidth(l, small) + 6 + tokenWidth(v, size)),
  );
  if (rows === 2) {
    return { width: Math.ceil(2 * pad + Math.max(head + size, plain, withToken)), lineX: pad };
  }
  const lineX = pad + head + size;
  return { width: Math.ceil(lineX + Math.max(plain, withToken) + pad), lineX };
}

export function drawCallStack(frames: StackFrame[], opts: CallStackOptions): StackDrawing {
  const size = opts.size ?? 12.5;
  const rows = opts.rows ?? 1;
  const m = frameMetrics(size, rows);
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const room = Math.max(opts.room, frames.length, 1);
  const shapes: Shape[] = [];
  const boxes = new Map<string, Bounds>();
  const pad = Math.round(size * 0.6);
  const small = smaller(size);
  const longestHead = Math.max(0, ...frames.map((f) => frameHeadWidth(f, size)));
  const lineX = opts.lineX ?? pad + longestHead + size;
  const tokenH = Math.min(m.h - 6, size * 1.8);

  shapes.push({
    kind: 'text',
    id: 'stack-title',
    x: opts.x,
    y: opts.y + m.title * 0.62,
    text: opts.title ?? 'call stack',
    size: Math.round(size * 1.05 * 10) / 10,
    cls: 'label',
    mono: true,
  });

  const bottom = opts.y + m.title + room * m.pitch - 4;
  const tokenShapes: Shape[] = [];
  frames.forEach((f, i) => {
    const y = bottom - (i + 1) * m.pitch + 4;
    const box = { x: opts.x, y, w: opts.width, h: m.h };
    boxes.set(f.id, box);
    const id = frameShapeId(f.id);
    shapes.push({
      kind: 'rect',
      id,
      ...box,
      r: 5,
      cls: f.status === 'caller' ? 'ghost' : 'live',
      role: roles.get(id) ?? FRAME_ROLE[f.status],
    });

    // Return tokens sit at the right end; the line gets what is left.
    const tokens: { key: string; value: string }[] = [];
    if (f.returns !== undefined) tokens.push({ key: f.callId ?? f.id, value: f.returns });
    if (f.received) tokens.push({ key: f.received.from, value: f.received.value });
    let right = box.x + box.w - pad / 2;
    for (const t of tokens) {
      const w = tokenWidth(t.value, size);
      right -= w;
      const tid = returnShapeId(t.key);
      // Returned values are purple (found) on every page, wherever they are on their way.
      const role = roles.get(tid) ?? 'found';
      const ty = rows === 1 ? box.y + (m.h - tokenH) / 2 : box.y + 3;
      tokenShapes.push(
        {
          kind: 'rect',
          id: tid,
          x: right,
          y: ty,
          w,
          h: tokenH,
          r: tokenH / 2,
          cls: 'live',
          role,
          z: 3,
        },
        {
          kind: 'text',
          id: `${tid}-text`,
          x: right + w / 2,
          y: ty + tokenH / 2 + size * 0.36,
          text: t.value,
          size,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role,
          z: 4,
        },
      );
      right -= 4;
    }

    const row1 = rows === 1 ? y + m.h / 2 + size * 0.36 : y + size * 1.3;
    const row2 = y + m.h - size * 0.75;
    // The first row holds the call and its locals; with one row the line follows at lineX.
    const headRoom =
      (rows === 1 ? lineX - pad : (tokens.length ? right : box.x + box.w - pad) - box.x - pad) -
      size * 0.4;
    const fit = Math.min(1, headRoom / Math.max(1, frameHeadWidth(f, size)));
    const callSize = Math.max(9, Math.floor(size * fit * 10) / 10);
    shapes.push({
      kind: 'text',
      id: `${id}-call`,
      x: opts.x + pad,
      y: row1,
      text: f.call,
      size: callSize,
      weight: 'bold',
      mono: true,
      role: roles.get(`${id}-call`) ?? (f.status === 'error' ? 'error' : undefined),
    });
    if (f.locals) {
      shapes.push({
        kind: 'text',
        id: `${id}-vars`,
        x: opts.x + pad + monoWidth(f.call, callSize) + callSize * 0.8,
        y: row1,
        text: f.locals,
        size: Math.max(9, Math.floor(small * fit * 10) / 10),
        mono: true,
        cls: 'label',
        role: roles.get(`${id}-vars`),
      });
    }
    if (f.line) {
      const lx = rows === 2 ? opts.x + pad : opts.x + lineX;
      const end = rows === 2 ? box.x + box.w - pad : tokens.length ? right : box.x + box.w - pad;
      shapes.push({
        kind: 'text',
        id: `${id}-line`,
        x: lx,
        y: rows === 2 ? row2 : row1,
        text: f.line,
        size: fitSize(f.line, end - lx, small),
        mono: true,
        role: roles.get(`${id}-line`) ?? (f.status === 'error' ? 'error' : undefined),
        cls: f.status === 'running' || f.status === 'error' ? undefined : 'label',
      });
    }
  });
  // Tokens go last, so they sit on top of the frames they travel across.
  shapes.push(...tokenShapes);

  const height = callStackHeight(room, size, rows);
  return { shapes, bounds: { x: opts.x, y: opts.y, w: opts.width, h: height }, boxes };
}

// ---------------------------------------------------------------------------------------------
// Recursion tree

export type CallState = 'current' | 'open' | 'done' | 'cut' | 'error';

export interface TreeCall {
  id: string;
  parent: string | null;
  label: string;
  value?: string;
  tag?: string;
  tagRole?: MarkRole;
  edge?: string;
  state: CallState;
}

export interface CallTreeOptions {
  size?: number;
  gap?: number;
  levelGap?: number;
  twoLines?: boolean;
  minW?: number;
}

export interface PlacedCall {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
  parent: string | null;
}

export interface CallTreeLayout {
  nodes: Map<string, PlacedCall>;
  /** Number of levels (0 for an empty tree). */
  levels: number;
  bounds: Bounds;
  size: number;
  twoLines: boolean;
  levelGap: number;
}

export const callShapeId = (id: string) => `call-${id}`;

/** Box size for a call: the label, and the value under it (two lines) or after it (one). */
export function callBoxSize(call: Pick<TreeCall, 'label' | 'value'>, size = 12.5, twoLines = true) {
  const label = monoWidth(call.label, size);
  const value = call.value ? monoWidth(call.value, smaller(size)) : 0;
  const text = twoLines ? Math.max(label, value) : label + (value ? size * 0.5 + value : 0);
  const w = Math.round(text + size * 0.9);
  const h = Math.round(twoLines ? size * 2.6 : size * 1.85);
  return { w, h };
}

/** Badge size for a tag. */
function tagSize(tag: string, size: number) {
  const s = Math.round(size * 0.74 * 10) / 10;
  return { w: Math.round(monoWidth(tag, s) + s * 0.9), h: Math.round(s * 1.5), s };
}

interface Outline {
  l: number[];
  r: number[];
}

export function layoutCallTree(calls: TreeCall[], options: CallTreeOptions = {}): CallTreeLayout {
  const size = options.size ?? 12.5;
  const gap = options.gap ?? 10;
  const levelGap = options.levelGap ?? 56;
  const twoLines = options.twoLines ?? true;
  const minW = options.minW ?? 34;

  const byId = new Map(calls.map((c) => [c.id, c]));
  const kids = new Map<string, string[]>();
  let root: string | null = null;
  for (const c of calls) {
    if (c.parent === null) {
      if (root !== null) throw new Error(`Two first calls: ${root} and ${c.id}.`);
      root = c.id;
    } else {
      if (!byId.has(c.parent)) throw new Error(`Call ${c.id} has an unknown parent ${c.parent}.`);
      const list = kids.get(c.parent) ?? [];
      list.push(c.id);
      kids.set(c.parent, list);
    }
  }

  const boxOf = new Map<string, { w: number; h: number; left: number; right: number }>();
  for (const c of calls) {
    const b = callBoxSize(c, size, twoLines);
    const w = Math.max(minW, b.w);
    // A tag badge hangs over the top-right corner; keep room for it.
    const over = c.tag ? Math.max(0, tagSize(c.tag, size).w / 2) : 0;
    boxOf.set(c.id, { w, h: b.h, left: w / 2, right: w / 2 + over });
  }

  const offsets = new Map<string, number[]>();
  const seen = new Set<string>();
  const outline = (id: string): Outline => {
    if (seen.has(id)) throw new Error(`Call ${id} appears twice: not a tree.`);
    seen.add(id);
    const b = boxOf.get(id)!;
    const subs = (kids.get(id) ?? []).map(outline);
    const xs: number[] = [];
    let merged: Outline = { l: [], r: [] };
    subs.forEach((o, i) => {
      let x = 0;
      if (i > 0) {
        x = -Infinity;
        const n = Math.min(merged.r.length, o.l.length);
        for (let k = 0; k < n; k++) x = Math.max(x, merged.r[k]! + gap - o.l[k]!);
        // A sibling never sits left of the previous one, even with nothing below to push on.
        x = Math.max(x, xs[i - 1]!);
      }
      xs.push(x);
      const depth = Math.max(merged.l.length, o.l.length);
      const next: Outline = { l: [], r: [] };
      for (let k = 0; k < depth; k++) {
        const ml = merged.l[k];
        const ol = o.l[k];
        next.l.push(ml === undefined ? ol! + x : ol === undefined ? ml : Math.min(ml, ol + x));
        const mr = merged.r[k];
        const or = o.r[k];
        next.r.push(mr === undefined ? or! + x : or === undefined ? mr : Math.max(mr, or + x));
      }
      merged = next;
    });
    const mid = xs.length ? (xs[0]! + xs[xs.length - 1]!) / 2 : 0;
    offsets.set(
      id,
      xs.map((x) => x - mid),
    );
    return {
      l: [-b.left, ...merged.l.map((v) => v - mid)],
      r: [b.right, ...merged.r.map((v) => v - mid)],
    };
  };

  const nodes = new Map<string, PlacedCall>();
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let levels = 0;
  const place = (id: string, x: number, depth: number, parent: string | null) => {
    const b = boxOf.get(id)!;
    const y = depth * levelGap;
    nodes.set(id, { id, x, y, w: b.w, h: b.h, depth, parent });
    levels = Math.max(levels, depth + 1);
    minX = Math.min(minX, x - b.left);
    maxX = Math.max(maxX, x + b.right);
    maxY = Math.max(maxY, y + b.h / 2);
    const offs = offsets.get(id)!;
    (kids.get(id) ?? []).forEach((k, i) => place(k, x + offs[i]!, depth + 1, id));
  };

  let bounds: Bounds = { x: 0, y: 0, w: 0, h: 0 };
  if (root !== null) {
    outline(root);
    if (seen.size !== calls.length) throw new Error('Some calls are not reachable from the first.');
    place(root, 0, 0, null);
    // Tags stick out above their boxes.
    const top = Math.min(
      ...[...nodes.values()].map((n) => {
        const tag = byId.get(n.id)!.tag;
        return n.y - n.h / 2 - (tag ? tagSize(tag, size).h / 2 : 0);
      }),
    );
    bounds = { x: minX, y: top, w: maxX - minX, h: maxY - top };
  }
  return { nodes, levels, bounds, size, twoLines, levelGap };
}

const NODE_ROLE: Record<CallState, MarkRole | undefined> = {
  current: 'active',
  open: 'visit',
  done: undefined,
  cut: undefined,
  error: 'error',
};

/** Shapes for one call box centered at (box.x, box.y). */
export function callNodeShapes(
  box: { x: number; y: number; w: number; h: number },
  call: TreeCall,
  roles: ReadonlyMap<string, MarkRole> = new Map(),
  opts: {
    size?: number;
    twoLines?: boolean;
    enterFrom?: { x: number; y: number };
    shapeId?: string;
  } = {},
): Shape[] {
  const size = opts.size ?? 12.5;
  const twoLines = opts.twoLines ?? true;
  const id = opts.shapeId ?? callShapeId(call.id);
  const shapes: Shape[] = [];
  const role = roles.get(id) ?? NODE_ROLE[call.state];
  const dim = call.state === 'done';
  const x0 = box.x - box.w / 2;
  const y0 = box.y - box.h / 2;
  const enter = opts.enterFrom;
  const from = (dx: number, dy: number) => enter && { x: enter.x + dx, y: enter.y + dy };
  shapes.push({
    kind: 'rect',
    id,
    x: x0,
    y: y0,
    w: box.w,
    h: box.h,
    r: 6,
    // A finished call keeps the plain (unfilled) box style: dimmed, but still readable.
    cls: call.state === 'cut' ? 'ghost' : dim ? 'call-done' : 'live',
    role,
    enterFrom: from(-box.w / 2, -box.h / 2),
  });
  const valueSize = smaller(size);
  const hasValue = call.value !== undefined && call.value !== '';
  const labelSize = fitSize(call.label, box.w - size * 0.5, size);
  const labelW = monoWidth(call.label, labelSize);
  const valueW = hasValue ? monoWidth(call.value!, valueSize) : 0;
  // The label is always anchored at its start, so only its position moves when a value arrives.
  let lx: number;
  let ly: number;
  if (twoLines) {
    lx = box.x - labelW / 2;
    // Low enough to clear a tag badge on the top edge.
    ly = hasValue ? box.y - size * 0.05 : box.y + size * 0.36;
  } else {
    const total = labelW + (hasValue ? size * 0.5 + valueW : 0);
    lx = box.x - Math.min(total, box.w - size * 0.5) / 2;
    ly = box.y + size * 0.36;
  }
  shapes.push({
    kind: 'text',
    id: `${id}-label`,
    x: lx,
    y: ly,
    text: call.label,
    size: labelSize,
    weight: 'bold',
    mono: true,
    cls: dim || call.state === 'cut' ? 'label' : undefined,
    role: roles.get(`${id}-label`) ?? (role === 'active' || role === 'error' ? role : undefined),
    enterFrom: from(lx - box.x, ly - box.y),
  });
  if (hasValue) {
    shapes.push({
      kind: 'text',
      id: `${id}-value`,
      x: twoLines ? box.x : lx + labelW + size * 0.5,
      y: twoLines ? box.y + size * 1.06 : ly,
      text: call.value!,
      size: twoLines ? fitSize(call.value!, box.w - size * 0.5, valueSize) : valueSize,
      anchor: twoLines ? 'middle' : 'start',
      mono: true,
      role: roles.get(`${id}-value`) ?? (call.state === 'error' ? 'error' : 'found'),
    });
  }
  if (call.tag) {
    const t = tagSize(call.tag, size);
    const tx = x0 + box.w - t.w / 2;
    const ty = y0 - t.h / 2;
    const tagRole = roles.get(`${id}-tag`) ?? call.tagRole ?? 'compare';
    shapes.push({
      kind: 'rect',
      id: `${id}-tag`,
      x: tx,
      y: ty,
      w: t.w,
      h: t.h,
      r: t.h / 2,
      cls: 'live tag',
      role: tagRole,
      z: 3,
    });
    shapes.push({
      kind: 'text',
      id: `${id}-tagtext`,
      x: tx + t.w / 2,
      y: ty + t.h / 2 + t.s * 0.36,
      text: call.tag,
      size: t.s,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      z: 4,
    });
  }
  return shapes;
}

export interface DrawCallTreeOptions {
  dx?: number;
  dy?: number;
  roles?: ReadonlyMap<string, MarkRole>;
  levelNotes?: (string | undefined)[];
  pathActive?: boolean;
}

export function drawCallTree(
  layout: CallTreeLayout,
  calls: TreeCall[],
  opts: DrawCallTreeOptions = {},
): Shape[] {
  const dx = opts.dx ?? 0;
  const dy = opts.dy ?? 0;
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const pathActive = opts.pathActive ?? true;
  const size = layout.size;
  const shapes: Shape[] = [];
  const at = (id: string) => {
    const n = layout.nodes.get(id);
    if (!n) throw new Error(`Call ${id} was not laid out.`);
    return { ...n, x: n.x + dx, y: n.y + dy };
  };
  for (const c of calls) {
    const n = at(c.id);
    if (c.parent !== null) {
      const p = at(c.parent);
      const id = `${callShapeId(c.id)}-edge`;
      const onPath = pathActive && (c.state === 'open' || c.state === 'current');
      const y1 = p.y + p.h / 2;
      const y2 = n.y - n.h / 2;
      shapes.push({
        kind: 'arrow',
        id,
        x1: p.x,
        y1,
        x2: n.x,
        y2,
        head: 'none',
        dashed: c.state === 'cut',
        role: roles.get(id) ?? (onPath ? 'active' : c.state === 'error' ? 'error' : undefined),
        opacity: c.state === 'done' || c.state === 'cut' ? 0.55 : 1,
      });
      if (c.edge) {
        const es = Math.round(size * 0.8 * 10) / 10;
        const mx = (p.x + n.x) / 2;
        const my = (y1 + y2) / 2;
        const side = n.x < p.x - 1 ? -1 : 1;
        shapes.push({
          kind: 'text',
          id: `${callShapeId(c.id)}-edgelabel`,
          x: mx + side * es * 0.5,
          y: my + es * 0.36,
          text: c.edge,
          size: es,
          anchor: side < 0 ? 'end' : 'start',
          mono: true,
          cls: 'label',
          role: roles.get(`${callShapeId(c.id)}-edgelabel`),
        });
      }
    }
    const parent = c.parent !== null ? at(c.parent) : undefined;
    shapes.push(
      ...callNodeShapes(n, c, roles, {
        size,
        twoLines: layout.twoLines,
        enterFrom: parent && { x: parent.x, y: parent.y },
      }),
    );
  }
  if (opts.levelNotes) {
    const right = layout.bounds.x + layout.bounds.w + dx + size;
    opts.levelNotes.forEach((note, d) => {
      if (!note) return;
      shapes.push({
        kind: 'text',
        id: `level-${d}`,
        x: right,
        y: d * layout.levelGap + dy + size * 0.36,
        text: note,
        size: smaller(size),
        mono: true,
        cls: 'label',
        role: roles.get(`level-${d}`),
      });
    });
  }
  return shapes;
}

/** Bounds of a laid-out tree after an offset, including level notes. */
export function callTreeBounds(
  layout: CallTreeLayout,
  dx = 0,
  dy = 0,
  levelNotes?: (string | undefined)[],
): Bounds {
  const b = { ...layout.bounds, x: layout.bounds.x + dx, y: layout.bounds.y + dy };
  if (!levelNotes?.some(Boolean)) return b;
  const widest = Math.max(...levelNotes.map((n) => (n ? monoWidth(n, smaller(layout.size)) : 0)));
  return { ...b, w: b.w + layout.size + widest };
}
