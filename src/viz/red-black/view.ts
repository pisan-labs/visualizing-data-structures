import './colors.css';
import type { Step } from '../../engine/types';
import {
  drawBinaryTree,
  layoutBinaryTree,
  nilSpot,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Scene, Shape } from '../../render/scene';
import { treeHeight } from '../avl/tree-kit';
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
} from '../avl/view-kit';
import { blackHeights, describe, type RBExtra, type RBSettings, type RBState } from './model';

/** Room on each side of a node for its black-height. */
const SLOT = 22;

export function view(step: Step<RBState, RBExtra>, settings: RBSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    {
      radius: R,
      gap: 6,
      levelGap: levelGapFor(treeHeight(s) + (settings.nils ? 1 : 0)),
      width: settings.bh ? () => 2 * R + 2 * SLOT : undefined,
      nulls: settings.nils,
    },
  );
  const f = frameOf(tree);
  const path = markPath(roles, s.nodes, extra.path);
  const red = (u: number) => s.nodes[u]!.color === 'red';

  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => String(s.nodes[u]!.key),
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    nodeClass: (u) => (red(u) ? 'rb-red' : 'rb-black'),
    enterFrom: (u) => (u === extra.fresh ? argCenter(f) : undefined),
  });
  // Keys take the color that reads on their node; NIL squares are black.
  for (const sh of shapes) {
    if (sh.kind === 'text' && sh.id.startsWith('key-')) {
      sh.cls = red(Number(sh.id.slice(4))) ? 'rb-key-red' : 'rb-key-black';
    } else if (sh.kind === 'rect' && sh.cls === 'null') {
      sh.cls = 'null rb-nil';
    }
  }

  if (s.root === null) drawEmpty(shapes, f);
  else f.boxes.push(tree.bounds);

  if (settings.bh) {
    const bhs = blackHeights(s, extra.extraBlack);
    for (const n of tree.nodes.values()) {
      const bh = bhs.get(n.id);
      shapes.push({
        kind: 'text',
        id: `bh-${n.id}`,
        x: n.x - R - 4,
        y: n.y + 4.5,
        text: bh === null || bh === undefined ? 'bh?' : `bh${bh}`,
        size: 12.5,
        anchor: 'end',
        cls: 'label',
      });
    }
  }

  // The extra black a delete leaves behind: a dashed ring around x, or around its NIL.
  const xb = extra.extraBlack;
  if (xb && 'node' in xb) {
    const at = tree.nodes.get(xb.node);
    if (at)
      shapes.push({ kind: 'circle', id: 'xb-ring', x: at.x, y: at.y, r: R + 5, cls: 'rb-extra' });
  } else if (xb && tree.nodes.has(xb.parent)) {
    const spot = settings.nils
      ? tree.nulls.find((z) => z.parent === xb.parent && z.side === xb.side)
      : nilSpot(tree, xb.parent, xb.side);
    if (spot)
      shapes.push({
        kind: 'rect',
        id: 'xb-box',
        x: spot.x - 11,
        y: spot.y - 11,
        w: 22,
        h: 22,
        r: 5,
        cls: 'rb-extra',
      });
  }

  const bottom = Math.max(...f.boxes.map((b) => b.y + b.h));
  drawNote(
    shapes,
    f,
    'legend',
    [
      'Dark nodes are black, light nodes are red.',
      ...(settings.nils ? ['Squares are NIL leaves.'] : []),
      ...(settings.bh ? ['bh: black-height.'] : []),
    ],
    bottom,
  );

  const free = drawArg(shapes, roles, f, extra.arg);
  drawCaption(shapes, free + 4, 'case', extra.caption, 'active');
  if (extra.held !== undefined && s.nodes[extra.held]) {
    const u = extra.held;
    drawHeld(
      shapes,
      roles,
      u,
      String(s.nodes[u]!.key),
      red(u) ? 'rb-red' : 'rb-black',
      red(u) ? 'rb-key-red' : 'rb-key-black',
    );
  }
  if (!settings.nils) drawNil(shapes, roles, tree, extra.nil, f);
  drawOutput(shapes, roles, tree, s.nodes, extra.output, f);

  return {
    shapes,
    bounds: padBounds(unionBounds(...f.boxes), 14),
    label: describe(s),
  };
}
