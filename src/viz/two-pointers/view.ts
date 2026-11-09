/**
 * The array (bars or cells) with lo and hi under it, and, while pairSum or maxWater runs, the
 * grid of every pair (i, j) with i < j: beside the array on a wide stage, under it on a tall
 * one. A move rules out a whole row (lo moves right) or column (hi moves left) of the grid, so
 * the cells still possible always form the triangle lo ≤ i < j ≤ hi. maxWater also draws the
 * water between the two walls.
 */
import type { MarkRole, StageSize } from '../../engine/types';
import { panelPlace, translate } from '../../layouts/arrange';
import {
  barsScene,
  barTop,
  barsGeometry,
  type BarsFrame,
  type BarsRegion,
} from '../../layouts/bars';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { ArrayState, Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import type { PairsGrid, TwoSettings, TwoStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;

const HEAD = 22;
const LABEL = 22;

/** The pairs grid at (0, 0): column indices j on top, row indices i on the left. */
function gridShapes(
  n: number,
  grid: PairsGrid,
  roles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const shapes: Shape[] = [];
  const cols = Math.max(1, n - 1);
  const c = Math.max(22, Math.min(34, Math.floor(320 / cols)));
  const label = Math.min(LABEL, Math.floor(c * 0.85));
  const x0 = 34;
  const y0 = 34 + label + 6;
  shapes.push({
    kind: 'text',
    id: 'grid-name',
    x: x0,
    y: 22,
    text: 'pairs (i, j)',
    size: HEAD,
    anchor: 'start',
    cls: 'label',
  });
  const checked = new Set(grid.checked.map(([i, j]) => `${i}-${j}`));
  const cut = new Set((grid.cut ?? []).map(([i, j]) => `${i}-${j}`));
  const found = grid.found ? `${grid.found[0]}-${grid.found[1]}` : '';
  for (let j = 1; j < n; j++)
    shapes.push({
      kind: 'text',
      id: `grid-j-${j}`,
      x: x0 + (j - 1) * c + c / 2,
      y: y0 - 6,
      text: String(j),
      size: label,
      anchor: 'middle',
      mono: true,
      cls: 'index',
    });
  for (let i = 0; i < n - 1; i++) {
    shapes.push({
      kind: 'text',
      id: `grid-i-${i}`,
      x: x0 - 6,
      y: y0 + i * c + c / 2 + label * 0.36,
      text: String(i),
      size: label,
      anchor: 'end',
      mono: true,
      cls: 'index',
    });
    for (let j = i + 1; j < n; j++) {
      const key = `${i}-${j}`;
      const id = `pair-${key}`;
      const possible = grid.lo <= i && j <= grid.hi;
      const was = checked.has(key);
      const role =
        roles.get(id) ??
        (key === found ? 'found' : cut.has(key) ? 'remove' : was ? 'visit' : undefined);
      const x = x0 + (j - 1) * c;
      const y = y0 + i * c;
      shapes.push({
        kind: 'rect',
        id,
        x: x + 1,
        y: y + 1,
        w: c - 2,
        h: c - 2,
        r: 3,
        cls: possible || was ? 'cell live' : 'cell',
        role,
        opacity: possible || was || role ? 1 : 0.55,
      });
      // A checked pair carries a dot, so it does not rest on color alone.
      if (was)
        shapes.push({
          kind: 'circle',
          id: `${id}-dot`,
          x: x + c / 2,
          y: y + c / 2,
          r: Math.max(3, c * 0.14),
          cls: 'arrowhead',
          role: role === 'found' ? 'found' : undefined,
        });
    }
  }
  const w = x0 + cols * c + 8;
  const h = y0 + Math.max(1, n - 1) * c + 8;
  return { shapes, bounds: { x: 0, y: 0, w, h } };
}

export function view(step: TwoStep, settings: TwoSettings, stage?: StageSize): Scene {
  const { state } = step;
  const extra = step.extra ?? {};
  const n = state.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const water = extra.water;
  const regions: BarsRegion[] = [...(extra.regions ?? [])];
  if (water)
    regions.push({
      id: 'water',
      from: water.lo,
      to: water.hi,
      tone: 'plain',
      label: `${water.h} × ${water.hi - water.lo} = ${water.h * (water.hi - water.lo)}`,
    });
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(1, ...state.a.map((x) => x.value)),
    regionLanes: 1,
    pointerLanes: 2,
  };
  const items = state.a.map((x) => (live(x) ? x : null));
  const ghosts = state.a.flatMap((x, index) => (x.stale ? [{ index, value: x.value }] : []));
  const bars = barsScene(frame, {
    rows: [{ id: 'a', label: 'A', items, ghosts }],
    pointers: extra.pointers,
    regions,
    faded: extra.faded,
    roles,
  });
  const shapes: Shape[] = [...bars.shapes];
  if (water && settings.draw === 'bars') {
    const g = barsGeometry(frame);
    const top = barTop(g, frame.max, water.h);
    const bottom = g.row('a').bottom;
    const x1 = g.center(water.lo);
    const x2 = g.center(water.hi);
    shapes.push({
      kind: 'polygon',
      id: 'water-fill',
      points: [
        { x: x1, y: top },
        { x: x2, y: top },
        { x: x2, y: bottom },
        { x: x1, y: bottom },
      ],
      role: water.best ? 'found' : 'visit',
      z: 0.4,
    });
    shapes.push({
      kind: 'arrow',
      id: 'water-line',
      x1,
      y1: top,
      x2,
      y2: top,
      head: 'none',
      dashed: true,
      role: water.best ? 'found' : 'visit',
    });
  }
  let bounds = bars.bounds;
  if (extra.pairs && n >= 2) {
    const grid = gridShapes(n, extra.pairs, roles);
    // Under the array, centered; or beside it when that draws larger.
    const ux = Math.max(0, (bars.bounds.w - grid.bounds.w) / 2);
    const uy = bars.bounds.h;
    const panel = { x: ux, y: uy, w: grid.bounds.w, h: grid.bounds.h };
    const usual = {
      x: 0,
      y: 0,
      w: Math.max(bars.bounds.w, ux + grid.bounds.w),
      h: uy + grid.bounds.h + 10,
    };
    const place = panelPlace(stage, usual, bars.bounds, panel, { gap: 10, pad: 10 });
    shapes.push(...translate(grid.shapes, ux + place.dx, uy + place.dy));
    bounds = place.bounds;
  }
  return { shapes, bounds, label: label(step) };
}

function label(step: TwoStep): string {
  const e = step.extra ?? {};
  const parts = [describeArray(step.state as ArrayState)];
  if (e.pointers?.length)
    parts.push(`${e.pointers.map((p) => `${p.name} at ${p.at}`).join(', ')}.`);
  if (e.pairs) {
    const { lo, hi, checked, found } = e.pairs;
    const left = hi > lo ? ((hi - lo) * (hi - lo + 1)) / 2 : 0;
    parts.push(
      `${checked.length} ${checked.length === 1 ? 'pair' : 'pairs'} checked; pairs with lo ≤ i < j ≤ hi, ${left} of them, are still possible.`,
    );
    if (found) parts.push(`Answer: the pair (${found[0]}, ${found[1]}).`);
  }
  if (e.water)
    parts.push(`Water between walls ${e.water.lo} and ${e.water.hi}, ${e.water.h} high.`);
  return parts.join(' ');
}
