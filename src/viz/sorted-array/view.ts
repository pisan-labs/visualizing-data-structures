import type { MarkRole, Step, Value } from '../../engine/types';
import type { Scene, Shape } from '../../render/scene';
import { describe, type SortedExtra, type SortedSettings, type SortedState } from './model';

const X0 = 60;
const W = 54;
const H = 48;
/** Centre of the band above the array that holds x and the returned value. */
const BOX_Y = 54;
const Y0 = BOX_Y + 100;
const BOX_W = 68;

const baseValueSize = (text: string) => (text.length <= 3 ? 22 : 17);

export function view(step: Step<SortedState, SortedExtra>, settings: SortedSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.capacity;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const role = (id: string) => roles.get(id);
  const width = X0 + n * W + 64;
  // A long row shrinks on a phone, so its labels grow with it.
  const f = Math.max(1, width / 588);
  const fit = (text: string, room: number) =>
    Math.min(baseValueSize(text) * f, (room - 8) / (0.6 * Math.max(1, text.length)));
  const xOf = (i: number) => X0 + i * W + W / 2;
  const live = extra.live ?? state.size;
  const range = extra.range;
  const shapes: Shape[] = [];

  shapes.push({
    kind: 'text',
    id: 'name',
    x: X0 - 12,
    y: Y0 + H / 2 + 6,
    text: 'A',
    size: 16 * f,
    anchor: 'end',
    cls: 'label',
    mono: true,
  });

  for (let i = 0; i < n; i++) {
    const inRange = range !== undefined && i >= range[0] && i <= range[1] && i < state.size;
    shapes.push({
      kind: 'rect',
      id: `cell-${i}`,
      x: X0 + i * W,
      y: Y0,
      w: W,
      h: H,
      role: role(`cell-${i}`) ?? (inRange ? 'visit' : undefined),
      cls: i < live ? 'cell live' : 'cell',
    });
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x: xOf(i),
      y: Y0 + H + 20,
      text: String(i),
      size: 15 * f,
      anchor: 'middle',
      cls: 'index',
      mono: true,
    });
    const slot = state.slots[i];
    if (slot) {
      const text = String(slot.value);
      shapes.push({
        kind: 'text',
        id: `v${slot.uid}`,
        x: xOf(i),
        y: Y0 + H / 2 + 7,
        text,
        size: fit(text, W),
        anchor: 'middle',
        weight: 'bold',
        role: role(`v${slot.uid}`) ?? (i < live ? undefined : 'stale'),
      });
    }
  }

  // mid points down from above; lo, hi, i and j point up from below.
  const ptr = extra.ptr ?? {};
  if (ptr.mid !== undefined) {
    const x = xOf(ptr.mid);
    shapes.push(
      { kind: 'arrow', id: 'mid-arrow', x1: x, y1: Y0 - 36, x2: x, y2: Y0 - 6, role: role('mid') },
      {
        kind: 'text',
        id: 'mid',
        x,
        y: Y0 - 44,
        text: 'mid',
        size: 15 * f,
        anchor: 'middle',
        mono: true,
        cls: 'pointer',
        role: role('mid'),
      },
    );
  }
  for (const name of ['lo', 'hi', 'i', 'j'] as const) {
    const at = ptr[name];
    if (at === undefined) continue;
    const x = xOf(at) + (name === 'lo' ? -12 : name === 'hi' ? 12 : 0);
    shapes.push(
      {
        kind: 'arrow',
        id: `${name}-arrow`,
        x1: x,
        y1: Y0 + H + 62,
        x2: x,
        y2: Y0 + H + 27,
        role: role(name),
      },
      {
        kind: 'text',
        id: name,
        x: x + (name === 'lo' ? -4 : name === 'hi' ? 4 : 0),
        y: Y0 + H + 80,
        text: name,
        size: 15 * f,
        anchor: name === 'lo' ? 'end' : name === 'hi' ? 'start' : 'middle',
        mono: true,
        cls: 'pointer',
        role: role(name),
      },
    );
  }

  shapes.push({
    kind: 'text',
    id: 'size',
    x: X0,
    y: Y0 + H + 112,
    text: `size = ${state.size}`,
    size: 15 * f,
    mono: true,
    cls: 'label',
    role: role('size'),
  });

  const box = (
    id: string,
    x: number,
    label: string,
    valueId: string,
    value: Value,
    r?: MarkRole,
  ) => {
    const text = String(value);
    shapes.push(
      {
        kind: 'rect',
        id: `${id}-box`,
        x: x - BOX_W / 2,
        y: BOX_Y - 24,
        w: BOX_W,
        h: 40,
        r: 8,
        cls: 'ghost',
        role: r,
      },
      {
        kind: 'text',
        id: `${id}-label`,
        x,
        y: BOX_Y - 32,
        text: label,
        size: 14 * f,
        anchor: 'middle',
        cls: 'label',
        mono: true,
      },
      {
        kind: 'text',
        id: valueId,
        x,
        y: BOX_Y + 3,
        text,
        size: fit(text, BOX_W),
        anchor: 'middle',
        weight: 'bold',
        role: role(valueId) ?? r,
        z: 3,
      },
    );
  };
  if (extra.key) {
    const { value, uid, error } = extra.key;
    box('key', X0 + BOX_W / 2, 'x', uid ? `v${uid}` : 'key', value, error ? 'error' : undefined);
  }
  if (extra.result) {
    box('result', X0 + BOX_W * 1.5 + 30, 'returned', 'result', extra.result.text, 'found');
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: Y0 + H + 124 },
    label: describe(state, settings),
  };
}
