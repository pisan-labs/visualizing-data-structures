/**
 * Tidy layout for ordered trees whose edges carry text: tries (one letter per edge) and
 * compressed tries (a string per edge).
 *
 * Every node sits on a level, one levelGap below its parent. The label of the edge into a node
 * sits at the midpoint of that edge, on a row halfway between the two levels, and the edge is
 * drawn in two pieces with a gap for the label, so the text never sits on a line. Labels are
 * monospace, so their width is known without measuring (0.6 em per character).
 *
 * The algorithm is a tidy tree for any number of children, with the label rows as extra rows:
 * each subtree is laid out on its own; the children of a node are then packed left to right,
 * each pushed right until, on every row (node rows and label rows alike), it is `gap` clear of
 * its older siblings, and until its edge label is clear of the previous sibling's. The parent
 * sits centered over its first and last child, so a lone child (a chain of letters) hangs
 * straight down. The layout is deterministic and draws the same subtree the same way wherever it
 * appears, so an insert or a delete moves only the nodes near the change.
 *
 * API
 *
 *   layoutTrie(root, children, options) -> TrieLayout
 *     root         the root id (a trie always has a root, even when it is empty).
 *     children(id) child ids, left to right (alphabetical order for a trie).
 *     options      label(id)      the text on the edge into id (the root's is ignored).
 *                  halfWidth(id)  half a node's drawn width, e.g. radius + 4 for a node drawn
 *                                 with an end-of-word ring. Default radius.
 *                  radius (11), labelSize (14, monospace), gap (10, between outlines),
 *                  labelGap (4, between two edge labels), levelGap (52), sideways (false:
 *                  true grows the tree to the right, one column per level, for a phone).
 *     Returns node centers (root at x = 0, y = 0), the box of every edge label, the height
 *     (edges on the longest root-to-leaf path) and the tight bounds of everything drawn.
 *
 *   drawTrie(layout, { isEnd, roles, baseRole, enterFrom, opacity }) -> Shape[]
 *     A circle per node, with a second, outer ring when isEnd(id) (end of a word: a shape, not
 *     a color), and each edge as two lines around its label. Shape ids, keyed by node id so a
 *     node keeps its shapes while it lives and the renderer animates it:
 *       trieNodeId(id)   the circle           trieRingId(id)   the end-of-word ring
 *       trieEdgeId(id)   the edge into id (its upper piece; the lower piece adds "-low")
 *       trieLabelId(id)  the edge label
 *     A role on trieEdgeId(id) colors both pieces of the edge; a role on trieNodeId(id) also
 *     colors the ring. Marks in a step should use these ids.
 *
 *   trieLabelWidth(text, size): the width of a label box.
 */
import type { MarkRole } from '../engine/types';
import type { Bounds, Shape } from '../render/scene';

export type TrieId = string | number;

export interface TrieLayoutOptions<Id extends TrieId> {
  /** The text on the edge into a node. */
  label(id: Id): string;
  /** Half the drawn width of a node. Default radius. */
  halfWidth?(id: Id): number;
  /** Node radius. Default 11. */
  radius?: number;
  /** Font size of the edge labels (monospace). Default 14. */
  labelSize?: number;
  /** Smallest horizontal gap between two outlines on the same row. Default 10. */
  gap?: number;
  /** Smallest horizontal gap between two edge labels. Default 4. */
  labelGap?: number;
  /** Vertical distance between levels, center to center. Default 52. */
  levelGap?: number;
  /**
   * Grow the tree to the right instead of down: the root on the left, each level a column, and
   * siblings stacked top to bottom. Each edge fans out from its parent, then runs level to its
   * child with the label on that level piece, so labels sit on their child's row and never
   * cross another edge. The columns are spread so that the longest label between two of them
   * fits, so long labels (a suffix tree's) widen the tree once per level instead of once per
   * leaf. For a tall, narrow stage. Default false.
   */
  sideways?: boolean;
}

export interface PlacedTrieNode<Id extends TrieId> {
  id: Id;
  x: number;
  y: number;
  depth: number;
  parent: Id | null;
  /** The box of the label on the edge into this node (null for the root). */
  label: (Bounds & { text: string }) | null;
}

