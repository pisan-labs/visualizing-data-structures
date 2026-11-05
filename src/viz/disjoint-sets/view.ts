/**
 * Disjoint sets: the forest on top, every node with an arrow to its parent (roots have none,
 * since they point at themselves) and a small badge with its rank or size, and under it the
 * parent array, with the rank or size row the union setting uses.
 *
 * FIND-SET's position is the pointer label x; the root it finds is marked found. Trees go side
 * by side in order of their roots, children in increasing order, so the same forest always
 * gets the same picture and a node that is relinked slides to its new place.
 */
import type { MarkRole, Step } from '../../engine/types';
import { trimmedLine } from '../../layouts/binary-tree';
import { layoutForest } from '../../layouts/forest';
import { below, drawTable, padBounds, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  describe,
  keyId,
  nodeId,
  ptrId,
  roots,
  type DSExtra,
  type DSSettings,
  type DSState,
} from './model';

const R = 17;
const MAX_ROW = 430;

export function view(step: Step<DSState, DSExtra>, settings: DSSettings): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];
  if (s.elems.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'ds-empty',
      x: 0,
      y: 0,
      text: 'No elements. Make a set to start.',
      size: 15,
      cls: 'label',
    });
    return {
      shapes,
      bounds: { x: -20, y: -30, w: 300, h: 60 },
      label: describe(s, settings),
    };
  }
  const kids = new Map<number, number[]>(s.elems.map((x) => [x, []]));
  for (const x of s.elems) if (s.p[x] !== x) kids.get(s.p[x]!)!.push(x);
  const layout = layoutForest(roots(s), (x) => kids.get(x) ?? [], {
    radius: R,
    gap: 14,
    treeGap: 22,
    levelGap: 56,
    maxWidth: MAX_ROW,
    rowGap: 46,
  });
  const badge = settings.union === 'rank' ? 'rank' : settings.union === 'size' ? 'size' : null;
  for (const n of layout.nodes.values()) {
    if (n.parent !== null) {
      const par = layout.nodes.get(n.parent)!;
      shapes.push({
        kind: 'arrow',
        id: ptrId(n.id),
        ...trimmedLine(n, par, R + 1, R + 2),
        role: roles.get(ptrId(n.id)),
      });
    }
    const role = roles.get(nodeId(n.id));
    shapes.push({ kind: 'circle', id: nodeId(n.id), x: n.x, y: n.y, r: R, cls: 'live', role });
    shapes.push({
      kind: 'text',
      id: keyId(n.id),
      x: n.x,
      y: n.y + 16 * 0.35,
      text: String(n.id),
      size: 16,
      anchor: 'middle',
      weight: 'bold',
      role: roles.get(keyId(n.id)) ?? (role === 'active' || role === 'error' ? role : undefined),
    });
    if (badge && n.parent === null) {
      const value = badge === 'rank' ? s.rank[n.id] : s.size[n.id];
      shapes.push({
        kind: 'text',
        id: `badge-${n.id}`,
        x: n.x + R + 2,
        y: n.y - R + 2,
        text: `${badge === 'rank' ? 'r' : 's'}${value}`,
        size: 12,
        mono: true,
        cls: 'label',
      });
    }
  }
  if (extra.at !== undefined && layout.nodes.has(extra.at)) {
    const n = layout.nodes.get(extra.at)!;
    shapes.push({
      kind: 'text',
      id: 'ptr-x',
      x: n.x - R - 6,
      y: n.y - R + 4,
      text: 'x',
      size: 15,
      anchor: 'end',
      weight: 'bold',
      mono: true,
      role: 'active',
      cls: 'pointer',
    });
  }
  const forest = {
    x: layout.bounds.x - 14,
    y: layout.bounds.y - 6,
    w: layout.bounds.w + 40,
    h: layout.bounds.h + 6,
  };
  boxes.push(forest);
  const rows = [
    {
      key: 'p',
      label: 'p',
      cells: s.elems.map((x) => ({
        text: String(s.p[x]),
        role: s.p[x] === x ? ('done' as const) : undefined,
      })),
    },
  ];
  if (badge)
    rows.push({
      key: badge,
      label: badge,
      cells: s.elems.map((x) => ({
        text: String(badge === 'rank' ? s.rank[x] : s.size[x]),
        role: undefined,
      })),
    });
  boxes.push(
    drawTable(shapes, {
      id: 'arr',
      x: layout.bounds.x,
      y: below(forest, 22),
      columns: s.elems.map(String),
      head: 'x',
      rows,
      roles,
      perRow: 8,
    }),
  );
  // Room above for the stage's zoom buttons, and a minimum size so a few nodes are not huge.
  const all = unionBounds(...boxes);
  const room = {
    x: all.x,
    y: all.y - 30,
    w: Math.max(all.w + 40, 460),
    h: Math.max(all.h + 30, 300),
  };
  return {
    shapes,
    bounds: padBounds(unionBounds(all, room), 14),
    label: describe(s, settings),
  };
}
