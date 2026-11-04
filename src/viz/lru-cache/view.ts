import type { MarkRole, Step } from '../../engine/types';
import {
  boxExit,
  drawChain,
  drawLink,
  NODE,
  type ChainLink,
  type ChainNode,
  type NamedPointer,
} from '../../layouts/linked';
import type { Scene, Shape } from '../../render/scene';
import {
  describe,
  mapId,
  nid,
  node,
  type LruExtra,
  type LruSettings,
  type LruState,
} from './model';

/**
 * The hash map is a row of entries at the top, each with an arrow down to its node. The list
 * is the linked layout's doubly linked chain, most recently used first, with head and tail
 * (and the local pointers x and y) named below it.
 */
const MIN_W = 380;
/** How far down the chain is moved to make room for the call and the map. */
const DY = 84;
const ENTRY_W = 44;
const ENTRY_H = 30;
/** Below the stage's zoom buttons, which cover the top right corner on a phone. */
const ENTRY_Y = 54;
const VALUE_X = NODE.double.field + NODE.double.value / 2;

const ref = (u: number | null) => (u === null ? null : nid(u));

function shift(s: Shape, dy: number): Shape {
  const out = { ...s };
  if (out.kind === 'arrow') {
    out.y1 += dy;
    out.y2 += dy;
  } else {
    out.y += dy;
  }
  if (out.enterFrom) out.enterFrom = { x: out.enterFrom.x, y: out.enterFrom.y + dy };
  return out;
}

export function view(step: Step<LruState, LruExtra>, _settings: LruSettings): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const ptrs = extra.ptrs ?? {};

  const nodes: ChainNode[] = state.nodes.map((n) => ({
    id: nid(n.uid),
    text: String(n.key),
    status: n.uid === extra.garbage ? 'garbage' : n.uid === extra.pending ? 'pending' : 'live',
  }));
  const links: ChainLink[] = state.nodes.flatMap((n) => [
    { from: nid(n.uid), field: 'next' as const, to: ref(n.next) },
    { from: nid(n.uid), field: 'prev' as const, to: ref(n.prev) },
  ]);
  const pointers: NamedPointer[] = [
    { name: 'head', to: ref(state.head), side: 'below', nullAt: 'before' },
    { name: 'tail', to: ref(state.tail), side: 'below', nullAt: 'after' },
  ];
  for (const name of ['x', 'y']) {
    if (name in ptrs) pointers.push({ name, to: ref(ptrs[name] ?? null), side: 'below' });
  }

  const chain = drawChain(
    { kind: 'double', nodes, links, pointers, cols: Math.max(1, state.capacity), minRows: 1 },
    roles,
  );
  const W = Math.max(MIN_W, chain.bounds.w);
  const dx = (W - chain.bounds.w) / 2;
  const shapes: Shape[] = chain.shapes.map((s) => {
    const moved = shift(s, DY);
    if (moved.kind === 'arrow') {
      moved.x1 += dx;
      moved.x2 += dx;
    } else {
      moved.x += dx;
    }
    if (moved.enterFrom) moved.enterFrom = { x: moved.enterFrom.x + dx, y: moved.enterFrom.y };
    return moved;
  });
  const box = (uid: number) => {
    const b = chain.boxes.get(nid(uid))!;
    return { x: b.x + dx, y: b.y + DY, w: b.w, h: b.h };
  };

  // Each node shows its key, with the value underneath.
  for (const n of state.nodes) {
    const b = box(n.uid);
    const key = shapes.find((s) => s.id === `${nid(n.uid)}.v`);
    if (key && key.kind === 'text') {
      key.y = b.y + 18;
      key.size = Math.min(key.size ?? 16, 15);
    }
    shapes.push({
      kind: 'text',
      id: `${nid(n.uid)}.val`,
      x: b.x + VALUE_X,
      y: b.y + 34,
      text: String(n.value),
      size: 12,
      anchor: 'middle',
      role: n.uid === extra.garbage ? 'stale' : undefined,
      opacity: n.uid === extra.garbage ? 0.55 : undefined,
    });
  }

  // The map: one entry per key, spread across the width, each pointing at its node.
  const cap = state.capacity;
  const pitch = Math.min(104, (W - 60) / cap);
  shapes.push({
    kind: 'text',
    id: 'map-label',
    x: 8,
    y: ENTRY_Y + ENTRY_H / 2 + 5,
    text: 'map',
    size: 13,
    cls: 'label',
    mono: true,
  });
  state.map.forEach((uid, s) => {
    if (uid === null) return;
    const cx = W / 2 + 14 + (s - (cap - 1) / 2) * pitch;
    const e = { x: cx - ENTRY_W / 2, y: ENTRY_Y, w: ENTRY_W, h: ENTRY_H };
    const id = mapId(uid);
    const role = roles.get(id);
    shapes.push({ kind: 'rect', id, ...e, r: 5, cls: 'cell live', role });
    shapes.push({
      kind: 'text',
      id: `${id}.k`,
      x: cx,
      y: e.y + 20,
      text: String(node(state, uid).key),
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    const from = { x: cx, y: e.y + e.h - 6 };
    shapes.push({
      kind: 'circle',
      id: `${id}:dot`,
      x: from.x,
      y: from.y,
      r: 3,
      cls: 'arrowhead',
      z: 1.6,
    });
    const target = box(uid);
    const to = boxExit(target, from, 1);
    shapes.push(...drawLink(`${id}.p`, [from, to], { role, dashed: uid === extra.pending }));
  });

  if (extra.label) {
    shapes.push({
      kind: 'text',
      id: 'op-label',
      x: 8,
      y: 24,
      text: extra.label,
      size: 15,
      mono: true,
    });
  }

  return {
    shapes,
    bounds: { x: 0, y: 0, w: W, h: DY + chain.bounds.h + chain.bounds.y + 4 },
    label: label(step),
  };
}

function label(step: Step<LruState, LruExtra>): string {
  const { state, extra = {} } = step;
  const parts = [describe(state)];
  const at = (u: number | null) => (u === null ? 'null' : String(node(state, u).key));
  parts.push(`head → ${at(state.head)}, tail → ${at(state.tail)}.`);
  const locals = Object.entries(extra.ptrs ?? {});
  if (locals.length)
    parts.push(`Pointers: ${locals.map(([k, u]) => `${k} → ${at(u)}`).join(', ')}.`);
  if (extra.pending !== undefined)
    parts.push(`New node ${at(extra.pending)} is not linked in yet.`);
  if (extra.garbage !== undefined) parts.push(`Node ${at(extra.garbage)} is garbage.`);
  return parts.join(' ');
}
