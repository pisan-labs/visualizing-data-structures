import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  callTreeObstacles,
  drawCallTree,
  layoutCallTree,
  padBounds,
  unionBounds,
  type CallState,
  type CallTreeLayout,
  type CallTreeOptions,
  type TreeCall,
  type TreeDirection,
} from '../../layouts/calls';
import { room } from '../../layouts/room';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ordinal } from '../_recursion/kit';
import { describe, isRepeat, type FibCall, type FibSettings, type FibState } from './model';

/** Up to 15 calls get full boxes with values; bigger trees get compact boxes holding just n. */
export const FULL_LIMIT = 15;
const FULL: CallTreeOptions = { size: 12.5, gap: 6, levelGap: 46, twoLines: true };
const COMPACT: CallTreeOptions = { size: 11, gap: 3, levelGap: 34, twoLines: false, minW: 18 };
const CELL = { w: 28, h: 22 };
const LABEL_W = 50;
/** Column widths of the table turned to run down: n, and the counts and the memo. */
const COL_K = 26;
const COL_W = 38;
const TITLE_H = 26;
/** Room between the tree and the table under it; half of it is kept around a table slid in. */
const TABLE_GAP = 18;

const tagOf = (c: FibCall) =>
  c.kind === 'hit' ? 'memo' : isRepeat(c) ? ordinal(c.occurrence) : undefined;

/**
 * Where the parts go: the tree grows down (the usual) or right (a tall phone stage), and the
 * table of counts sits under the tree, or slides into the room the tree leaves (a Fibonacci
 * tree leans left, so its bottom right corner is often free). Beside a tree that grows right,
 * the table is turned to run down.
 */
interface Arrangement {
  layout: CallTreeLayout;
  dx: number;
  dy: number;
  /** The table's top left corner, and whether it runs down. */
  table: { x: number; y: number; down: boolean };
  bounds: Bounds;
}

