import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest, translate } from '../../layouts/arrange';
import { loopArrow, type Pt } from '../../layouts/route';
import {
  boxRow,
  tableGeometry,
  tableScene,
  type TableFrame,
  type TableLink,
} from '../../layouts/table';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { approachOf } from '../_patterns/kit';
import { callsLabel, fmt, shrinkInfinities } from '../_dp2/kit';
import {
  describe,
  feeOf,
  moveId,
  stateId,
  statesFor,
  type Move,
  type SMExtra,
  type SMSettings,
  type SMState,
  type StateName,
} from './model';

const CELL_W = 58;
const CELL_H = 54;
const CORNER = 13;
const STATE_R = 28;
const NAME = 17;
const LABEL = 15;
const PLAN_H = 34;
const GAP = 28;

interface Edge {
  move: Move;
  label: string;
  /** Curve through this point; a loop has its own. */
  via?: Pt;
  /** The loop's side. */
  loop?: Pt;
  /** Where the label goes. */
  at: Pt;
  anchor?: 'start' | 'middle' | 'end';
}

/** The machine's states and moves, in diagram units with free at (0, 0). */
function machine(
  cooldown: boolean,
  fee: number,
): { pos: Record<string, Pt>; edges: Edge[]; bounds: Bounds } {
  const sell = `sell +p${fee ? ` −${fee}` : ''}`;
  if (cooldown) {
    const pos = { free: { x: 0, y: 0 }, hold: { x: 200, y: 0 }, cool: { x: 100, y: 128 } };
    return {
      pos,
      edges: [
        { move: { from: 'free', to: 'hold' }, label: 'buy −p', at: { x: 100, y: -10 } },
        { move: { from: 'hold', to: 'cool' }, label: sell, at: { x: 166, y: 78 }, anchor: 'start' },
        { move: { from: 'cool', to: 'free' }, label: 'rest', at: { x: 36, y: 78 }, anchor: 'end' },
        {
          move: { from: 'free', to: 'free' },
          label: 'rest',
          loop: { x: -1, y: 0 },
          at: { x: -60, y: -30 },
          anchor: 'middle',
        },
        {
          move: { from: 'hold', to: 'hold' },
          label: 'keep',
          loop: { x: 1, y: 0 },
          at: { x: 260, y: -30 },
          anchor: 'middle',
        },
      ],
      bounds: { x: -100, y: -56, w: 400, h: 128 + 56 + STATE_R + 14 },
    };
  }
  const pos = { free: { x: 0, y: 0 }, hold: { x: 200, y: 0 } };
  return {
    pos,
    edges: [
      {
        move: { from: 'free', to: 'hold' },
        label: 'buy −p',
        via: { x: 100, y: -54 },
        at: { x: 100, y: -36 },
      },
      {
        move: { from: 'hold', to: 'free' },
        label: sell,
        via: { x: 100, y: 54 },
        at: { x: 100, y: 52 },
      },
      {
        move: { from: 'free', to: 'free' },
        label: 'rest',
        loop: { x: -1, y: 0 },
        at: { x: -60, y: -30 },
        anchor: 'middle',
      },
      {
        move: { from: 'hold', to: 'hold' },
        label: 'keep',
        loop: { x: 1, y: 0 },
        at: { x: 260, y: -30 },
        anchor: 'middle',
      },
    ],
    bounds: { x: -100, y: -62, w: 400, h: 130 },
  };
}

const unit = (a: Pt, b: Pt): Pt => {
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
};

function diagram(
  cooldown: boolean,
  fee: number,
  roles: ReadonlyMap<string, MarkRole>,
  moveRoles: ReadonlyMap<string, MarkRole>,
): { shapes: Shape[]; bounds: Bounds } {
  const { pos, edges, bounds } = machine(cooldown, fee);
  const shapes: Shape[] = [];
  for (const [q, p] of Object.entries(pos)) {
    const id = stateId(q as StateName);
    shapes.push({ kind: 'circle', id, x: p.x, y: p.y, r: STATE_R, role: roles.get(id) });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: p.x,
      y: p.y + NAME * 0.36,
      text: q,
      size: NAME,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(id),
    });
  }
  for (const e of edges) {
    const id = moveId(e.move);
    const role = roles.get(id) ?? moveRoles.get(id);
    const a = pos[e.move.from]!;
    const b = pos[e.move.to]!;
    if (e.loop) {
      const seg = loopArrow(a, e.loop, STATE_R);
      shapes.push({
        kind: 'arrow',
        id,
        x1: seg.a.x,
        y1: seg.a.y,
        x2: seg.b.x,
        y2: seg.b.y,
        via: seg.via,
        role,
      });
    } else {
      const toward = e.via ?? b;
      const back = e.via ?? a;
      const u1 = unit(a, toward);
      const u2 = unit(b, back);
      shapes.push({
        kind: 'arrow',
        id,
        x1: a.x + u1.x * (STATE_R + 2),
        y1: a.y + u1.y * (STATE_R + 2),
        x2: b.x + u2.x * (STATE_R + 3),
        y2: b.y + u2.y * (STATE_R + 3),
        via: e.via,
        role,
      });
    }
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: e.at.x,
      y: e.at.y,
      text: e.label,
      size: LABEL,
      anchor: e.anchor ?? 'middle',
      mono: true,
      cls: role ? undefined : 'label',
      role,
    });
  }
  return { shapes, bounds };
}

