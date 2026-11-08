import type { MarkRole, Step } from '../../engine/types';
import { layoutBinaryTree, padBounds, trimmedLine, unionBounds } from '../../layouts/binary-tree';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  colId,
  describe,
  edgeId,
  nodeId,
  show,
  type HuffExtra,
  type HuffSettings,
  type HuffState,
} from './model';

const R = 16;
const LEAF = 30;
const TREE_GAP = 18;
const HELD_GAP = 34;
const CAPTION_Y = -R - 14;
const MONO = 0.6;

/** Deep trees get closer levels so they still fit a short screen. */
function levelGapFor(height: number): number {
  return height <= 4 ? 54 : Math.max(44, 54 - 3 * (height - 4));
}

function heightOf(s: HuffState, u: number): number {
  const n = s.nodes[u]!;
  return n.sym !== null ? 0 : 1 + Math.max(heightOf(s, n.left!), heightOf(s, n.right!));
}

/** Draw the trees of the queue (and any taken out of it) side by side, roots on one line. */
function drawForest(
  s: HuffState,
  roles: ReadonlyMap<string, MarkRole>,
  path: Set<number>,
): { shapes: Shape[]; bounds: Bounds[] } {
  const shapes: Shape[] = [];
  const bounds: Bounds[] = [];
  const roots = [...s.held, ...s.queue];
  const levelGap = levelGapFor(Math.max(0, ...roots.map((u) => heightOf(s, u))));
  let cursor = 0;
  const startOf = new Map<number, number>();
  roots.forEach((root, i) => {
    if (i === s.held.length && s.held.length > 0) cursor += HELD_GAP - TREE_GAP;
    const layout = layoutBinaryTree(
      root,
      { left: (u) => s.nodes[u]!.left, right: (u) => s.nodes[u]!.right },
      {
        radius: R,
        gap: 10,
        levelGap,
        width: (u) => (s.nodes[u]!.sym !== null ? LEAF : 2 * R),
      },
    );
    const dx = cursor - layout.bounds.x;
    startOf.set(root, cursor);
    const at = (u: number) => {
      const p = layout.nodes.get(u)!;
      return { x: p.x + dx, y: p.y };
    };
    for (const n of layout.nodes.values()) {
      const node = s.nodes[n.id]!;
      const p = at(n.id);
      const role = roles.get(nodeId(n.id)) ?? (path.has(n.id) ? 'visit' : undefined);
      if (n.parent !== null) {
        const q = at(n.parent);
        const line = trimmedLine(q, p, R, node.sym !== null ? LEAF / 2 + 1 : R);
        const eid = edgeId(n.id);
        const edgeRole = roles.get(eid) ?? (path.has(n.id) ? 'active' : undefined);
        shapes.push({ kind: 'arrow', id: eid, ...line, head: 'none', role: edgeRole });
        // The bit on the edge: 0 on the left edge, 1 on the right, outside the pair of edges.
        const left = n.side === 'left';
        const mx = (q.x + p.x) / 2;
        const my = (q.y + p.y) / 2;
        shapes.push({
          kind: 'text',
          id: `hb-${n.id}`,
          x: mx + (left ? -7 : 7),
          y: my - 1,
          text: left ? '0' : '1',
          size: 14,
          anchor: left ? 'end' : 'start',
          weight: 'bold',
          mono: true,
          role: edgeRole === 'active' ? 'active' : undefined,
        });
      }
      if (node.sym !== null) {
        shapes.push({
          kind: 'rect',
          id: nodeId(n.id),
          x: p.x - LEAF / 2,
          y: p.y - LEAF / 2,
          w: LEAF,
          h: LEAF,
          r: 6,
          cls: 'live',
          role,
        });
        shapes.push({
          kind: 'text',
          id: `hk-${n.id}`,
          x: p.x,
          y: p.y + 6,
          text: show(node.sym),
          size: 17,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: role === 'active' || role === 'found' || role === 'error' ? role : undefined,
        });
        shapes.push({
          kind: 'text',
          id: `hw-${n.id}`,
          x: p.x,
          y: p.y + LEAF / 2 + 14,
          text: String(node.weight),
          size: 13,
          anchor: 'middle',
          cls: 'label',
          mono: true,
        });
      } else {
        shapes.push({
          kind: 'circle',
          id: nodeId(n.id),
          x: p.x,
          y: p.y,
          r: R,
          cls: 'live',
          role,
        });
        const text = String(node.weight);
        shapes.push({
          kind: 'text',
          id: `hk-${n.id}`,
          x: p.x,
          y: p.y + 5,
          text,
          size: text.length <= 2 ? 15 : text.length === 3 ? 13 : 11,
          anchor: 'middle',
          weight: 'bold',
          role: role === 'active' || role === 'found' || role === 'error' ? role : undefined,
        });
      }
    }
    // Room under the leaves for their weights.
    bounds.push({ ...layout.bounds, x: cursor, h: layout.bounds.h + 20 });
    cursor += layout.bounds.w + TREE_GAP;
  });

  // Captions above the queue and above the trees taken out of it.
  if (roots.length > 1 || s.held.length) {
    if (s.held.length) {
      shapes.push({
        kind: 'text',
        id: 'cap-held',
        x: startOf.get(s.held[0]!)!,
        y: CAPTION_Y,
        text: 'taken out',
        size: 13,
        cls: 'label',
      });
    }
    if (s.queue.length) {
      const x = startOf.get(s.queue[0]!)!;
      shapes.push({
        kind: 'text',
        id: 'cap-queue',
        x,
        y: CAPTION_Y,
        text: 'queue, lightest first →',
        size: 13,
        cls: 'label',
      });
      bounds.push({ x, y: CAPTION_Y - 12, w: 150, h: 14 });
    }
  }
  return { shapes, bounds };
}