export interface TrieLayout<Id extends TrieId> {
  /** Every node, in preorder. */
  nodes: Map<Id, PlacedTrieNode<Id>>;
  /** Edges on the longest root-to-leaf path (0 for a lone root). */
  height: number;
  /** Tight box around every node and label. */
  bounds: Bounds;
  radius: number;
  labelSize: number;
  levelGap: number;
  halfWidth(id: Id): number;
  /** Grown to the right (TrieLayoutOptions.sideways). */
  sideways?: boolean;
}

interface Outline {
  /** Left and right extents at each row, relative to the subtree root's center. Row 2d holds
   * the nodes d levels down; row 2d + 1 the labels of the edges between levels d and d + 1. */
  l: number[];
  r: number[];
}

/** Width of a monospace label box: the text plus a little room on each side. */
export function trieLabelWidth(text: string, size = 14): number {
  return [...text].length * size * 0.6 + size * 0.3;
}

const labelHeight = (size: number) => size * 1.15;

/** Sideways: the room a parent's edges fan out in, and the room kept right of a label. */
const FAN = 22;
const SIDE_PAD = 6;

export function layoutTrie<Id extends TrieId>(
  root: Id,
  children: (id: Id) => Id[],
  options: TrieLayoutOptions<Id>,
): TrieLayout<Id> {
  const radius = options.radius ?? 11;
  const labelSize = options.labelSize ?? 14;
  const gap = options.gap ?? 10;
  const labelGap = options.labelGap ?? 4;
  const levelGap = options.levelGap ?? 52;
  const half = (id: Id) => options.halfWidth?.(id) ?? radius;
  const sideways = options.sideways ?? false;
  const textW = (id: Id) => trieLabelWidth(options.label(id), labelSize);
  // How much room a label takes across the tree: its width, or sideways its height.
  // Sideways, a label sits on its child's row, which the nodes already keep apart.
  const lw = sideways ? () => 0 : textW;

  // Offsets of each node's children from its center, filled in bottom-up.
  const offsets = new Map<Id, number[]>();
  const seen = new Set<Id>();

  const outline = (id: Id): Outline => {
    if (seen.has(id)) throw new Error(`Node ${String(id)} appears twice: not a tree.`);
    seen.add(id);
    const kids = children(id);
    const h = half(id);
    if (kids.length === 0) {
      offsets.set(id, []);
      return { l: [-h], r: [h] };
    }
    const subs = kids.map(outline);
    const widths = kids.map(lw);
    const xs: number[] = [];
    let merged: Outline = { l: [], r: [] };
    subs.forEach((o, i) => {
      let x = 0;
      if (i > 0) {
        x = xs[i - 1]!;
        const n = Math.min(merged.l.length, o.l.length);
        for (let k = 0; k < n; k++) x = Math.max(x, merged.r[k]! + gap - o.l[k]!);
        // Labels sit at the midpoints of the edges, so they are half as far apart as the
        // children: keep the two labels labelGap apart.
        x = Math.max(x, xs[i - 1]! + widths[i - 1]! + widths[i]! + 2 * labelGap);
      }
      xs.push(x);
      const depth = Math.max(merged.l.length, o.l.length);
      const next: Outline = { l: [], r: [] };
      for (let k = 0; k < depth; k++) {
        const ml = merged.l[k];
        const ol = o.l[k];
        next.l.push(ml === undefined ? ol! + x : ol === undefined ? ml : Math.min(ml, ol + x));
        const mr = merged.r[k];
        const or = o.r[k];
        next.r.push(mr === undefined ? or! + x : or === undefined ? mr : Math.max(mr, or + x));
      }
      merged = next;
    });
    const mid = (xs[0]! + xs[xs.length - 1]!) / 2;
    const offs = xs.map((x) => x - mid);
    offsets.set(id, offs);
    // The label row: each label centered on the midpoint of its edge.
    let ll = Infinity;
    let lr = -Infinity;
    offs.forEach((o, i) => {
      ll = Math.min(ll, o / 2 - widths[i]! / 2);
      lr = Math.max(lr, o / 2 + widths[i]! / 2);
    });
    return {
      l: [-h, ll, ...merged.l.map((v) => v - mid)],
      r: [h, lr, ...merged.r.map((v) => v - mid)],
    };
  };

  outline(root);

  const nodes = new Map<Id, PlacedTrieNode<Id>>();
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let height = 0;
  const lh = labelHeight(labelSize);

  if (sideways) return sidewaysPlace();

  const place = (id: Id, x: number, depth: number, parent: PlacedTrieNode<Id> | null) => {
    const y = depth * levelGap;
    let label: PlacedTrieNode<Id>['label'] = null;
    if (parent) {
      const text = options.label(id);
      const w = lw(id);
      const cx = (parent.x + x) / 2;
      const cy = (parent.y + y) / 2;
      label = { x: cx - w / 2, y: cy - lh / 2, w, h: lh, text };
      minX = Math.min(minX, label.x);
      maxX = Math.max(maxX, label.x + w);
    }
    const node: PlacedTrieNode<Id> = { id, x, y, depth, parent: parent?.id ?? null, label };
    nodes.set(id, node);
    height = Math.max(height, depth);
    minX = Math.min(minX, x - half(id));
    maxX = Math.max(maxX, x + half(id));
    maxY = Math.max(maxY, y + Math.max(radius, half(id)));
    const offs = offsets.get(id)!;
    children(id).forEach((k, i) => place(k, x + offs[i]!, depth + 1, node));
  };
  place(root, 0, 0, null);

  const top = -Math.max(radius, half(root));
  return {
    nodes,
    height,
    bounds: { x: minX, y: top, w: maxX - minX, h: maxY - top },
    radius,
    labelSize,
    levelGap,
    halfWidth: half,
  };

  /** Sideways: the offsets run down the page, and each level is a column. */
  function sidewaysPlace(): TrieLayout<Id> {
    // The widest label into each level, then the columns far enough apart for it.
    const widest: number[] = [0];
    const measure = (id: Id, depth: number) =>
      children(id).forEach((k) => {
        widest[depth + 1] = Math.max(widest[depth + 1] ?? 0, textW(k));
        measure(k, depth + 1);
      });
    measure(root, 0);
    const cols = [0];
    for (let d = 1; d < widest.length; d++) {
      const room = (widest[d] ?? 0) + 2 * radius + 2 * RING + FAN + SIDE_PAD;
      cols.push(cols[d - 1]! + Math.max(levelGap, room));
    }
    let minY = Infinity;
    const put = (id: Id, y: number, depth: number, parent: PlacedTrieNode<Id> | null) => {
      const x = cols[depth]!;
      let label: PlacedTrieNode<Id>['label'] = null;
      if (parent) {
        const text = options.label(id);
        const w = textW(id);
        label = { x: parent.x + half(parent.id) + FAN, y: y - lh / 2, w, h: lh, text };
        minY = Math.min(minY, label.y);
        maxY = Math.max(maxY, label.y + lh);
      }
      const node: PlacedTrieNode<Id> = { id, x, y, depth, parent: parent?.id ?? null, label };
      nodes.set(id, node);
      height = Math.max(height, depth);
      const h = Math.max(radius, half(id));
      minX = Math.min(minX, x - h);
      maxX = Math.max(maxX, x + h);
      minY = Math.min(minY, y - half(id));
      maxY = Math.max(maxY, y + half(id));
      const offs = offsets.get(id)!;
      children(id).forEach((k, i) => put(k, y + offs[i]!, depth + 1, node));
    };
    put(root, 0, 0, null);
    return {
      nodes,
      height,
      bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      radius,
      labelSize,
      levelGap,
      halfWidth: half,
      sideways: true,
    };
  }
}

