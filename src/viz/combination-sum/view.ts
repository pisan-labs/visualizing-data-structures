/**
 * The drawing. Backtracking: the recursion tree, one box per call, labelled with what is left
 * to make up; an edge says which candidate the call added. A branch the loop does not take is
 * a dashed box with a badge: pruned (the candidate is more than what is left, so the loop
 * stops there) or repeat (the same value as the one before, skipped). Calls that output are
 * marked found. Beside or under it, a panel: the sorted candidates, the list chosen so far, and
 * the combinations found.
 *
 * Every list: no tree (it would have hundreds of boxes), but the panel gets a row of counts, one
 * per candidate, like an odometer, with the list's sum and how many calls it has taken.
 *
 * The tree is laid out once with every box it will have, so it never moves while it grows.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { onStage, translate } from '../../layouts/arrange';
import {
  callShapeId,
  drawCallTree,
  layoutCallTree,
  monoWidth,
  padBounds,
  unionBounds,
  type CallState,
  type CallTreeOptions,
  type TreeCall,
  type TreeDirection,
} from '../../layouts/calls';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { ZOOM_DROP, zoomCorner } from '../../render/stage';
import { approachOf } from '../_patterns/kit';
import { describe, listText, type CNode, type CSExtra, type CSSettings, type CSStep } from './model';

/** Up to 16 boxes get full size; bigger trees get compact boxes. */
const FULL_LIMIT = 16;
const FULL: CallTreeOptions = { size: 14, gap: 10, levelGap: 52, twoLines: true, tagMin: 12 };
const COMPACT: CallTreeOptions = { size: 13, gap: 5, levelGap: 46, twoLines: true, minW: 28, padX: 0.6, tagMin: 12 };
const CELL = { w: 30, h: 28, pitch: 33 };
const LABEL_W = 70;
const FONT = 13;
const TITLE_H = 22;
const VGAP = 20;
const HGAP = 36;
/** Found combinations per row of the panel, the usual and the others a stage may prefer. */
const PER_ROW = [3, 2, 4, 6];

interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

const label = (id: string, x: number, y: number, text: string, size = FONT): Shape => ({
  kind: 'text',
  id,
  x,
  y,
  text,
  size,
  cls: 'label',
  mono: true,
});

/** The candidates, what is chosen, the counts (every list), and the combinations found. */
function panel(e: CSExtra | undefined, values: number[], roles: ReadonlyMap<string, MarkRole>, perRow: number): Block {
  const shapes: Shape[] = [];
  const c = e?.c ?? [...values].sort((a, b) => a - b);
  let y = 0;
  const cell = (id: string, text: string, x: number, top: number, role?: MarkRole, live = true) => {
    shapes.push({ kind: 'rect', id, x, y: top, w: CELL.w, h: CELL.h, r: 5, cls: live ? 'live' : undefined, role: roles.get(id) ?? role });
    if (text)
      shapes.push({
        kind: 'text',
        id: `${id}-v`,
        x: x + CELL.w / 2,
        y: top + CELL.h / 2 + 5.5,
        text,
        size: 15,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role: roles.get(id) === 'active' ? 'active' : undefined,
      });
  };
  shapes.push(label('c-name', 0, y + CELL.h / 2 + 5, e ? 'sorted' : 'values'));
  const shown = e ? c : values;
  shown.forEach((v, i) => cell(`c-${i}`, String(v), LABEL_W + i * CELL.pitch, y));
  y += CELL.h + 10;
  const n = e?.naive;
  if (n) {
    shapes.push(label('n-name', 0, y + CELL.h / 2 + 5, 'count'));
    c.forEach((_, i) => {
      const k = n.counts[i];
      cell(`n-${i}`, k === undefined ? '' : String(k), LABEL_W + i * CELL.pitch, y, undefined, k !== undefined);
    });
    y += CELL.h + 10;
  }
  if (e) {
    const sumText = n
      ? `sum = ${n.sum}${n.leaf ? (n.sum === e.target ? ' = target' : ` ≠ ${e.target}`) : ''}`
      : `left = ${e.target - e.chosen.reduce((a, b) => a + b, 0)}`;
    shapes.push(
      label('chosen', 0, y + 14, `chosen ${listText(e.chosen)}`),
      {
        kind: 'text',
        id: 'sum',
        x: 0,
        y: y + 36,
        text: sumText,
        size: FONT,
        mono: true,
        weight: 'bold',
        role: roles.get('sum'),
      },
    );
    y += 48;
    if (n && e.callsAll !== undefined) {
      shapes.push(label('calls', 0, y + 10, `call ${e.callsDone} of ${e.callsAll.toLocaleString('en-US')}`));
      y += 24;
    }
  }
  // The combinations found, with room for every one this run finds.
  let w = LABEL_W + Math.max(shown.length, 1) * CELL.pitch;
  if (e) {
    shapes.push(label('found-name', 0, y + 14, 'found'));
    const texts = e.found.map(listText);
    const widest = Math.max(60, ...texts.map((t) => monoWidth(t, 12.5) + 12), monoWidth(`[${Array(4).fill(9).join(', ')}]`, 12.5) + 12);
    const chipW = Math.min(widest, 150);
    if (e.found.length === 0)
      shapes.push(label('found-none', LABEL_W, y + 14, e.done ? 'none' : '(nothing yet)', 12.5));
    e.found.forEach((f, k) => {
      const fx = LABEL_W + (k % perRow) * (chipW + 6);
      const fy = y + Math.floor(k / perRow) * 22;
      const id = `found-${k}`;
      shapes.push({
        kind: 'text',
        id,
        x: fx,
        y: fy + 14,
        text: listText(f),
        size: 12.5,
        mono: true,
        weight: 'bold',
        role: roles.get(id) === 'new' ? 'new' : 'found',
      });
    });
    const rows = Math.max(1, Math.ceil(e.finds / perRow));
    w = Math.max(w, LABEL_W + Math.min(Math.max(e.finds, 1), perRow) * (chipW + 6));
    y += rows * 22;
  }
  return { shapes, w, h: y };
}

