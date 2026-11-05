import type { MarkRole, Step } from '../../engine/types';
import {
  bracket,
  cellRow,
  chip,
  columns,
  monoWidth,
  pitchFor,
  spanBox,
  FONT,
} from '../../layouts/columns';
import type { Scene, Shape } from '../../render/scene';
import {
  describe,
  nodesOf,
  tagText,
  type SegExtra,
  type SegNode,
  type SegSettings,
  type SegState,
} from './model';

const PAD = 10;
const TOP = 10;
/** A node's box, and the gap under it for the edges down to its children and its tag. */
const BOX_H = 44;
const GAP = 26;
const ROW_H = 40;

/**
 * The tree drawn over the array: one row per depth, every node a box over exactly the columns
 * of A it covers, labeled with its range (a leaf's range is its index, under it in A). Short
 * edges join each node to its children. A pending tag sits in the gap under its node, on the
 * way down to the children it is meant for; a node under a tag shows its value in gray italics,
 * because that value is out of date. A, with the current values, is under the tree, and the
 * range an operation is about is a bracket under A.
 *
 * Every step of an operation keeps room for that bracket, so the camera holds still. A plain
 * picture (no step data: the starting step, practice questions) leaves it out. The drawing is
 * taller than it is wide, so on a laptop it never reaches the stage's top right corner and
 * needs no room for the zoom buttons.
 */
export function view(step: Step<SegState, SegExtra>, settings: SegSettings): Scene {
  const s = step.state;
  const plain = step.extra === undefined;
  const extra = step.extra ?? {};
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const n = s.a.length;
  const nodes = nodesOf(n);
  const deepest = Math.max(...nodes.map((nd) => nd.depth));
  const pitch = pitchFor(n);
  const nameX = PAD + monoWidth('A', FONT.name);
  const cols = columns(n, { pitch, x0: nameX + 10 });
  const width = cols.x(n) + PAD;
  const rowY = (d: number) => TOP + d * (BOX_H + GAP);
  const center = (nd: SegNode) => (cols.x(nd.lo) + cols.x(nd.hi + 1)) / 2;
  const tagY = (nd: SegNode) => rowY(nd.depth) + BOX_H + GAP / 2;
  const byNumber = new Map(nodes.map((nd) => [nd.v, nd]));

  // What the tags above each node still owe it. Preorder visits parents first.
  const owed = new Map<number, number>();
  for (const nd of nodes) {
    const p = Math.floor(nd.v / 2);
    owed.set(nd.v, nd.v === 1 ? 0 : owed.get(p)! + (s.lazy[p] ?? 0));
  }

  const shapes: Shape[] = [];
  for (const nd of nodes) {
    const { v, lo, hi } = nd;
    const value = s.val[v];
    const top = rowY(nd.depth);
    shapes.push(
      ...spanBox(cols, {
        id: `node-${v}`,
        lo,
        hi,
        top,
        h: BOX_H,
        label: lo < hi ? `${lo}–${hi}` : undefined,
        labelSize: 17,
        value: value === null || value === undefined ? null : String(value),
        valueSize: 22,
        role: roles.get(`node-${v}`),
        valueRole: owed.get(v) ? 'stale' : undefined,
        cls: value === null || value === undefined ? 'cell' : 'live',
      }),
    );
    if (v > 1) {
      const parent = byNumber.get(Math.floor(v / 2))!;
      const x = center(nd);
      shapes.push({
        kind: 'arrow',
        id: `edge-${v}`,
        x1: x,
        y1: rowY(parent.depth) + BOX_H,
        x2: x,
        y2: top,
        head: 'none',
        role: roles.get(`edge-${v}`),
      });
    }
    const tag = s.lazy[v] ?? 0;
    if (tag !== 0) {
      const from = extra.pushed?.[v];
      const parent = from === undefined ? undefined : byNumber.get(from);
      shapes.push(
        ...chip({
          id: `tag-${v}`,
          x: center(nd),
          y: tagY(nd),
          text: tagText(tag),
          size: 16,
          role: 'compare',
          enterFrom: parent && { x: center(parent), y: tagY(parent) },
        }),
      );
    }
  }

  const a = cellRow(cols, {
    id: 'a',
    from: 0,
    to: n - 1,
    top: rowY(deepest) + BOX_H + 16,
    h: ROW_H,
    text: (i) => String(s.a[i]),
    roles,
    name: 'A',
    nameX,
  });
  shapes.push(...a.shapes);
  let bottom = a.bottom + 4;
  if (!plain) {
    const r = extra.range;
    if (r) {
      shapes.push(
        ...bracket(cols, {
          id: 'range',
          lo: r.lo,
          hi: r.hi,
          y: a.bottom + 4,
          ticks: 'up',
          label: r.label,
          role: r.role ?? 'visit',
          clamp: { min: 4, max: width - 4 },
        }),
      );
    }
    bottom = a.bottom + 38;
  }
  return {
    shapes,
    bounds: { x: 0, y: 0, w: width, h: bottom },
    label: describe(s, settings),
  };
}
