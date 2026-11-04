import type { MarkRole } from '../../engine/types';
import { barsScene, type BarItem, type BarsFrame, type BarsRow } from '../../layouts/bars';
import type { Scene } from '../../render/scene';
import type { ArrayState, Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import { COUNT_UID, type CountSettings, type CountStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;
const ghostsOf = (items: readonly (Item | null)[]) =>
  items.flatMap((x, index) => (x && x.stale ? [{ index, value: x.value }] : []));

const kOf = (s: ArrayState) => (s.a.length ? Math.max(...s.a.map((x) => x.value)) : 0);

/**
 * A on top, the count array C[0..k] in the middle (bars show the counts, a histogram that
 * turns into a staircase with the prefix sums), and the output array B below. Values keep
 * their uids, so each one visibly drops from A into B and goes back up at the end.
 */
export function view(step: CountStep, settings: CountSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const k = kOf(state);
  const counts = extra.counts?.values ?? Array<number | null>(k + 1).fill(null);
  const B = extra.aux?.items ?? Array<Item | null>(n).fill(null);
  const max = Math.max(1, k, n, ...counts.map((c) => c ?? 0));
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: Math.max(n, k + 1),
    max,
    rows: ['a', 'c', 'aux'],
    pointerLanes: 1,
    barHeight: 60,
  };
  const countItems: (BarItem | null)[] = counts.map((c, i) =>
    c === null ? null : { uid: COUNT_UID + i, value: c },
  );
  const rows: BarsRow[] = [
    {
      id: 'a',
      label: 'A',
      items: state.a.map((x) => (live(x) ? x : null)),
      ghosts: ghostsOf(state.a),
      from: 0,
      to: n - 1,
    },
    { id: 'c', label: 'C', items: countItems, from: 0, to: k },
    { id: 'aux', label: 'B', items: B.map((x) => (live(x) ? x : null)), from: 0, to: n - 1 },
  ];
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const { shapes, bounds } = barsScene(frame, {
    rows,
    pointers: extra.pointers,
    regions: extra.regions,
    roles,
  });
  return { shapes, bounds, label: label(step, k) };
}

function label(step: CountStep, k: number): string {
  const parts = [describeArray(step.state)];
  const counts = step.extra?.counts?.values;
  if (counts) parts.push(`Counts C[0..${k}]: ${counts.join(', ')}.`);
  const B = step.extra?.aux?.items;
  if (B?.some((x) => live(x)))
    parts.push(`Output B: ${B.map((x) => (live(x) ? String(x.value) : 'empty')).join(', ')}.`);
  if (step.extra?.pointers?.length)
    parts.push(`${step.extra.pointers.map((p) => `${p.name} at ${p.at}`).join(', ')}.`);
  return parts.join(' ');
}
