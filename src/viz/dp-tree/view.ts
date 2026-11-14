/**
 * The drawing: the tree, each node a circle with its value and its name (A, B, ...) at its left.
 *
 * - The pattern: under every node a strip of two cells, take | skip, filled from the leaves up;
 *   edges leave a node from the bottom of its strip, so the strip reads as part of the node.
 *   A legend on top names the two cells; the running call is marked, and the calls waiting on
 *   the stack (its ancestors) are drawn as visited.
 * - The naive approach: no strips. Nodes taken in the current choice are drawn as new, nodes
 *   left out as stale. A small table of bits, one column per node in level order, shows the
 *   current choice and the best so far, with their totals. It sits under the tree, or beside it
 *   when that draws larger (decided from the tree, so it holds still during a run).
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import { layoutBinaryTree, trimmedLine, type TreeLayout } from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  bestId,
  describe,
  nodeId,
  nowId,
  skipId,
  takeId,
  type TreeExtra,
  type TreeSettings,
  type TreeState,
  type TreeStep,
} from './model';

const PAD = 14;
const R = 20;
const CW = 32;
const CH = 26;
const STRIP_DROP = R + 4;
const LEVEL = 96;
const NODE_W = 2 * CW + 6;
const HEADER = 46;
const VALUE = 18;
const NAME = 15;
const CELL_TEXT = 16;
/** The bits table: label column, cell pitch and size, and the total column. */
const BT = { label: 50, pitch: 32, cell: 28, total: 64, head: 22, row: 34 };

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

/** The tree, centered at x = 0 with the root's center at y = 0. Returns shapes and bounds. */
function drawTree(
  s: TreeState,
  e: TreeExtra | undefined,
  naive: boolean,
  roles: ReadonlyMap<string, MarkRole>,
  final: boolean,
): { shapes: Shape[]; bounds: Bounds } {
  const nodes = s.nodes;
  const tree: TreeLayout<number> = layoutBinaryTree<number>(
    nodes.length ? 0 : null,
    { left: (u) => nodes[u]!.left, right: (u) => nodes[u]!.right },
    { radius: R, gap: 10, levelGap: LEVEL, width: () => (naive ? 2 * R + 26 : NODE_W) },
  );
  const shapes: Shape[] = [];
  const waiting = new Set(e?.stack ?? []);
  const chosen = new Set(final ? (s.chosen ?? []) : []);
  const strips = !naive;
  for (const p of tree.nodes.values()) {
    const v = nodes[p.id]!;
    const u = v.uid;
    let base: MarkRole | undefined;
    if (chosen.has(u)) base = 'found';
    else if (naive && e?.now)
      base = e.now[u] === true ? 'new' : e.now[u] === false ? 'stale' : undefined;
    else if (waiting.has(u)) base = 'visit';
    const role = roles.get(nodeId(u)) ?? base;
    if (p.parent !== null) {
      const q = tree.nodes.get(p.parent)!;
      const from = strips ? { x: q.x, y: q.y + STRIP_DROP + CH } : q;
      shapes.push({
        kind: 'arrow',
        id: `edge-${u}`,
        ...trimmedLine(from, p, strips ? 0 : R, R),
        head: 'none',
      });
    }
    shapes.push({ kind: 'circle', id: nodeId(u), x: p.x, y: p.y, r: R, cls: 'live', role });
    const label = String(v.value);
    shapes.push(
      text(`key-${u}`, p.x, p.y + VALUE * 0.36, label, label.length > 2 ? 15 : VALUE, {
        weight: 'bold',
        role,
      }),
    );
    shapes.push(
      text(`name-${u}`, p.x - R - 5, p.y + NAME * 0.36, v.name, NAME, {
        anchor: 'end',
        cls: 'label',
        mono: true,
      }),
    );
    if (strips) {
      const memo = s.memo[u];
      const top = p.y + STRIP_DROP;
      for (const [k, id] of [
        [0, takeId(u)],
        [1, skipId(u)],
      ] as const) {
        const x = p.x - CW + k * CW;
        const cellRole = roles.get(id);
        shapes.push({
          kind: 'rect',
          id,
          x,
          y: top,
          w: CW,
          h: CH,
          r: 2,
          cls: memo ? 'cell live' : 'cell',
          role: cellRole,
        });
        if (memo) {
          const t = String(memo[k]);
          shapes.push(
            text(
              `${id}-t`,
              x + CW / 2,
              top + CH / 2 + CELL_TEXT * 0.36,
              t,
              t.length > 2 ? 14 : CELL_TEXT,
              {
                weight: 'bold',
                role: cellRole,
              },
            ),
          );
        }
      }
    }
  }
  const b = tree.bounds;
  const bottom = strips ? b.y + b.h + STRIP_DROP + CH - R + 2 : b.y + b.h;
  const left = Math.min(b.x - NAME, -R - 5 - NAME);
  const bounds =
    nodes.length === 0
      ? { x: -60, y: -R, w: 120, h: 2 * R }
      : { x: left, y: b.y, w: Math.max(b.x + b.w, R) - left, h: bottom - b.y };
  if (nodes.length === 0) shapes.push(text('empty', 0, 5, 'empty tree', 16, { cls: 'label' }));
  return { shapes, bounds };
}

