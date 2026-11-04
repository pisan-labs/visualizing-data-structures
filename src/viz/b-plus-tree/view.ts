/**
 * The B+ tree drawing: the multiway tree, plus the links that chain the leaves left to right
 * (routed under the leaves, so they need no extra room between them), the arguments above the
 * tree, and a range query's output below it.
 */
import type { MarkRole, Step } from '../../engine/types';
import { drawLink } from '../../layouts/linked';
import {
  CELL,
  NODE_H,
  NODE_PAD,
  drawMultiway,
  keyFontSize,
  padBounds,
  unionBounds,
} from '../../layouts/multiway';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { argShapes, BAND_Y, layoutOf } from '../_multiway/view';
import { describe, type BPExtra, type BPSettings, type BState } from './model';

const MIN_W = 300;
/** How far below the leaves the links run. */
const LANE = 10;
const OUT = { w: 30, h: 26, pitch: 33, label: 60 };

export function view(step: Step<BState, BPExtra>, settings: BPSettings): Scene {
  const { state: s } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const layout = layoutOf(s, 6);
  const path = new Set(extra.path ?? []);

  /** The center of a key's cell in the tree. */
  const cellAt = (uid: number): { x: number; y: number } | undefined => {
    for (const n of layout.nodes.values()) {
      const i = s.nodes[n.id]!.keys.findIndex((k) => k.uid === uid);
      if (i >= 0) return { x: n.x + NODE_PAD + i * CELL + CELL / 2, y: n.y + NODE_PAD + CELL / 2 };
    }
    return undefined;
  };

  const shapes: Shape[] = drawMultiway(layout, {
    keys: (u) => s.nodes[u]!.keys.map((k) => ({ id: k.uid, text: String(k.key) })),
    roles,
    nodeRole: (u) => (path.has(u) ? 'visit' : undefined),
    // A separator copied up from a leaf slides up out of that leaf.
    enterFrom: (key) => (extra.copy && key === extra.copy.uid ? cellAt(extra.copy.of) : undefined),
  });

  // The leaf chain.
  const boxes: Bounds[] = [];
  for (const n of layout.nodes.values()) {
    const next = s.nodes[n.id]!.next;
    if (next === undefined || next === null) continue;
    const b = layout.nodes.get(next);
    if (!b) continue;
    const y = n.y + n.h + LANE;
    const id = `next-${n.id}`;
    const role = roles.get(id);
    const start = { x: n.x + n.w - 8, y: n.y + n.h };
    const tip = { x: b.x + 8, y: b.y + b.h + 1 };
    // The shared arrowhead is sized for long links; these are short, so a small chevron instead.
    shapes.push(
      ...drawLink(id, [start, { x: start.x, y }, { x: tip.x, y }, tip], { role, head: false }),
    );
    for (const [k, dx] of [
      [1, -3.5],
      [2, 3.5],
    ] as const) {
      shapes.push({
        kind: 'arrow',
        id: `${id}:h${k}`,
        x1: tip.x + dx,
        y1: tip.y + 4.5,
        x2: tip.x,
        y2: tip.y,
        head: 'none',
        role,
        z: 1.4,
      });
    }
    shapes.push({
      kind: 'circle',
      id: `${id}:dot`,
      x: start.x,
      y: start.y,
      r: 2.6,
      cls: 'arrowhead',
      role,
      z: 1.6,
    });
  }

  const tree = layout.bounds;
  if (s.root === null) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: NODE_H / 2 + 5,
      text: 'empty tree',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -50, y: 0, w: 100, h: NODE_H });
  } else {
    boxes.push({ ...tree, h: tree.h + (layout.levels.length > 0 ? LANE + 4 : 0) });
  }
  const cx = s.root === null ? 0 : tree.x + tree.w / 2;
  const left = Math.min(s.root === null ? -50 : tree.x, cx - MIN_W / 2);
  const right = Math.max(s.root === null ? 50 : tree.x + tree.w, cx + MIN_W / 2);

  // The arguments, in a band above the tree that stays for every step of an operation.
  if (step.extra !== undefined) {
    boxes.push({ x: left, y: BAND_Y, w: right - left, h: NODE_H });
    if (extra.arg) {
      const a = argShapes(extra.arg, left, BAND_Y, roles);
      shapes.push(...a.shapes);
      if (extra.arg2)
        shapes.push(...argShapes(extra.arg2, a.box.x + a.box.w + 16, BAND_Y, roles, 'arg2').shapes);
    }
  } else {
    boxes.push({ x: left, y: 0, w: right - left, h: CELL });
  }

  // A range query's output, under the tree.
  if (extra.output) {
    const y0 = Math.max(...boxes.map((b) => b.y + b.h)) + 18;
    const perRow = Math.max(6, Math.floor((right - left - OUT.label) / OUT.pitch));
    shapes.push({
      kind: 'text',
      id: 'output-label',
      x: left,
      y: y0 + OUT.h / 2 + 5,
      text: 'output',
      size: 14,
      cls: 'label',
      mono: true,
    });
    extra.output.forEach((uid, i) => {
      const from = cellAt(uid);
      const x = left + OUT.label + (i % perRow) * OUT.pitch;
      const y = y0 + Math.floor(i / perRow) * (OUT.h + 6);
      const key = Object.values(s.nodes)
        .flatMap((n) => n.keys)
        .find((k) => k.uid === uid);
      const text = String(key?.key ?? '');
      shapes.push({
        kind: 'rect',
        id: `outc-${uid}`,
        x,
        y,
        w: OUT.w,
        h: OUT.h,
        r: 4,
        cls: 'live',
        enterFrom: from && { x: from.x - OUT.w / 2, y: from.y - OUT.h / 2 },
      });
      shapes.push({
        kind: 'text',
        id: `out-${uid}`,
        x: x + OUT.w / 2,
        y: y + OUT.h / 2 + keyFontSize(text) * 0.36,
        text,
        size: keyFontSize(text),
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`out-${uid}`),
        enterFrom: from,
      });
    });
    const rows = Math.max(1, Math.ceil(extra.output.length / perRow));
    boxes.push({ x: left, y: y0, w: OUT.label + perRow * OUT.pitch, h: rows * (OUT.h + 6) });
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s, settings),
  };
}