/**
 * The code table, beside the tree: one row per symbol, in symbol order, with its code. The
 * counts are already under the leaves. A narrow column beside the tree suits both screens: a
 * phone has width to spare for it, and a desktop stage is short, with no height for a table
 * under the tree.
 */
function drawTable(
  s: HuffState,
  x0: number,
  y0: number,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const size = 14;
  const rowH = 22;
  const symW = 34;
  const longest = Math.max(4, ...s.freq.map(([sym]) => s.codes![sym]!.length));
  const codeW = longest * size * MONO + 16;
  const w = symW + codeW;
  ['symbol', 'code'].forEach((h, i) => {
    shapes.push({
      kind: 'text',
      id: `th-${i}`,
      x: x0 + (i === 0 ? symW / 2 : symW + codeW / 2),
      y: y0 + 14,
      text: h,
      size: 13,
      anchor: 'middle',
      cls: 'label',
    });
  });
  s.freq.forEach(([sym], i) => {
    const top = y0 + rowH + i * rowH;
    const id = colId(sym);
    const role = roles.get(id);
    shapes.push({ kind: 'rect', id, x: x0, y: top, w, h: rowH, r: 3, cls: 'live', role });
    const cc = sym.charCodeAt(0);
    shapes.push({
      kind: 'text',
      id: `tsym-${cc}`,
      x: x0 + symW / 2,
      y: top + rowH / 2 + 5,
      text: show(sym),
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
    });
    shapes.push({
      kind: 'text',
      id: `tcode-${cc}`,
      x: x0 + symW + 8,
      y: top + rowH / 2 + 5,
      text: s.codes![sym]!,
      size,
      weight: 'bold',
      mono: true,
      role: role === 'active' ? 'active' : undefined,
    });
  });
  return { shapes, bounds: { x: x0, y: y0, w, h: rowH * (s.freq.length + 1) } };
}