/** The naive approach's table: one column per node, rows now and best, with totals. */
function drawBits(
  s: TreeState,
  e: TreeExtra,
  roles: ReadonlyMap<string, MarkRole>,
  final: boolean,
) {
  const nodes = s.nodes;
  const shapes: Shape[] = [];
  const x0 = BT.label;
  const cx = (u: number) => x0 + u * BT.pitch + BT.pitch / 2;
  nodes.forEach((v, u) => {
    shapes.push(text(`bh-${u}`, cx(u), BT.head - 6, v.name, NAME, { cls: 'label', mono: true }));
  });
  const rows: { id: string; label: string; bits: (boolean | null)[]; total: number | null }[] = [
    { id: 'now', label: 'now', bits: e.now ?? [], total: final ? null : (e.total ?? null) },
    { id: 'best', label: 'best', bits: e.bestSet ?? [], total: e.bestTotal ?? null },
  ];
  rows.forEach((row, k) => {
    const top = BT.head + k * BT.row;
    shapes.push(
      text(`${row.id}-label`, x0 - 8, top + BT.cell / 2 + 5, row.label, NAME, {
        anchor: 'end',
        cls: 'label',
        mono: true,
      }),
    );
    nodes.forEach((_, u) => {
      const id = row.id === 'now' ? nowId(u) : bestId(u);
      const bit = row.bits[u];
      const has = bit === true || bit === false;
      const role =
        roles.get(id) ??
        (bit === true ? (row.id === 'best' && final ? 'found' : 'new') : undefined);
      shapes.push({
        kind: 'rect',
        id,
        x: cx(u) - BT.cell / 2,
        y: top,
        w: BT.cell,
        h: BT.cell,
        r: 2,
        cls: has ? 'cell live' : 'cell',
        role,
      });
      if (has)
        shapes.push(
          text(`${id}-t`, cx(u), top + BT.cell / 2 + CELL_TEXT * 0.36, bit ? '1' : '0', CELL_TEXT, {
            weight: 'bold',
            mono: true,
            role,
          }),
        );
    });
    if (row.total !== null)
      shapes.push(
        text(
          `${row.id}-total`,
          x0 + nodes.length * BT.pitch + 10,
          top + BT.cell / 2 + 6,
          `= ${row.total}`,
          CELL_TEXT,
          {
            anchor: 'start',
            mono: true,
            weight: 'bold',
          },
        ),
      );
  });
  const w = x0 + Math.max(1, nodes.length) * BT.pitch + BT.total;
  return { shapes, bounds: { x: 0, y: 0, w, h: BT.head + 2 * BT.row - (BT.row - BT.cell) } };
}

const LEGEND_W = 50;
const NAIVE_HEAD = 'every allowed subset';
const noteText = (s: TreeState, final: boolean) =>
  final && s.best !== null && s.nodes.length ? `best = ${s.best}` : 'under each node';

