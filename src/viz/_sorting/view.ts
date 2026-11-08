/**
 * The one look shared by the sorting and searching pages: a step's array, pointers, regions,
 * call stack and held value, drawn with the bars layout (src/layouts/bars.ts).
 */
import type { MarkRole } from '../../engine/types';
import {
  barsGeometry,
  barsScene,
  type BarsFrame,
  type BarsGeometry,
  type BarsRow,
} from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { ArrayState, ArrayStep, Draw, Item } from './kit';

/** Lanes a page reserves, so the frame stays the same for every step. */
export interface PageLayout {
  held?: boolean;
  calls?: boolean;
  aux?: boolean;
  regionLanes?: number;
  pointerLanes?: number;
  /** One extra slot past the end for a sentinel. */
  sentinel?: boolean;
  barHeight?: number;
  callsHeight?: number;
}

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;

const ghostsOf = (items: readonly (Item | null)[]) =>
  items.flatMap((x, index) => (x && x.stale ? [{ index, value: x.value }] : []));

/**
 * Shapes a page draws over the array (interpolation search's straight line), placed with the
 * same geometry and frame as the bars. Optional; pages without one draw exactly as before.
 */
export type Overlay = (g: BarsGeometry, frame: BarsFrame) => Shape[];

export function arrayView(
  step: ArrayStep,
  draw: Draw,
  layout: PageLayout = {},
  overlay?: Overlay,
): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const slots = n + (layout.sentinel ? 1 : 0);
  const auxItems = extra.aux?.items ?? [];
  const max = Math.max(
    1,
    ...state.a.map((x) => x.value),
    ...auxItems.filter((x): x is Item => !!x).map((x) => x.value),
    extra.held?.value ?? 0,
    extra.sentinel?.value ?? 0,
  );
  const frame: BarsFrame = {
    mode: draw,
    slots,
    max,
    rows: layout.aux ? ['a', 'aux'] : ['a'],
    calls: layout.calls,
    regionLanes: layout.regionLanes,
    held: layout.held,
    pointerLanes: layout.pointerLanes,
    barHeight: layout.barHeight,
    callsHeight: layout.callsHeight,
  };
  const items: (Item | null)[] = state.a.map((x) => (live(x) ? x : null));
  if (extra.sentinel) items[n] = extra.sentinel;
  const rows: BarsRow[] = [
    { id: 'a', label: 'A', items, ghosts: ghostsOf(state.a), from: 0, to: slots - 1 },
  ];
  if (layout.aux && extra.aux) {
    rows.push({
      id: 'aux',
      items: auxItems.map((x) => (live(x) ? x : null)),
      ghosts: ghostsOf(auxItems),
      from: extra.aux.from,
      to: extra.aux.to,
      indexLabel: extra.aux.label,
    });
  }
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const { shapes, bounds } = barsScene(frame, {
    rows,
    pointers: extra.pointers,
    regions: extra.regions,
    calls: extra.calls,
    held: extra.held,
    faded: extra.faded,
    roles,
  });
  const more = overlay ? overlay(barsGeometry(frame), frame) : [];
  return { shapes: [...shapes, ...more], bounds, label: describeStep(step) };
}

/** Screen-reader summary of the array. */
export function describeArray(state: ArrayState): string {
  if (state.a.length === 0) return 'The array is empty.';
  const vs = state.a.map((x) => (x.stale ? `(old copy of ${x.value})` : String(x.value)));
  return `Array A with ${state.a.length} ${state.a.length === 1 ? 'value' : 'values'}: ${vs.join(', ')}.`;
}

function describeStep(step: ArrayStep): string {
  const e = step.extra ?? {};
  const parts = [describeArray(step.state)];
  if (e.sentinel) parts.push(`Sentinel ${e.sentinel.value} in A[${step.state.a.length}].`);
  if (e.aux) {
    const vs = e.aux.items
      .slice(e.aux.from, e.aux.to + 1)
      .map((x) => (!x ? 'empty' : x.stale ? 'used' : String(x.value)));
    parts.push(`Auxiliary copies: ${vs.join(', ')}.`);
  }
  if (e.held) parts.push(`${e.held.label} = ${e.held.value}, held outside the array.`);
  if (e.pointers?.length)
    parts.push(`${e.pointers.map((p) => `${p.name} at index ${p.at}`).join(', ')}.`);
  return parts.join(' ');
}
