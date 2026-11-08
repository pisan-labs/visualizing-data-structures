import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout, translate } from '../../layouts/arrange';
import {
  drawCallTree,
  edgeLabelSize,
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
import { describe, seqText, type BtNode, type BtSettings, type BtState } from './model';

/** Up to 16 calls get full boxes with edge labels; bigger trees get compact boxes. */
export const FULL_LIMIT = 16;
const FULL: CallTreeOptions = { size: 12, gap: 8, levelGap: 54, twoLines: true };
const FULL_ONE: CallTreeOptions = { size: 12, gap: 8, levelGap: 48, twoLines: false };
const COMPACT: CallTreeOptions = { size: 11, gap: 3, levelGap: 36, twoLines: false, minW: 22 };
const CELL = { w: 28, h: 26, pitch: 31 };
const LABEL_W = 64;
/** Found outputs per row: the usual, then the others a stage may draw larger with. */
const PER_ROW = [6, 2, 3, 4, 8, 12];
const TITLE_H = 24;
/** Room between the tree and the panel under it, and beside it. */
const VGAP = 18;
const HGAP = 36;

/** A part of the drawing: shapes with their top left corner at (0, 0), and its size. */
interface Block {
  shapes: Shape[];
  w: number;
  h: number;
}

export function view(
  step: Step<BtState, undefined>,
  settings: BtSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const problem = s.run?.problem ?? settings.problem;
  // Before the first run, the title says what the next run will do.
  const target = s.run ? s.run.target : problem === 'subsets' ? settings.target : 0;
  const compact = s.nodes.length > FULL_LIMIT;
  const sums = !compact && problem === 'subsets' && target > 0;
  const opts = compact ? COMPACT : sums ? FULL : FULL_ONE;
  const top = s.stack[s.stack.length - 1];
  const onStack = new Set(s.stack);

  const label = (x: BtNode) => {
    if (x.chosen.length === 0) return '[]';
    return x.chosen.join(compact ? '' : ',');
  };
  // Only pruned calls get a badge (every leaf outputs, so leaves need none). Compact boxes are
  // narrow, so there it is the shorter word.
  const tag = (x: BtNode) => (x.kind !== 'pruned' ? undefined : compact ? 'cut' : 'pruned');
  const call = (x: BtNode, state: CallState, valueShown: boolean): TreeCall => ({
    id: String(x.id),
    parent: x.parent === null ? null : String(x.parent),
    label: label(x),
    value: sums && valueShown && x.kind !== 'cut' ? `= ${x.sum}` : undefined,
    tag: tag(x),
    tagRole: 'remove',
    edge: compact || problem === 'permutations' ? undefined : x.edge || undefined,
    state,
  });
  const finished = s.nodes.map((x) => call(x, 'done', true));
  const stateOf = (x: BtNode): CallState => {
    const st = s.status[x.id];
    if (st === 'cut') return 'cut';
    if (x.id === top) return 'current';
    return onStack.has(x.id) ? 'open' : 'done';
  };
  const now = s.nodes
    .filter((x) => s.status[x.id] !== undefined)
    .map((x) => call(x, stateOf(x), true));
  const treeTitle =
    problem === 'subsets'
      ? target > 0
        ? `decision tree: subsets with sum ${target}`
        : 'decision tree: take or skip each value'
      : 'decision tree: pick the next value';

  // The tree, growing down (the usual) or right (a tall phone stage), under its title.
  const tree = (direction: TreeDirection) => {
    // Growing right, an edge's label sits in the gap before its box, so the gap fits the widest.
    const edges = finished.map((c) => c.edge ?? '');
    const widest = Math.max(0, ...edges.map((e) => monoWidth(e, edgeLabelSize(opts.size!))));
    const columnGap = widest ? Math.round(widest + 10) : undefined;
    const layout = layoutCallTree(finished, { ...opts, direction, columnGap });
    const treeW = Math.max(layout.bounds.w, monoWidth(treeTitle, 12.5), 220);
    const dx = -layout.bounds.x + (treeW - layout.bounds.w) / 2;
    const dy = TITLE_H + 10 - layout.bounds.y;
    const h = s.nodes.length ? layout.bounds.h + TITLE_H + 10 : TITLE_H + 16;
    return { layout, dx, dy, w: treeW, h };
  };

  // The values, the partial solution, and what the search has output so far.
  const panel = (perRow: number): Block => {
    const shapes: Shape[] = [];
    let y = 0;
    const n = Math.max(1, s.values.length);
    const rowLabel = (id: string, text: string, at: number) =>
      shapes.push({
        kind: 'text',
        id,
        x: 0,
        y: at + CELL.h / 2 + 5,
        text,
        size: 12.5,
        cls: 'label',
        mono: true,
      });
    const cell = (
      id: string,
      text: string,
      x: number,
      at: number,
      role?: MarkRole,
      live = true,
    ) => {
      shapes.push({
        kind: 'rect',
        id: `${id}-box`,
        x,
        y: at,
        w: CELL.w,
        h: CELL.h,
        r: 5,
        cls: live ? 'live' : undefined,
        role,
      });
      if (text)
        shapes.push({
          kind: 'text',
          id,
          x: x + CELL.w / 2,
          y: at + CELL.h / 2 + 5,
          text,
          size: 14,
          anchor: 'middle',
          weight: 'bold',
          mono: true,
          role: role === 'active' ? 'active' : undefined,
        });
    };
    rowLabel('values-label', 'values', y);
    s.values.forEach((v, i) => cell(`value-${i}`, String(v), LABEL_W + i * CELL.pitch, y));
    y += CELL.h + 10;
    rowLabel('chosen-label', 'chosen', y);
    for (let i = 0; i < n; i++) {
      const v = s.chosen[i];
      cell(
        `chosen-${i}`,
        v === undefined ? '' : String(v),
        LABEL_W + i * CELL.pitch,
        y,
        v !== undefined && i === s.chosen.length - 1 && s.run?.outcome === 'running'
          ? 'active'
          : undefined,
        v !== undefined,
      );
    }
    y += CELL.h + 14;
    rowLabel('found-label', 'found', y);
    // Many outputs (a big tree) are listed without spaces, so more of them fit on a row.
    const show = (xs: readonly number[]) => (compact ? `[${xs.join(',')}]` : seqText(xs));
    const leaves = s.nodes.filter((x) => x.kind === 'leaf');
    const chipW = Math.max(54, ...leaves.map((x) => monoWidth(show(x.chosen), 11.5) + 12));
    if (s.found.length === 0) {
      shapes.push({
        kind: 'text',
        id: 'found-none',
        x: LABEL_W,
        y: y + CELL.h / 2 + 5,
        text: s.run ? '(nothing yet)' : '',
        size: 11.5,
        cls: 'label',
        mono: true,
      });
    }
    s.found.forEach((f, k) => {
      const fx = LABEL_W + (k % perRow) * (chipW + 6);
      const fy = y + Math.floor(k / perRow) * (CELL.h + 6);
      shapes.push({
        kind: 'text',
        id: `found-${k}`,
        x: fx + chipW / 2,
        y: fy + CELL.h / 2 + 5,
        text: show(f),
        size: 11.5,
        anchor: 'middle',
        mono: true,
        role: roles.get(`found-${k}`) === 'new' ? 'new' : 'found',
      });
    });
    // Room for every output this run will make, so the drawing does not grow as they arrive.
    const outputs = leaves.length;
    const rows = Math.max(1, Math.ceil(outputs / perRow));
    const foundW = LABEL_W + Math.min(Math.max(outputs, 1), perRow) * (chipW + 6);
    return {
      shapes,
      w: Math.max(foundW, LABEL_W + n * CELL.pitch),
      h: y - 4 + rows * (CELL.h + 6),
    };
  };

  interface Arrangement {
    t: ReturnType<typeof tree>;
    perRow: number;
    /** Where the panel's top left corner goes. */
    px: number;
    py: number;
    bounds: Bounds;
  }
  const drop = stage && zoomCorner(stage) ? ZOOM_DROP : 0;
  const options: Arrangement[] = [];
  for (const direction of stage ? (['down', 'right'] as const) : (['down'] as const)) {
    const t = tree(direction);
    for (const perRow of stage ? PER_ROW : PER_ROW.slice(0, 1)) {
      const p = panel(perRow);
      const make = (px: number, py: number): Arrangement => ({
        t,
        perRow,
        px,
        py,
        bounds: padBounds(
          unionBounds({ x: 0, y: 0, w: t.w, h: t.h }, { x: px, y: py, w: p.w, h: p.h }),
          12,
        ),
      });
      options.push(make(0, t.h + VGAP));
      if (stage) options.push(make(t.w + HGAP, drop));
    }
  }
  // With no stage, the tree grows down with the panel under it, as it always has.
  const place = pickLayout(stage, options);
  const { layout, dx, dy } = place.t;

  const shapes: Shape[] = [];
  shapes.push({
    kind: 'text',
    id: 'tree-title',
    x: 0,
    y: 15,
    text: treeTitle,
    size: 12.5,
    cls: 'label',
    mono: true,
  });
  if (s.nodes.length) shapes.push(...drawCallTree(layout, now, { dx, dy, roles }));
  else
    shapes.push({
      kind: 'text',
      id: 'tree-empty',
      x: 0,
      y: TITLE_H + 18,
      text: '(no calls yet)',
      size: 11.5,
      cls: 'label',
      mono: true,
    });
  shapes.push(...translate(panel(place.perRow).shapes, place.px, place.py));
  return { shapes, bounds: place.bounds, label: describe(s) };
}
