/**
 * The drawing:
 *
 * - The lattice of masks: one row per number of tasks given out (row k belongs to the first k
 *   workers, named at its left), masks in each row in numeric order. Each mask is a box with its
 *   bits (task 0 on the right, as on /bitmask/) over a cell with its value: f[mask] for the
 *   pattern, how many calls reached it for the naive approach. A faint line joins each mask to
 *   each mask one task bigger; the line a mask's cheapest way came in on is drawn stronger, and
 *   the naive approach's current order is a path down the lattice.
 * - The cost table (src/layouts/table.ts): one row per worker, one column per task. Beside its
 *   rows, the task each worker has now (naive) and in the best so far, with the totals.
 *
 * The cost table sits right of the lattice on a wide stage and above it on a tall one, decided
 * from n, so it holds still during a run.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { tableGeometry, tableScene, type TableFrame } from '../../layouts/table';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { members, popcountOf } from '../bitmask/model';
import {
  bestId,
  bits,
  describe,
  edgeId,
  fId,
  maskId,
  nowId,
  worker,
  type AssignExtra,
  type AssignSettings,
  type AssignState,
  type AssignStep,
} from './model';

const PAD = 14;
const HEADER = 40;
const BITS = 18;
const VALUE = 17;
const BH = 28;
const VH = 26;
const ROW = 86;
const LABEL_W = 52;
const CELL = 42;
const SIDE_W = 46;
const NAME = 15;

function text(
  id: string,
  x: number,
  y: number,
  t: string,
  size: number,
  more: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape {
  return { kind: 'text', id, x, y, text: t, size, anchor: 'middle', ...more };
}

const maskW = (n: number) => Math.max(46, Math.ceil(n * 0.6 * BITS) + 18);

/** Masks by row: row k holds the masks with k bits, in numeric order. */
function rowsOf(n: number): number[][] {
  const rows: number[][] = Array.from({ length: n + 1 }, () => []);
  for (let m = 0; m < 1 << n; m++) rows[popcountOf(m)]!.push(m);
  return rows;
}

/** The lattice with its top left at (0, 0). */
function lattice(
  s: AssignState,
  e: AssignExtra | undefined,
  naive: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const n = s.cost.length;
  const rows = rowsOf(n);
  const mw = maskW(n);
  const pitch = mw + 14;
  const widest = Math.max(...rows.map((r) => r.length));
  const width = LABEL_W + widest * pitch;
  const at = new Map<number, { x: number; y: number }>();
  rows.forEach((row, k) => {
    const left = LABEL_W + ((widest - row.length) * pitch) / 2;
    row.forEach((m, i) => at.set(m, { x: left + i * pitch + pitch / 2, y: k * ROW }));
  });
  const shapes: Shape[] = [];
  // The naive approach's current order, as masks from the empty one down.
  const path = new Set<string>();
  if (naive && e?.now) {
    let m = 0;
    for (const t of e.now) {
      if (t === null) break;
      m |= 1 << t;
      path.add(edgeId(m, t));
    }
  }
  const final = s.best !== null;
  const chosenPath = new Set<string>();
  if (e?.path)
    for (let i = 0; i + 1 < e.path.length; i++) {
      const m = e.path[i]!;
      const t = members(m ^ e.path[i + 1]!)[0]!;
      chosenPath.add(edgeId(m, t));
    }
  for (let m = 1; m < 1 << n; m++) {
    for (const t of members(m)) {
      const id = edgeId(m, t);
      const a = at.get(m ^ (1 << t))!;
      const b = at.get(m)!;
      const into = !naive && s.last[m] === t;
      const base: MarkRole | undefined = path.has(id)
        ? 'visit'
        : chosenPath.has(id)
          ? 'found'
          : undefined;
      const role = roles.get(id) ?? base;
      shapes.push({
        kind: 'arrow',
        id,
        x1: a.x,
        y1: a.y + BH + VH,
        x2: b.x,
        y2: b.y,
        head: 'none',
        role,
        opacity: role ? 1 : into ? 0.6 : 0.2,
      });
    }
  }
  for (const [k, row] of rows.entries()) {
    if (k > 0)
      shapes.push(
        text(
          `row-${k}`,
          LABEL_W - 12,
          k * ROW + BH / 2 + 5,
          [...'ABCD'].slice(0, k).join(''),
          NAME,
          {
            anchor: 'end',
            cls: 'label',
            mono: true,
          },
        ),
      );
    for (const m of row) {
      const p = at.get(m)!;
      const role = roles.get(maskId(m));
      shapes.push({
        kind: 'rect',
        id: maskId(m),
        x: p.x - mw / 2,
        y: p.y,
        w: mw,
        h: BH,
        r: 4,
        cls: 'cell live',
        role,
      });
      shapes.push(
        text(`${maskId(m)}-t`, p.x, p.y + BH / 2 + BITS * 0.36, bits(m, n), BITS, {
          mono: true,
          weight: 'bold',
          role,
        }),
      );
      const v = naive ? (e?.seen ? e.seen[m]! : 0) || null : s.f[m];
      const vrole = roles.get(fId(m)) ?? (final && m === (1 << n) - 1 ? 'found' : undefined);
      shapes.push({
        kind: 'rect',
        id: fId(m),
        x: p.x - mw / 2,
        y: p.y + BH,
        w: mw,
        h: VH,
        r: 2,
        cls: v === null ? 'cell' : 'cell live',
        role: vrole,
      });
      if (v !== null)
        shapes.push(
          text(`${fId(m)}-t`, p.x, p.y + BH + VH / 2 + VALUE * 0.36, String(v), VALUE, {
            weight: 'bold',
            role: vrole,
          }),
        );
    }
  }
  return { shapes, bounds: { x: 0, y: 0, w: width, h: n * ROW + BH + VH } };
}

