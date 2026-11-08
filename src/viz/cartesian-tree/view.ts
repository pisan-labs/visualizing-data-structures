import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  drawBinaryTree,
  edgeShapeId,
  keyShapeId,
  labelSize,
  nodeShapeId,
  padBounds,
  unionBounds,
  type PlacedNode,
  type TreeLayout,
} from '../../layouts/binary-tree';
import { pickLayout, translate } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { treeHeight } from '../_bst/tree-kit';
import { R, rolesOf } from '../_bst/view-kit';
import {
  cellShapeId,
  describe,
  rightSpine,
  type CartesianExtra,
  type CartesianSettings,
  type CartesianState,
} from './model';

/** Column pitch: node i sits under array cell i, because inorder is array order. */
const P = 42;
const CELL = { w: 36, h: 30 };
const ARR_Y = -114;
const WAIT_Y = -58;
const SMALL = 13;

const colX = (i: number) => i * P;

function levelGap(height: number): number {
  return height <= 4 ? 56 : Math.max(34, 56 - 8 * (height - 4));
}

export function view(
  step: Step<CartesianState, CartesianExtra>,
  _settings: CartesianSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const n = s.order.length;
  const index = new Map(s.order.map((u, i) => [u, i]));
  const gap = levelGap(treeHeight(s));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  // The array, with indexes above.
  shapes.push({
    kind: 'text',
    id: 'arr-label',
    x: -P / 2 - 6,
    y: ARR_Y + 5,
    text: 'A',
    size: 16,
    anchor: 'end',
    weight: 'bold',
    mono: true,
  });
  shapes.push({
    kind: 'text',
    id: 'idx-label',
    x: -P / 2 - 6,
    y: ARR_Y - CELL.h / 2 - 8,
    text: 'i',
    size: SMALL,
    anchor: 'end',
    mono: true,
    cls: 'label',
  });
  const [lo, hi] = extra.range ?? [-1, -1];
  s.order.forEach((u, i) => {
    const x = colX(i);
    const inRange = i >= lo && i <= hi;
    shapes.push({
      kind: 'rect',
      id: cellShapeId(u),
      x: x - CELL.w / 2,
      y: ARR_Y - CELL.h / 2,
      w: CELL.w,
      h: CELL.h,
      r: 4,
      cls: 'live',
      role: roles.get(cellShapeId(u)),
    });
    const text = String(s.nodes[u]!.key);
    shapes.push({
      kind: 'text',
      id: `val-${u}`,
      x,
      y: ARR_Y + 5.5,
      text,
      size: 16,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(cellShapeId(u)),
    });
    shapes.push({
      kind: 'text',
      id: `idx-${i}`,
      x,
      y: ARR_Y - CELL.h / 2 - 8,
      text: String(i),
      size: SMALL,
      anchor: 'middle',
      mono: true,
      weight: inRange ? 'bold' : 'normal',
      cls: inRange ? undefined : 'label',
      role: inRange ? 'active' : undefined,
    });
  });
  const arrW = Math.max(n, 1) * P;
  boxes.push({ x: -P / 2 - 24, y: ARR_Y - CELL.h / 2 - 22, w: arrW + 24, h: CELL.h + 22 });
  // The row the new node waits in is always there, so the camera stays put.
  boxes.push({ x: -P / 2, y: WAIT_Y - R, w: arrW, h: 2 * R });

  if (n === 0 && !extra.arg) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 60,
      y: ARR_Y + 5,
      text: 'empty array',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -20, y: ARR_Y - 15, w: 160, h: 30 });
  }

  // The tree: node i under column i, one level per depth.
  const nodes = new Map<number, PlacedNode<number>>();
  let maxDepth = -1;
  const place = (u: number | null, depth: number, parent: number | null) => {
    if (u === null) return;
    const node = s.nodes[u]!;
    const side = parent === null ? null : s.nodes[parent]!.left === u ? 'left' : 'right';
    nodes.set(u, { id: u, x: colX(index.get(u)!), y: depth * gap, depth, parent, side });
    maxDepth = Math.max(maxDepth, depth);
    place(node.left, depth + 1, u);
    place(node.right, depth + 1, u);
  };
  place(s.root, 0, null);
  const treeBounds: Bounds =
    s.root === null
      ? { x: 0, y: 0, w: 0, h: 0 }
      : { x: -R, y: -R, w: (n - 1) * P + 2 * R, h: maxDepth * gap + 2 * R };
  const layout: TreeLayout<number> = {
    nodes,
    nulls: [],
    height: maxDepth,
    bounds: treeBounds,
    radius: R,
    gap: P - 2 * R,
    levelGap: gap,
    nullSize: 12,
  };

  // The stack (the right spine) and the path of a query are drawn in their own color.
  const stack = extra.stack ?? (extra.range ? [] : rightSpine(s));
  const onStack = new Set(stack);
  const onPath = new Set(extra.path ?? []);
  for (const u of stack) {
    const id = edgeShapeId(u);
    if (s.nodes[u]!.parent !== null && onStack.has(s.nodes[u]!.parent!) && !roles.has(id))
      roles.set(id, 'visit');
  }
  for (const u of onPath) {
    const id = edgeShapeId(u);
    const p = s.nodes[u]!.parent;
    if (p !== null && onPath.has(p) && !roles.has(id)) roles.set(id, 'active');
  }
  const base = (u: number): MarkRole | undefined =>
    onPath.has(u) || onStack.has(u) ? 'visit' : undefined;
  shapes.push(
    ...drawBinaryTree(layout, {
      label: (u) => String(s.nodes[u]!.key),
      roles,
      baseRole: base,
    }),
  );
  if (s.root !== null) boxes.push(treeBounds);

  // The node being appended waits under its cell until it is linked.
  if (extra.waiting !== undefined && s.nodes[extra.waiting] && !nodes.has(extra.waiting)) {
    const u = extra.waiting;
    const x = colX(index.get(u)!);
    const text = String(s.nodes[u]!.key);
    const role = roles.get(nodeShapeId(u));
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(u),
      x,
      y: WAIT_Y,
      r: R,
      cls: 'live',
      role,
      enterFrom: { x, y: ARR_Y },
    });
    shapes.push({
      kind: 'text',
      id: keyShapeId(u),
      x,
      y: WAIT_Y + labelSize(text) * 0.35,
      text,
      size: labelSize(text),
      anchor: 'middle',
      weight: 'bold',
      role,
      enterFrom: { x, y: ARR_Y },
    });
  }

  // A refused argument, in a box where the next value would go.
  if (extra.arg) {
    const text = extra.arg.text.slice(0, 12);
    const w = Math.max(44, text.length * 9.5 + 16);
    const x = colX(n) - w / 2;
    shapes.push({
      kind: 'rect',
      id: 'arg-box',
      x,
      y: WAIT_Y - 15,
      w,
      h: 30,
      r: 6,
      cls: 'ghost',
      role: roles.get('arg-box'),
    });
    shapes.push({
      kind: 'text',
      id: 'arg',
      x: x + w / 2,
      y: WAIT_Y + 5,
      text,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get('arg-box'),
    });
    boxes.push({ x, y: WAIT_Y - 15, w, h: 30 });
  }

  // The stack panel: under the tree, or right of it on a wide stage.
  const panel = stackPanel(s, stack, extra.popped ?? [], roles);
  const mainBounds = unionBounds(...boxes);
  const slots = Math.max(n, 3);
  const panelW = 70 + slots * (CELL.w + 4);
  const under = {
    dx: -P / 2,
    dy: mainBounds.y + mainBounds.h + 30,
    bounds: unionBounds(mainBounds, {
      x: -P / 2,
      y: mainBounds.y + mainBounds.h + 10,
      w: panelW,
      h: 40,
    }),
  };
  const besideX = mainBounds.x + mainBounds.w + 30;
  const beside = {
    dx: besideX,
    dy: 0,
    bounds: unionBounds(mainBounds, { x: besideX, y: -20, w: panelW, h: 40 }),
  };
  const pick = pickLayout(stage, [under, beside]);
  shapes.push(...translate(panel, pick.dx, pick.dy));

  return { shapes, bounds: padBounds(pick.bounds, 14), label: describe(s) };
}

