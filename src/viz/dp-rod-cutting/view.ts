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
import {
  describe,
  frameId,
  nOf,
  pieceId,
  type RodExtra,
  type RodSettings,
  type RodState,
} from './model';

const STRIP_H = 44;
/** Narrower cells a narrow stage may draw the table larger with. */
const NARROW = [52, 46];

/**
 * One column per length j: the price of a piece that long (p), the best revenue (r) and the
 * first piece of a best cut (s). Arcs over the table run from r[j − i] to the cell being
 * filled, labeled with the price added: the candidate being tried and the best so far. Under
 * the table sit the calls on the stack (top-down), or the rod being cut into pieces.
 */
export function view(
  step: Step<RodState, RodExtra>,
  settings: RodSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const n = nOf(state);
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const frameFor = (cellW?: number): TableFrame => ({
    rows: 3,
    cols: n + 1,
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
  const at = extra.at;
  if (at !== undefined && extra.tryCut && extra.tryCut !== extra.bestCut)
    links.push({
      id: 'try',
      from: [1, at - extra.tryCut],
      to: [1, at],
      route: 'arc',
      lane: 0,
      label: `+${state.p[extra.tryCut]}`,
    });
  if (at !== undefined && extra.bestCut)
    links.push({
      id: 'best',
      from: [1, at - extra.bestCut],
      to: [1, at],
      route: 'arc',
      lane: 1,
      role: 'active',
      label: `+${state.p[extra.bestCut]}`,
    });

  const { shapes, bounds } = tableScene(frame, {
    values: [
      state.p.map((v, i) => (i === 0 ? '–' : String(v))),
      state.r.map((v) => (v === null ? null : String(v))),
      state.s.map((v, j) => (v === null ? null : j === 0 ? '–' : String(v))),
    ],
    colHeads: [state.p.map((_, j) => String(j))],
    rowHeads: [['p', 'r', 's']],
    corner: [['j']],
    links,
    roles,
  });
  const out: Shape[] = shapes;
  const y = g.belowTop;

  if (extra.stack) {
    const stack = extra.stack;
    const running = stack[stack.length - 1];
    out.push(
      ...boxRow(
        'frame',
        y,
        state.r.map((_, j) =>
          stack.includes(j)
            ? {
                text: String(j),
                x: g.cx(j),
                role:
                  roles.get(frameId(j)) ??
                  (j === extra.hit ? 'found' : j === running ? 'active' : undefined),
              }
            : null,
        ),
        { w: g.cellW - 6, h: STRIP_H, label: 'calls', labelX: g.gridLeft - 10 },
      ),
    );
  }

  if (extra.pieces) {
    // The rod spans columns 1..n, one cell per unit of length; each piece keeps its own id.
    out.push({
      kind: 'text',
      id: 'rod-label',
      x: g.gridLeft - 10,
      y: y + STRIP_H / 2 + 6,
      text: 'rod',
      size: 17,
      anchor: 'end',
      cls: 'label',
      mono: true,
    });
    let off = 0;
    extra.pieces.forEach((len, k) => {
      const x = g.left(1 + off) + 3;
      const w = len * g.cellW - 6;
      const id = pieceId(k);
      const role = roles.get(id) ?? 'done';
      out.push({ kind: 'rect', id, x, y, w, h: STRIP_H, r: 6, cls: 'cell live', role });
      out.push({
        kind: 'text',
        id: `${id}-t`,
        x: x + w / 2,
        y: y + STRIP_H / 2 + 8,
        text: String(len),
        size: 22,
        anchor: 'middle',
        weight: 'bold',
        mono: true,
        role,
      });
      off += len;
    });
    const rest = extra.rest ?? 0;
    if (rest > 0) {
      const x = g.left(1 + off) + 3;
      const w = rest * g.cellW - 6;
      out.push({ kind: 'rect', id: 'rest', x, y, w, h: STRIP_H, r: 6, cls: 'cell' });
      out.push({
        kind: 'text',
        id: 'rest-t',
        x: x + w / 2,
        y: y + STRIP_H / 2 + 8,
        text: String(rest),
        size: 22,
        anchor: 'middle',
        mono: true,
        cls: 'label',
      });
    }
  }
  return { shapes: out, bounds, label: label(step, settings) };
}

function label(step: Step<RodState, RodExtra>, _settings: RodSettings): string {
  const parts = [describe(step.state)];
  const { stack, pieces, rest } = step.extra ?? {};
  if (stack?.length)
    parts.push(`Calls on the stack: ${stack.map((j) => `memoCut(${j})`).join(', ')}.`);
  if (pieces)
    parts.push(
      `${pieces.length ? `Pieces cut so far: ${pieces.join(', ')}.` : 'No cuts yet.'}${rest ? ` Length ${rest} left.` : ''}`,
    );
  return parts.join(' ');
}
