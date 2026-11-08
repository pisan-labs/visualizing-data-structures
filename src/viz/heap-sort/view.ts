/**
 * Heap sort: the heap part of A as a tree on top, and all of A as bars (or cells) underneath,
 * drawn with the sorting pages' bars layout. The tree has a node for every slot; slots past the
 * heap are faded there and shaded "sorted" in the bars.
 *
 * Marks name values by their bar ids (v<uid>); the tree draws a marked value's node in the same
 * role, so a swap highlights the value in both pictures.
 */
import type { MarkRole } from '../../engine/types';
import { barsGeometry, barsScene, type BarsFrame } from '../../layouts/bars';
import { nodeShapeId } from '../../layouts/binary-tree';
import { drawHeapTree, heapLayout, shiftHeapLayout, treeIndexRoom } from '../../layouts/heap';
import type { Bounds, Scene } from '../../render/scene';
import type { ArrayState, ArrayStep } from '../_sorting/kit';
import { HEAP_REGION, type HeapSortSettings } from './model';

/** Big enough nodes to read on a phone next to 20 bars: the bars set the scene's width. */
const R = 26;
const GAP = 10;
const LEVEL_GAP = 66;
const INDEX_SIZE = 19;
/** The tree's bottom index labels end here, above the bars' region labels. */
const JOIN = 40;
/** Shorter bars than the other sorting pages: the tree takes the rest of the height. */
const BAR_HEIGHT = 96;
/** The faded, sorted part of the tree. */
const FADED = 0.3;

/** heapSize at a step: the heap region's length, or 0 once everything is sorted. */
export function heapSizeOf(step: { state: ArrayState; extra?: ArrayStep['extra'] }): number {
  const regions = step.extra?.regions ?? [];
  const heap = regions.find((r) => r.id === HEAP_REGION);
  if (heap) return heap.to + 1;
  const done = regions.filter((r) => r.tone === 'done').map((r) => r.from);
  return done.length ? Math.min(...done) : step.state.a.length;
}

export function view(step: ArrayStep, settings: HeapSortSettings): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const base = settings.index === 'zero' ? 0 : 1;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));

  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, ...state.a.map((x) => x.value)),
    regionLanes: 1,
    pointerLanes: 1,
    barHeight: BAR_HEIGHT,
  };
  const g = barsGeometry(frame);
  const bars = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items: state.a, indexLabel: (i) => String(i + base) }],
    pointers: extra.pointers,
    regions: extra.regions,
    roles,
  });

  // A value's mark colors its node too.
  const treeRoles = new Map(roles);
  for (const [id, role] of roles) {
    const uid = /^v(\d+)$/.exec(id)?.[1];
    if (uid !== undefined) treeRoles.set(nodeShapeId(Number(uid)), role);
  }
  const heapSize = heapSizeOf(step);
  const sorted = (p: number) => p >= heapSize;
  const raw = heapLayout(n, { radius: R, gap: GAP, levelGap: LEVEL_GAP });
  const bottom = raw.bounds.y + raw.bounds.h + treeIndexRoom(INDEX_SIZE);
  const layout = shiftHeapLayout(raw, g.width / 2, JOIN - bottom);
  const tree = drawHeapTree(
    layout,
    state.a.map((x) => ({ id: x.uid, text: String(x.value) })),
    {
      roles: treeRoles,
      base,
      indexSize: INDEX_SIZE,
      opacity: (p) => (sorted(p) ? FADED : undefined),
      baseRole: (p) => (sorted(p) ? 'done' : undefined),
    },
  );

  const top = n > 0 ? layout.bounds.y - 12 : 0;
  const left = Math.min(0, layout.bounds.x - 12);
  const right = Math.max(g.width, layout.bounds.x + layout.bounds.w + 12);
  const bounds: Bounds = { x: left, y: top, w: right - left, h: bars.bounds.h - top };
  return { shapes: [...tree, ...bars.shapes], bounds, label: describeStep(step, base) };
}

/** Screen-reader summary: the heap part and the sorted part. */
export function describeHeapSort(state: ArrayState, base = 1, heapSize = state.a.length): string {
  const n = state.a.length;
  if (n === 0) return 'The array is empty.';
  const vs = state.a.map((x) => x.value);
  const name = (lo: number, hi: number) =>
    lo === hi ? `A[${lo + base}]` : `A[${lo + base}..${hi + base}]`;
  const parts = [`Array A with ${n} ${n === 1 ? 'value' : 'values'}: ${vs.join(', ')}.`];
  if (heapSize > 0 && heapSize < n)
    parts.push(
      `The heap is ${name(0, heapSize - 1)}, with ${vs[0]} at the root; ${name(heapSize, n - 1)} is sorted.`,
    );
  else if (heapSize === 0) parts.push('All of it is sorted.');
  return parts.join(' ');
}

function describeStep(step: ArrayStep, base: number): string {
  const text = describeHeapSort(step.state, base, heapSizeOf(step));
  const pointers = step.extra?.pointers ?? [];
  return pointers.length
    ? `${text} ${pointers.map((p) => `${p.name} at index ${p.at + base}`).join(', ')}.`
    : text;
}
