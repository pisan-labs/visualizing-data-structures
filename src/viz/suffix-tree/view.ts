/**
 * Suffix tree: T$ along the top as a row of cells with their positions, the pattern (or the
 * suffix being inserted) under it, and the tree below, drawn with the compressed-trie layout
 * (src/layouts/trie.ts). A leaf carries the position its suffix starts at, inside its circle.
 * Ukkonen's build also shows suffix links as dashed arrows and the active point: the active
 * node is outlined and the active edge marked, with the length in the variables panel.
 */
import { makeRng } from '../../engine/rng';
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, unionBounds } from '../../layouts/binary-tree';
import { drawTrie, layoutTrie } from '../../layouts/trie';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { pickLayout, translate } from '../_stage/arrange';
import { argWidth, drawArg } from '../_trie/draw';
import {
  MAX_TEXT,
  describe,
  full,
  nodeId,
  ops,
  textId,
  type StExtra,
  type StSettings,
  type StState,
  type StTree,
} from './model';

const R = 11;
const PITCH = 24;
const CELL_H = 28;
const TEXT_Y = -118;
const ARG_Y = -58;

function levelGapFor(height: number): number {
  return height <= 4 ? 60 : Math.max(50, 60 - 3 * (height - 4));
}

function treeLayout(tr: StTree, src: string) {
  const label = (u: number) => src.slice(tr.nodes[u]!.start, tr.nodes[u]!.end);
  let height = 0;
  const depth = (u: number, d: number): void => {
    height = Math.max(height, d);
    tr.nodes[u]!.kids.forEach((k) => depth(k, d + 1));
  };
  depth(tr.root, 0);
  return layoutTrie(tr.root, (u) => tr.nodes[u]!.kids, {
    label,
    radius: R,
    labelSize: 15,
    gap: 8,
    labelGap: 8,
    levelGap: levelGapFor(height),
  });
}

const finished = new Map<string, Bounds>();

/** The box of the finished tree for a text, the same for both builds: the tree is unique. */
function finishedBox(text: string): Bounds {
  const hit = finished.get(text);
  if (hit) return hit;
  const gen = ops.build.run({ text, tree: null }, [], {
    settings: { method: 'naive' },
    rng: makeRng(1),
  });
  let r = gen.next();
  while (!r.done) r = gen.next();
  const tr = r.value.tree;
  const box = tr ? treeLayout(tr, full(text)).bounds : { x: -R, y: -R, w: 2 * R, h: 2 * R };
  if (finished.size > 50) finished.clear();
  finished.set(text, box);
  return box;
}

/**
 * Draw a step. T$ and the pattern sit over the tree; on a wide, short stage they move to the
 * tree's left when that draws larger. The choice is made for the finished tree of this text, so
 * it holds while the tree grows and through the searches after.
 */
