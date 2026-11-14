/**
 * Two drawings, by the approach setting.
 *
 * The pattern: the key map as a row of entries at the top (an arrow runs down to the node of an
 * entry being looked up). Under it, one row per frequency in use: the frequency map's entry on
 * the left, with an arrow to the first node of that frequency's doubly linked list, least
 * recently used first; "min" under the entry of the smallest frequency. Each node shows its
 * key, and its value under it. A node on its way between lists is drawn dashed at the tail of
 * the list it is going to. The frame keeps room for `capacity` rows, the most there can be.
 *
 * The naive design: the map as a table, one row per slot: key, value, uses and last used.
 * While put scans for the key to evict, the key looked at is marked, and the pick so far.
 */
import type { MarkRole, Step } from '../../engine/types';
import { drawLink, drawNode, NODE, type Pt } from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import {
  describe,
  fid,
  listOf,
  mid,
  nid,
  node,
  type LfuExtra,
  type LfuSettings,
  type LfuState,
} from './model';

type LStep = Step<LfuState, LfuExtra>;
type Roles = Map<string, MarkRole>;

const PAD = 14;
const LABEL = 15;
const SMALL = 13;
const MAP_Y = 44;
const ENTRY = { w: 44, h: 30, gap: 10 };
const FREQ = { w: 40, h: 30 };
const NODE_W = NODE.double.value + 2 * NODE.double.field;
const NODE_H = NODE.double.h;
const NODE_GAP = 26;
const NODES_X = PAD + FREQ.w + 30;
const HEAD_Y = 108;
const ROWS_TOP = 120;
const ROW_H = 76;
const MIN_W = 320;

function text(
  id: string,
  x: number,
  y: number,
  t: string,
  o: Partial<Extract<Shape, { kind: 'text' }>> = {},
): Shape {
  return { kind: 'text', id, x, y, text: t, size: LABEL, ...o };
}

export function view(step: LStep, settings: LfuSettings): Scene {
  return approachOf(settings) === 'naive' ? tableView(step) : listsView(step);
}

/** The op label at the top left. */
function opLabel(step: LStep): Shape[] {
  const l = step.extra?.label;
  return l ? [text('op-label', PAD, 24, l, { mono: true })] : [];
}

// ---------------------------------------------------------------------------------------------
// The pattern

