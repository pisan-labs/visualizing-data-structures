import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  edgeShapeId,
  keyShapeId,
  labelSize,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  trimmedLine,
  unionBounds,
} from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  charId,
  describe,
  leavesOf,
  show,
  textOf,
  weightOf,
  type RopeExtra,
  type RopeSettings,
  type RopeState,
} from './model';

const R = 16;
const LEAF_H = 28;
const LEVEL_GAP = 56;
const CELL_W = 20;
const CELL_H = 26;
const STRIP_PITCH = CELL_H + 18;
const BOX_W = 56;

const leafWidth = (t: string) => Math.max(30, t.length * 9 + 14);

/**
 * R2 beside R (the usual), or under it on a narrow stage; the strings under the trees, or beside
 * them for a tall tree on a wide stage.
 */
export function view(
  step: Step<RopeState, RopeExtra>,
  settings: RopeSettings,
  stage?: StageSize,
): Scene {
  const beside = draw(step, settings, true, false);
  if (!stage) return beside;
  const others = [draw(step, settings, true, true)];
  if (step.state.other !== null) others.push(draw(step, settings, false, false));
  return pickLayout(stage, [beside, ...others]);
}

interface Part {
  shapes: Shape[];
  bounds: Bounds;
  rootX: number;
}

function drawTree(
  s: RopeState,
  settings: RopeSettings,
  root: number,
  roles: ReadonlyMap<string, MarkRole>,
  leafRole: Map<number, MarkRole>,
  dx: number,
  dy: number,
): Part {
  const n = s.nodes;
  const layout = layoutBinaryTree<number>(
    root,
    { left: (u) => n[u]!.left, right: (u) => n[u]!.right },
    {
      radius: R,
      gap: 10,
      levelGap: LEVEL_GAP,
      width: (u) => (n[u]!.text !== null ? leafWidth(show(n[u]!.text!)) : 2 * R),
    },
  );
  const shapes: Shape[] = [];
  const at = (u: number) => {
    const p = layout.nodes.get(u)!;
    return { x: p.x + dx, y: p.y + dy };
  };
  for (const p of layout.nodes.values()) {
    const v = n[p.id]!;
    const c = at(p.id);
    if (p.parent !== null) {
      const q = at(p.parent);
      const leaf = v.text !== null;
      shapes.push({
        kind: 'arrow',
        id: edgeShapeId(p.id),
        ...trimmedLine(q, c, R, leaf ? LEAF_H / 2 : R),
        head: 'none',
        role: roles.get(edgeShapeId(p.id)),
      });
    }
    const role = roles.get(nodeShapeId(p.id));
    if (v.text !== null) {
      const t = show(v.text);
      const w = leafWidth(t);
      shapes.push({
        kind: 'rect',
        id: nodeShapeId(p.id),
        x: c.x - w / 2,
        y: c.y - LEAF_H / 2,
        w,
        h: LEAF_H,
        r: 4,
        cls: 'live',
        role: role ?? leafRole.get(p.id),
      });
      shapes.push({
        kind: 'text',
        id: keyShapeId(p.id),
        x: c.x,
        y: c.y + 5,
        text: t,
        size: 14,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role,
      });
    } else {
      shapes.push({
        kind: 'circle',
        id: nodeShapeId(p.id),
        x: c.x,
        y: c.y,
        r: R,
        cls: 'live',
        role,
      });
      const t = String(weightOf(n, p.id, settings));
      const size = labelSize(t, R);
      shapes.push({
        kind: 'text',
        id: keyShapeId(p.id),
        x: c.x,
        y: c.y + size * 0.35,
        text: t,
        size,
        anchor: 'middle',
        weight: 'bold',
        role,
      });
    }
  }
  const b = layout.bounds;
  return {
    shapes,
    bounds: { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h },
    rootX: dx,
  };
}

/** The text as a row of character cells, wrapping, with indices under the main rope's. */
function drawStrip(
  text: string,
  rope: 'r' | 's',
  name: string,
  top: number,
  perRow: number,
  roles: ReadonlyMap<string, MarkRole>,
  cellRole: (i: number) => MarkRole | undefined,
  base: number,
): Part {
  const shapes: Shape[] = [];
  const cols = Math.min(Math.max(text.length, 1), perRow);
  const x0 = -(cols * CELL_W) / 2;
  shapes.push({
    kind: 'text',
    id: `strip-${rope}`,
    x: x0 - 8,
    y: top + CELL_H / 2 + 5,
    text: name,
    size: 14,
    anchor: 'end',
    cls: 'label',
    mono: true,
  });
  [...text].forEach((ch, i) => {
    const x = x0 + (i % perRow) * CELL_W;
    const y = top + Math.floor(i / perRow) * STRIP_PITCH;
    const id = charId(rope, i);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y,
      w: CELL_W,
      h: CELL_H,
      r: 0,
      cls: 'live',
      role: roles.get(id) ?? cellRole(i),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + CELL_W / 2,
      y: y + CELL_H / 2 + 5,
      text: ch === ' ' ? '␣' : ch,
      size: 14,
      anchor: 'middle',
      mono: true,
      role: roles.get(id),
    });
    shapes.push({
      kind: 'text',
      id: `${id}-i`,
      x: x + CELL_W / 2,
      y: y + CELL_H + 13,
      text: String(base + i),
      size: 12,
      anchor: 'middle',
      mono: true,
      cls: 'index',
    });
  });
  const rows = Math.max(1, Math.ceil(text.length / perRow));
  return {
    shapes,
    bounds: {
      x: x0 - 8 - name.length * 9,
      y: top,
      w: cols * CELL_W + 8 + name.length * 9,
      h: (rows - 1) * STRIP_PITCH + CELL_H + 16,
    },
    rootX: 0,
  };
}

