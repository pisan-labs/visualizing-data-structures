import type { MarkRole, Step, Value } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import {
  cellId,
  describe,
  grownCapacity,
  MAX_CAPACITY,
  type DynExtra,
  type DynSettings,
  type DynState,
  type Slot,
} from './model';

const X0 = 70;
const W = 52;
const H = 42;
/** A row of cells plus its index labels. */
const ROW = 62;
const PER_ROW = 8;
/**
 * The band above array A holds the value going in or out. It starts low enough that the box
 * and its label clear the stage's zoom buttons on a phone (about 48 units at this width).
 */
const BOX_Y = 92;
const TOP = BOX_Y + 34;

const rows = (capacity: number) => Math.max(1, Math.ceil(capacity / PER_ROW));
const valueSize = (text: string) => (text.length <= 3 ? 20 : text.length <= 5 ? 16 : 13);

function cell(top: number, i: number) {
  return { x: X0 + (i % PER_ROW) * W, y: top + Math.floor(i / PER_ROW) * ROW, w: W, h: H };
}

/** Room kept under A for the array a resize would make, so the frame holds still while it runs. */
function reserve(state: DynState, settings: DynSettings, extra: DynExtra): number {
  if (extra.next) return extra.next.capacity;
  const grown = grownCapacity(state.capacity, settings);
  if (grown <= MAX_CAPACITY) return grown;
  return settings.shrink === 'never' ? 0 : Math.floor(state.capacity / 2);
}

function valueText(
  slot: Slot,
  at: { x: number; y: number },
  role: MarkRole | undefined,
  id?: string,
) {
  const text = String(slot.value);
  return {
    kind: 'text' as const,
    id: id ?? `v${slot.uid}`,
    x: at.x + W / 2,
    y: at.y + H / 2 + 7,
    text,
    size: valueSize(text),
    anchor: 'middle' as const,
    weight: 'bold' as const,
    role,
  };
}

function box(
  shapes: Shape[],
  id: string,
  x: number,
  label: string,
  value: { id: string; value: Value; role?: MarkRole; from?: { x: number; y: number } },
  role?: MarkRole,
) {
  const text = String(value.value);
  shapes.push(
    {
      kind: 'rect',
      id: `${id}-box`,
      x: x - 34,
      y: BOX_Y - 24,
      w: 68,
      h: 40,
      r: 8,
      cls: 'ghost',
      role,
    },
    {
      kind: 'text',
      id: `${id}-label`,
      x,
      y: BOX_Y - 32,
      text: label,
      size: 14,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    },
    {
      kind: 'text',
      id: value.id,
      x,
      y: BOX_Y + 3,
      text,
      size: valueSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: value.role,
      z: 3,
      enterFrom: value.from,
    },
  );
}

export function view(step: Step<DynState, DynExtra>, settings: DynSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const live = extra.live ?? state.size;
  const aRows = rows(state.capacity);
  const readY = TOP + aRows * ROW + 18;
  const bTop = TOP + aRows * ROW + 52;

  const frame = (
    gen: number,
    capacity: number,
    top: number,
    name: string,
    isLive: (i: number) => boolean,
  ) => {
    shapes.push({
      kind: 'text',
      id: `name-${gen}`,
      x: X0 - 14,
      y: top + H / 2 + 6,
      text: name,
      size: 16,
      anchor: 'end',
      cls: 'label',
      mono: true,
      role: roles.get(`name-${gen}`),
    });
    for (let i = 0; i < capacity; i++) {
      const c = cell(top, i);
      const id = cellId(gen, i);
      shapes.push({
        kind: 'rect',
        id,
        ...c,
        role: roles.get(id),
        cls: isLive(i) ? 'cell live' : 'cell',
      });
      shapes.push({
        kind: 'text',
        id: `a${gen}-idx-${i}`,
        x: c.x + W / 2,
        y: c.y + H + 16,
        text: String(i),
        size: 14,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    }
  };

  // Array A, with faded copies where its items have already gone to B.
  frame(state.gen, state.capacity, TOP, 'A', (i) => i < live);
  state.slots.forEach((slot, i) => {
    if (!slot) return;
    const at = cell(TOP, i);
    if (extra.copied !== undefined && i < extra.copied) {
      shapes.push(valueText(slot, at, 'stale', `a${state.gen}-ghost-${i}`));
    } else {
      shapes.push(
        valueText(slot, at, roles.get(`v${slot.uid}`) ?? (i < live ? undefined : 'stale')),
      );
    }
  });

  shapes.push(
    {
      kind: 'text',
      id: 'size',
      x: X0,
      y: readY,
      text: `size = ${state.size}`,
      size: 15,
      cls: 'label',
      mono: true,
      role: roles.get('size'),
    },
    {
      kind: 'text',
      id: 'capacity',
      x: X0 + 150,
      y: readY,
      text: `capacity = ${state.capacity}`,
      size: 15,
      cls: 'label',
      mono: true,
      role: roles.get('capacity'),
    },
  );

  // The new array during a resize.
  const next = extra.next;
  if (next) {
    shapes.push({
      kind: 'text',
      id: `cap-${next.gen}`,
      x: X0,
      y: bTop - 12,
      text: `new array B, ${next.capacity} slots`,
      size: 15,
      cls: 'label',
      mono: true,
    });
    frame(next.gen, next.capacity, bTop, 'B', (i) => next.slots[i] !== null);
    next.slots.forEach((slot, i) => {
      if (slot) shapes.push(valueText(slot, cell(bTop, i), roles.get(`v${slot.uid}`)));
    });
  }

  const column = (i: number) => {
    const k = Math.max(0, Math.min(state.capacity - 1, i));
    return X0 + (k % PER_ROW) * W + W / 2;
  };
  if (extra.incoming) {
    const { uid, value, error, at } = extra.incoming;
    box(
      shapes,
      'in',
      column(at),
      'x',
      { id: `v${uid}`, value, role: roles.get(`v${uid}`) },
      error ? 'error' : undefined,
    );
  }
  if (extra.out) {
    const { value, from, label } = extra.out;
    const c = cell(TOP, Math.min(from, state.capacity - 1));
    box(
      shapes,
      'out',
      column(from),
      label,
      { id: 'out', value, role: roles.get('out'), from: { x: c.x + W / 2, y: c.y + H / 2 + 7 } },
      roles.get('out'),
    );
  }

  const spare = reserve(state, settings, extra);
  const height = spare ? bTop + rows(spare) * ROW + 4 : TOP + aRows * ROW + 34;
  return {
    shapes,
    bounds: { x: 0, y: 0, w: X0 + PER_ROW * W + 24, h: height },
    label: describe(state, settings, extra),
  };
}