function listsView(step: LStep): Scene {
  const s = step.state;
  const x = step.extra ?? {};
  const roles: Roles = new Map(step.marks.map((m) => [m.id, m.role]));
  const cap = s.capacity;
  const W = Math.max(MIN_W, NODES_X + cap * NODE_W + (cap - 1) * NODE_GAP + 16);
  const shapes: Shape[] = [...opLabel(step)];

  // Rows: every list in use, and the list a moving node is going to.
  const freqs = new Set(s.lists.map((l) => l.freq));
  if (x.moving) freqs.add(x.moving.to);
  const rows = [...freqs].sort((a, b) => a - b);
  const boxes = new Map<number, { x: number; y: number; w: number; h: number }>();
  rows.forEach((f, r) => {
    const y = ROWS_TOP + r * ROW_H;
    const uids = [...(listOf(s, f)?.uids ?? [])];
    const moving = x.moving && x.moving.to === f ? x.moving.uid : undefined;
    if (moving !== undefined) uids.push(moving);
    const exists = !!listOf(s, f);
    const fRole = roles.get(fid(f));
    shapes.push({
      kind: 'rect',
      id: fid(f),
      x: PAD,
      y: y + 5,
      w: FREQ.w,
      h: FREQ.h,
      r: 5,
      cls: exists ? 'cell live' : 'cell ghost',
      role: fRole,
    });
    shapes.push(
      text(`${fid(f)}-v`, PAD + FREQ.w / 2, y + 26, String(f), {
        anchor: 'middle',
        mono: true,
        role: fRole,
      }),
    );
    if (f === s.minFreq)
      shapes.push(
        text('p:min', PAD + FREQ.w / 2, y + 54, 'min', {
          size: SMALL,
          anchor: 'middle',
          mono: true,
          role: roles.get('p:min'),
        }),
      );
    uids.forEach((u, i) => {
      const b = { x: NODES_X + i * (NODE_W + NODE_GAP), y, w: NODE_W, h: NODE_H };
      boxes.set(u, b);
      const n = node(s, u);
      const pending = u === moving;
      shapes.push(
        ...drawNode(
          { id: nid(u), text: String(n.key), status: pending ? 'pending' : 'live' },
          b,
          'double',
          roles,
        ),
      );
      shapes.push(
        text(`${nid(u)}.val`, b.x + NODE_W / 2, y + NODE_H + 17, `= ${n.value}`, {
          size: SMALL,
          anchor: 'middle',
          cls: 'label',
        }),
      );
      const linked = !pending;
      const prev = linked && i > 0 ? uids[i - 1] : undefined;
      const next =
        linked && i < uids.length - 1 && uids[i + 1] !== moving ? uids[i + 1] : undefined;
      shapes.push(...links(u, b, prev, next));
    });
    if (exists) {
      const first = boxes.get(listOf(s, f)!.uids[0]!)!;
      const from: Pt = { x: PAD + FREQ.w, y: y + 20 };
      shapes.push(
        ...drawLink(`${fid(f)}.p`, [from, { x: first.x - 1, y: y + 20 }], { role: fRole }),
      );
    }
  });

  // The key map, and an arrow from an entry being looked up to its node.
  shapes.push(text('map-label', PAD, MAP_Y + 20, 'map', { size: SMALL, cls: 'label', mono: true }));
  const ex = PAD + 44;
  s.map.forEach((u, slot) => {
    if (u === null) return;
    const id = mid(u);
    const role = roles.get(id);
    const e = { x: ex + slot * (ENTRY.w + ENTRY.gap), y: MAP_Y, w: ENTRY.w, h: ENTRY.h };
    shapes.push({ kind: 'rect', id, ...e, r: 5, cls: 'cell live', role });
    shapes.push(
      text(`${id}.k`, e.x + e.w / 2, e.y + 20, String(node(s, u).key), {
        anchor: 'middle',
        weight: 'bold',
        role,
      }),
    );
    const b = boxes.get(u);
    if (role && b)
      shapes.push(
        ...drawLink(
          `${id}.p`,
          [
            { x: e.x + e.w / 2, y: e.y + e.h },
            { x: b.x + NODE_W / 2, y: b.y - 1 },
          ],
          { role },
        ),
      );
  });
  shapes.push(
    text('head-f', PAD + FREQ.w / 2, HEAD_Y, 'freq', {
      size: SMALL,
      anchor: 'middle',
      cls: 'label',
    }),
    text('head-n', NODES_X, HEAD_Y, 'least recent → most recent', { size: SMALL, cls: 'label' }),
  );

  return {
    shapes,
    bounds: { x: 0, y: 0, w: W, h: ROWS_TOP + cap * ROW_H - 4 },
    label: label(step),
  };
}

