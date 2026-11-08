import type { MarkRole, Step } from '../../engine/types';
import {
  drawBinaryTree,
  layoutBinaryTree,
  nilSpot,
  padBounds,
  trimmedLine,
  unionBounds,
  type TreeLayout,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { describe, fmt, type BTExtra, type BTSettings, type BTState, type Frame } from './model';

const CELL = { w: 30, h: 26, pitch: 33 };
const FRAME = { w: 116, h: 24, pitch: 28 };
const STACK_CELL = { w: 44, h: 26, pitch: 30 };
const LABEL_W = 62;

function frameText(fn: string, f: Frame, s: BTState): string {
  return `${fn}(${f.uid === null ? 'nil' : fmt(s.nodes[f.uid]!.value)})`;
}

const frameId = (f: Frame) => (f.uid === null ? 'frame-nil' : `frame-${f.uid}`);

/** Cells in a row that wraps: value boxes with labels, like the output and the queue. */
function row(
  shapes: Shape[],
  opts: {
    label: string;
    labelId: string;
    uids: number[];
    x: number;
    y: number;
    perRow: number;
    rectId: (uid: number) => string;
    textId: (uid: number) => string;
    text: (uid: number) => string;
    from: (uid: number) => { x: number; y: number } | undefined;
    roles: Map<string, MarkRole>;
  },
): Bounds {
  const { x, y, perRow } = opts;
  shapes.push({
    kind: 'text',
    id: opts.labelId,
    x,
    y: y + CELL.h / 2 + 5,
    text: opts.label,
    size: 14,
    cls: 'label',
    mono: true,
  });
  let rows = 1;
  if (opts.uids.length === 0) {
    shapes.push({
      kind: 'text',
      id: `${opts.labelId}-empty`,
      x: x + LABEL_W,
      y: y + CELL.h / 2 + 5,
      text: '(empty)',
      size: 13,
      cls: 'label',
    });
  }
  opts.uids.forEach((uid, i) => {
    const r = Math.floor(i / perRow);
    rows = r + 1;
    const cx = x + LABEL_W + (i % perRow) * CELL.pitch;
    const cy = y + r * (CELL.h + 8);
    const from = opts.from(uid);
    shapes.push({
      kind: 'rect',
      id: opts.rectId(uid),
      x: cx,
      y: cy,
      w: CELL.w,
      h: CELL.h,
      r: 5,
      cls: 'live',
      role: opts.roles.get(opts.rectId(uid)),
      enterFrom: from && { x: from.x - CELL.w / 2, y: from.y - CELL.h / 2 },
    });
    const text = opts.text(uid);
    shapes.push({
      kind: 'text',
      id: opts.textId(uid),
      x: cx + CELL.w / 2,
      y: cy + CELL.h / 2 + 5,
      text,
      size: text.length <= 2 ? 15 : 12,
      anchor: 'middle',
      weight: 'bold',
      role: opts.roles.get(opts.textId(uid)),
      enterFrom: from && { x: from.x, y: from.y + 5 },
    });
  });
  const w = LABEL_W + Math.max(1, Math.min(opts.uids.length, perRow)) * CELL.pitch;
  return { x, y, w, h: rows * (CELL.h + 8) - 8 };
}

export function view(step: Step<BTState, BTExtra>, settings: BTSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const tree: TreeLayout<number> = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    { nulls: settings.nulls },
  );
  const R = tree.radius;
  const at = (uid: number) => tree.nodes.get(uid);

  const output = new Set(extra.output ?? []);
  const waiting = new Set<number>([
    ...(extra.frames ?? []).flatMap((f) => (f.uid === null ? [] : [f.uid])),
    ...(extra.stack ?? []),
    ...(extra.queue ?? []),
  ]);
  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => fmt(s.nodes[u]!.value),
    roles,
    baseRole: (u) => (output.has(u) ? 'done' : waiting.has(u) ? 'visit' : undefined),
    enterFrom: (u) => {
      const p = extra.from?.[u];
      return p === undefined ? undefined : at(p);
    },
  });

  let treeBox = tree.bounds;
  if (s.root === null) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'empty tree',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    treeBox = { x: -50, y: -R, w: 100, h: 2 * R };
  }

  // A nil child being looked at.
  if (extra.nil) {
    const { parent, side } = extra.nil;
    const laid = tree.nulls.find((z) => z.parent === parent && z.side === side);
    const spot = laid ?? nilSpot(tree, parent, side);
    const size = laid ? tree.nullSize + 6 : 12;
    const p = at(parent);
    if (p && !laid) {
      shapes.push({
        kind: 'arrow',
        id: 'nil-edge',
        ...trimmedLine(p, spot, R, size / 2),
        head: 'none',
        dashed: true,
        role: roles.get('nil'),
      });
    }
    shapes.push({
      kind: 'rect',
      id: 'nil',
      x: spot.x - size / 2,
      y: spot.y - size / 2,
      w: size,
      h: size,
      r: 2,
      cls: 'ghost',
      role: roles.get('nil'),
    });
    shapes.push({
      kind: 'text',
      id: 'nil-label',
      x: spot.x + (side === 'left' ? -size / 2 - 3 : size / 2 + 3),
      y: spot.y + 4,
      text: 'nil',
      size: 13,
      anchor: side === 'left' ? 'end' : 'start',
      mono: true,
      cls: 'label',
    });
  }

  const boxes: Bounds[] = [treeBox];
  const right = treeBox.x + treeBox.w;

  // Call stack or explicit stack, beside the tree, newest on top. It starts one level down,
  // leaving the top right corner free for the stage's zoom buttons.
  if (extra.frames || extra.stack) {
    const recursive = !!extra.frames;
    const px = right + 34;
    const top = treeBox.y + 40;
    const width = recursive ? FRAME.w : STACK_CELL.w;
    const pitch = recursive ? FRAME.pitch : STACK_CELL.pitch;
    const h = recursive ? FRAME.h : STACK_CELL.h;
    shapes.push({
      kind: 'text',
      id: 'stack-label',
      x: px,
      y: top + 10,
      text: recursive ? 'call stack' : 'stack S',
      size: 14,
      cls: 'label',
      mono: true,
    });
    const y0 = top + 22;
    const items = recursive ? extra.frames! : extra.stack!.map((uid) => ({ uid }) as Frame);
    const n = items.length;
    items.forEach((f, i) => {
      const y = y0 + (n - 1 - i) * pitch;
      const isTop = i === n - 1;
      const id = recursive ? frameId(f) : `stk-${f.uid}`;
      const from = f.uid !== null ? at(f.uid) : undefined;
      shapes.push({
        kind: 'rect',
        id,
        x: px,
        y,
        w: width,
        h,
        r: 4,
        cls: 'live',
        role: roles.get(id) ?? (isTop ? 'active' : undefined),
        enterFrom: !recursive && from ? { x: from.x - width / 2, y: from.y - h / 2 } : undefined,
      });
      const text = recursive ? frameText(extra.fn ?? 'walk', f, s) : fmt(s.nodes[f.uid!]!.value);
      shapes.push({
        kind: 'text',
        id: recursive ? `${id}-t` : `stkv-${f.uid}`,
        x: recursive ? px + 8 : px + width / 2,
        y: y + h / 2 + 5,
        text,
        size: recursive ? 13 : 15,
        anchor: recursive ? 'start' : 'middle',
        weight: recursive ? 'normal' : 'bold',
        mono: recursive,
        enterFrom: !recursive && from ? { x: from.x, y: from.y + 5 } : undefined,
      });
    });
    if (n === 0) {
      shapes.push({
        kind: 'text',
        id: 'stack-empty',
        x: px,
        y: y0 + 16,
        text: '(empty)',
        size: 13,
        cls: 'label',
      });
    }
    // Room for the deepest the stack can get (one path plus a nil call), so the rows below
    // stay put while the stack grows and shrinks.
    const deepest = Math.max(n, tree.height + 2);
    boxes.push({ x: px, y: top, w: Math.max(width, 80), h: 22 + deepest * pitch });
  }

  // Rows under the tree: the output so far, then the queue.
  const left = Math.min(treeBox.x, ...boxes.map((b) => b.x));
  const rightEdge = Math.max(...boxes.map((b) => b.x + b.w));
  const perRow = Math.max(8, Math.floor((rightEdge - left - LABEL_W) / CELL.pitch));
  let y = Math.max(...boxes.map((b) => b.y + b.h)) + 24;
  const valueText = (uid: number) => fmt(s.nodes[uid]!.value);
  const nodeAt = (uid: number) => at(uid);
  if (extra.output) {
    const b = row(shapes, {
      label: 'output',
      labelId: 'output-label',
      uids: extra.output,
      x: left,
      y,
      perRow,
      rectId: (u) => `outc-${u}`,
      textId: (u) => `out-${u}`,
      text: valueText,
      from: nodeAt,
      roles,
    });
    boxes.push(b);
    y = b.y + b.h + 14;
  }
  if (extra.queue) {
    const b = row(shapes, {
      label: 'queue',
      labelId: 'queue-label',
      uids: extra.queue,
      x: left,
      y,
      perRow,
      rectId: (u) => `q-${u}`,
      textId: (u) => `qv-${u}`,
      text: valueText,
      from: nodeAt,
      roles,
    });
    boxes.push(b);
    if (extra.queue.length > 0) {
      shapes.push({
        kind: 'text',
        id: 'queue-front',
        x: left + LABEL_W + CELL.w / 2,
        y: b.y + CELL.h + 16,
        text: 'front',
        size: 13,
        anchor: 'middle',
        cls: 'label',
      });
      boxes.push({ x: left, y: b.y, w: b.w, h: CELL.h + 20 });
    }
  }

  // A message goes under everything else, away from the zoom buttons.
  if (extra.message) {
    const bottom = Math.max(...boxes.map((b) => b.y + b.h));
    shapes.push({
      kind: 'text',
      id: 'message',
      x: left,
      y: bottom + 30,
      text: extra.message,
      size: 15,
      weight: 'bold',
      role: roles.get('message') ?? 'error',
    });
    boxes.push({ x: left, y: bottom + 12, w: extra.message.length * 8.5, h: 24 });
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s),
  };
}
