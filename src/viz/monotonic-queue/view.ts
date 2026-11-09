/**
 * The array (bars or cells) with the window as a dashed band and i under it, the answers row
 * (each window's maximum, under the window's first index), and the deque as a row of boxes,
 * front on the left. Indices in the deque are outlined in the array too, so the staircase
 * they form is visible where the values are.
 */
import type { MarkRole } from '../../engine/types';
import { barsGeometry, barsScene, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import { describeArray } from '../_sorting/view';
import { CELL_ROW_H, cellRowShapes, grow, LIST_ROW_H, listRowShapes } from '../_techniques/kit';
import type { QueueSettings, QueueStep } from './model';

export function view(step: QueueStep, settings: QueueSettings): Scene {
  const { state } = step;
  const extra = step.extra ?? {};
  const n = state.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const deque = extra.deque ?? [];
  for (const k of deque) {
    const id = `v${state.a[k]!.uid}`;
    if (!roles.has(id)) roles.set(id, 'visit');
  }
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, ...state.a.map((x) => x.value)),
    regionLanes: 1,
    pointerLanes: 1,
    barHeight: 150,
  };
  const g = barsGeometry(frame);
  const bars = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items: state.a }],
    pointers: extra.pointers,
    regions: extra.regions,
    roles,
  });
  const shapes: Shape[] = [...bars.shapes];
  let bounds = bars.bounds;
  let y = bounds.h - 6;
  const word = settings.goal === 'max' ? 'max' : 'min';
  if (extra.out) {
    const texts = Array.from({ length: n }, (_, s) => {
      if (s >= extra.out!.length) return null;
      const v = extra.out![s];
      return v === undefined ? '' : String(v);
    });
    shapes.push(
      ...cellRowShapes(
        g,
        { id: 'out', name: `${word} of the window that starts here`, texts, roles },
        y,
      ),
    );
    bounds = grow(bounds, 0, y, bounds.w, CELL_ROW_H + 4);
    y += CELL_ROW_H + 4;
  }
  if (extra.deque) {
    const valueAt = (k: number) => ({ x: g.center(k), y: g.row('a').valueY });
    shapes.push(
      ...listRowShapes(
        g,
        {
          id: 'dq',
          name: 'deque, front on the left, back on the right',
          items: deque.map((k) => ({
            key: state.a[k]!.uid,
            text: String(state.a[k]!.value),
            sub: `[${k}]`,
            from: valueAt(k),
          })),
          slots: n,
          roles,
        },
        y,
      ),
    );
    bounds = grow(bounds, 0, y, bounds.w, LIST_ROW_H + 8);
  }
  return { shapes, bounds, label: label(step, word) };
}

function label(step: QueueStep, word: string): string {
  const e = step.extra ?? {};
  const a = step.state.a;
  const parts = [describeArray(step.state)];
  const w = e.regions?.find((r) => r.id === 'window');
  if (w) parts.push(`Window A[${w.from}..${w.to}].`);
  if (e.deque)
    parts.push(
      e.deque.length
        ? `Deque, front to back: ${e.deque.map((k) => `${a[k]!.value} (index ${k})`).join(', ')}.`
        : 'The deque is empty.',
    );
  const known = (e.out ?? []).filter((x): x is number => x !== undefined);
  if (known.length) parts.push(`Window ${word}s so far: ${known.join(', ')}.`);
  return parts.join(' ');
}
