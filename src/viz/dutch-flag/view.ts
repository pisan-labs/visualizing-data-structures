/**
 * The drawing, top to bottom: what is asked ("partition around p = 5"), left, clear of the zoom
 * buttons; the four regions of the pattern over A (below, equal, unknown, above) with low, mid
 * and high under it; or, counting then rewriting, A with i under it and the output array B with
 * its three regions. In bars mode a dashed line across A marks the pivot's height, so a value's
 * kind shows as "under, on or over the line".
 *
 * Each operation fixes its frame (rows, lanes), so the camera holds still while it runs. A plain
 * picture (the start, a load, practice) draws A alone.
 */
import type { MarkRole } from '../../engine/types';
import { barTop, barsGeometry, barsScene, type BarsFrame, type BarsRow } from '../../layouts/bars';
import type { Scene, Shape } from '../../render/scene';
import type { Item } from '../_sorting/kit';
import { describeArray } from '../_sorting/view';
import type { FlagSettings, FlagStep } from './model';

const live = (x: Item | null | undefined): x is Item => !!x && !x.stale;
const ghosts = (items: readonly (Item | null)[]) =>
  items.flatMap((x, index) => (x && x.stale ? [{ index, value: x.value }] : []));

const HEADING = 21;

export function view(step: FlagStep, settings: FlagSettings): Scene {
  const s = step.state;
  const e = step.extra;
  const n = s.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const counting = !!e?.b;
  const frame: BarsFrame = {
    mode: settings.draw,
    slots: n,
    max: Math.max(
      1,
      ...s.a.map((x) => x.value),
      ...(e?.b ?? []).map((x) => x?.value ?? 0),
      e?.p ?? 0,
    ),
    rows: counting ? ['a', 'b'] : ['a'],
    regionLanes: e && !counting ? 2 : 0,
    pointerLanes: e ? (counting ? 1 : 3) : 0,
  };
  const rows: BarsRow[] = [
    { id: 'a', label: 'A', items: s.a.map((x) => (live(x) ? x : null)), ghosts: ghosts(s.a) },
  ];
  if (e?.b)
    rows.push({
      id: 'b',
      label: 'B',
      items: e.b.map((x) => (live(x) ? x : null)),
      ghosts: ghosts(e.b),
    });
  const bars = barsScene(frame, {
    rows,
    pointers: e?.pointers,
    regions: [...(e?.regions ?? []), ...(e?.bRegions ?? [])],
    roles,
  });
  const shapes: Shape[] = [...bars.shapes];
  if (e) {
    shapes.push({
      kind: 'text',
      id: 'heading',
      x: 10,
      y: 28,
      text: counting
        ? `count, then rewrite around p = ${e.p}`
        : `three-way partition around p = ${e.p}`,
      size: HEADING,
      weight: 'bold',
      mono: true,
    });
    if (settings.draw === 'bars') {
      const g = barsGeometry(frame);
      for (const row of frame.rows!) {
        const y = barTop(g, frame.max, e.p, row);
        shapes.push(
          {
            kind: 'arrow',
            id: `pivot-${row}`,
            x1: g.left(0) - 4,
            y1: y,
            x2: g.left(n) + 4,
            y2: y,
            head: 'none',
            dashed: true,
            z: 2.5,
          },
          {
            kind: 'text',
            id: `pivot-${row}-t`,
            x: g.left(0) - 8,
            y: y + 7,
            text: 'p',
            size: 20,
            anchor: 'end',
            cls: 'label',
            mono: true,
          },
        );
      }
    }
  }
  return { shapes, bounds: bars.bounds, label: label(step) };
}

function label(step: FlagStep): string {
  const e = step.extra;
  const parts = [describeArray(step.state)];
  if (!e) return parts[0]!;
  parts.push(`Pivot p = ${e.p}.`);
  const named = (rs: typeof e.regions, row: string) =>
    rs
      .filter((r) => r.to >= r.from)
      .map((r) => `${row}[${r.from}..${r.to}] ${r.label}`)
      .join(', ');
  if (e.regions.length) parts.push(`Regions: ${named(e.regions, 'A')}.`);
  if (e.b) {
    const vs = e.b.map((x) => (!x ? 'empty' : x.stale ? 'copied back' : String(x.value)));
    parts.push(`B: ${vs.join(', ')}.`);
    if (e.bRegions?.length) parts.push(`Regions of B: ${named(e.bRegions, 'B')}.`);
  }
  if (e.pointers.length) parts.push(`${e.pointers.map((p) => `${p.name} at ${p.at}`).join(', ')}.`);
  return parts.join(' ');
}
