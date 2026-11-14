/**
 * The drawing, by approach:
 *
 * - the heap of heads: the lists L1..Lk, one row each, with taken values gone from their slots;
 *   the min-heap of heads (each node labeled with its list); and the merged list growing in the
 *   row `out`. A value travels from its list into the heap and on to `out`.
 * - merging in pairs: the lists, one row each; the two being merged have their names marked, and
 *   the merge grows in `out`. A merged list moves up into its first list's row.
 * - concatenating and sorting: every value in one array A, merge sorted with a second row B.
 *
 * Each operation keeps its frame (rows of n slots, the heap's k slots), so the camera holds still.
 * On a wide stage the heap sits beside the lists; on a tall one, under the merged row.
 */
import type { Step, StageSize } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { monoWidth } from '../../layouts/columns';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import {
  BRACKET_ROOM,
  drawRow,
  FONT,
  heading,
  heapPanel,
  PITCH,
  runBracket,
  union,
  valueRoles,
  type Roles,
} from '../_heaps2/draw';
import { fullSize, type HItem } from '../_heaps2/heap';
import { plural } from '../_heaps2/say';
import {
  describe,
  listName,
  methodOf,
  type MergeExtra,
  type MergeSettings,
  type MergeState,
} from './model';

const PAD = 14;
const X0 = PAD + 44;
const HEAD_Y = 26;
const ROW_GAP = 10;
const GAP = 44;

type MergeStep = Step<MergeState, MergeExtra>;

interface Part {
  shapes: Shape[];
  bounds: Bounds;
}

/** The list rows, from `top`; with no extra, the lists as loaded. */
function listRows(
  rows: readonly (readonly (HItem | null)[])[],
  roles: Roles,
  top: number,
  pair?: [number, number],
): Part & { bottom: number; right: number } {
  const shapes: Shape[] = [];
  let y = top;
  let right = X0;
  rows.forEach((r, j) => {
    const row = drawRow({
      id: `l${j}`,
      items: r,
      x0: X0,
      top: y,
      roles,
      name: listName(j),
      index: false,
      nameRole: pair?.includes(j) ? 'active' : undefined,
    });
    shapes.push(...row.shapes);
    right = Math.max(right, row.right);
    y = row.bottom + ROW_GAP;
  });
  const bottom = y - ROW_GAP;
  return { shapes, bounds: { x: 0, y: 0, w: right + PAD, h: bottom }, bottom, right };
}

export function view(step: MergeStep, settings: MergeSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = valueRoles(step.marks);
  const label = labelOf(step);
  const top = HEAD_Y + 18;
  if (!e) {
    const lists = listRows(s.lists, roles, 16);
    return {
      shapes: lists.shapes,
      bounds: { x: 0, y: 0, w: lists.right + PAD, h: lists.bottom + PAD },
      label,
    };
  }
  const k = s.lists.length;
  const method = methodOf(settings);
  const head = heading('heading', `merge ${plural(k, 'sorted list')}`, PAD, HEAD_Y);
  const headW = PAD + monoWidth(head.kind === 'text' ? head.text : '', FONT.label) + PAD;
  const width = X0 + e.n * PITCH + PAD;

  if (method === 'naive') {
    const rows = e.sort!;
    const shapes: Shape[] = [head];
    const tops = [top + BRACKET_ROOM, 0];
    const a = drawRow({
      id: 'a',
      items: rows[0],
      slots: e.n,
      x0: X0,
      top: tops[0]!,
      roles,
      name: 'A',
    });
    tops[1] = a.bottom + BRACKET_ROOM + 6;
    const b = drawRow({
      id: 'b',
      items: rows[1],
      slots: e.n,
      x0: X0,
      top: tops[1],
      roles,
      name: 'B',
    });
    shapes.push(...a.shapes, ...b.shapes);
    if (e.merge) {
      const { lo, mid, hi, from } = e.merge;
      const y = tops[from]! - 10;
      const clamp = { min: PAD, max: width - PAD };
      const room = Math.min(mid - lo + 1, hi - mid) * PITCH;
      const [l, r] =
        room >= monoWidth('right run', FONT.label) + 10
          ? ['left run', 'right run']
          : room >= monoWidth('right', FONT.label) + 8
            ? ['left', 'right']
            : ['L', 'R'];
      shapes.push(
        ...runBracket({ id: 'run-l', lo, hi: mid, x0: X0, y, label: l, role: 'active', clamp }),
        ...runBracket({
          id: 'run-r',
          lo: mid + 1,
          hi,
          x0: X0,
          y,
          label: r,
          role: 'compare',
          clamp,
        }),
      );
    }
    return finish(shapes, { x: 0, y: 0, w: width, h: b.bottom }, headW, label);
  }

  const lists = listRows(e.rows ?? [], roles, top, e.pair);
  const outTop = lists.bottom + 24;
  const out = drawRow({
    id: 'out',
    items: e.out ?? [],
    slots: e.n,
    x0: X0,
    top: outTop,
    roles,
    name: 'out',
  });
  const main: Part = {
    shapes: [head, ...lists.shapes, ...out.shapes],
    bounds: { x: 0, y: 0, w: Math.max(width, lists.right + PAD), h: out.bottom },
  };
  if (method === 'pairs') return finish(main.shapes, main.bounds, headW, label);

  const panel = (cx: number, y: number) =>
    heapPanel({
      prefix: 'h',
      items: e.heap ?? [],
      capacity: fullSize(k),
      cx,
      top: y,
      roles,
      title: 'min-heap of heads',
      label: (x) => listName(x.src ?? 0),
    });
  const probe = panel(0, 0);
  const half = probe.bounds.w / 2;
  // The longest list row: the lists keep their lengths in this approach.
  const listsRight = X0 + Math.max(1, ...s.lists.map((l) => l.length)) * PITCH;
  const beside = panel(listsRight + GAP + half, HEAD_Y - 18 + ZOOM_DROP);
  const under = panel(Math.max(X0 + half, width / 2), out.bottom + 6);
  const options = [beside, under].map((p) => ({
    shapes: [...main.shapes, ...p.shapes],
    bounds: union(main.bounds, { ...p.bounds, w: p.bounds.w + PAD, h: p.bounds.h + 6 }),
  }));
  const pick = pickLayout(stage, options);
  return finish(pick.shapes, pick.bounds, headW, label);
}

function finish(shapes: Shape[], b: Bounds, headW: number, label: string): Scene {
  const w = Math.max(b.x + b.w, headW);
  return { shapes, bounds: { x: 0, y: 0, w, h: b.y + b.h + PAD }, label };
}

function labelOf(step: MergeStep): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  if (e.heap)
    parts.push(
      e.heap.length
        ? `The heap of heads holds ${e.heap.map((x) => `${x.key} from ${listName(x.src ?? 0)}`).join(', ')}.`
        : 'The heap is empty.',
    );
  if (e.sort) {
    const show = (r: (HItem | null)[]) => r.map((x) => (x ? x.key : '_')).join(' ');
    parts.push(`Row A: ${show(e.sort[0])}. Row B: ${show(e.sort[1])}.`);
  }
  if (e.out)
    parts.push(
      e.out.length ? `Out so far: ${e.out.map((x) => x.key).join(' ')}.` : 'Nothing out yet.',
    );
  return parts.join(' ');
}
