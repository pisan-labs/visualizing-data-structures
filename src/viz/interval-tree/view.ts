import type { MarkRole, StageSize, Step } from '../../engine/types';
import {
  edgeShapeId,
  keyShapeId,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import { pickLayout, translate } from '../../layouts/arrange';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { rolesOf } from '../_bst/view-kit';
import { describe, type IntervalExtra, type IntervalSettings, type IntervalState } from './model';

const NW = 62;
const NH = 42;
const GAP = 64;
const HY = -(NH / 2 + 32);
/** The number line: label column, then the axis. */
const LBL = 58;
const AX = 250;
const ROWH = 19;

export function view(
  step: Step<IntervalState, IntervalExtra>,
  _settings: IntervalSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = rolesOf(step.marks);
  const tree = layoutBinaryTree(
    s.root,
    { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
    { radius: NH / 2, gap: 8, levelGap: GAP, width: () => NW },
  );
  const onPath = new Set(extra.path ?? []);
  const faded = new Set<number>();
  const fade = (u: number | null) => {
    if (u === null) return;
    faded.add(u);
    fade(s.nodes[u]!.left);
    fade(s.nodes[u]!.right);
  };
  for (const u of extra.pruned ?? []) fade(u);
  const found = new Set(extra.found ?? []);
  const roleOf = (u: number): MarkRole | undefined =>
    roles.get(nodeShapeId(u)) ??
    (found.has(u) ? 'found' : onPath.has(u) ? 'visit' : u === extra.fresh ? 'new' : undefined);

  const shapes: Shape[] = [];
  for (const n of tree.nodes.values()) {
    const node = s.nodes[n.id]!;
    const role = roleOf(n.id);
    const opacity = faded.has(n.id) ? 0.35 : undefined;
    if (n.parent !== null) {
      const p = tree.nodes.get(n.parent)!;
      const pathEdge = onPath.has(n.id) && onPath.has(n.parent);
      shapes.push({
        kind: 'arrow',
        id: edgeShapeId(n.id),
        x1: p.x + (n.x < p.x ? -NW / 4 : NW / 4),
        y1: p.y + NH / 2,
        x2: n.x,
        y2: n.y - NH / 2,
        head: 'none',
        role: roles.get(edgeShapeId(n.id)) ?? (pathEdge ? 'active' : undefined),
        opacity,
      });
    }
    shapes.push({
      kind: 'rect',
      id: nodeShapeId(n.id),
      x: n.x - NW / 2,
      y: n.y - NH / 2,
      w: NW,
      h: NH,
      r: 8,
      cls: 'live',
      role,
      opacity,
    });
    shapes.push({
      kind: 'text',
      id: keyShapeId(n.id),
      x: n.x,
      y: n.y - 2,
      text: `${node.lo}–${node.hi}`,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role,
      opacity,
    });
    const maxRole = roles.get(`max-${n.id}`);
    shapes.push({
      kind: 'text',
      id: `max-${n.id}`,
      x: n.x,
      y: n.y + 15,
      text: `max ${node.max}`,
      size: 13,
      anchor: 'middle',
      mono: true,
      weight: maxRole ? 'bold' : 'normal',
      cls: maxRole ? undefined : 'label',
      role: maxRole,
      opacity,
    });
  }

  const left = Math.min(tree.bounds.x, -110);
  const right = Math.max(tree.bounds.x + tree.bounds.w, 110);
  const boxes: Bounds[] = [{ x: left, y: HY - 17, w: right - left, h: 34 }];
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
    boxes.push({ x: -50, y: -20, w: 100, h: 40 });
  } else boxes.push(tree.bounds);

  // The operation's interval, top left.
  if (extra.arg) {
    const text = extra.arg.text.slice(0, 14);
    const w = Math.max(70, text.length * 9.5 + 16);
    shapes.push({
      kind: 'rect',
      id: 'arg-box',
      x: left,
      y: HY - 16,
      w,
      h: 32,
      r: 6,
      cls: 'ghost',
      role: roles.get('arg-box') ?? (extra.arg.error ? 'error' : undefined),
    });
    shapes.push({
      kind: 'text',
      id: 'arg',
      x: left + w / 2,
      y: HY + 5.5,
      text,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role: extra.query ? 'active' : undefined,
    });
  }
  // A node lifted out during delete waits in the band.
  if (extra.held !== undefined && s.nodes[extra.held]) {
    const node = s.nodes[extra.held]!;
    const role = roles.get(nodeShapeId(extra.held));
    shapes.push({
      kind: 'rect',
      id: nodeShapeId(extra.held),
      x: right - NW,
      y: HY - NH / 2,
      w: NW,
      h: NH,
      r: 8,
      cls: 'live',
      role,
    });
    shapes.push({
      kind: 'text',
      id: keyShapeId(extra.held),
      x: right - NW / 2,
      y: HY + 5,
      text: `${node.lo}–${node.hi}`,
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      role,
    });
    boxes.push({ x: right - NW, y: HY - NH / 2, w: NW, h: NH });
  }

  // The number line, beside the tree on a wide stage and under it on a tall one.
  const main = unionBounds(...boxes);
  const { shapes: panel, h: panelH } = numberLine(s, extra, roleOf, faded);
  const panelW = LBL + AX + 16;
  const besideX = main.x + main.w + 36;
  const beside = {
    dx: besideX,
    dy: main.y,
    bounds: unionBounds(main, { x: besideX, y: main.y, w: panelW, h: panelH }),
  };
  const underY = main.y + main.h + 24;
  const under = {
    dx: main.x,
    dy: underY,
    bounds: unionBounds(main, { x: main.x, y: underY, w: panelW, h: panelH }),
  };
  const pick = pickLayout(stage, [beside, under]);
  shapes.push(...translate(panel, pick.dx, pick.dy));
  return { shapes, bounds: padBounds(pick.bounds, 14), label: describe(s) };
}

/** Each interval as a bar on a number line, in key order, with the query as a band. */
function numberLine(
  s: IntervalState,
  extra: IntervalExtra,
  roleOf: (u: number) => MarkRole | undefined,
  faded: Set<number>,
): { shapes: Shape[]; h: number } {
  const order: number[] = [];
  const walk = (u: number | null) => {
    if (u === null) return;
    walk(s.nodes[u]!.left);
    order.push(u);
    walk(s.nodes[u]!.right);
  };
  walk(s.root);
  // Reserve a few rows so the panel does not jump with every insert.
  const rows = Math.max(order.length, 4);
  const ends = [...order.map((u) => s.nodes[u]!.hi), ...(extra.query ?? [])];
  const span = Math.max(20, Math.ceil(Math.max(0, ...ends) / 10) * 10);
  const X = (v: number) => LBL + (v / span) * AX;
  const top = 22;
  const axisY = top + rows * ROWH + 4;
  const out: Shape[] = [
    {
      kind: 'text',
      id: 'nl-title',
      x: 0,
      y: 12,
      text: 'on a number line',
      size: 13,
      cls: 'label',
    },
    { kind: 'arrow', id: 'nl-axis', x1: LBL, y1: axisY, x2: LBL + AX, y2: axisY, head: 'none' },
  ];
  for (const v of [0, span / 2, span]) {
    out.push({
      kind: 'arrow',
      id: `nl-tick-${v}`,
      x1: X(v),
      y1: axisY,
      x2: X(v),
      y2: axisY + 5,
      head: 'none',
    });
    out.push({
      kind: 'text',
      id: `nl-num-${v}`,
      x: X(v),
      y: axisY + 19,
      text: String(v),
      size: 13,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  }
  if (extra.query) {
    const [a, b] = extra.query;
    const x1 = X(a) - (a === b ? 1.5 : 0);
    const x2 = X(b) + (a === b ? 1.5 : 0);
    out.push({
      kind: 'polygon',
      id: 'qband',
      points: [
        { x: x1, y: top - 4 },
        { x: x2, y: top - 4 },
        { x: x2, y: axisY },
        { x: x1, y: axisY },
      ],
      role: 'active',
    });
  }
  order.forEach((u, i) => {
    const n = s.nodes[u]!;
    const y = top + i * ROWH;
    const role = roleOf(u);
    const opacity = faded.has(u) ? 0.35 : undefined;
    out.push({
      kind: 'text',
      id: `nl-lbl-${u}`,
      x: LBL - 8,
      y: y + 10,
      text: `${n.lo}–${n.hi}`,
      size: 13,
      anchor: 'end',
      mono: true,
      role,
      cls: role ? undefined : 'label',
      opacity,
    });
    out.push({
      kind: 'rect',
      id: `bar-${u}`,
      x: X(n.lo) - 2,
      y: y + 2,
      w: X(n.hi) - X(n.lo) + 4,
      h: 11,
      r: 3,
      cls: 'live',
      role,
      opacity,
    });
  });
  return { shapes: out, h: axisY + 26 };
}
