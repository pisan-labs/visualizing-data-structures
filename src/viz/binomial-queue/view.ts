import type { MarkRole, Step } from '../../engine/types';
import { labelSize, padBounds, trimmedLine, unionBounds } from '../../layouts/binary-tree';
import { drawForest, layoutForest, shiftForest, type ForestLayout } from '../../layouts/forest';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  binary,
  childrenOf,
  countFrom,
  describe,
  listFrom,
  tree,
  type BinExtra,
  type BinSettings,
  type BinState,
} from './model';

const R = 17;
/** Rows above the roots: tree names, then pointer names, then N in binary. */
const NAME_Y = -(R + 8);
const PTR_Y = -(R + 26);
const N_Y = -(R + 56);
const BOX_W = 56;

export const rootListId = (u: number) => `rlist-${u}`;

export function view(step: Step<BinState, BinExtra>, settings: BinSettings): Scene {
  const { state: s } = step;
  const extra = step.extra;
  const internal = settings.view === 'internal';
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const kids = (u: number) => childrenOf(s.nodes, u);
  // The internal view spaces siblings apart so the sibling pointers between them show.
  const opts = {
    radius: R,
    gap: internal ? 26 : 8,
    treeGap: internal ? 36 : 28,
    levelGap: internal ? 62 : 54,
  };
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  const drawList = (layout: ForestLayout, head: number | null, prefix: string) => {
    shapes.push(
      ...drawForest(layout, {
        label: (u) => String(s.nodes[u]!.key),
        keyId: (u) => `kv-${s.nodes[u]!.vid}`,
        children: kids,
        roles,
        style: internal ? 'pointers' : 'tree',
      }),
    );
    const roots = listFrom(s.nodes, head);
    for (const u of roots) {
      const p = layout.nodes.get(u)!;
      shapes.push({
        kind: 'text',
        id: `${prefix}name-${u}`,
        x: p.x,
        y: p.y + NAME_Y + 4,
        text: tree(s.nodes[u]!.degree),
        size: 14,
        anchor: 'middle',
        cls: 'label',
        weight: 'bold',
      });
    }
    if (internal) {
      // The degree field under every node, and the root list's sibling pointers.
      for (const n of layout.nodes.values()) {
        shapes.push({
          kind: 'text',
          id: `deg-${n.id}`,
          x: n.x + R + 3,
          y: n.y + R + 4,
          text: String(s.nodes[n.id]!.degree),
          size: 11,
          cls: 'label',
          mono: true,
        });
      }
      roots.forEach((u, i) => {
        const v = roots[i + 1];
        if (v === undefined) return;
        const a = layout.nodes.get(u)!;
        const b = layout.nodes.get(v)!;
        shapes.push({
          kind: 'arrow',
          id: rootListId(u),
          ...trimmedLine(a, b, R, R + 2),
          role: roles.get(rootListId(u)),
        });
      });
    }
    boxes.push({ ...layout.bounds, h: layout.bounds.h + (internal ? 14 : 0) });
  };

  const main = layoutForest(listFrom(s.nodes, s.head), kids, opts);
  const firstRoot = s.head === null ? null : main.nodes.get(s.head)!;
  if (s.head === null) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 44,
      y: 5,
      text: 'empty queue',
      size: 15,
      anchor: 'middle',
      cls: 'label',
      role: roles.get('empty'),
    });
    boxes.push({ x: 0, y: -R, w: 88, h: 2 * R });
  } else {
    drawList(main, s.head, 'm');
  }
  if (internal && firstRoot) {
    shapes.push({
      kind: 'text',
      id: 'head-label',
      x: firstRoot.x - R - 40,
      y: 5,
      text: 'head',
      size: 13,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
    shapes.push({
      kind: 'arrow',
      id: 'head-ptr',
      x1: firstRoot.x - R - 36,
      y1: 0,
      x2: firstRoot.x - R - 3,
      y2: 0,
      role: roles.get('head-ptr'),
    });
    boxes.push({ x: firstRoot.x - R - 80, y: -10, w: 80, h: 20 });
  }

  // A second root list, waiting for union, under the first.
  if (s.other !== null) {
    const top =
      (s.head === null ? R : main.bounds.y + main.bounds.h + (internal ? 14 : 0)) - NAME_Y + 40;
    const other = shiftForest(layoutForest(listFrom(s.nodes, s.other), kids, opts), 0, top);
    drawList(other, s.other, 'o');
    const n2 = countFrom(s.nodes, s.other);
    shapes.push({
      kind: 'text',
      id: 'other-label',
      x: 0,
      y: top + N_Y + 12,
      text: `${extra?.otherLabel ?? 'H2'}: N₂ = ${n2} = ${binary(n2)}`,
      size: 14,
      cls: 'label',
      mono: true,
    });
    boxes.push({ x: 0, y: top + N_Y, w: 200, h: 16 });
  }

  // Pointer names over the roots they point at: prev, x and next during union, x and y in scans.
  if (extra?.ptr) {
    const at = new Map<number, string[]>();
    for (const [name, u] of Object.entries(extra.ptr)) {
      if (u === null || u === undefined || !main.nodes.has(u)) continue;
      at.set(u, [...(at.get(u) ?? []), name]);
    }
    for (const [u, names] of at) {
      const p = main.nodes.get(u)!;
      shapes.push({
        kind: 'text',
        id: `ptr-${u}`,
        x: p.x,
        y: p.y + PTR_Y + 4,
        text: names.join(', '),
        size: 13,
        anchor: 'middle',
        mono: true,
        cls: 'pointer',
        role: 'active',
      });
    }
  }

  // N in binary, and after it, on the same row, a key on its way out or a refused argument.
  let rowEnd = 0;
  if (s.head !== null || extra !== undefined) {
    const n = countFrom(s.nodes, s.head);
    const sum = extra?.sum;
    const text =
      sum && sum.b > 0
        ? `N = ${sum.a} + ${sum.b}:  ${binary(sum.a)} + ${binary(sum.b)} = ${binary(sum.a + sum.b)}`
        : `N = ${n} = ${binary(n)}`;
    shapes.push({
      kind: 'text',
      id: 'n-binary',
      x: 0,
      y: N_Y + 5,
      text,
      size: 14,
      mono: true,
      cls: 'label',
    });
    rowEnd = text.length * 8.4;
    boxes.push({ x: 0, y: N_Y - 12, w: rowEnd, h: 18 });
  }
  if (extra !== undefined) {
    const shown = extra.out
      ? { id: 'out', label: extra.out.label, text: String(extra.out.key), role: roles.get('out') }
      : extra.arg
        ? {
            id: 'arg',
            label: extra.arg.label,
            text: extra.arg.text.length > 8 ? `${extra.arg.text.slice(0, 7)}…` : extra.arg.text,
            role: roles.get('arg-box'),
          }
        : null;
    if (shown) {
      const w = Math.max(BOX_W, shown.text.length * 10 + 18);
      const lx = rowEnd + 24;
      const x = lx + shown.label.length * 9 + 8;
      shapes.push({
        kind: 'text',
        id: `${shown.id}-label`,
        x: lx,
        y: N_Y + 5,
        text: shown.label,
        size: 15,
        cls: 'label',
        mono: true,
      });
      shapes.push({
        kind: 'rect',
        id: `${shown.id}-box`,
        x,
        y: N_Y - 14,
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
        y: N_Y + size * 0.35,
        text: shown.text,
        size,
        anchor: 'middle',
        weight: 'bold',
        role: shown.role,
        z: 3,
      });
      boxes.push({ x: lx, y: N_Y - 14, w: x + w - lx, h: 28 });
    }
    // Keep room for the pointer names and the tree names, so the camera holds still.
    boxes.push({ x: 0, y: PTR_Y - 12, w: 10, h: 10 });
  }

  return {
    shapes,
    bounds: padBounds(unionBounds(...boxes), 14),
    label: describe(s),
  };
}
