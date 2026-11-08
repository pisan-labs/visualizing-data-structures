import type { Step } from '../../engine/types';
import {
  keyShapeId,
  labelSize,
  nodeShapeId,
  padBounds,
  trimmedLine,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { R, rolesOf } from '../_bst/view-kit';
import {
  describe,
  pedgeId,
  reach,
  vlabelId,
  type PersistentExtra,
  type PersistentSettings,
  type PersistentState,
} from './model';

/** Every node gets its own column, in key order (copies of one key side by side, oldest first). */
const P = 40;
const GAP = 64;
/** The row of version labels, and the argument box above it. */
const VY = -(R + 40);
const AY = VY - 40;
const LBL = { w: 36, h: 24 };
const DIM = 0.3;

export function view(
  step: Step<PersistentState, PersistentExtra>,
  _settings: PersistentSettings,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const all = Object.values(s.nodes).sort((a, b) => a.key - b.key || a.uid - b.uid);
  const mid = (all.length - 1) / 2;
  const pos = new Map(all.map((n, i) => [n.uid, { x: (i - mid) * P, y: n.depth * GAP }]));
  const cur = s.versions[s.current]!;
  const live = new Set(reach(s, cur.root));
  const made = new Set(extra.made ?? []);
  const onPath = new Set(extra.path ?? []);
  // While an update runs, its new nodes are not in any version yet: draw them solid too.
  const solid = (u: number) => live.has(u) || made.has(u);
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  for (const n of all) {
    const p = pos.get(n.uid)!;
    for (const side of ['left', 'right'] as const) {
      const c = n[side];
      if (c === null) continue;
      const q = pos.get(c)!;
      const id = pedgeId(n.uid, side);
      shapes.push({
        kind: 'arrow',
        id,
        ...trimmedLine(p, q, R, R),
        head: 'none',
        role: roles.get(id) ?? (onPath.has(n.uid) && onPath.has(c) ? 'active' : undefined),
        opacity: solid(n.uid) ? undefined : DIM,
      });
    }
  }
  for (const n of all) {
    const p = pos.get(n.uid)!;
    const role = roles.get(nodeShapeId(n.uid)) ?? (onPath.has(n.uid) ? 'visit' : undefined);
    const opacity = solid(n.uid) || role ? undefined : DIM;
    const text = String(n.key);
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(n.uid),
      x: p.x,
      y: p.y,
      r: R,
      cls: 'live',
      role,
      opacity,
    });
    shapes.push({
      kind: 'text',
      id: keyShapeId(n.uid),
      x: p.x,
      y: p.y + labelSize(text) * 0.35,
      text,
      size: labelSize(text),
      anchor: 'middle',
      weight: 'bold',
      role,
      opacity,
    });
    boxes.push({ x: p.x - R, y: p.y - R, w: 2 * R, h: 2 * R });
  }

  // Version labels in a row above, each pointing at its root.
  const left = Math.min(-90, ...[...pos.values()].map((p) => p.x - R));
  const want = s.versions.map((v, i) => ({
    i,
    x: v.root === null ? -Infinity : pos.get(v.root)!.x,
  }));
  want.sort((a, b) => a.x - b.x || a.i - b.i);
  let next = -Infinity;
  // Empty versions go first, left of every node.
  const firstX = all.length ? pos.get(all[0]!.uid)!.x - P : 0;
  for (const w of want) {
    const desired = Number.isFinite(w.x) ? w.x : Math.max(firstX, next);
    const x = Math.max(desired, next);
    next = x + LBL.w + 4;
    const v = s.versions[w.i]!;
    const id = vlabelId(w.i);
    const role = roles.get(id) ?? (w.i === s.current ? 'active' : undefined);
    shapes.push({
      kind: 'rect',
      id,
      x: x - LBL.w / 2,
      y: VY - LBL.h / 2,
      w: LBL.w,
      h: LBL.h,
      r: 5,
      cls: 'live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: `vtext-${w.i}`,
      x,
      y: VY + 5,
      text: `v${w.i}`,
      size: 14,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role,
    });
    if (v.root !== null) {
      const q = pos.get(v.root)!;
      shapes.push({
        kind: 'arrow',
        id: `vedge-${w.i}`,
        x1: x,
        y1: VY + LBL.h / 2,
        x2: q.x,
        y2: q.y - R - 2,
        role: w.i === s.current ? 'active' : undefined,
        opacity: w.i === s.current ? undefined : 0.55,
      });
    } else {
      shapes.push({
        kind: 'text',
        id: `vnil-${w.i}`,
        x,
        y: VY + LBL.h / 2 + 16,
        text: 'nil',
        size: 13,
        anchor: 'middle',
        mono: true,
        cls: 'label',
      });
      boxes.push({ x: x - 12, y: VY + LBL.h / 2, w: 24, h: 20 });
    }
    boxes.push({ x: x - LBL.w / 2, y: VY - LBL.h / 2, w: LBL.w, h: LBL.h });
  }

  // The argument, top left.
  if (extra.arg) {
    const text = extra.arg.text.slice(0, 12);
    const w = Math.max(48, text.length * 9.5 + 16);
    shapes.push({
      kind: 'rect',
      id: 'arg-box',
      x: left,
      y: AY - 15,
      w,
      h: 30,
      r: 6,
      cls: 'ghost',
      role: roles.get('arg-box') ?? (extra.arg.error ? 'error' : undefined),
    });
    shapes.push({
      kind: 'text',
      id: 'arg',
      x: left + w / 2,
      y: AY + 5.5,
      text,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
    });
  }
  // Keep the argument row and a minimum width, so the camera stays put.
  boxes.push({ x: left, y: AY - 16, w: 180, h: 32 });
  if (all.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'no nodes yet',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -60, y: -R, w: 120, h: 2 * R });
  }
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
