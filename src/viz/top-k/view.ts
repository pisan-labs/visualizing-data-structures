/**
 * The drawing, by approach:
 *
 * - the heap: A, read left to right with a pointer i, and the min-heap of the best k so far.
 *   A value in the heap has left its slot in A; a value that was passed over or pushed out of
 *   the heap is back in its slot, gray.
 * - sorting everything: the copy being merge sorted, in two rows A and B. Each pass moves every
 *   value from one row to the other; brackets mark the two runs being merged.
 * - quickselect: the copy, with the range A[p..r] bracketed above it and i, j, q and the target
 *   t under it.
 *
 * Each operation keeps its frame (rows, lanes, the heap's slots), so the camera holds still. On
 * a wide stage the heap sits beside A; on a tall one, under it.
 */
import type { Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  BRACKET_ROOM,
  drawRow,
  FONT,
  heading,
  heapPanel,
  PITCH,
  pointerRoom,
  pointers,
  runBracket,
  union,
  valueRoles,
  type Pointer,
  type Roles,
} from '../_heaps2/draw';
import { fullSize, type HItem } from '../_heaps2/heap';
import { monoWidth } from '../../layouts/columns';
import { ordinal } from '../_heaps2/say';
import { describe, methodOf, type TopExtra, type TopSettings, type TopState } from './model';

const PAD = 14;
const NAME_W = 30;
const X0 = PAD + NAME_W;
const HEAD_Y = 26;
const GAP = 40;

type TopStep = Step<TopState, TopExtra>;

interface Part {
  shapes: Shape[];
  bounds: Bounds;
}

function headingText(e: TopExtra, n: number, settings: TopSettings): string {
  const k = e.k;
  if (settings.goal === 'kth') return `the ${k === 1 ? '' : `${ordinal(k)} `}largest of ${n}`;
  return k === 1 ? `the largest of ${n}` : `the ${k} largest of ${n}`;
}

/** Row A of the heap approach, with the pointer i. */
function heapRow(step: TopStep, roles: Roles, top: number): Part {
  const e = step.extra!;
  const a = step.state.a;
  const inHeap = new Set((e.heap ?? []).map((x) => x.uid));
  const out = new Set(e.out ?? []);
  const row = drawRow({
    id: 'a',
    items: a.map((x) => (inHeap.has(x.uid) ? null : x)),
    x0: X0,
    top,
    roles,
    name: 'A',
    stale: (x) => out.has(x.uid),
  });
  const ptr = pointers('a', e.answer ? [] : [{ name: 'i', at: e.i ?? 0, role: 'active' }], {
    x0: X0,
    top: row.bottom + 2,
  });
  const bottom = row.bottom + pointerRoom(e.lanes);
  return { shapes: [...row.shapes, ...ptr.shapes], bounds: { x: 0, y: 0, w: row.right + PAD, h: bottom } };
}

/** The sort: rows A and B, with brackets over the two runs being merged. */
function sortRows(step: TopStep, roles: Roles, top: number): Part {
  const e = step.extra!;
  const rows = e.rows!;
  const n = rows[0].length;
  const shapes: Shape[] = [];
  const width = X0 + n * PITCH + PAD;
  const clamp = { min: PAD, max: width - PAD };
  const tops = [top + BRACKET_ROOM, 0];
  const a = drawRow({ id: 'a', items: rows[0], slots: n, x0: X0, top: tops[0]!, roles, name: 'A' });
  tops[1] = a.bottom + BRACKET_ROOM + 6;
  const b = drawRow({ id: 'b', items: rows[1], slots: n, x0: X0, top: tops[1], roles, name: 'B' });
  shapes.push(...a.shapes, ...b.shapes);
  if (e.merge) {
    const y = tops[e.from ?? 0]! - 10;
    const { lo, mid, hi } = e.merge;
    const room = Math.min(mid - lo + 1, hi - mid) * PITCH;
    const [l, r] =
      room >= monoWidth('right run', FONT.label) + 10
        ? ['left run', 'right run']
        : room >= monoWidth('right', FONT.label) + 8
          ? ['left', 'right']
          : ['L', 'R'];
    shapes.push(
      ...runBracket({ id: 'run-l', lo, hi: mid, x0: X0, y, label: l, role: 'active', clamp }),
      ...runBracket({ id: 'run-r', lo: mid + 1, hi, x0: X0, y, label: r, role: 'compare', clamp }),
    );
  }
  return { shapes, bounds: { x: 0, y: 0, w: width, h: b.bottom } };
}

