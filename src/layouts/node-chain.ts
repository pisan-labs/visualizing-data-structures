/**
 * A chain of linked nodes for the stack, queue and deque pages built on linked lists.
 * (src/layouts/linked.ts, built for the linked-list pages, is the general version; this one
 * only needs chains where each pointer field is null or points at a neighbour.)
 *
 * - A node is a box: [value | next] for a singly linked list, [prev | value | next] for a
 *   doubly linked one. A pointer field that is set sends an arrow to its neighbour; a null
 *   field has a slash through it.
 * - Nodes sit in slots, four to a row so values stay readable on a phone, and a row ends by
 *   routing the link down to the start of the next row.
 * - Named pointers (top, head, tail) are labels with an arrow, above or below their node. A null
 *   named pointer points at the word "null": before the first node if it is drawn above, after
 *   the last if below.
 * - A `pending` node (made, not linked in yet) has a dashed outline; a `garbage` node (nothing
 *   points at it) is greyed and captioned.
 *
 * Shape ids: node box `n<uid>`, value `v<uid>`, link `n<uid>-next` / `n<uid>-prev` (the segment
 * with the arrowhead), null slash `n<uid>-next-null` / `n<uid>-prev-null`, named pointer label
 * `<name>` and its arrow `<name>-arrow`, returned value `out`.
 */
import type { MarkRole, Value } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type ChainKind = 'single' | 'double';

export interface ChainNode {
  uid: number;
  value: Value;
  /** pending: made, not linked in yet. garbage: nothing points at it any more. */
  status?: 'live' | 'pending' | 'garbage';
  /** Whether next points at the node in the following slot; otherwise it is null. */
  next: boolean;
  /** Doubly linked only: whether prev points at the node in the previous slot. */
  prev?: boolean;
}

export interface ChainPointer {
  name: string;
  /** Slot of the node it points at, or null. */
  to: number | null;
  side: 'above' | 'below';
}

export interface ChainDrawing {
  kind: ChainKind;
  /** In slot order. */
  nodes: ChainNode[];
  pointers: ChainPointer[];
  roles: Map<string, MarkRole>;
  /** A value on its way out of the node in slot `from`. */
  out?: { value: Value; from: number; label: string };
}

const COLS = 4;
/** Rows kept even when empty, so the camera holds still for short lists. */
const MIN_ROWS = 2;
const H = 42;
const GAP = 40;
/** Room above a row for labels, and below it for labels, then the lane between rows. */
const ABOVE = 46;
const BELOW = 46;
const LANE = 22;
const ROW_H = ABOVE + H + BELOW + LANE;
/** The band at the top holds the returned value, clear of the stage's zoom buttons. */
const TOP = 96;
const X0 = 64;
const LABEL = 15;
/** Paint order: node boxes are 1 and text 2, so links and dividers go in between. */
const LINK_Z = 1.5;

const SIZES = {
  single: { field: 24, value: 48 },
  double: { field: 20, value: 46 },
};

const valueSize = (text: string) => (text.length <= 3 ? 20 : text.length <= 5 ? 16 : 13);

