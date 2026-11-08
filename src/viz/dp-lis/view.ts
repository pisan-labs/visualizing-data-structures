import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import type { Scene, Shape } from '../../render/scene';
import { describe, type LisExtra, type LisSettings, type LisState } from './model';

const STRIP_H = 44;
const NARROW = [52, 46, 40];

/**
 * One column per position: the value (a), the length of the longest increasing run ending
 * there (L) and the position before it in that run (P). Arcs over the table join a[j] to a[i]
 * while they are compared, and later the run the walk back follows. Under the table: the
 * tails array (binary search method) or the subsequence being read off.
 */
export function view(
  step: Step<LisState, LisExtra>,
  settings: LisSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = state.a.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frameFor = (cellW?: number): TableFrame => ({
    rows: 3,
    cols: n,
    colHeads: 1,
    colHeadsAt: 'below',
    rowHeads: [44],
    arcLanes: 2,
    below: STRIP_H + 4,
    cellW,
    cellH: cellW && Math.max(40, Math.round(cellW * 0.8)),
  });
  const narrow = stage && stage.w < stage.h ? NARROW : [];
  const cellW = pickLayout(
    stage,
    [undefined, ...narrow].map((w) => {
      const g = tableGeometry(frameFor(w));
      return { w, bounds: { x: 0, y: 0, w: g.width, h: g.height } };
    }),
  ).w;
  const frame = frameFor(cellW);
  const g = tableGeometry(frame);

  const links: TableLink[] = [];
  const { at, from, best, found } = extra;
  if (at !== undefined && from !== undefined && from !== best)
    links.push({ id: 'cmp', from: [0, from], to: [0, at], route: 'arc', lane: 0 });
  if (at !== undefined && best !== undefined)
    links.push({ id: 'best', from: [0, best], to: [0, at], route: 'arc', lane: 1, role: 'active' });
  if (at !== undefined && extra.place !== undefined && (state.P[at] ?? -1) >= 0)
    links.push({
      id: 'best',
      from: [0, state.P[at]!],
      to: [0, at],
      route: 'arc',
      lane: 1,
      role: 'active',
    });
  if (found)
    for (let k = 0; k + 1 < found.length; k++)
      links.push({
        id: `run-${k}`,
        from: [0, found[k + 1]!],
        to: [0, found[k]!],
        route: 'arc',
        lane: 0,
        role: 'active',
      });

  const { shapes, bounds } = tableScene(frame, {
    values: [
      state.a.map(String),
      state.L.map((v) => (v === null ? null : String(v))),
      state.P.map((v) => (v === null ? null : v < 0 ? '–' : String(v + 1))),
    ],
    colHeads: [state.a.map((_, i) => String(i + 1))],
    rowHeads: [['a', 'L', 'P']],
    corner: [['i']],
    links,
    roles,
  });
  const out: Shape[] = shapes;
  const y = g.belowTop;
  const w = g.cellW - 6;
  if (found) {
    const length = state.L[found[0] ?? 0] ?? 0;
    out.push(
      ...boxRow(
        'lis',
        y,
        Array.from({ length }, (_, pos) => {
          const k = length - 1 - pos;
          const i = found[k];
          return i === undefined
            ? null
            : {
                text: String(state.a[i]),
                x: g.cx(pos),
                role: 'found' as MarkRole,
                from: { x: g.cx(i), y: g.cy(0) },
              };
        }),
        { w, h: STRIP_H, label: 'LIS', labelX: g.gridLeft - 10 },
      ),
    );
  } else if (settings.method === 'tails' && (state.tails.length || isFilling(step))) {
    out.push(
      ...boxRow(
        'tails',
        y,
        state.tails.map((i, k) => ({
          text: String(state.a[i]),
          x: g.cx(k),
          role:
            roles.get(`tails-${k}`) ??
            (extra.lo !== undefined && (k < extra.lo || k >= extra.hi!) ? 'stale' : undefined),
          from: { x: g.cx(i), y: g.cy(0) },
        })),
        { w, h: STRIP_H, label: 'tails', labelX: g.gridLeft - 10 },
      ),
    );
  }
  return { shapes: out, bounds, label: label(step) };
}

const isFilling = (step: Step<LisState, LisExtra>) => step.lines.some((l) => l.startsWith('p.'));

function label(step: Step<LisState, LisExtra>): string {
  const parts = [describe(step.state)];
  const found = step.extra?.found;
  if (found)
    parts.push(
      found.length
        ? `Found so far, from the end: ${found.map((i) => step.state.a[i]).join(', ')}.`
        : 'Nothing found yet.',
    );
  return parts.join(' ');
}