/** The cost table and the task columns beside it, with its top left at (0, 0). */
function costs(
  s: AssignState,
  e: AssignExtra | undefined,
  naive: boolean,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const n = s.cost.length;
  const frame: TableFrame = {
    rows: n,
    cols: n,
    colHeads: 1,
    rowHeads: [34],
    cellW: CELL,
    cellH: 36,
  };
  const g = tableGeometry(frame);
  const table = tableScene(frame, {
    values: s.cost.map((r) => r.map(String)),
    colHeads: [Array.from({ length: n }, (_, t) => String(t))],
    rowHeads: [Array.from({ length: n }, (_, w) => worker(w))],
    rowStyles: ['label'],
    roles,
  });
  const left = g.gridLeft - 34;
  const top = g.headY(0) - 24;
  const shapes = translate(table.shapes, -left, 22 - top);
  const dy = 22 - top;
  shapes.push(
    text('cost-title', 0, 16, 'cost: worker × task', NAME, {
      anchor: 'start',
      cls: 'label',
      mono: true,
    }),
  );
  // Task columns beside the rows: now (naive) and best.
  const cols: {
    id: string;
    label: string;
    tasks: (number | null)[];
    total: number | null;
    cell: (w: number) => string;
  }[] = [];
  if (naive)
    cols.push({
      id: 'now',
      label: 'now',
      tasks: e?.now ?? [],
      total: e?.now?.some((t) => t !== null) ? (e.total ?? null) : null,
      cell: nowId,
    });
  const bestTasks = e?.bestTasks ?? (s.tasks && s.best !== null ? s.tasks : null) ?? [];
  const bestTotal = e?.bestTotal ?? s.best;
  const showBestTotal = bestTotal !== null && bestTotal !== undefined && (naive || s.best !== null);
  cols.push({
    id: 'best',
    label: 'best',
    tasks: bestTasks,
    total: showBestTotal ? bestTotal : null,
    cell: bestId,
  });
  const x0 = g.gridRight - left + 16;
  cols.forEach((c, j) => {
    const cx = x0 + j * (SIDE_W + 8) + SIDE_W / 2;
    shapes.push(
      text(`${c.id}-head`, cx, g.headY(0) + dy, c.label, NAME, { cls: 'label', mono: true }),
    );
    for (let w = 0; w < n; w++) {
      const id = c.cell(w);
      const t = c.tasks[w];
      const has = t !== null && t !== undefined;
      const role =
        roles.get(id) ?? (has && c.id === 'best' && s.best !== null ? 'found' : undefined);
      const y = g.top(w) + dy + 3;
      shapes.push({
        kind: 'rect',
        id,
        x: cx - SIDE_W / 2,
        y,
        w: SIDE_W,
        h: 30,
        r: 4,
        cls: has ? 'cell live' : 'cell',
        role,
      });
      if (has)
        shapes.push(
          text(`${id}-t`, cx, y + 15 + VALUE * 0.36, String(t), VALUE, {
            weight: 'bold',
            mono: true,
            role,
          }),
        );
    }
    if (c.total !== null)
      shapes.push(
        text(`${c.id}-total`, cx, g.gridBottom + dy + 24, `= ${c.total}`, VALUE, {
          weight: 'bold',
          mono: true,
        }),
      );
  });
  const w = x0 + cols.length * (SIDE_W + 8);
  return { shapes, bounds: { x: 0, y: 0, w, h: g.gridBottom + dy + 32 } };
}