export function view(
  step: Step<FibState, undefined>,
  _settings: FibSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const compact = s.calls.length > FULL_LIMIT;
  const label = (c: FibCall) => (compact ? String(c.n) : `f(${c.n})`);
  const top = s.stack[s.stack.length - 1];
  const onStack = new Set(s.stack);

  const finished: TreeCall[] = s.calls.map((c) => ({
    id: String(c.id),
    parent: c.parent === null ? null : String(c.parent),
    label: label(c),
    value: compact || c.kind === 'cut' ? undefined : `= ${c.returns}`,
    tag: tagOf(c),
    state: 'done',
  }));
  const stateOf = (c: FibCall): CallState => {
    const st = s.status[c.id];
    if (st === 'cut') return 'cut';
    if (c.id === top) return 'current';
    return onStack.has(c.id) ? 'open' : 'done';
  };
  const now: TreeCall[] = s.calls
    .filter((c) => s.status[c.id] !== undefined)
    .map((c) => ({
      id: String(c.id),
      parent: c.parent === null ? null : String(c.parent),
      label: label(c),
      value: compact || s.result[c.id] === undefined ? undefined : `= ${s.result[c.id]}`,
      tag: s.status[c.id] === 'cut' ? undefined : tagOf(c),
      tagRole: c.kind === 'hit' ? 'found' : 'compare',
      state: stateOf(c),
    }));

  const n = s.run?.n ?? 0;
  const memoOn = s.run?.memo === 'memo';
  const rows: { id: string; label: string; cell: (k: number) => string }[] = [
    { id: 'k', label: 'n', cell: (k) => String(k) },
    { id: 'cnt', label: 'calls', cell: (k) => String(s.counts[k] ?? 0) },
  ];
  if (memoOn)
    rows.push({
      id: 'memo',
      label: 'memo',
      cell: (k) => (k <= 1 ? '–' : s.memo[k] === undefined ? '' : String(s.memo[k])),
    });
  // The table's size laid across (a row per line, the usual) and turned to run down (a column
  // per line, under a header row: narrow enough to sit beside a tree that grows right).
  const across = { w: LABEL_W + (n + 1) * CELL.w, h: s.run ? rows.length * CELL.h : 0 };
  const colW = rows.map((r) => (r.id === 'k' ? COL_K : COL_W));
  const down = { w: colW.reduce((a, b) => a + b, 0), h: (n + 2) * CELL.h };
  const titleBox: Bounds = { x: 0, y: 0, w: 200, h: TITLE_H };

  const arrangements = (direction: TreeDirection): Arrangement[] => {
    const layout = layoutCallTree(finished, { ...(compact ? COMPACT : FULL), direction });
    const lb = layout.bounds;
    const treeW = Math.max(lb.w, across.w, 200);
    const dx = -lb.x + (treeW - lb.w) / 2;
    const dy = TITLE_H + 6 - lb.y;
    const treeBox: Bounds = s.calls.length
      ? { x: lb.x + dx, y: lb.y + dy, w: lb.w, h: lb.h }
      : { x: 0, y: TITLE_H, w: treeW, h: 30 };
    const make = (table: Arrangement['table']): Arrangement => {
      const parts = [treeBox, titleBox];
      const size = table.down ? down : across;
      if (s.run) parts.push({ x: table.x, y: table.y, ...size });
      return { layout, dx, dy, table, bounds: padBounds(unionBounds(...parts), 12) };
    };
    const under = treeBox.y + treeBox.h + TABLE_GAP;
    const out = [make({ x: (treeW - across.w) / 2, y: under, down: false })];
    if (!s.run || !s.calls.length) return out;
    // Slid into the room the tree leaves: up, right-aligned with the tree or sticking out past
    // it; or, turned to run down, left from beside the tree.
    const obstacles = callTreeObstacles(layout, dx, dy);
    for (const k of [0, 0.25, 0.5]) {
      const x = treeW - across.w * (1 - k);
      const up = room([{ x, y: under, ...across }], obstacles, 'y', TABLE_GAP / 2);
      if (up > 0) out.push(make({ x, y: under - up, down: false }));
    }
    if (direction === 'right') {
      const besideX = treeBox.x + treeBox.w + TABLE_GAP;
      for (const y of [treeBox.y, treeBox.y + treeBox.h - down.h]) {
        const left = room([{ x: besideX, y, ...down }], obstacles, 'x', TABLE_GAP / 2);
        out.push(make({ x: besideX - left, y, down: true }));
      }
    }
    return out;
  };
  // With no stage the tree grows down, as it always has.
  const place = pickLayout(stage, [
    ...arrangements('down'),
    ...(stage ? arrangements('right') : []),
  ]);
  const { layout, dx, dy } = place;

  shapes.push({
    kind: 'text',
    id: 'tree-title',
    x: 0,
    y: 16,
    text: compact ? 'call tree: each box k is a call fib(k)' : 'call tree',
    size: 13,
    cls: 'label',
    mono: true,
  });
  if (s.calls.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'tree-empty',
      x: 0,
      y: TITLE_H + 20,
      text: '(no calls yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  }
  shapes.push(...drawCallTree(layout, now, { dx, dy, roles }));

  // How often each fib(k) has been called, and the memo when it is on.
  if (s.run) {
    const { x: x0, y: y0, down: turned } = place.table;
    // Where line r's label goes, and its cell for k (top left corner and width).
    const colX = colW.map((_, r) => colW.slice(0, r).reduce((a, b) => a + b, 0));
    const cellAt = (r: number, k: number) =>
      turned
        ? { x: x0 + colX[r]!, y: y0 + (k + 1) * CELL.h, w: colW[r]! }
        : { x: x0 + LABEL_W + k * CELL.w, y: y0 + r * CELL.h, w: CELL.w };
    rows.forEach((row, r) => {
      shapes.push({
        kind: 'text',
        id: `${row.id}-label`,
        x: turned ? x0 + colX[r]! + colW[r]! / 2 : x0,
        y: (turned ? y0 : y0 + r * CELL.h) + CELL.h / 2 + 4.5,
        text: row.label,
        size: 12,
        anchor: turned ? 'middle' : undefined,
        cls: 'label',
        mono: true,
      });
      for (let k = 0; k <= n; k++) {
        const id = `${row.id}-${k}`;
        const c = cellAt(r, k);
        // A subproblem computed more than once (k >= 2) gets an orange box.
        const hot = !memoOn && row.id === 'cnt' && k >= 2 && (s.counts[k] ?? 0) > 1;
        if (row.id !== 'k') {
          shapes.push({
            kind: 'rect',
            id: `${id}-box`,
            x: c.x,
            y: c.y,
            w: c.w,
            h: CELL.h,
            r: 0,
            cls: 'live',
            role: roles.get(`${id}-box`) ?? (hot ? 'compare' : undefined),
          });
        }
        const text = row.cell(k);
        if (text === '') continue;
        shapes.push({
          kind: 'text',
          id,
          x: c.x + c.w / 2,
          y: c.y + CELL.h / 2 + 4.5,
          text,
          size: row.id === 'k' ? 11 : 12.5,
          anchor: 'middle',
          weight: row.id === 'k' ? 'normal' : 'bold',
          mono: true,
          cls: row.id === 'k' ? 'index' : undefined,
          role: roles.get(id) ?? (row.id === 'memo' ? 'found' : undefined),
        });
      }
    });
  }

  return { shapes, bounds: place.bounds, label: describe(s) };
}