/** The next and prev links of a node in a row: arrows to its neighbours, or slashes for null. */
function links(
  u: number,
  b: { x: number; y: number; w: number; h: number },
  prev: number | undefined,
  next: number | undefined,
): Shape[] {
  const out: Shape[] = [];
  const f = NODE.double.field;
  const cy = b.y + b.h / 2;
  const nextAt: Pt = { x: b.x + b.w - f / 2, y: cy - 8 };
  const prevAt: Pt = { x: b.x + f / 2, y: cy + 8 };
  const slash = (c: Pt): Pt[] => [
    { x: c.x - 6, y: cy + 11 },
    { x: c.x + 6, y: cy - 11 },
  ];
  const dot = (id: string, p: Pt): Shape => ({
    kind: 'circle',
    id,
    x: p.x,
    y: p.y,
    r: 3.5,
    cls: 'arrowhead',
    z: 1.6,
  });
  if (next !== undefined) {
    out.push(dot(`${nid(u)}.next:dot`, nextAt));
    out.push(...drawLink(`${nid(u)}.next`, [nextAt, { x: b.x + b.w + NODE_GAP - 1, y: nextAt.y }]));
  } else {
    out.push(...drawLink(`${nid(u)}.next`, slash({ x: nextAt.x, y: cy }), { head: false }));
  }
  if (prev !== undefined) {
    out.push(dot(`${nid(u)}.prev:dot`, prevAt));
    out.push(...drawLink(`${nid(u)}.prev`, [prevAt, { x: b.x - NODE_GAP + 1, y: prevAt.y }]));
  } else {
    out.push(...drawLink(`${nid(u)}.prev`, slash({ x: prevAt.x, y: cy }), { head: false }));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The naive design: a table

const T = { top: 70, row: 42, h: 34, key: 56, rest: 228 };
const COLS = [
  { name: 'value', x: 40 },
  { name: 'uses', x: 116 },
  { name: 'last used', x: 186 },
];

function tableView(step: LStep): Scene {
  const s = step.state;
  const x = step.extra ?? {};
  const roles: Roles = new Map(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [...opLabel(step)];
  const restX = PAD + T.key + 6;
  shapes.push(
    text('t-key', PAD + T.key / 2, T.top - 8, 'key', {
      size: SMALL,
      anchor: 'middle',
      cls: 'label',
    }),
    ...COLS.map((c) =>
      text(`t-${c.name}`, restX + c.x, T.top - 8, c.name, {
        size: SMALL,
        anchor: 'middle',
        cls: 'label',
      }),
    ),
  );
  s.map.forEach((u, slot) => {
    const y = T.top + slot * T.row;
    if (u === null) {
      shapes.push({
        kind: 'rect',
        id: `slot-${slot}`,
        x: PAD,
        y,
        w: T.key + 6 + T.rest,
        h: T.h,
        r: 5,
        cls: 'ghost',
      });
      return;
    }
    const n = node(s, u);
    const mRole = roles.get(mid(u));
    const nRole = roles.get(nid(u));
    shapes.push({
      kind: 'rect',
      id: mid(u),
      x: PAD,
      y,
      w: T.key,
      h: T.h,
      r: 5,
      cls: 'cell live',
      role: mRole,
    });
    shapes.push(
      text(`${mid(u)}.k`, PAD + T.key / 2, y + 23, String(n.key), {
        anchor: 'middle',
        weight: 'bold',
        role: mRole,
      }),
    );
    shapes.push({
      kind: 'rect',
      id: nid(u),
      x: restX,
      y,
      w: T.rest,
      h: T.h,
      r: 5,
      cls: 'cell live',
      role: nRole,
    });
    [n.value, n.freq, n.used].forEach((v, i) =>
      shapes.push(
        text(`${nid(u)}.c${i}`, restX + COLS[i]!.x, y + 23, String(v), {
          anchor: 'middle',
          role: i === 0 ? undefined : nRole,
        }),
      ),
    );
    if (x.pick === u)
      shapes.push(
        text('pick', restX + T.rest + 10, y + 23, '← fewest so far', {
          size: SMALL,
          role: 'found',
        }),
      );
  });
  return {
    shapes,
    bounds: { x: 0, y: 0, w: PAD + T.key + 6 + T.rest + 130, h: T.top + s.capacity * T.row + 6 },
    label: label(step),
  };
}

function label(step: LStep): string {
  const parts = [describe(step.state)];
  const x = step.extra ?? {};
  if (x.moving)
    parts.push(
      `Key ${node(step.state, x.moving.uid).key} is on its way to the list for frequency ${x.moving.to}.`,
    );
  if (x.scan !== undefined && x.pick !== undefined)
    parts.push(
      `Scanning: looking at ${node(step.state, x.scan).key}; the pick so far is ${node(step.state, x.pick).key}.`,
    );
  return parts.join(' ');
}
