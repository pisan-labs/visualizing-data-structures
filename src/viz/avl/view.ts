import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Scene, Shape } from '../../render/scene';
import {
  describe,
  shownBalance,
  shownHeight,
  signed,
  storedBalance,
  type AVLExtra,
  type AVLSettings,
  type AVLState,
} from './model';
import { treeHeight } from '../_bst/tree-kit';
import {
  R,
  argCenter,
  drawArg,
  drawCaption,
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

/** Room on each side of a node for its height (left) and balance factor (right). */
const SLOT = 21;
const LABEL_SIZE = 12.5;

export function view(step: Step<AVLState, AVLExtra>, settings: AVLSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const showH = settings.show !== 'balance';
  const showB = settings.show !== 'height';
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    {
      radius: R,
      gap: 6,
      levelGap: levelGapFor(treeHeight(s)),
      width: () => 2 * R + 2 * SLOT,
    },
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

  // Height on the left of each node, balance factor on the right.
  for (const n of tree.nodes.values()) {
    const node = s.nodes[n.id]!;
    if (showH) {
      shapes.push({
        kind: 'text',
        id: `h-${n.id}`,
        x: n.x - R - 4,
        y: n.y + 4.5,
        text: `h${shownHeight(node.height, settings)}`,
        size: LABEL_SIZE,
        anchor: 'end',
        cls: 'label',
      });
    }
    if (showB) {
      const b = storedBalance(s, n.id);
      const nodeRole = roles.get(nodeShapeId(n.id));
      shapes.push({
        kind: 'text',
        id: `bf-${n.id}`,
        x: n.x + R + 4,
        y: n.y + 4.5,
        text: signed(shownBalance(b, settings)),
        size: LABEL_SIZE,
        anchor: 'start',
        weight: 'bold',
        cls: Math.abs(b) > 1 || nodeRole ? undefined : 'label',
        role: Math.abs(b) > 1 ? 'error' : nodeRole === 'active' ? 'active' : undefined,
      });
    }
  }

  const bottom = Math.max(...f.boxes.map((b) => b.y + b.h));
  drawNote(shapes, f, 'legend', legendParts(settings), bottom);

  const free = drawArg(shapes, roles, f, extra.arg);
  drawCaption(shapes, free + 4, 'case', extra.rotation && `${extra.rotation} case`, 'error');
  if (extra.held !== undefined && s.nodes[extra.held])
    drawHeld(shapes, roles, extra.held, String(s.nodes[extra.held]!.key));
  drawNil(shapes, roles, tree, extra.nil, f);
  drawOutput(shapes, roles, tree, s.nodes, extra.output, f);

  return {
    shapes,
    bounds: padBounds(unionBounds(...f.boxes), 14),
    label: describe(s, settings),
  };
}

function legendParts(settings: AVLSettings): string[] {
  const bf = settings.bf === 'left' ? 'left − right' : 'right − left';
  const leaf = settings.leaf === 'one' ? 1 : 0;
  const height = `Left of a node: its height (a leaf is ${leaf}).`;
  const balance = `Right: its balance factor, ${bf}.`;
  if (settings.show === 'height') return [height];
  if (settings.show === 'balance') return [`Right of a node: its balance factor, ${bf}.`];
  return [height, balance];
}