export const trieNodeId = (id: TrieId) => `tn-${id}`;
export const trieRingId = (id: TrieId) => `tr-${id}`;
export const trieEdgeId = (id: TrieId) => `te-${id}`;
export const trieLabelId = (id: TrieId) => `tl-${id}`;

/** How far the end-of-word ring sits outside a node. */
export const RING = 4;

export interface DrawTrieOptions<Id extends TrieId> {
  /** A word ends at this node: draw a second ring around it. */
  isEnd(id: Id): boolean;
  /** Roles by shape id, usually built from the step's marks. */
  roles?: ReadonlyMap<string, MarkRole>;
  /** Role for a node (and its ring) when no mark names it. */
  baseRole?(id: Id): MarkRole | undefined;
  /** Role for the edge into a node (and its label) when no mark names it. */
  edgeRole?(id: Id): MarkRole | undefined;
  /** Where a node slides in from the first time it appears. */
  enterFrom?(id: Id): { x: number; y: number } | undefined;
  /** Opacity of a node, its ring, its edge and its label. */
  opacity?(id: Id): number | undefined;
}

/** Where the line from the center of a box of half sizes (hw, hh) along (ux, uy) leaves it. */
function exitDistance(ux: number, uy: number, hw: number, hh: number): number {
  const sx = Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity;
  const sy = Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity;
  return Math.min(sx, sy);
}