export function view(step: Step<HuffState, HuffExtra>, _settings?: HuffSettings): Scene {
  const s = step.state;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const boxes: Bounds[] = [];

  if (s.freq.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: 5,
      text: 'no symbols yet',
      size: 15,
      anchor: 'middle',
      cls: 'label',
    });
    boxes.push({ x: -70, y: -14, w: 140, h: 28 });
  } else {
    const forest = drawForest(s, roles, new Set(extra.path ?? []));
    shapes.push(...forest.shapes);
    boxes.push(...forest.bounds);
  }

  if (s.codes) {
    const tree = unionBounds(...boxes);
    const table = drawTable(s, tree.x + tree.w + 24, -R - 4, roles);
    shapes.push(...table.shapes);
    boxes.push(table.bounds);
  }
  // Encode and decode write under the tree and the table.
  const trees = unionBounds(...boxes);
  const width = Math.max(trees.w, 300);
  let y = trees.y + trees.h + 18;

  // Encode: the text, one symbol at a time, with the codes written so far under it.
  if (extra.encode && s.codes) {
    const { text, at, done } = extra.encode;
    let x = trees.x;
    let top = y;
    const rowH = 35;
    shapes.push({
      kind: 'text',
      id: 'enc-label',
      x,
      y: top + 14,
      text: 'encoded',
      size: 13,
      cls: 'label',
    });
    x += 62;
    let right = x;
    [...text].forEach((sym, i) => {
      const code = s.codes![sym]!;
      const w = Math.max(14, code.length * 13 * MONO) + 8;
      if (x + w > trees.x + width && x > trees.x + 62) {
        x = trees.x + 62;
        top += rowH;
      }
      shapes.push({
        kind: 'text',
        id: `encs-${i}`,
        x: x + w / 2,
        y: top + 14,
        text: show(sym),
        size: 14,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: i === at ? 'active' : undefined,
      });
      if (i < done) {
        shapes.push({
          kind: 'text',
          id: `enc-${i}`,
          x: x + w / 2,
          y: top + 29,
          text: code,
          size: 13,
          anchor: 'middle',
          mono: true,
          role: roles.get(`enc-${i}`),
        });
      }
      x += w;
      right = Math.max(right, x);
    });
    boxes.push({ x: trees.x, y, w: right - trees.x, h: top + rowH - y });
    y = top + rowH + 8;
  }

  // Decode: the bits, the bit being read, and the message so far.
  if (extra.decode) {
    const { bits, at, out } = extra.decode;
    const cell = 15;
    let x = trees.x + 62;
    let top = y;
    shapes.push({
      kind: 'text',
      id: 'dec-label',
      x: trees.x,
      y: top + 15,
      text: 'bits',
      size: 13,
      cls: 'label',
    });
    let right = x;
    [...bits].forEach((b, i) => {
      if (x + cell > trees.x + width && x > trees.x + 62) {
        x = trees.x + 62;
        top += cell + 8;
      }
      const role = roles.get(`bit-${i}`) ?? (i < at ? 'visit' : undefined);
      shapes.push({
        kind: 'rect',
        id: `bit-${i}`,
        x,
        y: top,
        w: cell,
        h: 22,
        r: 3,
        cls: 'live',
        role,
      });
      shapes.push({
        kind: 'text',
        id: `bitt-${i}`,
        x: x + cell / 2,
        y: top + 16,
        text: b,
        size: 14,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: role === 'active' || role === 'error' ? role : undefined,
      });
      x += cell;
      right = Math.max(right, x);
    });
    top += 22 + 22;
    shapes.push({
      kind: 'text',
      id: 'dec-out-label',
      x: trees.x,
      y: top,
      text: 'message',
      size: 13,
      cls: 'label',
    });
    shapes.push({
      kind: 'text',
      id: 'dec-out',
      x: trees.x + 62,
      y: top,
      text: out ? [...out].map(show).join('') : '…',
      size: 15,
      weight: 'bold',
      mono: true,
      role: 'found',
    });
    boxes.push({
      x: trees.x,
      y,
      w: Math.max(right - trees.x, 62 + out.length * 15 * MONO),
      h: top + 6 - y,
    });
    y = top + 14;
  }

  if (extra.totals) {
    const t = extra.totals;
    const text = `Huffman: ${t.huffman} bits.  Fixed-length: ${t.width} × ${t.n} = ${t.fixed} bits.`;
    shapes.push({
      kind: 'text',
      id: 'totals',
      x: trees.x,
      y: y + 12,
      text,
      size: 14,
      weight: 'bold',
      role: 'found',
    });
    boxes.push({ x: trees.x, y, w: text.length * 14 * 0.55, h: 18 });
  }

  if (extra.bad !== undefined) {
    const text = extra.bad.length > 24 ? `${extra.bad.slice(0, 23)}…` : extra.bad || '(empty)';
    const top = trees.y - 44;
    const w = Math.max(60, text.length * 14 * MONO + 16);
    shapes.push({
      kind: 'rect',
      id: 'bad',
      x: trees.x,
      y: top,
      w,
      h: 26,
      r: 5,
      cls: 'ghost',
      role: roles.get('bad') ?? 'error',
    });
    shapes.push({
      kind: 'text',
      id: 'bad-text',
      x: trees.x + w / 2,
      y: top + 18,
      text,
      size: 14,
      anchor: 'middle',
      mono: true,
      role: 'error',
    });
    boxes.push({ x: trees.x, y: top, w, h: 26 });
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label: describe(s) };
}
