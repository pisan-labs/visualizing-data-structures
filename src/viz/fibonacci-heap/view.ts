import type { MarkRole, Step } from '../../engine/types';
import { labelSize, padBounds, trimmedLine, unionBounds } from '../../layouts/binary-tree';
import {
  drawForest,
  layoutForest,
  shiftForest,
  type ForestLayout,
  type PlacedForestNode,
} from '../../layouts/forest';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  countNodes,
  describe,
  marked,
  show,
  type FibExtra,
  type FibSettings,
  type FibState,
} from './model';

const R = 17;
/** Rows above the first row of roots: the min pointer, the wrap of the root list, the totals. */
const MIN_Y = -(R + 24);
const WRAP_Y = -(R + 42);
const STATS_Y = -(R + 66);
const BOX_W = 56;
const CELL = { w: 40, h: 30 };
/** Wrap the root list onto a new row past this width, so long lists stay readable on phones. */
const MAX_ROW = 420;

type Pt = { x: number; y: number };

export function view(step: Step<FibState, FibExtra>, settings: FibSettings): Scene {
  const { state: s } = step;
  const extra = step.extra;
  const internal = settings.view === 'internal';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const kids = (u: number) => s.nodes[u]!.children;
  // Arrowheads are 14 units long, so doubly linked arrows (internal view) need wide gaps.
  const opts = {
    radius: R,
    gap: internal ? 40 : 8,
    treeGap: internal ? 44 : 26,
    levelGap: internal ? 62 : 56,
    maxWidth: MAX_ROW,
    rowGap: 64,
  };
  const listHead = internal ? 'both' : 'none';
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  /** A polyline as arrow segments; the first and last can carry arrowheads into the ends. */
  const polyline = (id: string, pts: Pt[], headStart: boolean, headEnd: boolean) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const first = i === 0;
      const last = i + 2 === pts.length;
      // The first segment is drawn backwards, so its arrowhead lands on the start.
      const [p, q] = first && headStart ? [b, a] : [a, b];
      const head = (first && headStart) || (last && headEnd) ? 'end' : 'none';
      shapes.push({
        kind: 'arrow',
        id: `${id}-${i}`,
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        head,
        cls: 'list',
        role: roles.get(id),
      });
    }
  };

  const drawList = (layout: ForestLayout, roots: number[], prefix: string) => {
    shapes.push(
      ...drawForest(layout, {
        label: (u) => show(s.nodes[u]!.key),
        keyId: (u) => `kv-${s.nodes[u]!.vid}`,
        children: kids,
        roles,
        style: internal ? 'pointers' : 'tree',
        doubly: true,
      }),
    );
    // Marked nodes get a dashed ring, so the mark does not rest on color alone.
    for (const n of layout.nodes.values()) {
      if (!s.nodes[n.id]!.mark) continue;
      shapes.push({
        kind: 'circle',
        id: `ring-${n.id}`,
        x: n.x,
        y: n.y,
        r: R + 5,
        cls: 'ghost',
        role: roles.get(`ring-${n.id}`),
      });
    }
    if (internal) {
      for (const n of layout.nodes.values()) {
        shapes.push({
          kind: 'text',
          id: `deg-${n.id}`,
          x: n.x + R + 4,
          y: n.y + R + 5,
          text: String(s.nodes[n.id]!.children.length),
          size: 11,
          cls: 'label',
          mono: true,
        });
      }
    }
    // The root list: doubly linked between neighbors, and around from the last to the first.
    const at = (u: number) => layout.nodes.get(u)!;
    const rowOf = new Map(layout.trees.map((t) => [t.root, t.row]));
    const rowRight = (row: number) =>
      Math.max(...layout.trees.filter((t) => t.row === row).map((t) => t.bounds.x + t.bounds.w));
    const rowBottom = (row: number) =>
      Math.max(...layout.trees.filter((t) => t.row === row).map((t) => t.bounds.y + t.bounds.h));
    roots.forEach((u, i) => {
      const v = roots[i + 1];
      if (v === undefined) return;
      const a = at(u);
      const b = at(v);
      const id = `${prefix}rl-${u}`;
      if (rowOf.get(u) === rowOf.get(v)) {
        shapes.push({
          kind: 'arrow',
          id,
          ...trimmedLine(a, b, R + 2, R + 2),
          head: listHead,
          cls: 'list',
          role: roles.get(id),
        });
        return;
      }
      // Down to the next row, close under this one: the next row's H.min label sits above it.
      const xr = rowRight(rowOf.get(u)!) + 10;
      const ym = rowBottom(rowOf.get(u)!) + 14;
      const xl = b.x - R - 14;
      polyline(
        id,
        [
          { x: a.x + R + 2, y: a.y },
          { x: xr, y: a.y },
          { x: xr, y: ym },
          { x: xl, y: ym },
          { x: xl, y: b.y },
          { x: b.x - R - 2, y: b.y },
        ],
        internal,
        internal,
      );
    });
    if (roots.length > 1) {
      // Around from the right side of the last root, over the top, into the left of the first.
      const first = at(roots[0]!);
      const last = at(roots[roots.length - 1]!);
      const top = first.y + WRAP_Y + R;
      const xr =
        rowOf.get(roots[roots.length - 1]!) === rowOf.get(roots[0]!)
          ? last.x + R + 14
          : layout.bounds.x + layout.bounds.w + 22;
      const xl = first.x - R - 14;
      polyline(
        `${prefix}wrap`,
        [
          { x: last.x + R + 2, y: last.y },
          { x: xr, y: last.y },
          { x: xr, y: top },
          { x: xl, y: top },
          { x: xl, y: first.y },
          { x: first.x - R - 2, y: first.y },
        ],
        internal,
        true,
      );
      boxes.push({ x: xl, y: top - 2, w: xr - xl, h: 4 });
    }
    boxes.push({ ...layout.bounds, h: layout.bounds.h + (internal ? 14 : 0) });
  };

  const minLabel = (node: PlacedForestNode, text: string, id: string) => {
    shapes.push({
      kind: 'text',
      id: `${id}-label`,
      x: node.x,
      y: node.y + MIN_Y + R - 4,
      text,
      size: 13,
      anchor: 'middle',
      mono: true,
      cls: 'pointer',
      role: roles.get(id) ?? (extra?.minPending ? 'stale' : 'found'),
    });
    shapes.push({
      kind: 'arrow',
      id,
      x1: node.x,
      y1: node.y + MIN_Y + R,
      x2: node.x,
      y2: node.y - R - 3,
      role: roles.get(id) ?? (extra?.minPending ? undefined : 'found'),
    });
  };

  const main = layoutForest(s.roots, kids, opts);
  if (s.roots.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 48,
      y: 5,
      text: 'empty heap',
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role: roles.get('empty'),
    });
    boxes.push({ x: 0, y: -R, w: 96, h: 2 * R });
  } else {
    drawList(main, s.roots, 'm');
    if (s.min !== null && main.nodes.has(s.min))
      minLabel(main.nodes.get(s.min)!, 'H.min', 'min-ptr');
  }

  let below = s.roots.length ? main.bounds.y + main.bounds.h + (internal ? 14 : 0) : R;

  // A second heap waiting to be joined, under the first.
  if (s.other.length) {
    const top = below - MIN_Y + 34;
    const other = shiftForest(layoutForest(s.other, kids, opts), 0, top);
    drawList(other, s.other, 'o');
    if (s.otherMin !== null) minLabel(other.nodes.get(s.otherMin)!, 'H2.min', 'min2-ptr');
    shapes.push({
      kind: 'text',
      id: 'other-label',
      x: -12,
      y: top + 5,
      text: extra?.otherLabel ?? 'H2',
      size: 14,
      anchor: 'end',
      mono: true,
      cls: 'label',
    });
    boxes.push({ x: -40, y: top - 10, w: 40, h: 20 });
    below = other.bounds.y + other.bounds.h;
  }

  // The degree table of consolidate, under the trees.
  if (extra?.table) {
    const y0 = below + 34;
    extra.table.forEach((u, d) => {
      const x = d * CELL.w;
      const id = `slot-${d}`;
      shapes.push({
        kind: 'rect',
        id,
        x,
        y: y0,
        w: CELL.w,
        h: CELL.h,
        r: 0,
        cls: 'live',
        role: roles.get(id),
      });
      if (u !== null && s.nodes[u]) {
        const text = show(s.nodes[u]!.key);
        const size = text.length <= 2 ? 15 : 13;
        shapes.push({
          kind: 'text',
          id: `slotv-${d}`,
          x: x + CELL.w / 2,
          y: y0 + CELL.h / 2 + size * 0.35,
          text,
          size,
          anchor: 'middle',
          weight: 'bold',
          role: roles.get(id),
        });
      }
      shapes.push({
        kind: 'text',
        id: `slotix-${d}`,
        x: x + CELL.w / 2,
        y: y0 + CELL.h + 14,
        text: String(d),
        size: 12,
        anchor: 'middle',
        cls: 'index',
        mono: true,
      });
    });
    shapes.push({
      kind: 'text',
      id: 'table-label',
      x: -10,
      y: y0 + CELL.h / 2 + 5,
      text: 'A',
      size: 15,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
    boxes.push({ x: -24, y: y0, w: extra.table.length * CELL.w + 24, h: CELL.h + 18 });
  }

  // Totals and the potential, then a key on its way out, on one row above everything.
  if (s.roots.length || extra !== undefined) {
    const n = countNodes(s.nodes, s.roots) + countNodes(s.nodes, s.other);
    const t = s.roots.length + s.other.length;
    const m = marked(s.nodes);
    const text = `N = ${n}, t(H) = ${t}, m(H) = ${m}, Φ = ${t + 2 * m}`;
    shapes.push({
      kind: 'text',
      id: 'totals',
      x: 0,
      y: STATS_Y + 5,
      text,
      size: 14,
      mono: true,
      cls: 'label',
    });
    const end = text.length * 8.4;
    boxes.push({ x: 0, y: STATS_Y - 12, w: end, h: 18 });
    const shown = extra?.out
      ? { id: 'out', label: extra.out.label, text: extra.out.text, role: roles.get('out') }
      : extra?.arg
        ? {
            id: 'arg',
            label: extra.arg.label,
            text: extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text,
            role: roles.get('arg-box'),
          }
        : null;
    if (shown) {
      const w = Math.max(BOX_W, shown.text.length * 10 + 18);
      const lx = end + 24;
      const x = lx + shown.label.length * 9 + 8;
      shapes.push({
        kind: 'text',
        id: `${shown.id}-label`,
        x: lx,
        y: STATS_Y + 5,
        text: shown.label,
        size: 15,
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: `${shown.id}-box`,
        x,
        y: STATS_Y - 14,
        w,
        h: 28,
        r: 6,
        cls: 'ghost',
        role: shown.role,
      });
      const size = labelSize(shown.text);
      shapes.push({
        kind: 'text',
        id: shown.id,
        x: x + w / 2,
        y: STATS_Y + size * 0.35,
        text: shown.text,
        size,
        anchor: 'middle',
        weight: 'bold',
        role: shown.role,
        z: 3,
      });
      boxes.push({ x: lx, y: STATS_Y - 14, w: x + w - lx, h: 28 });
    }
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s),
  };
}