export function view(
  step: Step<StState, StExtra>,
  _settings?: StSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  const src = full(s.text);

  // The tree, or a lone root before the build.
  const tr = s.tree ?? {
    nodes: { 0: { start: 0, end: 0, kids: [], parent: null, leaf: null, link: null } },
    root: 0,
    next: 1,
  };
  const layout = treeLayout(tr, src);
  const path = new Set(extra.path ?? []);
  const counted = new Set(extra.counted ?? []);
  const active = extra.active;
  if (active) {
    if (!roles.has(nodeId(active.node))) roles.set(nodeId(active.node), 'active');
    if (active.edge !== null && !roles.has(`te-${active.edge}`))
      roles.set(`te-${active.edge}`, 'compare');
  }
  shapes.push(
    ...drawTrie(layout, {
      isEnd: () => false,
      roles,
      baseRole: (u) => (counted.has(u) ? 'found' : path.has(u) ? 'visit' : undefined),
      edgeRole: (u) => (path.has(u) && u !== tr.root ? 'active' : undefined),
      enterFrom: (u) => {
        if (u !== extra.fresh) return undefined;
        const p = layout.nodes.get(tr.nodes[u]!.parent!);
        return p && { x: p.x, y: p.y };
      },
    }),
  );
  boxes.push(layout.bounds);

  // Leaf numbers, inside the leaves.
  for (const n of layout.nodes.values()) {
    const leaf = tr.nodes[n.id]!.leaf;
    if (leaf === null) continue;
    const role = roles.get(nodeId(n.id)) ?? (counted.has(n.id) ? 'found' : undefined);
    shapes.push({
      kind: 'text',
      id: `leaf-${n.id}`,
      x: n.x,
      y: n.y + 4,
      text: String(leaf),
      size: leaf > 9 ? 10 : 12,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: role === 'found' || role === 'error' || role === 'new' ? role : undefined,
    });
  }

  // Suffix links (Ukkonen only sets them).
  for (const n of layout.nodes.values()) {
    const to = tr.nodes[n.id]!.link;
    // Links to the root are left out: every node without a link falls back to the root anyway.
    if (to === null || to === undefined || to === n.id || to === tr.root) continue;
    const b = layout.nodes.get(to);
    if (!b) continue;
    // Bend each link to the left of its direction, so it does not run along a row of nodes
    // or on top of another link.
    const len = Math.hypot(b.x - n.x, b.y - n.y) || 1;
    const bend = Math.min(36, 10 + 0.12 * len);
    const c = {
      x: (n.x + b.x) / 2 + ((b.y - n.y) / len) * bend,
      y: (n.y + b.y) / 2 - ((b.x - n.x) / len) * bend,
    };
    const from = (p: { x: number; y: number }, q: { x: number; y: number }, by: number) => {
      const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { x: p.x + ((q.x - p.x) / d) * by, y: p.y + ((q.y - p.y) / d) * by };
    };
    const p0 = from(n, c, R + 2);
    const p1 = from(b, c, R + 3);
    const look = { dashed: true, cls: 'ghost', opacity: 0.85 } as const;
    shapes.push({
      kind: 'arrow',
      id: `sl-${n.id}-a`,
      x1: p0.x,
      y1: p0.y,
      x2: c.x,
      y2: c.y,
      head: 'none',
      ...look,
    });
    boxes.push({ x: c.x - 4, y: c.y - 4, w: 8, h: 8 });
    shapes.push({
      kind: 'arrow',
      id: `sl-${n.id}`,
      x1: c.x,
      y1: c.y,
      x2: p1.x,
      y2: p1.y,
      head: 'end',
      ...look,
    });
  }

  // T$ with positions, centered over the root.
  const block: Shape[] = [];
  const blockBoxes: Bounds[] = [];
  const x0 = -(src.length * PITCH) / 2;
  const spot = new Map<number, MarkRole>();
  for (const sp of extra.spots ?? [])
    for (let j = sp.from; j < sp.from + sp.len; j++) if (!spot.has(j)) spot.set(j, sp.role);
  block.push({
    kind: 'text',
    id: 't-name',
    x: x0 - 10,
    y: TEXT_Y + 20,
    text: 'T$',
    size: 15,
    anchor: 'end',
    weight: 'bold',
    cls: 'label',
    mono: true,
  });
  for (let j = 0; j < src.length; j++) {
    const role = roles.get(textId(j)) ?? spot.get(j);
    const x = x0 + j * PITCH;
    block.push({
      kind: 'rect',
      id: textId(j),
      x,
      y: TEXT_Y,
      w: PITCH,
      h: CELL_H,
      r: 0,
      cls: 'live',
      role,
    });
    block.push({
      kind: 'text',
      id: `${textId(j)}-c`,
      x: x + PITCH / 2,
      y: TEXT_Y + 20,
      text: src[j]!,
      size: 17,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: role === 'found' || role === 'active' ? role : undefined,
    });
    block.push({
      kind: 'text',
      id: `${textId(j)}-i`,
      x: x + PITCH / 2,
      y: TEXT_Y - 6,
      text: String(j),
      size: 11,
      anchor: 'middle',
      cls: 'label',
      mono: true,
    });
  }
  blockBoxes.push({ x: x0 - 34, y: TEXT_Y - 18, w: src.length * PITCH + 34, h: CELL_H + 18 });

  // The pattern, or the suffix being inserted.
  if (step.extra !== undefined && extra.arg) {
    const w = argWidth(extra.arg);
    const a = drawArg(extra.arg, -w / 2, ARG_Y, roles);
    block.push(...a.shapes);
    blockBoxes.push(a.bounds);
  }

  if (!s.tree) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: R + 26,
      text: 'not built yet',
      size: 14,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -60, y: R + 10, w: 120, h: 20 });
  }

  // T$ (and the pattern) over the tree, or left of its top: decided for the finished tree and
  // the widest argument this text can have, so it holds while the tree grows.
  const argRoom = Math.max(
    argWidth({ name: `suffix ${src.length - 1}`, text: src, at: 0 }),
    argWidth({ name: 'P', text: 'x'.repeat(MAX_TEXT), at: 0 }),
    argWidth({ name: 'P', text: 'x'.repeat(16), at: 0, bad: true }),
  );
  const over = unionBounds(blockBoxes[0]!, {
    x: -argRoom / 2,
    y: ARG_Y - CELL_H / 2,
    w: argRoom,
    h: CELL_H,
  });
  const done = finishedBox(s.text);
  const sideDx = done.x - 30 - (over.x + over.w);
  const sideDy = -R - 4 - over.y;
  const atTop = { dx: 0, dy: 0, bounds: padBounds(unionBounds(done, over), 14) };
  const atSide = {
    dx: sideDx,
    dy: sideDy,
    bounds: padBounds(unionBounds(done, { ...over, x: over.x + sideDx, y: over.y + sideDy }), 14),
  };
  const place = pickLayout(stage, [atTop, atSide]);
  shapes.push(...translate(block, place.dx, place.dy));
  boxes.push(...blockBoxes.map((b) => ({ ...b, x: b.x + place.dx, y: b.y + place.dy })));
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
