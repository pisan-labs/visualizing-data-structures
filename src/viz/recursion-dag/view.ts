import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  callBoxSize,
  callNodeShapes,
  callTreeObstacles,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  padBounds,
  tagSize,
  unionBounds,
  type CallState,
  type CallTreeOptions,
  type TreeCall,
  type TreeDirection,
} from '../../layouts/calls';
import { along, room, shifted } from '../../layouts/room';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ordinal } from '../_recursion/kit';
import {
  describe,
  edgeKey,
  isBase,
  type Args,
  type DagNode,
  type DagSettings,
  type DagState,
  type Problem,
  type TreeNode,
} from './model';

/** Up to 15 calls get full boxes with values; bigger trees get compact boxes. */
export const FULL_LIMIT = 15;
const FULL: CallTreeOptions = { size: 12.5, gap: 6, levelGap: 46, twoLines: true };
const COMPACT: CallTreeOptions = { size: 11, gap: 3, levelGap: 34, twoLines: false, minW: 18 };
const GAP = 40;
/** The least room kept between the DAG and the tree when the DAG slides in beside or under it. */
const CLEAR = 18;
const TITLE_H = 26;

const shortLabel = (p: Problem, a: Args) => (p === 'fib' ? `f(${a[0]})` : `C(${a[0]},${a[1]})`);
const tinyLabel = (p: Problem, a: Args) => (p === 'fib' ? `${a[0]}` : `${a[0]},${a[1]}`);

/**
 * The tree and the DAG of subproblems. The tree grows down (the usual) or right (a tall phone
 * stage); the DAG sits beside it or under it, slid into the room the tree leaves. Growing down
 * with the DAG beside, the DAG's rows are level with the tree's levels. Everything is laid out
 * finished, so the choice holds for a whole run.
 */
