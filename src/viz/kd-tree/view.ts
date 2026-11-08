import type { MarkRole, Step, StageSize } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  drawBinaryTree,
  layoutBinaryTree,
  nodeShapeId,
  padBounds,
  unionBounds,
} from '../../layouts/binary-tree';
import { drawGrid, drawPoint, drawSegment, makePlane, text, type Vec } from '../../layouts/plane';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP } from '../../render/stage';
import { drawBox, drawClippedCircle } from '../_spatial/kit';
import {
  MAX,
  axisOf,
  byId,
  describe,
  finalTree,
  ptId,
  subtree,
  type Box,
  type KdExtra,
  type KdSettings,
  type KdState,
} from './model';

/** The cell of every node: the part of the window its subtree covers. */
function cells(s: KdState): Map<number, Box> {
  const out = new Map<number, Box>();
  const walk = (id: number | null, box: Box) => {
    if (id === null) return;
    out.set(id, box);
    const n = byId(s, id);
    if (axisOf(n.depth) === 'x') {
      walk(n.left, { lo: box.lo, hi: { x: n.x, y: box.hi.y } });
      walk(n.right, { lo: { x: n.x, y: box.lo.y }, hi: box.hi });
    } else {
      walk(n.left, { lo: box.lo, hi: { x: box.hi.x, y: n.y } });
      walk(n.right, { lo: { x: box.lo.x, y: n.y }, hi: box.hi });
    }
  };
  walk(s.root, { lo: { x: 0, y: 0 }, hi: { x: MAX, y: MAX } });
  return out;
}

const LINE_ROLE = { x: 'g1', y: 'g2' } as const;

