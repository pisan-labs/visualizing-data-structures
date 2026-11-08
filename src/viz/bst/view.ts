import type { MarkRole, Step } from '../../engine/types';
import {
  drawBinaryTree,
  edgeShapeId,
  keyShapeId,
  labelSize,
  layoutBinaryTree,
  nilSpot,
  nodeShapeId,
  padBounds,
  trimmedLine,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { describe, treeHeight, type BSTExtra, type BSTSettings, type BSTState } from './model';

const R = 17;
/** Center line of the band above the tree that holds the argument and lifted nodes. */
const HY = -(R + 30);
const CELL = { w: 34, h: 26, pitch: 37 };
const LABEL_W = 62;

/**
 * Deep trees get closer levels so they still fit a short screen. A label under each node needs
 * more room, but 46 still clears it of the edges and nodes below: a child sits a node and a
 * gap to the side.
 */
function levelGapFor(height: number, annotated: boolean): number {
  const gap = height <= 4 ? 56 : Math.max(38, 56 - 4 * (height - 4));
  return annotated ? Math.max(gap, 46) : gap;
}

export function view(step: Step<BSTState, BSTExtra>, settings: BSTSettings): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const pairs = settings.mode === 'pairs';
  const counts = Object.values(s.nodes).some((n) => n.count > 1);
  const annotated = !!extra.sizes || pairs || counts;
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    // Values need room for a tag under each node.
    { radius: R, gap: pairs ? 22 : 8, levelGap: levelGapFor(treeHeight(s), annotated) },
  );
  const at = (uid: number) => tree.nodes.get(uid);

  // The path taken so far: visited nodes, and the edges between them.
  const path = new Set(extra.path ?? []);
  for (const u of extra.path ?? []) {
    const p = s.nodes[u]?.parent;
    if (p !== null && p !== undefined && path.has(p) && !roles.has(edgeShapeId(u)))
      roles.set(edgeShapeId(u), 'active');
  }

  // Steps of an operation keep a band above the tree for its argument and for a node lifted
  // out during delete. A plain picture (no step data, as in practice questions) leaves it out.
  const band = step.extra !== undefined;
  const left = band ? Math.min(tree.bounds.x, -110) : tree.bounds.x;
  const right = band ? Math.max(tree.bounds.x + tree.bounds.w, 110) : tree.bounds.x + tree.bounds.w;
  const argX = left + 24;
  const argBox = { x: argX, y: HY - 15, w: 56, h: 30 };

  const shapes: Shape[] = drawBinaryTree(tree, {
    label: (u) => String(s.nodes[u]!.key),
    roles,
    baseRole: (u) => (path.has(u) ? 'visit' : undefined),
    // A key typed for insert slides out of the argument box into its new node.
    enterFrom: (u) => (u === extra.fresh ? { x: argBox.x + argBox.w / 2, y: HY } : undefined),
  });

  const boxes: Bounds[] = [];
  if (s.root === null) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'empty tree',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -50, y: -R, w: 100, h: 2 * R });
  } else {
    // Room under the bottom row for the labels drawn below nodes.
    boxes.push({ ...tree.bounds, h: tree.bounds.h + (annotated ? 22 : 0) });
  }
  // The band stays for every step of an operation, so the camera stays put between steps.
  if (band) boxes.push({ x: left, y: HY - 16, w: right - left, h: 32 });

  // One label under each node: its subtree size (select, rank), else its value (key-value
  // mode), else how many copies it holds (when duplicates are counted).
  for (const n of tree.nodes.values()) {
    const node = s.nodes[n.id]!;
    const y = n.y + R + 13;
    if (extra.sizes) {
      const id = `size-${n.id}`;
      shapes.push({
        kind: 'text',
        id,
        x: n.x,
        y: y + 4,
        text: String(node.size),
        size: 13,
        anchor: 'middle',
        cls: 'label',
        mono: true,
        weight: roles.has(id) ? 'bold' : 'normal',
        role: roles.get(id),
      });
    } else if (pairs) {
      const text = node.value ?? '–';
      const w = Math.max(22, text.length * 7.6 + 10);
      shapes.push({
        kind: 'rect',
        id: `valbox-${n.id}`,
        x: n.x - w / 2,
        y: y - 9,
        w,
        h: 18,
        r: 4,
        cls: 'live',
      });
      shapes.push({
        kind: 'text',
        id: `val-${n.id}`,
        x: n.x,
        y: y + 4.5,
        text,
        size: 13,
        anchor: 'middle',
        role: roles.get(`val-${n.id}`),
      });
    } else if (node.count > 1) {
      shapes.push({
        kind: 'text',
        id: `cnt-${n.id}`,
        x: n.x,
        y: y + 4,
        text: `×${node.count}`,
        size: 14,
        anchor: 'middle',
        weight: 'bold',
        cls: 'label',
      });
    }
  }
  if (extra.sizes && s.root !== null) {
    const bottom = tree.bounds.y + tree.bounds.h + 22;
    shapes.push({
      kind: 'text',
      id: 'sizes-note',
      x: left,
      y: bottom + 18,
      text: 'Numbers under the nodes are subtree sizes.',
      size: 13,
      cls: 'label',
    });
    boxes.push({ x: left, y: bottom, w: 280, h: 24 });
  }

  // The operation's argument, in a box at the top left.
  if (extra.arg) {
    const { name, text, uid, value, error } = extra.arg;
    const w = Math.max(argBox.w, text.length * 9.5 + 16);
    shapes.push({
      kind: 'text',
      id: 'arg-label',
      x: left + 4,
      y: HY + 5,
      text: name,
      size: 15,
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'rect',
      id: 'arg-box',
      x: argBox.x,
      y: argBox.y,
      w,
      h: argBox.h,
      r: 6,
      cls: 'ghost',
      role: roles.get('arg-box') ?? (error ? 'error' : undefined),
    });
    const id = uid !== undefined ? keyShapeId(uid) : 'arg';
    shapes.push({
      kind: 'text',
      id,
      x: argBox.x + w / 2,
      y: HY + labelSize(text) * 0.35,
      text,
      size: labelSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(id),
    });
    if (value !== undefined) {
      shapes.push({
        kind: 'text',
        id: uid !== undefined ? `val-${uid}` : 'arg-value',
        x: argBox.x + w + 8,
        y: HY + 5,
        text: value ?? '(no value)',
        size: 13,
        cls: 'label',
      });
    }
  }

  // A node lifted out of the tree waits above the root.
  if (extra.held !== undefined && s.nodes[extra.held]) {
    const u = extra.held;
    const role = roles.get(nodeShapeId(u));
    shapes.push({
      kind: 'circle',
      id: nodeShapeId(u),
      x: 0,
      y: HY,
      r: R,
      cls: 'live',
      role,
    });
    const text = String(s.nodes[u]!.key);
    shapes.push({
      kind: 'text',
      id: keyShapeId(u),
      x: 0,
      y: HY + labelSize(text) * 0.35,
      text,
      size: labelSize(text),
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(keyShapeId(u)) ?? role,
    });
  }

  // An empty child the walk fell into.
  if (extra.nil) {
    const { parent, side } = extra.nil;
    const p = at(parent);
    if (p) {
      const spot = nilSpot(tree, parent, side);
      const size = 12;
      shapes.push({
        kind: 'arrow',
        id: 'nil-edge',
        ...trimmedLine(p, spot, R, size / 2),
        head: 'none',
        dashed: true,
        role: roles.get('nil'),
      });
      shapes.push({
        kind: 'rect',
        id: 'nil',
        x: spot.x - size / 2,
        y: spot.y - size / 2,
        w: size,
        h: size,
        r: 2,
        cls: 'ghost',
        role: roles.get('nil'),
      });
      shapes.push({
        kind: 'text',
        id: 'nil-label',
        x: spot.x + (side === 'left' ? -size / 2 - 3 : size / 2 + 3),
        y: spot.y + 4,
        text: 'nil',
        size: 13,
        anchor: side === 'left' ? 'end' : 'start',
        mono: true,
        cls: 'label',
      });
      boxes.push({ x: spot.x - 30, y: spot.y - size / 2, w: 60, h: size + 2 });
    }
  }

  // Inorder output, under the tree.
  if (extra.output) {
    const y0 = Math.max(...boxes.map((b) => b.y + b.h)) + 24;
    const perRow = Math.max(8, Math.floor((right - left - LABEL_W) / CELL.pitch));
    shapes.push({
      kind: 'text',
      id: 'output-label',
      x: left,
      y: y0 + CELL.h / 2 + 5,
      text: 'output',
      size: 14,
      cls: 'label',
      mono: true,
    });
    extra.output.forEach(([uid, copy], i) => {
      const node = s.nodes[uid]!;
      const from = at(uid);
      const x = left + LABEL_W + (i % perRow) * CELL.pitch;
      const y = y0 + Math.floor(i / perRow) * (CELL.h + 8);
      const text = String(node.key);
      shapes.push({
        kind: 'rect',
        id: `outc-${uid}-${copy}`,
        x,
        y,
        w: CELL.w,
        h: CELL.h,
        r: 5,
        cls: 'live',
        enterFrom: from && { x: from.x - CELL.w / 2, y: from.y - CELL.h / 2 },
      });
      shapes.push({
        kind: 'text',
        id: `out-${uid}-${copy}`,
        x: x + CELL.w / 2,
        y: y + CELL.h / 2 + 5,
        text,
        size: text.length <= 2 ? 15 : 13,
        anchor: 'middle',
        weight: 'bold',
        role: roles.get(`out-${uid}-${copy}`),
        enterFrom: from && { x: from.x, y: from.y + 5 },
      });
    });
    const rows = Math.max(1, Math.ceil(extra.output.length / perRow));
    boxes.push({ x: left, y: y0, w: LABEL_W + perRow * CELL.pitch, h: rows * (CELL.h + 8) });
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s, settings),
  };
}
