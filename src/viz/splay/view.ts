import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  layoutBinaryTree,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Scene, Shape } from '../../render/scene';
import { treeHeight } from '../_bst/tree-kit';
import {
  R,
  argCenter,
  drawArg,
  drawCaption,
  drawEmpty,
  drawHeld,
  drawNil,
  drawOutput,
  frameOf,
  levelGapFor,
  markPath,
  rolesOf,
} from '../_bst/view-kit';
import { describe, type SplayExtra, type SplaySettings, type SplayState } from './model';

export function view(step: Step<SplayState, SplayExtra>, _settings: SplaySettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    { radius: R, gap: 8, levelGap: levelGapFor(treeHeight(s)) },
  );
  const f = frameOf(tree);
  const path = markPath(roles, s.nodes, extra.path);

  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => String(s.nodes[u]!.key),
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    // A key typed for insert slides out of the argument box into its new node.
    enterFrom: (u) => (u === extra.fresh ? argCenter(f) : undefined),
  });

  if (s.root === null) drawEmpty(shapes, f);
  else f.boxes.push(tree.bounds);

  const free = drawArg(shapes, roles, f, extra.arg);
  drawCaption(shapes, free + 4, 'case', extra.caption, 'active');
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