export function view(
  step: Step<KdState, KdExtra>,
  _settings: KdSettings,
  stage?: StageSize,
): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const plane = makePlane({ xmin: 0, xmax: MAX, ymin: 0, ymax: MAX, unit: 30, x: 34, y: 16 });
  const left: Shape[] = [];
  drawGrid(left, plane, { id: 'g' });

  const faded = new Set(s.pruned.flatMap((id) => subtree(s, id)));
  const cellOf = cells(s);

  for (const id of s.pruned) {
    const c = cellOf.get(id)!;
    drawBox(left, plane, { id: `prune-${id}`, lo: c.lo, hi: c.hi, fill: true, noEdges: true });
  }
  if (s.box)
    drawBox(left, plane, { id: 'box', lo: s.box.lo, hi: s.box.hi, role: 'active', fill: 'active' });

  // Splitting lines, each clipped to its node's cell.
  for (const n of s.nodes) {
    const c = cellOf.get(n.id)!;
    const a = axisOf(n.depth);
    const [p, q]: [Vec, Vec] =
      a === 'x'
        ? [
            { x: n.x, y: c.lo.y },
            { x: n.x, y: c.hi.y },
          ]
        : [
            { x: c.lo.x, y: n.y },
            { x: c.hi.x, y: n.y },
          ];
    const r = roles.get(nodeShapeId(n.id));
    drawSegment(left, plane, {
      id: `split-${n.id}`,
      a: p,
      b: q,
      role: r === 'active' ? 'active' : LINE_ROLE[a],
      opacity: faded.has(n.id) ? 0.4 : undefined,
    });
  }

  if (s.query) {
    const q = s.query;
    if (s.best !== null && s.bestD2 !== null) {
      const b = byId(s, s.best);
      drawClippedCircle(left, plane, { id: 'best-c', c: q, r: Math.sqrt(s.bestD2), role: 'found' });
      drawSegment(left, plane, { id: 'best-l', a: q, b, role: 'found', dashed: true });
    }
    if (extra.gap) {
      const n = byId(s, extra.gap.node);
      const foot = axisOf(n.depth) === 'x' ? { x: n.x, y: q.y } : { x: q.x, y: n.y };
      drawSegment(left, plane, {
        id: 'gap',
        a: q,
        b: foot,
        role: extra.gap.crosses ? 'active' : 'error',
        dashed: true,
      });
    }
  }

  for (const p of s.nodes) {
    const id = ptId(p.id);
    const role = roles.get(id) ?? (s.found.includes(p.id) || s.best === p.id ? 'found' : undefined);
    drawPoint(left, plane, {
      id,
      at: p,
      r: 6,
      role,
      label: p.name,
      size: 15,
      opacity: faded.has(p.id) ? 0.4 : undefined,
    });
  }
  for (const p of s.pending) {
    const moving = extra.moving === p.id;
    drawPoint(left, plane, {
      id: ptId(p.id),
      at: p,
      r: 6,
      role: moving ? 'active' : roles.get(ptId(p.id)),
      label: p.name,
      size: 15,
      opacity: moving ? undefined : 0.45,
    });
  }

  if (s.query) {
    const c = plane.at(s.query);
    left.push({
      kind: 'rect',
      id: 'q',
      x: c.x - 6,
      y: c.y - 6,
      w: 12,
      h: 12,
      r: 1,
      role: roles.get('q') ?? 'active',
    });
    left.push(
      text('q-l', { x: c.x + 9, y: c.y + 18 }, 'q', { size: 15, bold: true, role: 'active' }),
    );
  }

  const planeBox: Bounds = {
    x: 0,
    y: 0,
    w: plane.rect.x + plane.rect.w + 14,
    h: plane.rect.y + plane.rect.h + 22,
  };

  // The tree, laid out as it will be when the running insert ends, so nodes never jump.
  const full = finalTree(s);
  const live = new Set(s.nodes.map((n) => n.id));
  const kid = (id: number, side: 'left' | 'right') => {
    const n = full.nodes.find((m) => m.id === id)!;
    return n[side];
  };
  const layout = layoutBinaryTree(
    full.root,
    { left: (id) => kid(id, 'left'), right: (id) => kid(id, 'right') },
    {
      radius: 16,
      gap: 10,
      levelGap: 50,
    },
  );
  const shown = { ...layout, nodes: new Map([...layout.nodes].filter(([id]) => live.has(id))) };
  const right: Shape[] = drawBinaryTree(shown, {
    label: (id) => byId(s, id).name,
    roles,
    baseRole: (id) => (s.found.includes(id) || s.best === id ? 'found' : undefined),
    opacity: (id) => (faded.has(id) ? 0.4 : undefined),
  });
  // Which coordinate each level splits on.
  const labelX = layout.bounds.x - 14;
  for (let d = 0; d <= Math.max(0, layout.height); d++) {
    right.push(
      text(`lvl-${d}`, { x: labelX, y: d * 50 + 5 }, axisOf(d), {
        size: 15,
        anchor: 'end',
        bold: true,
      }),
    );
  }
  const treeBox: Bounds =
    full.root === null
      ? { x: 0, y: 0, w: 0, h: 0 }
      : {
          x: labelX - 14,
          y: layout.bounds.y,
          w: layout.bounds.x + layout.bounds.w - (labelX - 14),
          h: layout.bounds.h,
        };

  const at = (dx: number, dy: number) => ({
    dx,
    dy,
    bounds: unionBounds(planeBox, { ...treeBox, x: treeBox.x + dx, y: treeBox.y + dy }),
  });
  const beside = at(planeBox.w + 24 - treeBox.x, planeBox.y + ZOOM_DROP + 6 - treeBox.y);
  const under = at(
    planeBox.x + (planeBox.w - treeBox.w) / 2 - treeBox.x,
    planeBox.y + planeBox.h + 16 - treeBox.y,
  );
  const pick = pickLayout(stage, [beside, under]);
  const shapes = [...left, ...translate(right, pick.dx, pick.dy)];
  return { shapes, bounds: padBounds(pick.bounds, 8), label: describe(s) };
}
