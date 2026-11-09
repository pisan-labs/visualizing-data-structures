import './deck.css';
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
  type PNode,
  type PersistentExtra,
  type PersistentSettings,
  type PersistentState,
} from './model';

/**
 * Every key gets its own column, in key order. The copies of one key stack like a deck: the
 * copy in the version looked at (or the newest) in front, older copies peeking out above and to
 * the left. Edges from the copies of a key then run together instead of crossing each other:
 * side by side, a copy's right edge would cross the left edge of every copy to its right.
 */
const P = 40;
const GAP = 64;
/** How far each copy further back in a deck sits from the one in front of it. */
const DECK = { x: -9, y: -6 };
/** The row of version labels sits this far above the highest node, the argument box above it. */
const LABEL_RISE = R + 40;
const LBL = { w: 36, h: 24 };
const DIM = 0.3;

/**
 * Centres for labels of width w that want to sit at `want` (sorted), at least w apart: labels
 * that would overlap form a block, centred on the mean of what its labels want.
 */
function packRow(want: number[], w: number): number[] {
  const blocks: { n: number; sum: number; x: number }[] = [];
  want.forEach((x) => {
    let b = { n: 1, sum: x, x };
    for (;;) {
      const prev = blocks[blocks.length - 1];
      if (!prev || prev.x + prev.n * w <= b.x) break;
      blocks.pop();
      const n = prev.n + b.n;
      const sum = prev.sum + b.sum;
      // Centre the block on the mean of the centres its labels want.
      b = { n, sum, x: sum / n - ((n - 1) * w) / 2 };
    }
    blocks.push(b);
  });
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.x + k * w);
  return out;
}

export function view(
  step: Step<PersistentState, PersistentExtra>,
  _settings: PersistentSettings,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const cur = s.versions[s.current]!;
  const live = new Set(reach(s, cur.root));
  const made = new Set(extra.made ?? []);
  const onPath = new Set(extra.path ?? []);
  // While an update runs, its new nodes are not in any version yet: draw them solid too.
  const solid = (u: number) => live.has(u) || made.has(u);
  // A column per key, in key order, holding a deck per depth. In a deck, front to back: a copy
  // this update made, then the copy in the version looked at, then newest first.
  const rank = (n: PNode) => (made.has(n.uid) ? 2 : live.has(n.uid) ? 1 : 0);
  const columns = new Map<number, Map<number, PNode[]>>();
  for (const n of Object.values(s.nodes)) {
    const col = columns.get(n.key) ?? new Map<number, PNode[]>();
    col.set(n.depth, [...(col.get(n.depth) ?? []), n]);
    columns.set(n.key, col);
  }
  const keys = [...columns.keys()].sort((a, b) => a - b);
  const decks = keys.flatMap((k) => [...columns.get(k)!.values()]);
  for (const deck of decks) deck.sort((a, b) => rank(b) - rank(a) || b.uid - a.uid);
  const pos = new Map<number, { x: number; y: number }>();
  let cursor = 0;
  for (const k of keys) {
    const col = [...columns.get(k)!.values()];
    const base = cursor - (Math.max(...col.map((d) => d.length)) - 1) * DECK.x;
    for (const deck of col)
      deck.forEach((n, i) =>
        pos.set(n.uid, { x: base + i * DECK.x, y: n.depth * GAP + i * DECK.y }),
      );
    cursor = base + P;
  }
  const shift = keys.length ? (cursor - P) / 2 : 0;
  for (const p of pos.values()) p.x -= shift;
  // Back to front, so a deck's front copy is drawn over the ones behind it.
  const all = decks.flatMap((deck) => [...deck].reverse());
  const front = new Set(decks.map((deck) => deck[0]!.uid));
  const top = Math.min(0, ...[...pos.values()].map((p) => p.y));
  const VY = top - LABEL_RISE;
  const AY = VY - 40;
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
    // A faded copy gets an opaque backing, so the deck reads as cards, not overlapping rings.
    if (opacity !== undefined)
      shapes.push({ kind: 'circle', id: `pback-${n.uid}`, x: p.x, y: p.y, r: R, cls: 'pb-back' });
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
      // Texts are drawn above every circle: only a deck's front copy shows its key.
      opacity: front.has(n.uid) ? opacity : 0,
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
  // Empty versions go first, left of every node.
  const firstX = pos.size ? Math.min(...[...pos.values()].map((p) => p.x)) - P : 0;
  const xs = packRow(
    want.map((w) => (Number.isFinite(w.x) ? w.x : firstX)),
    LBL.w + 4,
  );
  want.forEach((w, k) => {
    const x = xs[k]!;
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
  });

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
