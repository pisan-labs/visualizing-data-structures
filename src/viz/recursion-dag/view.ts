import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  callBoxSize,
  callNodeShapes,
  callTreeBounds,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  padBounds,
  unionBounds,
  type CallState,
  type CallTreeOptions,
  type TreeCall,
} from '../../layouts/calls';
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
const COMPACT: CallTreeOptions = { size: 11, gap: 4, levelGap: 34, twoLines: false, minW: 20 };
const GAP = 40;
const TITLE_H = 26;

const shortLabel = (p: Problem, a: Args) => (p === 'fib' ? `f(${a[0]})` : `C(${a[0]},${a[1]})`);
const tinyLabel = (p: Problem, a: Args) => (p === 'fib' ? `${a[0]}` : `${a[0]},${a[1]}`);

/**
 * The DAG sits beside the tree, its rows level with the tree's levels. On a narrow stage it
 * goes under the tree instead, when that draws larger. Both are laid out finished, so the
 * choice holds for a whole run.
 */
export function view(
  step: Step<DagState, undefined>,
  settings: DagSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const p = s.run?.problem ?? settings.problem;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const compact = s.tree.length > FULL_LIMIT;
  const opts = compact ? COMPACT : FULL;
  const size = opts.size!;
  const top = s.stack[s.stack.length - 1];
  const onStack = new Set(s.stack);

  // The tree: every call of the plain recursion, laid out finished.
  const tag = (t: TreeNode) =>
    !isBase(p, t.args) && t.occurrence > 1 ? ordinal(t.occurrence) : undefined;
  const treeLabel = (t: TreeNode) => (compact ? tinyLabel(p, t.args) : shortLabel(p, t.args));
  const layout = layoutCallTree(
    s.tree.map((t) => ({
      id: String(t.id),
      parent: t.parent === null ? null : String(t.parent),
      label: treeLabel(t),
      value: compact ? undefined : `= ${t.returns}`,
      tag: tag(t),
      state: 'done',
    })),
    opts,
  );
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
  const treeW = Math.max(layout.bounds.w, 120);
  const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
  const dy = TITLE_H + 8 - layout.bounds.y;
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
  shapes.push(...drawCallTree(layout, now, { dx, dy, roles }));
  const boxes: Bounds[] = [{ x: 0, y: 0, w: treeW, h: TITLE_H }];
  if (s.tree.length) boxes.push(callTreeBounds(layout, dx, dy));

  // The DAG: one box per subproblem, its rows lined up with the levels of the tree.
  const dag: Shape[] = [];
  const dagBoxes: Bounds[] = [];
  const dagLabel = (d: DagNode) => shortLabel(p, d.args);
  const sizes = s.dag.map((d) =>
    callBoxSize({ label: dagLabel(d), value: `= ${d.returns}` }, size, opts.twoLines),
  );
  const boxW = Math.max(34, ...sizes.map((b) => b.w));
  const boxH = sizes[0]?.h ?? 30;
  const unit = p === 'fib' ? boxW * 0.75 : (boxW + 10) / 2;
  const cols = s.dag.map((d) => d.col);
  const minCol = Math.min(0, ...cols);
  const maxCol = Math.max(0, ...cols);
  const dagLeft = treeW + GAP;
  const x0 = dagLeft + boxW / 2 - minCol * unit;
  const at = (d: DagNode) => ({
    x: x0 + d.col * unit,
    y: dy + d.row * layout.levelGap,
    w: boxW,
    h: boxH,
  });
  const dagW = (maxCol - minCol) * unit + boxW;
  const dagTitle = 'DAG: subproblems';
  dag.push({
    kind: 'text',
    id: 'dag-title',
    x: dagLeft,
    y: 16,
    text: dagTitle,
    size: 13,
    cls: 'label',
    mono: true,
  });
  dagBoxes.push({ x: dagLeft, y: 0, w: monoWidth(dagTitle, 13), h: TITLE_H });
  const byKey = new Map(s.dag.map((d) => [d.key, d]));
  const openKeys = new Set(s.stack.map((id) => s.tree[id - 1]!.key));
  const topKey = top === undefined ? undefined : s.tree[top - 1]!.key;
  const done = new Set(s.tree.filter((t) => s.result[t.id] !== undefined).map((t) => t.key));
  // Arrows first, so boxes sit on top of them.
  for (const e of s.edges) {
    const [from, to] = e.split('>') as [string, string];
    const a = at(byKey.get(from)!);
    const b = at(byKey.get(to)!);
    const id = `dagedge-${edgeKey(from, to)}`;
    // Leave the bottom of the caller and reach the top of the callee.
    dag.push({
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
    const seen = s.seen[d.key] ?? 0;
    if (seen === 0) continue;
    const state: CallState = d.key === topKey ? 'current' : openKeys.has(d.key) ? 'open' : 'done';
    dag.push(
      ...callNodeShapes(
        at(d),
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
  if (s.dag.length) {
    const rows = Math.max(...s.dag.map((d) => d.row));
    dagBoxes.push({
      x: dagLeft,
      y: dy - boxH / 2 - 8,
      w: dagW + 14,
      h: rows * layout.levelGap + boxH + 8,
    });
  } else {
    dagBoxes.push({ x: dagLeft, y: 0, w: 200, h: TITLE_H });
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
  const tree = unionBounds(...boxes);
  const dagBox = unionBounds(...dagBoxes);
  const besideIt = { dx: 0, dy: 0, bounds: padBounds(unionBounds(tree, dagBox), 12) };
  const underDx = -dagLeft;
  const underDy = tree.y + tree.h + 24;
  const underIt = {
    dx: underDx,
    dy: underDy,
    bounds: padBounds(
      unionBounds(tree, { ...dagBox, x: dagBox.x + underDx, y: dagBox.y + underDy }),
      12,
    ),
  };
  const place = pickLayout(stage, [besideIt, underIt]);
  shapes.push(...translate(dag, place.dx, place.dy));
  return { shapes, bounds: place.bounds, label: describe(s) };
}
