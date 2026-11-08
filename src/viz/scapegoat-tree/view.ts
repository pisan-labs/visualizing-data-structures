import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  keyShapeId,
  labelSize,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Scene, Shape } from '../../render/scene';
import { treeHeight, treeSize } from '../_bst/tree-kit';
import {
  HY,
  R,
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
  rolesOf,
} from '../_bst/view-kit';
import {
  depthLimit,
  describe,
  type ScapegoatExtra,
  type ScapegoatSettings,
  type ScapegoatState,
} from './model';

/** Room right of a node for its subtree size. */
const SLOT = 14;
const FLAT_PITCH = 2 * R + 6;

export function view(
  step: Step<ScapegoatState, ScapegoatExtra>,
  settings: ScapegoatSettings,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const height = treeHeight(s);
  // A little tighter than the kit's spacing: a key that lands too deep makes the tree tall.
  const gap = height <= 4 ? levelGapFor(height) : Math.max(40, 56 - 5 * (height - 4));
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    { radius: R, gap: 6, levelGap: gap, width: () => 2 * R + 2 * SLOT },
  );
  const f = frameOf(tree);
  const path = markPath(roles, s.nodes, extra.path);
  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => String(s.nodes[u]!.key),
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    enterFrom: (u) => (u === extra.fresh ? argCenter(f) : undefined),
  });
  if (s.root === null && !extra.flat) drawEmpty(shapes, f);
  else if (s.root !== null) f.boxes.push(tree.bounds);

  // Subtree sizes worked out on the way up.
  for (const [k, size] of Object.entries(extra.sizes ?? {})) {
    const p = tree.nodes.get(Number(k));
    if (!p) continue;
    shapes.push({
      kind: 'text',
      id: `size-${k}`,
      x: p.x + R + 3,
      y: p.y - R + 4,
      text: String(size),
      size: 14,
      weight: 'bold',
      mono: true,
      role: 'compare',
    });
  }

  // The depth limit: nodes below the dashed line are too deep.
  const n = treeSize(s);
  const limit = depthLimit(n, settings.alpha);
  const legend: string[] = [];
  if (s.root !== null && limit <= height) {
    const y = (limit + 0.5) * gap;
    shapes.push({
      kind: 'arrow',
      id: 'limit-line',
      x1: f.left,
      y1: y,
      x2: f.right,
      y2: y,
      head: 'none',
      dashed: true,
      role: height > limit ? 'error' : undefined,
    });
    legend.push(`Dashed line: depth limit ${limit} for N = ${n}.`);
  }
  if (extra.sizes) legend.push('Numbers beside nodes: subtree sizes.');

  // A subtree being rebuilt, flattened into sorted order in the band above the tree.
  if (extra.flat) {
    const k = extra.flat.length;
    extra.flat.forEach((u, i) => {
      const x = (i - (k - 1) / 2) * FLAT_PITCH;
      const text = String(s.nodes[u]!.key);
      const role = roles.get(nodeShapeId(u));
      shapes.push({ kind: 'circle', id: nodeShapeId(u), x, y: HY, r: R, cls: 'live', role });
      shapes.push({
        kind: 'text',
        id: keyShapeId(u),
        x,
        y: HY + labelSize(text) * 0.35,
        text,
        size: labelSize(text),
        anchor: 'middle',
        weight: 'bold',
        role,
      });
    });
    const w = k * FLAT_PITCH;
    f.boxes.push({ x: -w / 2, y: HY - R, w, h: 2 * R });
  }

  drawNil(shapes, roles, tree, extra.nil, f);
  if (legend.length) {
    const bottom = Math.max(...f.boxes.map((b) => b.y + b.h));
    drawNote(shapes, f, 'legend', legend, bottom);
  }
  drawArg(shapes, roles, f, extra.arg);
  if (extra.held !== undefined && s.nodes[extra.held])
    drawHeld(shapes, roles, extra.held, String(s.nodes[extra.held]!.key));
  drawOutput(shapes, roles, tree, s.nodes, extra.output, f);
  return { shapes, bounds: padBounds(unionBounds(...f.boxes), 14), label: describe(s) };
}