/** The header: a legend for the strips (pattern) or what is being tried (naive). */
function header(naive: boolean, e: TreeExtra | undefined, s: TreeState, final: boolean): Shape[] {
  const out: Shape[] = [];
  const y = 14;
  if (naive) {
    out.push(
      text('head', PAD, y + 18, NAIVE_HEAD, 16, {
        anchor: 'start',
        cls: 'label',
        mono: true,
      }),
    );
    return out;
  }
  const lw = LEGEND_W;
  for (const [k, t] of ['take', 'skip'].entries()) {
    out.push({
      kind: 'rect',
      id: `legend-${t}`,
      x: PAD + k * lw,
      y,
      w: lw,
      h: CH,
      r: 2,
      cls: 'cell live',
    });
    out.push(text(`legend-${t}-t`, PAD + k * lw + lw / 2, y + CH / 2 + 5, t, 14, { mono: true }));
  }
  const note = noteText(s, final);
  out.push(
    text('legend-note', PAD + 2 * lw + 10, y + CH / 2 + 5, note, 15, {
      anchor: 'start',
      cls: final && s.best !== null ? undefined : 'label',
      weight: final && s.best !== null ? 'bold' : 'normal',
      role: final && s.best !== null ? 'found' : undefined,
      mono: true,
    }),
  );
  return out;
}

export function view(step: TreeStep, settings: TreeSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = e ? e.approach === 'naive' : settings.approach === 'naive';
  const final = s.best !== null;
  const tree = drawTree(s, e, naive, roles, final);
  const head = header(naive, e, s, final);
  const headW = naive
    ? 2 * PAD + NAIVE_HEAD.length * 0.6 * 16
    : 2 * PAD + 2 * LEGEND_W + 10 + noteText(s, final).length * 0.6 * 15;
  const bits = naive && e?.now ? drawBits(s, e, roles, final) : null;

  // The tree's top left goes to (PAD, HEADER).
  const tb = tree.bounds;
  const place = (dx: number, dy: number) => translate(tree.shapes, dx, dy);
  type Arr = { shapes: Shape[]; bounds: Bounds };
  const arrangements: Arr[] = [];
  const treeDx = PAD - tb.x;
  const treeDy = HEADER - tb.y;
  if (!bits) {
    const w = Math.max(tb.w + 2 * PAD, headW);
    const dx = treeDx + (w - 2 * PAD - tb.w) / 2;
    arrangements.push({
      shapes: [...head, ...place(dx, treeDy)],
      bounds: { x: 0, y: 0, w, h: HEADER + tb.h + PAD },
    });
  } else {
    // Under the tree.
    const bw = bits.bounds.w;
    const w = Math.max(tb.w, bw) + 2 * PAD;
    const tdx = treeDx + (w - 2 * PAD - tb.w) / 2;
    const by = HEADER + tb.h + 24;
    arrangements.push({
      shapes: [
        ...head,
        ...place(tdx, treeDy),
        ...translate(bits.shapes, PAD + (w - 2 * PAD - bw) / 2, by),
      ],
      bounds: { x: 0, y: 0, w: Math.max(w, headW), h: by + bits.bounds.h + PAD },
    });
    // Beside it, level with the tree's second row.
    const bx = PAD + tb.w + 30;
    const byB = HEADER + Math.min(LEVEL, tb.h / 2);
    arrangements.push({
      shapes: [...head, ...place(treeDx, treeDy), ...translate(bits.shapes, bx, byB)],
      bounds: {
        x: 0,
        y: 0,
        w: Math.max(bx + bw + PAD, headW),
        h: Math.max(HEADER + tb.h, byB + bits.bounds.h) + PAD,
      },
    });
  }
  const pick = pickLayout(stage, arrangements);
  return { shapes: pick.shapes, bounds: pick.bounds, label: label(step) };
}

function label(step: TreeStep): string {
  const parts = [describe(step.state)];
  const e = step.extra;
  if (e?.approach === 'naive' && e.now) {
    const s = step.state;
    const inNow = s.nodes.filter((v) => e.now![v.uid] === true).map((v) => v.name);
    if (e.now.some((x) => x !== null))
      parts.push(
        `Current choice takes ${inNow.length ? inNow.join(', ') : 'no nodes'}, total ${e.total ?? 0}.`,
      );
    if (e.bestTotal !== null && e.bestTotal !== undefined)
      parts.push(`Best so far: ${e.bestTotal}.`);
  }
  return parts.join(' ');
}