export function view(
  step: Step<DagState, undefined>,
  settings: DagSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const p = s.run?.problem ?? settings.problem;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const compact = s.tree.length > FULL_LIMIT;
  const opts = compact ? COMPACT : FULL;
  const size = opts.size!;
  const top = s.stack[s.stack.length - 1];
  const onStack = new Set(s.stack);

  // The tree: every call of the plain recursion, laid out finished.
  const tag = (t: TreeNode) =>
    !isBase(p, t.args) && t.occurrence > 1 ? ordinal(t.occurrence) : undefined;
  const treeLabel = (t: TreeNode) => (compact ? tinyLabel(p, t.args) : shortLabel(p, t.args));
  const finished: TreeCall[] = s.tree.map((t) => ({
    id: String(t.id),
    parent: t.parent === null ? null : String(t.parent),
    label: treeLabel(t),
    value: compact ? undefined : `= ${t.returns}`,
    tag: tag(t),
    state: 'done',
  }));
  const stateOf = (t: TreeNode): CallState =>
    t.id === top ? 'current' : onStack.has(t.id) ? 'open' : 'done';
  const now: TreeCall[] = s.tree
    .filter((t) => s.status[t.id] !== undefined)
    .map((t) => ({
      id: String(t.id),
      parent: t.parent === null ? null : String(t.parent),
      label: treeLabel(t),
      value: compact || s.result[t.id] === undefined ? undefined : `= ${s.result[t.id]}`,
      tag: tag(t),
      state: stateOf(t),
    }));

  const tree = (direction: TreeDirection) => {
    const layout = layoutCallTree(finished, { ...opts, direction });
    const treeW = Math.max(layout.bounds.w, 120);
    const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
    const dy = TITLE_H + 8 - layout.bounds.y;
    const titleBox = { x: 0, y: 0, w: treeW, h: TITLE_H };
    const box = s.tree.length
      ? unionBounds(titleBox, {
          ...layout.bounds,
          x: layout.bounds.x + dx,
          y: layout.bounds.y + dy,
        })
      : titleBox;
    // What the DAG must keep clear of: the title, every box and badge, and the edges.
    const rects: Bounds[] = [
      { ...titleBox, w: monoWidth('tree: every call', 13) },
      ...callTreeObstacles(layout, dx, dy),
    ];
    return { layout, dx, dy, box, rects };
  };

  // The DAG: one box per subproblem, drawn from x = 0, its first row at y = row0.
  // A big tree has compact boxes; the DAG labels its boxes the same way.
  const dagLabel = (d: DagNode) => (compact ? tinyLabel(p, d.args) : shortLabel(p, d.args));
  const sizes = s.dag.map((d) =>
    callBoxSize({ label: dagLabel(d), value: `= ${d.returns}` }, size, opts.twoLines),
  );
  const boxW = Math.max(34, ...sizes.map((b) => b.w));
  const boxH = sizes[0]?.h ?? 30;
  const unit = p === 'fib' ? boxW * 0.75 : (boxW + 10) / 2;
  const cols = s.dag.map((d) => d.col);
  const minCol = Math.min(0, ...cols);
  const maxCol = Math.max(0, ...cols);
  const x0 = boxW / 2 - minCol * unit;
  const dagW = (maxCol - minCol) * unit + boxW;
  const dagTitle = 'DAG: subproblems';
  const badge = tagSize('×9', size);
  const byKey = new Map(s.dag.map((d) => [d.key, d]));
  const openKeys = new Set(s.stack.map((id) => s.tree[id - 1]!.key));
  const topKey = top === undefined ? undefined : s.tree[top - 1]!.key;
  const done = new Set(s.tree.filter((t) => s.result[t.id] !== undefined).map((t) => t.key));
  const pitch = opts.levelGap!;

  const dag = (row0: number) => {
    const shapes: Shape[] = [];
    const rects: Bounds[] = [{ x: 0, y: 0, w: monoWidth(dagTitle, 13), h: TITLE_H }];
    const at = (d: DagNode) => ({
      x: x0 + d.col * unit,
      y: row0 + d.row * pitch,
      w: boxW,
      h: boxH,
    });
    shapes.push({
      kind: 'text',
      id: 'dag-title',
      x: 0,
      y: 16,
      text: dagTitle,
      size: 13,
      cls: 'label',
      mono: true,
    });
    // Arrows first, so boxes sit on top of them.
    for (const e of s.edges) {
      const [from, to] = e.split('>') as [string, string];
      const a = at(byKey.get(from)!);
      const b = at(byKey.get(to)!);
      const id = `dagedge-${edgeKey(from, to)}`;
      // Leave the bottom of the caller and reach the top of the callee.
      shapes.push({
        kind: 'arrow',
        id,
        x1: a.x,
        y1: a.y + boxH / 2,
        x2: b.x,
        y2: b.y - boxH / 2 - 2,
        role: roles.get(id),
      });
    }
    for (const d of s.dag) {
      const box = at(d);
      // Room for every box and its badge, drawn or not yet, so the choice holds for the run.
      rects.push({
        x: box.x - boxW / 2,
        y: box.y - boxH / 2 - badge.h,
        w: boxW + badge.w / 2,
        h: boxH + badge.h,
      });
      for (const c of d.children) {
        const b = at(byKey.get(c)!);
        rects.push(...along(box.x, box.y + boxH / 2, b.x, b.y - boxH / 2));
      }
      const seen = s.seen[d.key] ?? 0;
      if (seen === 0) continue;
      const state: CallState = d.key === topKey ? 'current' : openKeys.has(d.key) ? 'open' : 'done';
      shapes.push(
        ...callNodeShapes(
          box,
          {
            id: `dag-${d.key}`,
            parent: null,
            label: dagLabel(d),
            value: done.has(d.key) ? `= ${d.returns}` : undefined,
            tag: seen > 1 ? `×${seen}` : undefined,
            tagRole: 'compare',
            state,
          },
          roles,
          { size, twoLines: opts.twoLines, shapeId: `dag-${d.key}` },
        ),
      );
    }
    const rows = s.dag.length ? Math.max(...s.dag.map((d) => d.row)) : 0;
    const box: Bounds = s.dag.length
      ? unionBounds(rects[0]!, {
          x: 0,
          y: row0 - boxH / 2 - 8,
          w: dagW + 14,
          h: rows * pitch + boxH + 8,
        })
      : { x: 0, y: 0, w: 200, h: TITLE_H };
    return { shapes, rects, box };
  };

  interface Arrangement {
    t: ReturnType<typeof tree>;
    d: ReturnType<typeof dag>;
    dx: number;
    dy: number;
    bounds: Bounds;
  }
  const arrangements = (direction: TreeDirection): Arrangement[] => {
    const t = tree(direction);
    // Growing down, the DAG's rows are level with the tree's levels.
    const d = dag(direction === 'down' ? t.dy : TITLE_H + 8 + badge.h + boxH / 2);
    const make = (dx: number, dy: number): Arrangement => ({
      t,
      d,
      dx,
      dy,
      bounds: padBounds(unionBounds(t.box, { ...d.box, x: d.box.x + dx, y: d.box.y + dy }), 12),
    });
    const besideX = t.box.x + t.box.w + GAP;
    const underY = t.box.y + t.box.h + 24;
    const out = [make(besideX, 0), make(0, underY)];
    if (!s.dag.length || !s.tree.length) return out;
    // Slid in beside the tree, or under it, as far as the tree leaves room.
    const left = room(shifted(d.rects, besideX, 0), t.rects, 'x', CLEAR);
    if (left > 0) out.push(make(besideX - left, 0));
    for (const x of [0, t.box.w - d.box.w]) {
      const up = room(shifted(d.rects, x, underY), t.rects, 'y', CLEAR);
      if (up > 0) out.push(make(x, underY - up));
    }
    return out;
  };
  // With no stage, the tree grows down with the DAG beside it, as it always has.
  const all = arrangements('down');
  const place = stage ? pickLayout(stage, [...all, ...arrangements('right')]) : all[0]!;

  const shapes: Shape[] = [];
  shapes.push({
    kind: 'text',
    id: 'tree-title',
    x: 0,
    y: 16,
    text: 'tree: every call',
    size: 13,
    cls: 'label',
    mono: true,
  });
  shapes.push(...drawCallTree(place.t.layout, now, { dx: place.t.dx, dy: place.t.dy, roles }));
  if (!s.dag.length) {
    shapes.push({
      kind: 'text',
      id: 'empty',
      x: 0,
      y: TITLE_H + 20,
      text: '(no calls yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  }
  shapes.push(...translate(place.d.shapes, place.dx, place.dy));
  return { shapes, bounds: place.bounds, label: describe(s) };
}