export function drawChain(d: ChainDrawing): { shapes: Shape[]; bounds: Bounds } {
  const { field, value: vw } = SIZES[d.kind];
  const double = d.kind === 'double';
  const W = vw + field * (double ? 2 : 1);
  const pitch = W + GAP;
  const role = (id: string) => d.roles.get(id);
  const rows = Math.max(MIN_ROWS, Math.ceil((d.nodes.length + 1) / COLS));
  const shapes: Shape[] = [];

  const slot = (k: number) => {
    const row = Math.floor(k / COLS);
    const x = X0 + (k % COLS) * pitch;
    const y = TOP + ABOVE + row * ROW_H;
    return { x, y, cy: y + H / 2, row };
  };
  const laneY = (row: number) => TOP + ABOVE + row * ROW_H + H + BELOW + LANE / 2;
  const right = X0 + (COLS - 1) * pitch + W;

  const line = (
    id: string,
    pts: [number, number][],
    opts: { role?: MarkRole; head?: boolean; dashed?: boolean; cls?: string },
  ) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const last = k === pts.length - 2;
      shapes.push({
        kind: 'arrow',
        id: last ? id : `${id}-${k + 1}`,
        x1: pts[k]![0],
        y1: pts[k]![1],
        x2: pts[k + 1]![0],
        y2: pts[k + 1]![1],
        head: last && opts.head ? 'end' : 'none',
        role: opts.role,
        dashed: opts.dashed,
        cls: opts.cls,
        // Over the node boxes, so a link visibly leaves from its pointer field.
        z: LINK_Z,
      });
    }
  };

  /** The dot in a pointer field that is set. */
  const dot = (id: string, x: number, y: number) =>
    shapes.push({ kind: 'text', id, x, y: y + 5, text: '•', size: 16, anchor: 'middle' });

  d.nodes.forEach((node, k) => {
    const p = slot(k);
    const id = `n${node.uid}`;
    const status = node.status ?? 'live';
    const live = status === 'live';
    shapes.push({
      kind: 'rect',
      id,
      x: p.x,
      y: p.y,
      w: W,
      h: H,
      r: 6,
      role: role(id),
      cls: live ? 'cell live' : status === 'pending' ? 'cell ghost' : 'cell',
    });
    // Field dividers.
    const dividers = double ? [p.x + field, p.x + field + vw] : [p.x + vw];
    dividers.forEach((x, i) =>
      shapes.push({
        kind: 'arrow',
        id: `${id}-div${i}`,
        x1: x,
        y1: p.y,
        x2: x,
        y2: p.y + H,
        head: 'none',
        cls: 'divider',
        z: LINK_Z,
      }),
    );
    const text = String(node.value);
    shapes.push({
      kind: 'text',
      id: `v${node.uid}`,
      x: p.x + (double ? field : 0) + vw / 2,
      y: p.cy + 7,
      text,
      size: valueSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: role(`v${node.uid}`) ?? (status === 'garbage' ? 'stale' : undefined),
    });
    if (status === 'garbage') {
      shapes.push({
        kind: 'text',
        id: `${id}-gc`,
        x: p.x + W / 2,
        y: p.y - 10,
        text: 'garbage',
        size: 13,
        anchor: 'middle',
        cls: 'label',
        role: 'stale',
      });
    }

    // next: an arrow to the following slot, routed around the row end; or a slash.
    const nx = p.x + W - field / 2;
    const ny = p.cy - (double ? 6 : 0);
    const nextRole = role(`${id}-next`);
    if (node.next) {
      const q = slot(k + 1);
      const qy = q.cy - (double ? 6 : 0);
      const pts: [number, number][] =
        q.row === p.row
          ? [
              [nx, ny],
              [q.x - 1, qy],
            ]
          : [
              [nx, ny],
              [right + 16, ny],
              [right + 16, laneY(p.row)],
              [X0 - 22, laneY(p.row)],
              [X0 - 22, qy],
              [q.x - 1, qy],
            ];
      line(`${id}-next`, pts, { role: nextRole, head: true });
      dot(`${id}-next-dot`, nx, ny);
    } else {
      line(
        `${id}-next-null`,
        [
          [p.x + W - field + 3, p.y + H - 4],
          [p.x + W - 3, p.y + 4],
        ],
        { role: nextRole },
      );
    }

    if (double) {
      const prevRole = role(`${id}-prev`);
      const px = p.x + field / 2;
      const py = p.cy + 6;
      if (node.prev && k > 0) {
        const q = slot(k - 1);
        const pts: [number, number][] =
          q.row === p.row
            ? [
                [px, py],
                [q.x + W + 1, q.cy + 6],
              ]
            : [
                [px, py],
                [X0 - 30, py],
                [X0 - 30, laneY(q.row) + 8],
                [right + 24, laneY(q.row) + 8],
                [right + 24, q.cy + 6],
                [q.x + W + 1, q.cy + 6],
              ];
        line(`${id}-prev`, pts, { role: prevRole, head: true });
        dot(`${id}-prev-dot`, px, py);
      } else {
        line(
          `${id}-prev-null`,
          [
            [p.x + 3, p.y + H - 4],
            [p.x + field - 3, p.y + 4],
          ],
          { role: prevRole },
        );
      }
    }
  });

  // Named pointers.
  for (const ptr of d.pointers) {
    const r = role(ptr.name);
    let x: number;
    let y: number;
    if (ptr.to === null) {
      // Point at "null": before the first node (above) or after the last (below).
      const at = slot(ptr.side === 'above' ? 0 : d.nodes.length);
      x = ptr.side === 'above' ? X0 - 30 : at.x + 22;
      y = at.y;
      shapes.push({
        kind: 'text',
        id: `${ptr.name}-null`,
        x,
        y: y + H / 2 + 5,
        text: 'null',
        size: 14,
        anchor: 'middle',
        mono: true,
        cls: 'label',
        role: r,
      });
    } else {
      const p = slot(ptr.to);
      x = p.x + (double ? field : 0) + vw / 2;
      y = p.y;
    }
    const above = ptr.side === 'above';
    const tip =
      ptr.to === null ? (above ? y + H / 2 - 9 : y + H / 2 + 12) : above ? y - 5 : y + H + 5;
    const tail = above ? y - 30 : y + H + 30;
    shapes.push(
      { kind: 'arrow', id: `${ptr.name}-arrow`, x1: x, y1: tail, x2: x, y2: tip, role: r },
      {
        kind: 'text',
        id: ptr.name,
        x,
        y: above ? y - 36 : y + H + 47,
        text: ptr.name,
        size: LABEL,
        anchor: 'middle',
        mono: true,
        cls: 'pointer',
        role: r,
      },
    );
  }

  if (d.out) {
    const { value, from, label } = d.out;
    const p = slot(from);
    const bx = X0 + 34;
    const by = TOP - 40;
    const text = String(value);
    shapes.push(
      {
        kind: 'rect',
        id: 'out-box',
        x: bx - 34,
        y: by - 24,
        w: 68,
        h: 40,
        r: 8,
        cls: 'ghost',
        role: role('out'),
      },
      {
        kind: 'text',
        id: 'out-label',
        x: bx,
        y: by - 32,
        text: label,
        size: 14,
        anchor: 'middle',
        cls: 'label',
        mono: true,
      },
      {
        kind: 'text',
        id: 'out',
        x: bx,
        y: by + 3,
        text,
        size: valueSize(text),
        anchor: 'middle',
        weight: 'bold',
        role: role('out'),
        z: 3,
        enterFrom: { x: p.x + (double ? field : 0) + vw / 2, y: p.cy + 7 },
      },
    );
  }

  return { shapes, bounds: { x: 0, y: 0, w: right + 40, h: TOP + rows * ROW_H - LANE } };
}
