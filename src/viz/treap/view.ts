import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  edgeShapeId,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Scene, Shape } from '../../render/scene';
import { treeHeight } from '../avl/tree-kit';
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
} from '../avl/view-kit';
import { above, describe, type TreapExtra, type TreapSettings, type TreapState } from './model';

/** Room on each side of a node; its priority goes on the right. */
const SLOT = 20;
const LABEL_SIZE = 12.5;

export function view(step: Step<TreapState, TreapExtra>, settings: TreapSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    { radius: R, gap: 6, levelGap: levelGapFor(treeHeight(s)), width: () => 2 * R + 2 * SLOT },
  );
  const f = frameOf(tree);
  const path = markPath(roles, s.nodes, extra.path);
  // An edge whose child belongs above its parent breaks the heap order: draw it red.
  for (const n of Object.values(s.nodes)) {
    const p = n.parent === null ? undefined : s.nodes[n.parent];
    if (p && above(settings, n.priority, p.priority) && !roles.has(edgeShapeId(n.uid)))
      roles.set(edgeShapeId(n.uid), 'error');
  }

  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => String(s.nodes[u]!.key),
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    enterFrom: (u) => (u === extra.fresh ? argCenter(f) : undefined),
  });

  if (s.root === null) drawEmpty(shapes, f);
  else f.boxes.push(tree.bounds);

  for (const n of tree.nodes.values()) {
    const node = s.nodes[n.id]!;
    const parent = node.parent === null ? undefined : s.nodes[node.parent];
    const broken = parent !== undefined && above(settings, node.priority, parent.priority);
    const role = roles.get(nodeShapeId(n.id));
    shapes.push({
      kind: 'text',
      id: `prio-${n.id}`,
      x: n.x + R + 4,
      y: n.y + 4.5,
      text: `p${node.priority}`,
      size: LABEL_SIZE,
      mono: true,
      weight: broken || role ? 'bold' : 'normal',
      cls: broken || role ? undefined : 'label',
      role: broken ? 'error' : role === 'active' || role === 'new' ? role : undefined,
    });
  }

  const bottom = Math.max(...f.boxes.map((b) => b.y + b.h));
  drawNote(
    shapes,
    f,
    'legend',
    [
      'pN: the priority of the node to its left.',
      settings.heap === 'min' ? 'Smaller priorities sit higher.' : 'Larger priorities sit higher.',
    ],
    bottom,
  );

  const free = drawArg(shapes, roles, f, extra.arg);
  // While a new key walks down, its priority waits next to the argument.
  if (extra.arg && extra.drawn !== undefined && !extra.arg.error) {
    shapes.push({
      kind: 'text',
      id: 'arg-prio',
      x: free,
      y: HY + 5,
      text: `priority ${extra.drawn}`,
      size: 14,
      mono: true,
      cls: 'label',
    });
    f.boxes.push({ x: free, y: HY - 10, w: 100, h: 20 });
  }
  if (extra.held !== undefined && s.nodes[extra.held])
    drawHeld(shapes, roles, extra.held, String(s.nodes[extra.held]!.key));
  drawNil(shapes, roles, tree, extra.nil, f);
  drawOutput(shapes, roles, tree, s.nodes, extra.output, f);

  return {
    shapes,
    bounds: padBounds(unionBounds(...f.boxes), 14),
    label: describe(s),
  };
}
