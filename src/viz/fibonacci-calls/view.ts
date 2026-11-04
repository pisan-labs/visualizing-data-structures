import type { MarkRole, Step } from '../../engine/types';
import {
  callTreeBounds,
  drawCallTree,
  layoutCallTree,
  padBounds,
  unionBounds,
  type CallState,
  type CallTreeOptions,
  type TreeCall,
} from '../../layouts/calls';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ordinal } from '../_recursion/kit';
import { describe, isRepeat, type FibCall, type FibSettings, type FibState } from './model';

/** Up to 15 calls get full boxes with values; bigger trees get compact boxes holding just n. */
export const FULL_LIMIT = 15;
const FULL: CallTreeOptions = { size: 12.5, gap: 6, levelGap: 46, twoLines: true };
const COMPACT: CallTreeOptions = { size: 11, gap: 4, levelGap: 34, twoLines: false, minW: 20 };
const CELL = { w: 28, h: 22 };
const LABEL_W = 50;

const tagOf = (c: FibCall) =>
  c.kind === 'hit' ? 'memo' : isRepeat(c) ? ordinal(c.occurrence) : undefined;

export function view(step: Step<FibState, undefined>, _settings: FibSettings): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const compact = s.calls.length > FULL_LIMIT;
  const label = (c: FibCall) => (compact ? String(c.n) : `f(${c.n})`);
  const top = s.stack[s.stack.length - 1];
  const onStack = new Set(s.stack);

  const layout = layoutCallTree(
    s.calls.map((c) => ({
      id: String(c.id),
      parent: c.parent === null ? null : String(c.parent),
      label: label(c),
      value: compact || c.kind === 'cut' ? undefined : `= ${c.returns}`,
      tag: tagOf(c),
      state: 'done',
    })),
    compact ? COMPACT : FULL,
  );
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

  const titleH = 26;
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
  const n = s.run?.n ?? 0;
  const tableW = LABEL_W + (n + 1) * CELL.w;
  const treeW = Math.max(layout.bounds.w, tableW, 200);
  const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
  const dy = titleH + 6 - layout.bounds.y;
  if (s.calls.length === 0) {
    shapes.push({
      kind: 'text',
      id: 'tree-empty',
      x: 0,
      y: titleH + 20,
      text: '(no calls yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  }
  shapes.push(...drawCallTree(layout, now, { dx, dy, roles }));
  const treeBox: Bounds =
    s.calls.length > 0 ? callTreeBounds(layout, dx, dy) : { x: 0, y: titleH, w: treeW, h: 30 };

  // How often each fib(k) has been called, and the memo when it is on.
  const boxes: Bounds[] = [treeBox, { x: 0, y: 0, w: treeW, h: titleH }];
  if (s.run) {
    const memoOn = s.run.memo === 'memo';
    const x0 = (treeW - tableW) / 2;
    const y0 = treeBox.y + treeBox.h + 18;
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
    rows.forEach((row, r) => {
      const y = y0 + r * CELL.h;
      shapes.push({
        kind: 'text',
        id: `${row.id}-label`,
        x: x0,
        y: y + CELL.h / 2 + 4.5,
        text: row.label,
        size: 12,
        cls: 'label',
        mono: true,
      });
      for (let k = 0; k <= n; k++) {
        const id = `${row.id}-${k}`;
        // A subproblem computed more than once (k >= 2) gets an orange box.
        const hot = !memoOn && row.id === 'cnt' && k >= 2 && (s.counts[k] ?? 0) > 1;
        if (row.id !== 'k') {
          shapes.push({
            kind: 'rect',
            id: `${id}-box`,
            x: x0 + LABEL_W + k * CELL.w,
            y,
            w: CELL.w,
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
          x: x0 + LABEL_W + k * CELL.w + CELL.w / 2,
          y: y + CELL.h / 2 + 4.5,
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
    boxes.push({ x: x0, y: y0, w: tableW, h: rows.length * CELL.h });
  }

  return { shapes, bounds: padBounds(unionBounds(...boxes), 12), label: describe(s) };
}
