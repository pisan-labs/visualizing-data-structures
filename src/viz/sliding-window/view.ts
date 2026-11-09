/**
 * The array (cells or bars) with the window A[l..r] as a dashed band labeled with what it
 * keeps (its sum, or its length), l and r under it, and the best window so far as a gray band.
 * While distinct() runs, the counts of the values in the window sit in a row under the array.
 */
import type { MarkRole } from '../../engine/types';
import { barsGeometry, barsScene, type BarsFrame } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import { describeArray } from '../_sorting/view';
import { grow, LIST_ROW_H, listRowShapes } from '../_techniques/kit';
import type { WindowSettings, WindowStep } from './model';

export function view(step: WindowStep, settings: WindowSettings): Scene {
  const { state } = step;
  const extra = step.extra ?? {};
  const n = state.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, ...state.a.map((x) => x.value)),
    regionLanes: 2,
    pointerLanes: 1,
  };
  const { shapes, bounds } = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items: state.a }],
    pointers: extra.pointers,
    regions: extra.regions,
    roles,
  });
  const out: Shape[] = [...shapes];
  let b = bounds;
  if (extra.counts) {
    const y = bounds.h - 6;
    const slots = new Set(state.a.map((x) => x.value)).size;
    out.push(
      ...listRowShapes(
        barsGeometry(frame),
        {
          id: 'count',
          name: 'count[v]: the values in the window',
          items: extra.counts.map(([v, c]) => ({ key: v, text: String(v), sub: `×${c}` })),
          slots,
          roles,
        },
        y,
      ),
    );
    b = grow(b, 0, y, bounds.w, LIST_ROW_H + 8);
  }
  return { shapes: out, bounds: b, label: label(step) };
}

function label(step: WindowStep): string {
  const e = step.extra ?? {};
  const parts = [describeArray(step.state)];
  const w = e.regions?.find((r) => r.id === 'window');
  if (w) parts.push(`The window is A[${w.from}..${w.to}], ${w.label}.`);
  const best = e.regions?.find((r) => r.id === 'best');
  if (best) parts.push(`Best so far: A[${best.from}..${best.to}].`);
  if (e.counts?.length) parts.push(`Counts: ${e.counts.map(([v, c]) => `${v} ×${c}`).join(', ')}.`);
  return parts.join(' ');
}
