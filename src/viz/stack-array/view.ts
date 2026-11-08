import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Scene, Shape } from '../../render/scene';
import { describe, topOf, type StackExtra, type StackSettings, type StackState } from './model';

const valueSize = (text: string) => (text.length <= 3 ? 20 : text.length <= 5 ? 16 : 13);

interface Geometry {
  cell(i: number): { x: number; y: number; w: number; h: number };
  index(i: number): { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  /** Arrow for the top pointer aimed at slot i (may be -1 or capacity). */
  pointer(i: number): {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    tx: number;
    ty: number;
    anchor: 'start' | 'middle';
  };
  incoming(slot: number): { x: number; y: number };
  out(): { x: number; y: number };
  name: { x: number; y: number; anchor: 'start' | 'middle' | 'end' };
  bounds: Scene['bounds'];
}

function vertical(cap: number): Geometry {
  const x0 = 70;
  const w = 76;
  const h = 44;
  const top0 = 110;
  const yOf = (i: number) => top0 + (cap - 1 - i) * h;
  return {
    cell: (i) => ({ x: x0, y: yOf(i), w, h }),
    index: (i) => ({ x: x0 - 12, y: yOf(i) + h / 2 + 5, anchor: 'end' }),
    pointer: (i) => {
      const y = yOf(i) + h / 2;
      return {
        x1: x0 + w + 62,
        y1: y,
        x2: x0 + w + 8,
        y2: y,
        tx: x0 + w + 68,
        ty: y + 5,
        anchor: 'start',
      };
    },
    incoming: () => ({ x: x0 + w / 2, y: top0 - 62 }),
    out: () => ({ x: x0 + w + 210, y: top0 - 62 }),
    name: { x: x0 + w / 2, y: yOf(-1) + 30, anchor: 'middle' },
    bounds: { x: 0, y: 0, w: x0 + w + 270, h: top0 + cap * h + 50 },
  };
}

function horizontal(cap: number): Geometry {
  const x0 = 90;
  const w = 60;
  const h = 50;
  const y0 = 110;
  const xOf = (i: number) => x0 + i * w;
  return {
    cell: (i) => ({ x: xOf(i), y: y0, w, h }),
    index: (i) => ({ x: xOf(i) + w / 2, y: y0 + h + 20, anchor: 'middle' }),
    pointer: (i) => {
      const x = xOf(i) + w / 2;
      return {
        x1: x,
        y1: y0 + h + 80,
        x2: x,
        y2: y0 + h + 30,
        tx: x,
        ty: y0 + h + 102,
        anchor: 'middle',
      };
    },
    incoming: (slot) => ({ x: xOf(Math.min(slot, cap - 1)) + w / 2, y: y0 - 58 }),
    out: () => ({ x: xOf(cap) + 50, y: y0 - 58 }),
    name: { x: x0 - 12, y: y0 + h / 2 + 6, anchor: 'end' },
    bounds: { x: 0, y: 0, w: xOf(cap) + 110, h: y0 + h + 120 },
  };
}

/**
 * The array's geometry. 'fit' draws it whichever way is larger on the stage (across a wide
 * laptop stage, up a tall phone one), and vertically with no stage (thumbnails, practice).
 */
function geometry(cap: number, layout: StackSettings['layout'], stage?: StageSize): Geometry {
  if (layout === 'horizontal') return horizontal(cap);
  if (layout === 'vertical') return vertical(cap);
  return pickLayout(stage, [vertical(cap), horizontal(cap)]);
}

export function view(
  step: Step<StackState, StackExtra>,
  settings: StackSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const cap = state.capacity;
  const g = geometry(cap, settings.layout, stage);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];

  for (let i = 0; i < cap; i++) {
    const c = g.cell(i);
    const live = (i < state.size && extra.pending !== i) || extra.hold === i;
    shapes.push({
      kind: 'rect',
      id: `cell-${i}`,
      ...c,
      role: roles.get(`cell-${i}`),
      cls: live ? 'cell live' : 'cell',
    });
    const ix = g.index(i);
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: ix.x,
      y: ix.y,
      text: String(i),
      size: 13,
      anchor: ix.anchor,
      cls: 'index',
      mono: true,
    });
    const slot = state.slots[i];
    if (slot) {
      const text = String(slot.value);
      shapes.push({
        kind: 'text',
        id: `v${slot.uid}`,
        x: c.x + c.w / 2,
        y: c.y + c.h / 2 + 7,
        text,
        size: valueSize(text),
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`v${slot.uid}`) ?? (live ? undefined : 'stale'),
      });
    }
  }

  shapes.push({
    kind: 'text',
    id: 'name',
    ...g.name,
    text: 'A',
    size: 15,
    cls: 'label',
    mono: true,
  });

  const top = topOf(state, settings);
  const pointerSlot = settings.top === 'count' ? state.size : state.size - 1;
  const p = g.pointer(pointerSlot);
  shapes.push({
    kind: 'arrow',
    id: 'top-arrow',
    x1: p.x1,
    y1: p.y1,
    x2: p.x2,
    y2: p.y2,
    role: roles.get('top'),
  });
  shapes.push({
    kind: 'text',
    id: 'top',
    x: p.tx,
    y: p.ty,
    text: `top = ${top}`,
    size: 15,
    anchor: p.anchor,
    mono: true,
    role: roles.get('top'),
    cls: 'pointer',
  });

  if (extra.incoming) {
    const { uid, value, error } = extra.incoming;
    const at = g.incoming(state.size);
    const text = String(value);
    shapes.push({
      kind: 'rect',
      id: 'in-box',
      x: at.x - 34,
      y: at.y - 24,
      w: 68,
      h: 40,
      r: 8,
      cls: 'ghost',
      role: error ? 'error' : undefined,
    });
    shapes.push({
      kind: 'text',
      id: 'in-label',
      x: at.x,
      y: at.y - 32,
      text: 'x',
      size: 13,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'text',
      id: `v${uid}`,
      x: at.x,
      y: at.y + 3,
      text,
      size: valueSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(`v${uid}`),
    });
  }

  if (extra.out) {
    const { value, from, label } = extra.out;
    const c = g.cell(from);
    const at = g.out();
    const text = String(value);
    shapes.push({
      kind: 'rect',
      id: 'out-box',
      x: at.x - 34,
      y: at.y - 24,
      w: 68,
      h: 40,
      r: 8,
      cls: 'ghost',
      role: roles.get('out'),
    });
    shapes.push({
      kind: 'text',
      id: 'out-label',
      x: at.x,
      y: at.y - 32,
      text: label,
      size: 13,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'text',
      id: 'out',
      x: at.x,
      y: at.y + 3,
      text,
      size: valueSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: roles.get('out'),
      z: 3,
      enterFrom: { x: c.x + c.w / 2, y: c.y + c.h / 2 + 7 },
    });
  }

  return { shapes, bounds: g.bounds, label: describe(state, settings, extra.pending) };
}