function draw(
  step: Step<RopeState, RopeExtra>,
  settings: RopeSettings,
  beside: boolean,
  stripBeside: boolean,
): Scene {
  const { state: s, extra } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  // Each leaf and its characters share a group color, so a leaf's piece is easy to find.
  const leafRole = new Map<number, MarkRole>();
  const charLeaf: MarkRole[] = [];
  const colorLeaves = (root: number | null, into: MarkRole[]) =>
    leavesOf(s.nodes, root).forEach((u, k) => {
      const g = groupRole((k % 4) + 1);
      leafRole.set(u, g);
      for (let j = 0; j < s.nodes[u]!.len; j++) into.push(g);
    });
  colorLeaves(s.root, charLeaf);
  const otherLeaf: MarkRole[] = [];
  colorLeaves(s.other, otherLeaf);

  if (s.root !== null) {
    const main = drawTree(s, settings, s.root, roles, leafRole, 0, 0);
    shapes.push(...main.shapes);
    boxes.push(main.bounds);
  } else {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'empty rope',
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role: roles.get('empty'),
    });
    boxes.push({ x: -44, y: -R, w: 88, h: 2 * R });
  }
  const mainBox = boxes[0]!;
  let treeBottom = mainBox.y + mainBox.h;
  if (s.other !== null) {
    // Lay R2 out once at the origin to learn its size, then place it.
    const probe = drawTree(s, settings, s.other, roles, leafRole, 0, 0);
    const dx = beside ? mainBox.x + mainBox.w + 40 - probe.bounds.x : 0;
    const dy = beside ? 0 : treeBottom + 40 - probe.bounds.y;
    const otherPart = drawTree(s, settings, s.other, roles, leafRole, dx, dy);
    shapes.push(...otherPart.shapes);
    boxes.push(otherPart.bounds);
    const labelY = otherPart.bounds.y - 8;
    shapes.push({
      kind: 'text',
      id: 'label-r2',
      x: dx,
      y: labelY,
      text: 'R2',
      size: 14,
      anchor: 'middle',
      cls: 'label',
      weight: 'bold',
    });
    boxes.push({ x: dx - 12, y: labelY - 14, w: 24, h: 16 });
    treeBottom = Math.max(treeBottom, otherPart.bounds.y + otherPart.bounds.h);
  }

  // The strings under the trees.
  const wide = unionBounds(...boxes);
  const perRow = stripBeside ? 10 : Math.max(12, Math.floor(wide.w / CELL_W) - 2);
  const range = extra?.range;
  const at = extra?.at;
  const mainText = textOf(s.nodes, s.root);
  let top = stripBeside ? wide.y + 30 : treeBottom + 28;
  const stripShift = stripBeside ? wide.x + wide.w + 60 + (perRow * CELL_W) / 2 : 0;
  const place = (p: { shapes: Shape[]; bounds: Bounds }) => {
    shapes.push(...translate(p.shapes, stripShift, 0));
    boxes.push({ ...p.bounds, x: p.bounds.x + stripShift });
  };
  if (mainText.length > 0 || s.other !== null) {
    const strip = drawStrip(
      mainText,
      'r',
      'R',
      top,
      perRow,
      roles,
      (i) => ((range && i >= range[0] && i < range[1]) || i === at ? 'active' : charLeaf[i]),
      0,
    );
    place(strip);
    top = strip.bounds.y + strip.bounds.h + 12;
  }
  if (s.other !== null) {
    const strip = drawStrip(
      textOf(s.nodes, s.other),
      's',
      'R2',
      top,
      perRow,
      roles,
      (i) => otherLeaf[i],
      mainText.length,
    );
    place(strip);
  }

  // A character handed back, or a refused argument, left of the root.
  if (extra !== undefined) {
    const shown = extra.out
      ? { id: 'out', label: extra.out.label, text: extra.out.text, role: roles.get('out') }
      : extra.arg
        ? {
            id: 'arg',
            label: extra.arg.label,
            text: extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text,
            role: roles.get('arg-box'),
          }
        : null;
    const w = Math.max(BOX_W, (shown?.text.length ?? 0) * 10 + 18);
    const labelW = Math.max(3, shown?.label.length ?? 3) * 9;
    const right = s.root === null ? -52 : -(R + 16);
    const left = right - w - 8 - labelW;
    boxes.push({ x: left, y: -18, w: -left, h: 36 });
    if (shown) {
      const x = right - w;
      shapes.push({
        kind: 'text',
        id: `${shown.id}-label`,
        x: x - 8,
        y: 5,
        text: shown.label,
        size: 15,
        anchor: 'end',
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: `${shown.id}-box`,
        x,
        y: -16,
        w,
        h: 32,
        r: 6,
        cls: 'ghost',
        role: shown.role,
      });
      shapes.push({
        kind: 'text',
        id: shown.id,
        x: x + w / 2,
        y: 6,
        text: shown.text,
        size: 16,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: shown.role,
        z: 3,
      });
    }
  }
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