export function drawTrie<Id extends TrieId>(
  layout: TrieLayout<Id>,
  opts: DrawTrieOptions<Id>,
): Shape[] {
  const roles = opts.roles ?? new Map<string, MarkRole>();
  const r = layout.radius;
  const shapes: Shape[] = [];
  const outer = (id: Id) => (opts.isEnd(id) ? r + RING : r);
  for (const n of layout.nodes.values()) {
    const role = roles.get(trieNodeId(n.id)) ?? opts.baseRole?.(n.id);
    const opacity = opts.opacity?.(n.id);
    const enter = opts.enterFrom?.(n.id);
    if (n.parent !== null && n.label) {
      const p = layout.nodes.get(n.parent)!;
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const cx = n.label.x + n.label.w / 2;
      const cy = n.label.y + n.label.h / 2;
      const s = exitDistance(ux, uy, n.label.w / 2 + 1, n.label.h / 2 + 1);
      const edgeId = trieEdgeId(n.id);
      const edgeRole = roles.get(edgeId) ?? opts.edgeRole?.(n.id);
      const a = {
        x1: p.x + ux * outer(p.id),
        y1: p.y + uy * outer(p.id),
        x2: cx - ux * s,
        y2: cy - uy * s,
      };
      const b = {
        x1: cx + ux * s,
        y1: cy + uy * s,
        x2: n.x - ux * outer(n.id),
        y2: n.y - uy * outer(n.id),
      };
      if (layout.sideways) {
        // Fan out from the parent to the label's left end, then run level to the child.
        const fx = n.label.x - 2;
        const len2 = Math.hypot(fx - p.x, cy - p.y) || 1;
        a.x1 = p.x + ((fx - p.x) / len2) * outer(p.id);
        a.y1 = p.y + ((cy - p.y) / len2) * outer(p.id);
        a.x2 = fx;
        a.y2 = cy;
        b.x1 = n.label.x + n.label.w + 2;
        b.y1 = cy;
        b.x2 = n.x - outer(n.id);
        b.y2 = n.y;
      }
      for (const [id, seg] of [
        [edgeId, a],
        [`${edgeId}-low`, b],
      ] as const) {
        // A piece too short to see (a label taller than the room) is drawn as a point.
        const ok = (seg.x2 - seg.x1) * ux + (seg.y2 - seg.y1) * uy > 0;
        shapes.push({
          kind: 'arrow',
          id,
          ...(ok ? seg : { x1: cx, y1: cy, x2: cx, y2: cy }),
          head: 'none',
          role: edgeRole,
          opacity,
          enterFrom: enter && { x: p.x, y: p.y },
        });
      }
      const labelRole = roles.get(trieLabelId(n.id)) ?? edgeRole;
      shapes.push({
        kind: 'text',
        id: trieLabelId(n.id),
        x: cx,
        y: cy + layout.labelSize * 0.36,
        text: n.label.text,
        size: layout.labelSize,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: labelRole,
        opacity,
        enterFrom: enter && { x: p.x, y: p.y },
      });
    }
    if (opts.isEnd(n.id)) {
      shapes.push({
        kind: 'circle',
        id: trieRingId(n.id),
        x: n.x,
        y: n.y,
        r: r + RING,
        cls: 'live',
        role: roles.get(trieRingId(n.id)) ?? role,
        opacity,
        enterFrom: enter,
      });
    }
    shapes.push({
      kind: 'circle',
      id: trieNodeId(n.id),
      x: n.x,
      y: n.y,
      r,
      cls: 'live',
      role,
      opacity,
      enterFrom: enter,
    });
  }
  return shapes;
}
