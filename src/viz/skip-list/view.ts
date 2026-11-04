/**
 * The skip list drawing. Every node is a tower of boxes, one per level, with its key in each box,
 * between the head on one side and nil on the other. A pointer on level i runs from a box to the
 * next tower at least i levels tall, passing over the shorter ones. Across: keys left to right,
 * levels bottom to top. Down: keys top to bottom, levels left to right, which fits a phone.
 */
import type { MarkRole, Step } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/multiway';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { argShapes } from '../_multiway/view';
import {
  NIL_ID,
  boxId,
  capOf,
  describe,
  ptrId,
  type Pos,
  type SkipExtra,
  type SkipSettings,
  type SLState,
} from './model';

const BW = 26;
const BH = 20;
/** Across: column pitch and level pitch. */
const ACROSS = { col: 34, lvl: 26 };
/** Down: row pitch and level pitch. */
const DOWN = { col: 28, lvl: 34 };

const keySize = (text: string) => (text.length <= 2 ? 14 : text.length === 3 ? 11.5 : 10);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function view(step: Step<SLState, SkipExtra>, settings: SkipSettings): Scene {
  const { state: s } = step;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const cap = Math.max(capOf(settings), s.head.length);
  const across = settings.draw !== 'down';

  // Columns: the head, the nodes in key order (with a node being built, in its place), nil.
  const towers: { uid: number; key: number; height: number; pending: boolean }[] = Object.values(
    s.nodes,
  ).map((n) => ({ uid: n.uid, key: n.key, height: n.next.length, pending: false }));
  if (extra.fresh)
    towers.push({
      uid: extra.fresh.uid,
      key: extra.fresh.key,
      height: extra.fresh.level,
      pending: true,
    });
  towers.sort((a, b) => a.key - b.key);
  const colOf = new Map<Pos, number>([['head', 0]]);
  towers.forEach((t, i) => colOf.set(t.uid, i + 1));
  const nilCol = towers.length + 1;

  const at = (col: number, l: number): Box =>
    across
      ? { x: col * ACROSS.col, y: -l * ACROSS.lvl, w: BW, h: BH }
      : { x: l * DOWN.lvl, y: col * DOWN.col, w: BW, h: BH };
  const nil: Box = across
    ? { x: nilCol * ACROSS.col, y: -(cap - 1) * ACROSS.lvl, w: BW, h: (cap - 1) * ACROSS.lvl + BH }
    : { x: 0, y: nilCol * DOWN.col, w: (cap - 1) * DOWN.lvl + BW, h: BH };

  const visited = new Set((extra.path ?? []).map(([p, l]) => boxId(p, l)));
  const followed = new Set(extra.moves ?? []);
  if (extra.at)
    roles.set(
      boxId(extra.at.node, extra.at.level),
      roles.get(boxId(extra.at.node, extra.at.level)) ?? 'active',
    );
  const boxRole = (id: string) => roles.get(id) ?? (visited.has(id) ? 'visit' : undefined);

  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  // The head: one box per possible level; levels not in use are faded.
  for (let l = 0; l < cap; l++) {
    const b = at(0, l);
    const used = l < s.level;
    shapes.push({
      kind: 'rect',
      id: boxId('head', l),
      ...b,
      r: 3,
      cls: used ? 'live' : undefined,
      opacity: used ? undefined : 0.5,
      role: boxRole(boxId('head', l)),
    });
    shapes.push({
      kind: 'text',
      id: `lvl-${l}`,
      x: across ? b.x - 8 : b.x + BW / 2,
      y: across ? b.y + BH / 2 + 4 : b.y - 7,
      text: String(l + 1),
      size: 11,
      anchor: across ? 'end' : 'middle',
      cls: 'label',
      mono: true,
    });
  }
  const h0 = at(0, 0);
  shapes.push({
    kind: 'text',
    id: 'head-label',
    x: across ? h0.x + BW / 2 : h0.x - 6,
    y: across ? h0.y + BH + 15 : h0.y + BH / 2 + 4,
    text: 'head',
    size: 12,
    anchor: across ? 'middle' : 'end',
    cls: 'label',
    mono: true,
  });

  // The towers.
  for (const t of towers) {
    const col = colOf.get(t.uid)!;
    for (let l = 0; l < t.height; l++) {
      const b = at(col, l);
      const id = boxId(t.uid, l);
      const text = String(t.key);
      shapes.push({
        kind: 'rect',
        id,
        ...b,
        r: 3,
        cls: t.pending ? 'ghost' : 'live',
        role: boxRole(id),
        enterFrom: across ? { x: b.x, y: b.y - 30 } : { x: b.x - 30, y: b.y },
      });
      const role = roles.get(id);
      shapes.push({
        kind: 'text',
        id: `key-${t.uid}-${l}`,
        x: b.x + BW / 2,
        y: b.y + BH / 2 + keySize(text) * 0.36,
        text,
        size: keySize(text),
        anchor: 'middle',
        weight: 'bold',
        role: role === 'compare' || role === 'visit' ? undefined : role,
        enterFrom: across ? { x: b.x + BW / 2, y: b.y - 30 } : { x: b.x - 30 + BW / 2, y: b.y },
      });
    }
  }

  // nil, the end of every level.
  shapes.push({ kind: 'rect', id: NIL_ID, ...nil, r: 3, role: roles.get(NIL_ID) });
  shapes.push({
    kind: 'text',
    id: 'nil-label',
    x: nil.x + nil.w / 2,
    y: across ? nil.y + nil.h + 15 : nil.y + BH / 2 + 4,
    text: 'nil',
    size: 12,
    anchor: 'middle',
    cls: 'label',
    mono: true,
  });

  // Pointers: the head's on the levels in use, and every node's.
  const pointer = (from: Pos, l: number, to: number | null) => {
    const a = at(colOf.get(from)!, l);
    const id = ptrId(from, l);
    const role = roles.get(id) ?? (followed.has(id) ? 'active' : undefined);
    const b = to === null ? undefined : colOf.has(to) ? at(colOf.get(to)!, l) : undefined;
    const start = across ? { x: a.x + a.w, y: a.y + BH / 2 } : { x: a.x + BW / 2, y: a.y + a.h };
    const tip = across
      ? { x: (b ? b.x : nil.x) - 1, y: a.y + BH / 2 }
      : { x: a.x + BW / 2, y: (b ? b.y : nil.y) - 1 };
    shapes.push({
      kind: 'arrow',
      id,
      x1: start.x,
      y1: start.y,
      x2: tip.x,
      y2: tip.y,
      head: 'none',
      role,
    });
    // A small head: the shared arrowhead is too big for the short hops between towers.
    for (const [k, side] of [
      [1, -1],
      [2, 1],
    ] as const) {
      shapes.push({
        kind: 'arrow',
        id: `${id}:h${k}`,
        x1: across ? tip.x - 5 : tip.x + side * 3.5,
        y1: across ? tip.y + side * 3.5 : tip.y - 5,
        x2: tip.x,
        y2: tip.y,
        head: 'none',
        role,
      });
    }
  };
  for (let l = 0; l < s.level; l++) pointer('head', l, s.head[l] ?? null);
  for (const n of Object.values(s.nodes)) n.next.forEach((to, l) => pointer(n.uid, l, to ?? null));

  const top = at(0, across ? cap - 1 : 0);
  const drawn: Bounds = across
    ? { x: top.x - 22, y: top.y, w: nil.x + BW - top.x + 22, h: -top.y + BH + 20 }
    : { x: -36, y: -16, w: nil.w + 36, h: nil.y + BH + 16 };
  boxes.push(drawn);

  // The argument and the coin flips, in a band above the drawing.
  if (step.extra !== undefined) {
    const bandY = drawn.y - 44;
    const left = drawn.x;
    boxes.push({ x: left, y: bandY, w: Math.max(drawn.w, 280), h: 32 });
    if (extra.arg) {
      const a = argShapes(extra.arg, left, bandY, roles);
      shapes.push(...a.shapes);
      if (extra.flips) {
        let x = a.box.x + a.box.w + 22;
        shapes.push({
          kind: 'text',
          id: 'flips-label',
          x,
          y: bandY + 21,
          text: 'flips',
          size: 13,
          cls: 'label',
          mono: true,
        });
        x += 56;
        extra.flips.forEach((f, i) => {
          const id = `coin-${i + 1}`;
          shapes.push({
            kind: 'circle',
            id,
            x: x + i * 26,
            y: bandY + 16,
            r: 10,
            cls: f === 'H' ? 'live' : undefined,
            role: roles.get(id),
            enterFrom: { x: x + i * 26, y: bandY - 6 },
          });
          shapes.push({
            kind: 'text',
            id: `${id}-t`,
            x: x + i * 26,
            y: bandY + 21,
            text: f,
            size: 13,
            anchor: 'middle',
            weight: 'bold',
            role: roles.get(id) === 'active' ? 'active' : undefined,
            enterFrom: { x: x + i * 26, y: bandY - 1 },
          });
        });
        boxes.push({ x, y: bandY, w: extra.flips.length * 26 + 10, h: 32 });
      }
    }
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 12), label: describe(s) };
}