export function view(step: AssignStep, settings: AssignSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = e ? e.approach === 'naive' : settings.approach === 'naive';
  const lat = lattice(s, e, naive, roles);
  const tab = costs(s, e, naive, roles);
  const head = naive
    ? 'every order; under each mask: calls that reached it'
    : 'f[mask]: the cheapest way to give out the tasks in mask';
  const headShape = text('head', PAD, 26, head, NAME, {
    anchor: 'start',
    cls: 'label',
    mono: true,
  });
  const headW = 2 * PAD + head.length * 0.6 * NAME;
  type Arr = { shapes: Shape[]; bounds: Bounds };
  // Beside: lattice left, table right.
  const top = HEADER + 12;
  const bx = PAD + lat.bounds.w + 30;
  const beside: Arr = {
    shapes: [headShape, ...translate(lat.shapes, PAD, top), ...translate(tab.shapes, bx, top + 20)],
    bounds: {
      x: 0,
      y: 0,
      w: Math.max(bx + tab.bounds.w + PAD, headW),
      h: top + Math.max(lat.bounds.h, tab.bounds.h + 20) + PAD,
    },
  };
  // Stacked: table on top, lattice under it.
  const w = Math.max(lat.bounds.w, tab.bounds.w);
  const ly = top + tab.bounds.h + 26;
  const stacked: Arr = {
    shapes: [
      headShape,
      ...translate(tab.shapes, PAD + (w - tab.bounds.w) / 2, top),
      ...translate(lat.shapes, PAD + (w - lat.bounds.w) / 2, ly),
    ],
    bounds: { x: 0, y: 0, w: Math.max(w + 2 * PAD, headW), h: ly + lat.bounds.h + PAD },
  };
  const pick = pickLayout(stage, [beside, stacked]);
  return { shapes: pick.shapes, bounds: pick.bounds, label: label(step) };
}

function label(step: AssignStep): string {
  const parts = [describe(step.state)];
  const e = step.extra;
  const n = step.state.cost.length;
  if (e?.mask !== undefined) parts.push(`Now at mask ${bits(e.mask, n)}.`);
  if (e?.approach === 'naive' && e.now?.some((t) => t !== null))
    parts.push(
      `Current order: ${e.now
        .map((t, w) => (t === null ? null : `${worker(w)} → ${t}`))
        .filter(Boolean)
        .join(', ')}, total ${e.total ?? 0}.`,
    );
  if (e?.bestTotal !== null && e?.bestTotal !== undefined)
    parts.push(`Best so far: ${e.bestTotal}.`);
  return parts.join(' ');
}