/** "stack" and one cell per node on it, bottom (the root) on the left, top on the right. */
function stackPanel(
  s: CartesianState,
  stack: number[],
  popped: number[],
  roles: Map<string, MarkRole>,
): Shape[] {
  const out: Shape[] = [
    {
      kind: 'text',
      id: 'stack-label',
      x: 0,
      y: 5,
      text: 'stack',
      size: 15,
      mono: true,
      cls: 'label',
    },
  ];
  const x0 = 62;
  const pitch = CELL.w + 4;
  stack.forEach((u, k) => {
    const x = x0 + k * pitch;
    const role = roles.get(nodeShapeId(u)) ?? 'visit';
    out.push({
      kind: 'rect',
      id: `stk-${u}`,
      x,
      y: -CELL.h / 2,
      w: CELL.w,
      h: CELL.h,
      r: 4,
      cls: 'live',
      role,
    });
    out.push({
      kind: 'text',
      id: `stkv-${u}`,
      x: x + CELL.w / 2,
      y: 5.5,
      text: String(s.nodes[u]!.key),
      size: 16,
      anchor: 'middle',
      weight: 'bold',
    });
  });
  const end = x0 + stack.length * pitch;
  out.push({
    kind: 'text',
    id: 'stack-top',
    x: end + 2,
    y: 5,
    text: stack.length ? '← top' : popped.length ? '(empty)' : '',
    size: SMALL,
    cls: 'label',
  });
  return out;
}