export function view(step: CSStep, settings: CSSettings, stage?: StageSize): Scene {
  const s = step.state;
  const e = step.extra;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const naive = approachOf(settings) === 'naive';
  const title = e
    ? `${naive ? 'every list' : 'sorted backtracking'}: sum ${e.target}, each ${e.reuse === 'once' ? 'once' : 'again'}`
    : 'combination sum';

  const nodes = e?.nodes;
  if (!nodes) {
    // The panel alone: a plain picture, or every list.
    const p = panel(e, s.values, roles, PER_ROW[0]!);
    const shapes = [label('title', 0, 15, title, 13.5), ...translate(p.shapes, 0, TITLE_H + 12)];
    return {
      shapes,
      bounds: padBounds({ x: 0, y: 0, w: Math.max(p.w, monoWidth(title, 13.5)), h: TITLE_H + 12 + p.h }, 12),
      label: labelText(step),
    };
  }

  const compact = nodes.length > FULL_LIMIT;
  const opts = compact ? COMPACT : FULL;
  const top = e.stack?.[e.stack.length - 1];
  const onStack = new Set(e.stack ?? []);
  // A box shows the candidate it adds and what is then left. A branch not taken is dashed:
  // pruned (what is left would go below 0) or the same value as the one before.
  const call = (x: CNode, state: CallState): TreeCall => ({
    id: String(x.id),
    parent: x.parent === null ? null : String(x.parent),
    label: x.parent === null ? String(x.left) : `+${e.c[x.i]}`,
    value: x.parent === null ? undefined : x.kind === 'dup' ? 'same' : String(x.left).replace('-', '−'),
    tag: x.kind === 'dead' ? 'dead' : undefined,
    tagRole: 'remove',
    state,
  });
  const finished = nodes.map((x) => call(x, 'done'));
  const stateOf = (x: CNode): CallState => {
    const st = e.status?.[x.id];
    if (st === 'cut') return 'cut';
    if (x.id === top) return 'current';
    return onStack.has(x.id) ? 'open' : 'done';
  };
  const now = nodes.filter((x) => e.status?.[x.id] !== undefined).map((x) => call(x, stateOf(x)));
  const treeRoles = new Map(roles);
  for (const x of nodes)
    if (x.kind === 'leaf' && e.status?.[x.id] !== undefined && !treeRoles.has(callShapeId(String(x.id))))
      treeRoles.set(callShapeId(String(x.id)), 'found');
  const legend = 'dashed: pruned or skipped, never called';

  // The tree, growing down (the usual) or right (a tall phone stage), under its title.
  const tree = (direction: TreeDirection) => {
    const layout = layoutCallTree(finished, { ...opts, direction });
    const titleW = Math.max(monoWidth(title, 13.5), monoWidth(legend, 12));
    const treeW = Math.max(layout.bounds.w, titleW);
    const dx = -layout.bounds.x + (direction === 'down' ? (treeW - layout.bounds.w) / 2 : 0);
    const dy = TITLE_H + 26 - layout.bounds.y;
    const h = layout.bounds.y + dy + layout.bounds.h;
    return { layout, dx, dy, w: treeW, h };
  };

  const drop = stage && zoomCorner(stage) ? ZOOM_DROP : 0;
  interface Arrangement {
    t: ReturnType<typeof tree>;
    perRow: number;
    px: number;
    py: number;
    bounds: Bounds;
  }
  const options: Arrangement[] = [];
  for (const direction of stage ? (['down', 'right'] as const) : (['down'] as const)) {
    const t = tree(direction);
    for (const perRow of stage ? PER_ROW : [PER_ROW[0]!]) {
      const p = panel(e, s.values, roles, perRow);
      const make = (px: number, py: number): Arrangement => ({
        t,
        perRow,
        px,
        py,
        bounds: padBounds(unionBounds({ x: 0, y: 0, w: t.w, h: t.h }, { x: px, y: py, w: p.w, h: p.h }), 12),
      });
      options.push(make(0, t.h + VGAP));
      if (stage) options.push(make(t.w + HGAP, drop));
    }
  }
  const place = stage
    ? options.reduce((a, b) => (onStage(b.bounds, stage) > onStage(a.bounds, stage) ? b : a))
    : options[0]!;
  const { layout, dx, dy } = place.t;

  const shapes: Shape[] = [label('title', 0, 15, title, 13.5), label('legend', 0, 34, legend, 12)];
  shapes.push(...drawCallTree(layout, now, { dx, dy, roles: treeRoles }));
  shapes.push(...translate(panel(e, s.values, roles, place.perRow).shapes, place.px, place.py));
  return { shapes, bounds: place.bounds, label: labelText(step) };
}

function labelText(step: CSStep): string {
  const e = step.extra;
  const parts = [describe(step.state)];
  if (!e) return parts.join(' ');
  parts.push(`Target ${e.target}; sorted candidates ${e.c.join(', ')}; chosen ${listText(e.chosen)}.`);
  if (e.nodes && e.status) {
    const made = e.nodes.filter((x) => e.status![x.id] !== undefined).length;
    parts.push(`${made} of ${e.nodes.length} boxes of the tree drawn.`);
  }
  if (e.naive) parts.push(`Counts ${e.naive.counts.join(', ') || 'none yet'}, sum ${e.naive.sum}.`);
  parts.push(e.found.length ? `Found: ${e.found.map(listText).join(', ')}.` : 'Nothing found yet.');
  return parts.join(' ');
}