/**
 * The state machine beside (or above) the table: one row per state, one column per day, with
 * the day and its price over each column. Filling a cell draws arrows from the cells of the day
 * before that it is made from, and lights the moves they stand for in the diagram, the winner
 * brighter. Recursion counts each cell's calls in its corner and lights the cells on the stack;
 * the trace draws the walk back and lines the buys and sells up under their days.
 */
export function view(step: Step<SMState, SMExtra>, settings: SMSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const states = statesFor(settings);
  const cooldown = settings.cooldown !== false;
  const n = state.prices.length;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const recursion = approachOf(settings) === 'naive';
  for (const [r, t] of extra.stack ?? []) {
    const id = `cell-${r}-${t}`;
    if (!roles.has(id)) roles.set(id, 'visit');
  }
  const planning = extra.plan !== undefined;
  const frame: TableFrame = {
    rows: states.length,
    cols: n + 1,
    colHeads: 2,
    rowHeads: [64],
    cellW: CELL_W,
    cellH: CELL_H,
    below: planning ? PLAN_H + 6 : 0,
  };
  const g = tableGeometry(frame);
  const links: TableLink[] = (extra.reads ?? []).map((r, k) => ({
    id: `read-${k}`,
    from: r.from,
    to: r.to,
    role: r.win ? 'active' : undefined,
  }));
  const values = states.map((_, i) =>
    Array.from({ length: n + 1 }, (_, t) => {
      const v = state.T[i]?.[t] ?? extra.seen?.[i]?.[t] ?? null;
      return v === null ? null : fmt(v);
    }),
  );
  const table = tableScene(frame, {
    values,
    colHeads: [
      Array.from({ length: n + 1 }, (_, t) => String(t)),
      ['', ...state.prices.map(String)],
    ],
    colStyles: ['index', 'label'],
    rowHeads: [states],
    rowStyles: ['label'],
    corner: [['day'], ['p']],
    links,
    path: extra.path,
    roles,
  });
  const tShapes: Shape[] = shrinkInfinities(table.shapes, g.cy);
  if (recursion && extra.calls)
    extra.calls.forEach((row, r) =>
      row.forEach((k, t) => {
        if (k > 0)
          tShapes.push({
            kind: 'text',
            id: `calls-${r}-${t}`,
            x: g.left(t) + CELL_W - 3,
            y: g.top(r) + CORNER,
            text: callsLabel(k),
            size: CORNER,
            anchor: 'end',
            mono: true,
            cls: 'label',
          });
      }),
    );
  if (planning) {
    tShapes.push(
      ...boxRow(
        'plan',
        g.belowTop,
        (extra.plan ?? []).map((a) => ({
          text: a.kind,
          x: g.cx(a.day),
          role: (a.kind === 'buy' ? 'new' : 'found') as MarkRole,
        })),
        {
          w: CELL_W - 6,
          h: PLAN_H,
          label: 'plan',
          labelX: g.gridLeft - 10,
          size: 17,
          labelSize: 15,
        },
      ),
    );
  }

  const moveRoles = new Map<string, MarkRole>();
  for (const r of extra.reads ?? []) moveRoles.set(moveId(r.move), r.win ? 'active' : 'compare');
  const dia = diagram(cooldown, feeOf(settings), roles, moveRoles);

  // Trim the table's side margins (its minimum width) to what is drawn.
  const tLeft = g.gridLeft - 64 - 10;
  const tRight = g.gridRight + 10;
  const tw = tRight - tLeft;
  const th = table.bounds.h;
  const db = dia.bounds;
  /** Where the diagram and the table go: translations, and the bounds of the whole. */
  type Option = { bounds: Bounds; d: Pt; t: Pt };
  const H = Math.max(th, db.h);
  const W = Math.max(db.w, tw);
  const options: Option[] = [
    {
      // Side by side: the diagram left of the table, both centered on the same line.
      bounds: { x: 0, y: 0, w: db.w + GAP + tw, h: H },
      d: { x: -db.x, y: -db.y + (H - db.h) / 2 },
      t: { x: db.w + GAP - tLeft, y: (H - th) / 2 },
    },
    {
      // The diagram above the table (a phone).
      bounds: { x: 0, y: 0, w: W, h: db.h + th },
      d: { x: (W - db.w) / 2 - db.x, y: -db.y },
      t: { x: (W - tw) / 2 - tLeft, y: db.h },
    },
  ];
  const o = pickBest(options, stage);
  const shapes = [...translate(dia.shapes, o.d.x, o.d.y), ...translate(tShapes, o.t.x, o.t.y)];
  return { shapes, bounds: o.bounds, label: label(step, settings) };
}

function label(step: Step<SMState, SMExtra>, settings: SMSettings): string {
  const parts = [describe(step.state, settings)];
  const plan = step.extra?.plan;
  if (plan)
    parts.push(
      plan.length
        ? `Plan so far: ${plan.map((a) => `${a.kind} on day ${a.day}`).join(', ')}.`
        : 'No trades found yet.',
    );
  return parts.join(' ');
}
