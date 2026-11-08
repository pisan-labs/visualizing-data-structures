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
  riseUnderTitle,
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
const COMPACT: CallTreeOptions = {
  size: 11,
  gap: 3,
  levelGap: 34,
  twoLines: false,
  minW: 18,
  tagMin: 11,
};
/** Growing right (a phone), a big tree is as tall as its rows: lower boxes packed closer. */
const COMPACT_RIGHT: CallTreeOptions = { ...COMPACT, gap: 2, boxH: 1.5 };
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
    const layout = layoutCallTree(finished, {
      ...(compact && direction === 'right' ? COMPACT_RIGHT : opts),
      direction,
    });
    const treeW = Math.max(layout.bounds.w, 120);
    const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
    const titleText = { x: 0, y: 0, w: monoWidth('tree: every call', 13), h: TITLE_H };
    let dy = TITLE_H + 8 - layout.bounds.y;
    // Growing right, the tree rises into the empty corner beside its title.
    if (direction === 'right') dy -= riseUnderTitle(layout, dx, dy, titleText);
    const titleBox = { x: 0, y: 0, w: treeW, h: TITLE_H };
    const box = s.tree.length
      ? unionBounds(titleBox, {
          ...layout.bounds,
          x: layout.bounds.x + dx,
          y: layout.bounds.y + dy,
        })
      : titleBox;
    // What the DAG must keep clear of: the title, every box and badge, and the edges.
    const rects: Bounds[] = [titleText, ...callTreeObstacles(layout, dx, dy)];
    return { layout, dx, dy, box, rects };
  };

  // The DAG: one box per subproblem, drawn from x = 0, its first row at y = row0. A big tree
  // has compact boxes; the DAG labels its boxes the same way, a little larger, since its values
  // are the smallest text on the page.
  const dagSize = compact ? 12 : size;
  const dagLabel = (d: DagNode) => (compact ? tinyLabel(p, d.args) : shortLabel(p, d.args));
  const sizes = s.dag.map((d) =>
    callBoxSize({ label: dagLabel(d), value: `= ${d.returns}` }, dagSize, opts.twoLines),
  );
  const boxW = Math.max(34, ...sizes.map((b) => b.w));
  const boxH = sizes[0]?.h ?? 30;
  const unit = p === 'fib' ? boxW * 0.75 : (boxW + 10) / 2;
  const cols = s.dag.map((d) => d.col);
  const minCol = Math.min(0, ...cols);
  const maxCol = Math.max(0, ...cols);
  const dagTitle = 'DAG: subproblems';
  const badge = tagSize('×99', dagSize, opts.tagMin);
  const byKey = new Map(s.dag.map((d) => [d.key, d]));
  const openKeys = new Set(s.stack.map((id) => s.tree[id - 1]!.key));
  const topKey = top === undefined ? undefined : s.tree[top - 1]!.key;
  const done = new Set(s.tree.filter((t) => s.result[t.id] !== undefined).map((t) => t.key));
  const pitch = opts.levelGap!;
  const rowsN = s.dag.length ? Math.max(...s.dag.map((d) => d.row)) : 0;

  /**
   * Drawn down (the usual: a row per depth), or, for fib under a tree that grows right (a
   * phone), turned to run right: a column per n, zigzagging between two rows, so it is short
   * enough to go under the tree. Turned, a badge sits on the outer side of its row, clear of the
   * arrows between the rows.
   */
  const dag = (row0: number, turned: boolean) => {
    const shapes: Shape[] = [];
    const rects: Bounds[] = [{ x: 0, y: 0, w: monoWidth(dagTitle, 13), h: TITLE_H }];
    const tPitch = boxH + 18;
    const at = (d: DagNode) =>
      turned
        ? { x: boxW / 2 + d.row * unit, y: row0 + (d.col - minCol) * tPitch, w: boxW, h: boxH }
        : { x: boxW / 2 + (d.col - minCol) * unit, y: row0 + d.row * pitch, w: boxW, h: boxH };
    // Where an arrow from a to b starts and ends. Down: the caller's bottom to the callee's top.
    // Turned: along a row from side to side, or between the rows from bottom to top.
    const ends = (a: Bounds, b: Bounds) => {
      if (!turned) return { x1: a.x, y1: a.y + boxH / 2, x2: b.x, y2: b.y - boxH / 2 - 2 };
      if (Math.abs(a.y - b.y) < 1)
        return { x1: a.x + boxW / 2, y1: a.y, x2: b.x - boxW / 2 - 2, y2: b.y };
      const s = Math.sign(b.y - a.y);
      return {
        x1: a.x + boxW * 0.2,
        y1: a.y + (s * boxH) / 2,
        x2: b.x - boxW * 0.2,
        y2: b.y - s * (boxH / 2 + 2),
      };
    };
    const badgeAt = (box: Bounds, w: number) => {
      const below = turned && box.y > row0 + 1;
      return {
        x: box.x + boxW / 2 - w / 2,
        y: below ? box.y + boxH / 2 - 2 : box.y - boxH / 2 - badge.h + 2,
      };
    };
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
      const id = `dagedge-${edgeKey(from, to)}`;
      shapes.push({
        kind: 'arrow',
        id,
        ...ends(at(byKey.get(from)!), at(byKey.get(to)!)),
        role: roles.get(id),
      });
    }
    for (const d of s.dag) {
      const box = at(d);
      // Room for every box and its badge, drawn or not yet, so the choice holds for the run.
      const room = badgeAt(box, badge.w);
      rects.push(
        { x: box.x - boxW / 2, y: box.y - boxH / 2, w: boxW, h: boxH },
        { x: room.x, y: room.y, w: badge.w, h: badge.h },
      );
      for (const c of d.children) {
        const e = ends(box, at(byKey.get(c)!));
        rects.push(...along(e.x1, e.y1, e.x2, e.y2));
      }
      const seen = s.seen[d.key] ?? 0;
      if (seen === 0) continue;
      const state: CallState = d.key === topKey ? 'current' : openKeys.has(d.key) ? 'open' : 'done';
      const id = `dag-${d.key}`;
      const tag = seen > 1 ? `×${seen}` : undefined;
      shapes.push(
        ...callNodeShapes(
          box,
          {
            id,
            parent: null,
            label: dagLabel(d),
            value: done.has(d.key) ? `= ${d.returns}` : undefined,
            tag: turned ? undefined : tag,
            tagRole: 'compare',
            state,
          },
          roles,
          { size: dagSize, twoLines: opts.twoLines, shapeId: id, tagMin: opts.tagMin },
        ),
      );
      if (turned && tag) {
        const t = tagSize(tag, dagSize, opts.tagMin);
        const q = badgeAt(box, t.w);
        shapes.push(
          {
            kind: 'rect',
            id: `${id}-tag`,
            x: q.x,
            y: q.y,
            w: t.w,
            h: t.h,
            r: t.h / 2,
            cls: 'live tag',
            role: roles.get(`${id}-tag`) ?? 'compare',
            z: 3,
          },
          {
            kind: 'text',
            id: `${id}-tagtext`,
            x: q.x + t.w / 2,
            y: q.y + t.h / 2 + t.s * 0.36,
            text: tag,
            size: t.s,
            anchor: 'middle',
            weight: 'bold',
            mono: true,
            z: 4,
          },
        );
      }
    }
    const box: Bounds = s.dag.length
      ? unionBounds(...rects, {
          x: 0,
          y: row0 - boxH / 2 - 8,
          w: (turned ? rowsN * unit : (maxCol - minCol) * unit) + boxW + 14,
          h: (turned ? (maxCol - minCol) * tPitch : rowsN * pitch) + boxH + 8,
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
    const turned = direction === 'right' && p === 'fib' && s.dag.length > 2;
    // Growing down, the DAG's rows are level with the tree's levels.
    const d = dag(direction === 'down' ? t.dy : TITLE_H + 8 + badge.h + boxH / 2, false);
    const make = (dx: number, dy: number, dd = d): Arrangement => ({
      t,
      d: dd,
      dx,
      dy,
      bounds: padBounds(unionBounds(t.box, { ...dd.box, x: dd.box.x + dx, y: dd.box.y + dy }), 12),
    });
    const besideX = t.box.x + t.box.w + GAP;
    const underY = t.box.y + t.box.h + 24;
    const out = [make(besideX, 0), make(0, underY)];
    if (!s.dag.length || !s.tree.length) return out;
    // Slid in beside the tree, or under it, as far as the tree leaves room.
    const left = room(shifted(d.rects, besideX, 0), t.rects, 'x', CLEAR);
    if (left > 0 && left < besideX) out.push(make(besideX - left, 0));
    const under = turned ? [d, dag(TITLE_H + 8 + badge.h + boxH / 2, true)] : [d];
    for (const dd of under) {
      const spare = Math.max(0, t.box.w - dd.box.w);
      for (const x of dd === d ? [0, spare] : [0, spare / 4, spare / 2, (3 * spare) / 4, spare]) {
        const up = room(shifted(dd.rects, x, underY), t.rects, 'y', dd === d ? CLEAR : CLEAR / 2);
        if (up > 0 && up < underY) out.push(make(x, underY - up, dd));
        else if (dd !== d) out.push(make(x, underY, dd));
      }
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
