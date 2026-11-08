import '../red-black/colors.css';
import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  edgeShapeId,
  layoutBinaryTree,
  padBounds,
  unionBounds,
  type PlacedNode,
  type TreeLayout,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { treeHeight } from '../_bst/tree-kit';
import {
  argCenter,
  drawArg,
  drawEmpty,
  drawHeld,
  drawNil,
  drawNote,
  drawOutput,
  frameOf,
  levelGapFor,
  markPath,
  R,
  rolesOf,
} from '../_bst/view-kit';
import { describe, type AAExtra, type AANode, type AASettings, type AAState } from './model';

const P = 40;
const ROW = 62;

/** Rows by level, the top level first; x follows key order, so horizontal links lie flat. */
function levelLayout(s: AAState): TreeLayout<number> {
  const order: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    walk(s.nodes[u]!.left);
    order.push(u);
    walk(s.nodes[u]!.right);
  };
  walk(s.root);
  const top = Math.max(0, ...order.map((u) => s.nodes[u]!.level));
  const nodes = new Map<number, PlacedNode<number>>();
  const mid = (order.length - 1) / 2;
  // Preorder, so edges draw parent first like the tidy layout.
  const place = (u: number | null, parent: number | null) => {
    if (u === null) return;
    const n = s.nodes[u]!;
    const side = parent === null ? null : s.nodes[parent]!.left === u ? 'left' : 'right';
    const depth = top - n.level;
    nodes.set(u, { id: u, x: (order.indexOf(u) - mid) * P, y: depth * ROW, depth, parent, side });
    place(n.left, u);
    place(n.right, u);
  };
  place(s.root, null);
  const bounds: Bounds =
    order.length === 0
      ? { x: 0, y: 0, w: 0, h: 0 }
      : { x: -mid * P - R, y: -R, w: (order.length - 1) * P + 2 * R, h: (top - 1) * ROW + 2 * R };
  return {
    nodes,
    nulls: [],
    height: top - 1,
    bounds,
    radius: R,
    gap: P - 2 * R,
    levelGap: ROW,
    nullSize: 12,
  };
}

export function view(step: Step<AAState, AAExtra>, settings: AASettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const levels = settings.draw === 'levels';
  const tree = levels
    ? levelLayout(s)
    : layoutBinaryTree(
        s.root,
        { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
        { radius: R, gap: 6, levelGap: levelGapFor(treeHeight(s)) },
      );
  const f = frameOf(tree);
  const path = markPath(roles, s.nodes, extra.path);
  const node = (u: number): AANode => s.nodes[u]!;
  const sameLevel = (u: number) => {
    const p = node(u).parent;
    return p !== null && node(p).level === node(u).level;
  };

  // A broken rule shows on its links: a left horizontal link, or two right ones in a row.
  for (const n of Object.values(s.nodes)) {
    if (!tree.nodes.has(n.uid)) continue;
    const l = n.left === null ? null : node(n.left);
    if (l && l.level === n.level && !roles.has(edgeShapeId(l.uid)))
      roles.set(edgeShapeId(l.uid), 'error');
    const r = n.right === null ? null : node(n.right);
    const rr = r && r.right !== null ? node(r.right) : null;
    if (r && rr && rr.level === n.level) {
      if (!roles.has(edgeShapeId(r.uid))) roles.set(edgeShapeId(r.uid), 'error');
      if (!roles.has(edgeShapeId(rr.uid))) roles.set(edgeShapeId(rr.uid), 'error');
    }
  }

  const shapes: Shape[] = [];
  // 2-3 tree nodes: a node and its right horizontal child, in one dashed box.
  if (levels) {
    for (const n of tree.nodes.values()) {
      const r = node(n.id).right;
      if (r === null || !sameLevel(r)) continue;
      const q = tree.nodes.get(r)!;
      shapes.push({
        kind: 'rect',
        id: `pair-${n.id}`,
        x: n.x - R - 5,
        y: n.y - R - 5,
        w: q.x - n.x + 2 * R + 10,
        h: 2 * R + 10,
        r: R + 5,
        cls: 'ghost',
      });
    }
  }
  shapes.push(
    ...drawBinaryTree(tree, {
      label: (u) => String(node(u).key),
      roles,
      baseRole: (u) => (path.has(u) ? 'visit' : undefined),
      nodeClass: levels ? undefined : (u) => (sameLevel(u) ? 'rb-red' : 'rb-black'),
      enterFrom: (u) => (u === extra.fresh ? argCenter(f) : undefined),
    }),
  );
  if (!levels) {
    for (const sh of shapes) {
      if (sh.kind === 'text' && sh.id.startsWith('key-'))
        sh.cls = sameLevel(Number(sh.id.slice(4))) ? 'rb-key-red' : 'rb-key-black';
    }
  }
  if (s.root === null) drawEmpty(shapes, f);
  else f.boxes.push(tree.bounds);

  if (s.root !== null) {
    if (levels) {
      // Level numbers down the left side.
      const top = Math.max(...[...tree.nodes.keys()].map((u) => node(u).level));
      const x = tree.bounds.x - 10;
      for (let k = top; k >= 1; k--) {
        const y = (top - k) * ROW;
        shapes.push({
          kind: 'text',
          id: `lvl-${k}`,
          x,
          y: y + 5,
          text: `level ${k}`,
          size: 13,
          anchor: 'end',
          mono: true,
          cls: 'label',
        });
        f.boxes.push({ x: x - 62, y: y - 10, w: 62, h: 20 });
      }
    } else {
      // Levels as small numbers beside the nodes.
      for (const n of tree.nodes.values()) {
        shapes.push({
          kind: 'text',
          id: `lvl-${n.id}`,
          x: n.x + R + 2,
          y: n.y + R,
          text: String(node(n.id).level),
          size: 13,
          mono: true,
          cls: 'label',
        });
      }
    }
    drawNil(shapes, roles, tree, extra.nil, f);
    f.left = Math.min(f.left, ...f.boxes.map((b) => b.x));
    const bottom = Math.max(...f.boxes.map((b) => b.y + b.h));
    drawNote(
      shapes,
      f,
      'legend',
      levels
        ? ['Dashed box: one level, linked sideways,', 'like one node of a 2-3 tree.']
        : ['Red: on its parent’s level (a horizontal link).', 'Small numbers: levels.'],
      bottom,
    );
  }

  drawArg(shapes, roles, f, extra.arg);
  if (extra.held !== undefined && s.nodes[extra.held])
    drawHeld(shapes, roles, extra.held, String(s.nodes[extra.held]!.key));
  drawOutput(shapes, roles, tree, s.nodes, extra.output, f);
  return { shapes, bounds: padBounds(unionBounds(...f.boxes), 14), label: describe(s) };
}