/** Quickselect: the copy, the range bracketed, pointers under it. */
function selectRow(step: TopStep, roles: Roles, top: number): Part {
  const e = step.extra!;
  const w = e.work!;
  const n = w.length;
  const width = X0 + n * PITCH + PAD;
  const t = e.t ?? 0;
  const p = e.p ?? 0;
  const r = e.r ?? n - 1;
  const done = (i: number) => i < p || i > r;
  const row = drawRow({
    id: 'a',
    items: w,
    x0: X0,
    top: top + BRACKET_ROOM,
    roles,
    name: 'A',
    stale: (_x, i) => !e.answer && done(i),
    slotRole: (i) => (i === t ? 'found' : undefined),
  });
  const shapes: Shape[] = [...row.shapes];
  if (!e.answer)
    shapes.push(
      ...runBracket({
        id: 'range',
        lo: p,
        hi: r,
        x0: X0,
        y: top + BRACKET_ROOM - 10,
        label: p === r ? `A[${p}]` : `A[${p}..${r}]`,
        role: 'active',
        clamp: { min: PAD, max: width - PAD },
      }),
    );
  const ps: Pointer[] = [];
  if (!e.answer) {
    if (e.pi !== undefined && e.pi >= p) ps.push({ name: 'i', at: e.pi, role: 'active' });
    if (e.j !== undefined && e.q === undefined) ps.push({ name: 'j', at: e.j, role: 'compare' });
    if (e.q !== undefined) ps.push({ name: 'q', at: e.q, role: 'active' });
  }
  ps.push({ name: 't', at: t, role: 'found' });
  shapes.push(...pointers('a', ps, { x0: X0, top: row.bottom + 2 }).shapes);
  return { shapes, bounds: { x: 0, y: 0, w: width, h: row.bottom + pointerRoom(e.lanes) } };
}

function heapPart(step: TopStep, roles: Roles, cx: number, top: number): Part {
  const e = step.extra!;
  const heap: HItem[] = e.heap ?? [];
  const panel = heapPanel({
    prefix: 'h',
    items: heap,
    capacity: fullSize(e.k),
    cx,
    top,
    roles,
    title: `min-heap, best ${e.k}`,
  });
  return { shapes: panel.shapes, bounds: panel.bounds };
}

export function view(step: TopStep, settings: TopSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = valueRoles(step.marks);
  const label = labelOf(step, settings);
  if (!e) {
    const row = drawRow({ id: 'a', items: s.a, x0: X0, top: 16, roles, name: 'A' });
    return { shapes: row.shapes, bounds: { x: 0, y: 0, w: row.right + PAD, h: row.bottom + PAD }, label };
  }
  const method = methodOf(settings);
  const head = heading('heading', headingText(e, s.a.length, settings), PAD, HEAD_Y);
  const headW = PAD + monoWidth(head.kind === 'text' ? head.text : '', FONT.label) + PAD;
  const top = HEAD_Y + 18;
  if (method === 'naive') {
    const part = sortRows(step, roles, top);
    return finish([head, ...part.shapes], part.bounds, headW, label);
  }
  if (method === 'select') {
    const part = selectRow(step, roles, top);
    return finish([head, ...part.shapes], part.bounds, headW, label);
  }
  const row = heapRow(step, roles, top);
  // Beside: the heap right of A, its top level with A's. Under: centered under A.
  const probe = heapPart(step, roles, 0, 0);
  const halfW = probe.bounds.w / 2;
  const besideX = row.bounds.w + GAP - PAD + halfW;
  const beside = heapPart(step, roles, besideX, HEAD_Y - 18 + ZOOM_DROP);
  const under = heapPart(step, roles, Math.max(X0 + halfW, row.bounds.w / 2), row.bounds.h + 4);
  const options = [beside, under].map((h) => ({
    shapes: [head, ...row.shapes, ...h.shapes],
    bounds: union(row.bounds, { ...h.bounds, w: h.bounds.w + PAD, h: h.bounds.h + PAD }),
  }));
  const pick = pickLayout(stage, options);
  return finish(pick.shapes, pick.bounds, headW, label);
}

function finish(shapes: Shape[], b: Bounds, headW: number, label: string): Scene {
  const w = Math.max(b.x + b.w, headW);
  return { shapes, bounds: { x: 0, y: 0, w, h: b.y + b.h + PAD }, label };
}

function labelOf(step: TopStep, settings: TopSettings): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  const method = methodOf(settings);
  if (method === 'pattern') {
    const heap = e.heap ?? [];
    parts.push(
      heap.length
        ? `The min-heap holds ${heap.map((x) => x.key).join(', ')}, with ${heap[0]!.key} at the root.`
        : 'The min-heap is empty.',
    );
  } else if (method === 'naive' && e.rows) {
    const show = (r: (HItem | null)[]) => r.map((x) => (x ? x.key : '_')).join(' ');
    parts.push(`Row A: ${show(e.rows[0])}. Row B: ${show(e.rows[1])}.`);
  } else if (e.work) {
    parts.push(
      `The copy: ${e.work.map((x) => x.key).join(', ')}. Range A[${e.p}..${e.r}], target A[${e.t}].`,
    );
  }
  return parts.join(' ');
}
