import type { MarkRole, Step } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  MAX_ITEMS,
  MAX_OBJECTS,
  MAX_VARS,
  describe,
  type Item,
  type MemSettings,
  type MemState,
} from './model';

const X0 = 20;
const TOP = 44;
const HEAD = 28;
const ROW = 40;
const BOX_H = 30;
const GAP = 12;
const NAME_W = 64;
const CELL = 28;
const OBJ_CELL = 34;
const OBJ_PITCH = 56;

export function view(step: Step<MemState, undefined>, settings: MemSettings): Scene {
  const s = step.state;
  const refs = settings.lang !== 'values';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxW = refs ? 64 : MAX_ITEMS * CELL + 8;
  const frameW = NAME_W + boxW + 16;
  const heapX = X0 + frameW + (refs ? 120 : 60);

  shapes.push({
    kind: 'text',
    id: 'stack-title',
    x: X0,
    y: 24,
    text: 'stack',
    size: 14,
    cls: 'label',
  });
  if (refs)
    shapes.push({
      kind: 'text',
      id: 'heap-title',
      x: heapX,
      y: 24,
      text: 'heap',
      size: 14,
      cls: 'label',
    });

  // Where each variable's box is, for arrows and references.
  const boxAt = new Map<string, { x: number; y: number }>();
  const key = (frame: number, name: string) => `${frame}:${name}`;
  let y = TOP;
  const placed: { frameId: number; vy: number; v: MemState['frames'][number]['vars'][number] }[] =
    [];
  for (const f of s.frames) {
    const h = HEAD + Math.max(1, f.vars.length) * ROW;
    const fid = `frame-${f.id}`;
    shapes.push({
      kind: 'rect',
      id: fid,
      x: X0,
      y,
      w: frameW,
      h,
      r: 6,
      cls: f.id === s.frames.at(-1)!.id ? 'cell live' : 'cell',
      role: roles.get(fid),
    });
    shapes.push({
      kind: 'text',
      id: `${fid}-title`,
      x: X0 + 10,
      y: y + 19,
      text: f.title,
      size: 13.5,
      weight: 'bold',
      mono: true,
    });
    f.vars.forEach((v, k) => {
      const vy = y + HEAD + k * ROW;
      boxAt.set(key(f.id, v.name), { x: X0 + NAME_W, y: vy });
      placed.push({ frameId: f.id, vy, v });
    });
    y += h + GAP;
  }

  let lane = 0;
  for (const { vy, v } of placed) {
    const id = `var-${v.uid}`;
    const bx = X0 + NAME_W;
    shapes.push({
      kind: 'text',
      id: `${id}-name`,
      x: bx - 10,
      y: vy + BOX_H / 2 + 5,
      text: v.name,
      size: 14,
      anchor: 'end',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id,
      x: bx,
      y: vy,
      w: boxW,
      h: BOX_H,
      r: 4,
      cls: 'cell live',
      role: roles.get(id),
    });
    const c = v.cell;
    if (c.kind === 'num') {
      shapes.push({
        kind: 'text',
        id: `${id}-val`,
        x: bx + (refs ? boxW / 2 : 14),
        y: vy + BOX_H / 2 + 6,
        text: String(c.v),
        size: 15,
        anchor: refs ? 'middle' : 'start',
        weight: 'bold',
        mono: true,
      });
    } else if (c.kind === 'list') {
      cells(shapes, roles, id, c.items, bx + 4, vy + 3, CELL, BOX_H - 6);
    } else if (c.kind === 'ref') {
      const cx = bx + boxW / 2;
      const cy = vy + BOX_H / 2;
      shapes.push({
        kind: 'circle',
        id: `${id}-dot`,
        x: cx,
        y: cy,
        r: 4,
        cls: 'arrowhead',
        role: roles.get(`arrow-${v.uid}`),
      });
      const at = s.heap.findIndex((o) => o.id === c.obj);
      shapes.push({
        kind: 'arrow',
        id: `arrow-${v.uid}`,
        x1: cx,
        y1: cy,
        x2: heapX - 4,
        y2: TOP + at * OBJ_PITCH + BOX_H / 2,
        role: roles.get(`arrow-${v.uid}`),
      });
    } else {
      const target = boxAt.get(key(c.frame, c.name));
      const where =
        c.frame === s.frames.find((f) => f.vars.includes(v))?.id ? c.name : `${c.name} in main`;
      shapes.push({
        kind: 'text',
        id: `${id}-val`,
        x: bx + 12,
        y: vy + BOX_H / 2 + 5,
        text: `& → ${where}`,
        size: 13.5,
        mono: true,
        cls: 'label',
      });
      if (target) {
        // A three-part line through the gutter right of the stack, ending at the target's box.
        const right = bx + boxW;
        const gx = right + 14 + 10 * lane++;
        const y1 = vy + BOX_H / 2;
        const y2 = target.y + BOX_H / 2;
        const role = roles.get(id);
        shapes.push({
          kind: 'arrow',
          id: `alias-${v.uid}-a`,
          x1: right,
          y1,
          x2: gx,
          y2: y1,
          head: 'none',
          role,
        });
        shapes.push({
          kind: 'arrow',
          id: `alias-${v.uid}-b`,
          x1: gx,
          y1,
          x2: gx,
          y2,
          head: 'none',
          role,
        });
        shapes.push({
          kind: 'arrow',
          id: `alias-${v.uid}-c`,
          x1: gx,
          y1: y2,
          x2: right + 3,
          y2,
          role,
        });
      }
    }
  }

  s.heap.forEach((o, k) => {
    const oy = TOP + k * OBJ_PITCH;
    const id = `obj-${o.id}`;
    const w = Math.max(1, o.items.length) * OBJ_CELL + 8;
    shapes.push({
      kind: 'rect',
      id,
      x: heapX,
      y: oy - 4,
      w,
      h: BOX_H + 8,
      r: 6,
      cls: 'ghost',
      role: roles.get(id),
      opacity: o.garbage ? 0.45 : 1,
    });
    cells(shapes, roles, id, o.items, heapX + 4, oy, OBJ_CELL, BOX_H, o.garbage ? 0.45 : 1);
    if (o.items.length === 0)
      shapes.push({
        kind: 'text',
        id: `${id}-empty`,
        x: heapX + w / 2,
        y: oy + 20,
        text: 'empty',
        size: 12,
        anchor: 'middle',
        cls: 'label',
      });
    shapes.push({
      kind: 'text',
      id: `${id}-tag`,
      x: heapX + w + 10,
      y: oy + BOX_H / 2 + 5,
      text: o.garbage ? 'garbage' : 'list',
      size: 12.5,
      cls: 'label',
      role: o.garbage ? 'stale' : undefined,
    });
  });

  const stackH = TOP + HEAD + MAX_VARS * ROW + GAP + HEAD + ROW + GAP;
  const heapH = TOP + MAX_OBJECTS * OBJ_PITCH;
  const width = refs ? heapX + MAX_ITEMS * OBJ_CELL + 80 : X0 + frameW + 70;
  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: Math.max(stackH, heapH) + 10 },
    label: describe(s),
  };
}

/** A row of cells holding a list's values; each value is its own shape so it can move. */
function cells(
  shapes: Shape[],
  roles: Map<string, MarkRole>,
  owner: string,
  items: Item[],
  x: number,
  y: number,
  w: number,
  h: number,
  opacity = 1,
) {
  items.forEach((it, k) => {
    shapes.push({ kind: 'rect', id: `${owner}-c${k}`, x: x + k * w, y, w, h, opacity });
    const t = String(it.v);
    shapes.push({
      kind: 'text',
      id: `item-${it.uid}`,
      x: x + k * w + w / 2,
      y: y + h / 2 + 5,
      text: t,
      size: t.length > 2 ? 12 : 14,
      anchor: 'middle',
      mono: true,
      weight: 'bold',
      role: roles.get(`item-${it.uid}`),
      opacity,
    });
  });
}
