/**
 * A Turing machine: the tape with the head and the state over it, a status line (the rule just
 * used, or how the run ended), and the last few configurations in Sipser's u q v notation. The
 * transition table goes beside them on a wide stage and under them on a tall one
 * (`placePanels`), with the rule just used lit.
 *
 * The tape shows a window of 12 cells (10 on a phone). It stays put while everything the run
 * has touched fits in it, and otherwise follows the head in half-window steps (`tapeWindow`),
 * so the camera stays still while the head walks. Every part keeps its size through a run, so
 * nothing jumps.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { padBounds, placePanels, textWidth, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  ACCEPT,
  BLANK,
  BLANK_SHOWN,
  cellAt,
  halting,
  ruleFor,
  ruleText,
  type Config,
  type Machine,
} from '../_turing/machine';
import {
  TRACE_KEEP,
  describe,
  type TmExtra,
  type TmSettings,
  type TmState,
  type TraceLine,
} from './model';

const HEAD_H = 46;
const TAPE_H = HEAD_H + CELL_H + 20;
const STATUS = 14;
const LINE = 20;
const TRACE_SIZE = 14;
const NUM_W = 30;

/** Cells in the tape window: wide stages get more. */
export function tapeWidth(stage?: StageSize): number {
  if (!stage) return 12;
  return stage.w >= 1.4 * stage.h ? 12 : 10;
}

const shown = (a: string) => (a === BLANK ? BLANK_SHOWN : a);

/**
 * The cells to show. While everything the run has touched (the input, what was written, the
 * cells visited) fits in the first window with a spare cell beside it, the window stays put
 * for the whole run, however often the head sweeps back and forth. Past that, it follows the
 * head in half-window steps (`tapeWindow`).
 */
export function windowFor(
  c: Config | null,
  width: number,
  oneWay: boolean,
): { from: number; to: number } {
  const lo = oneWay ? 0 : -Infinity;
  const base = tapeWindow(0, width, lo);
  if (!c) return base;
  const left = Math.min(c.lo, c.cells.length ? c.first : c.lo);
  const right = Math.max(c.hi, c.cells.length ? c.first + c.cells.length - 1 : c.hi);
  const fits = (oneWay ? left >= base.from : left > base.from) && right < base.to - 1;
  return fits ? base : tapeWindow(c.head, width, lo);
}

/** A trace line cut to `max` characters around the state, with … where symbols are left out. */
export function fitLine(l: Pick<TraceLine, 'u' | 'q' | 'v'>, max: number): string {
  const join = (u: string, v: string) => (u ? `${u} ${l.q} ${v}` : `${l.q} ${v}`);
  if (join(l.u, l.v).length <= max) return join(l.u, l.v);
  const room = Math.max(2, max - l.q.length - 2);
  const vKeep = Math.max(1, Math.ceil(room / 2));
  const uKeep = Math.max(1, room - vKeep);
  const u = l.u.length > uKeep ? `…${l.u.slice(l.u.length - uKeep + 1)}` : l.u;
  const v = l.v.length > vKeep ? `${l.v.slice(0, vKeep - 1)}…` : l.v;
  return join(u, v);
}

function status(
  c: Config | null,
  extra: TmExtra,
): { text: string; role?: MarkRole; label?: boolean } {
  if (!c) return { text: 'No word on the tape yet.', label: true };
  if (extra.capped) return { text: `still running after ${c.moves} moves`, role: 'active' };
  if (halting(c.state)) {
    const n = `after ${c.moves} move${c.moves === 1 ? '' : 's'}`;
    if (extra.stuck) return { text: `no rule: reject ${n}`, role: 'error' };
    return c.state === ACCEPT
      ? { text: `accept ${n}`, role: 'found' }
      : { text: `reject ${n}`, role: 'error' };
  }
  if (extra.rule)
    return { text: `${ruleText(extra.rule)}${extra.bumped ? ': stays on cell 0' : ''}` };
  return { text: `move ${c.moves}, in ${c.state}`, label: true };
}

function drawTrace(
  out: Shape[],
  trace: TraceLine[],
  x: number,
  y: number,
  w: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  out.push({
    kind: 'text',
    id: 'trace-title',
    x,
    y: y + 13,
    text: 'Configurations (u q v)',
    size: 13,
    cls: 'label',
    role: roles.get('trace-title'),
  });
  const max = Math.floor((w - NUM_W) / (TRACE_SIZE * 0.6));
  trace.forEach((l, k) => {
    const id = `cfg-${l.n}`;
    const role = roles.get(id);
    const ly = y + 22 + 15 + k * LINE;
    out.push({
      kind: 'text',
      id: `${id}-n`,
      x: x + NUM_W - 8,
      y: ly,
      text: String(l.moves),
      size: 12,
      anchor: 'end',
      mono: true,
      cls: 'index',
    });
    out.push({
      kind: 'text',
      id,
      x: x + NUM_W,
      y: ly,
      text: fitLine(l, max),
      size: TRACE_SIZE,
      mono: true,
      role,
      opacity: role || k === trace.length - 1 ? undefined : 0.75,
    });
  });
  return { x, y, w, h: 22 + TRACE_KEEP * LINE };
}

const CELL_SIZE = 13;
const ROW_H = 25;
const GAP = 3;

/** The transition table: a row per state, a column per tape symbol, "q1 x R" in each cell. */
function drawRules(
  out: Shape[],
  m: Machine,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const text = (q: string, a: string) => {
    const r = ruleFor(m, q, a);
    return r ? `${r.to} ${shown(r.write)} ${r.move}` : '';
  };
  const labelW = Math.max(20, ...m.states.map((q) => textWidth(q, 14, true))) + 12;
  const colW = m.symbols.map((a) =>
    Math.max(32, ...m.states.map((q) => textWidth(text(q, a), CELL_SIZE, true) + 16)),
  );
  const title = 'δ(q, a): next state, write, move';
  out.push({
    kind: 'text',
    id: 'rule-title',
    x,
    y: y + 13,
    text: title,
    size: 13,
    cls: 'label',
    role: roles.get('rule-title'),
  });
  const top = y + 24;
  let cx = x + labelW;
  m.symbols.forEach((a, j) => {
    const w = colW[j]!;
    out.push({
      kind: 'text',
      id: `rule-h-${a}`,
      x: cx + (w - GAP) / 2,
      y: top + 15,
      text: shown(a),
      size: 15,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
      role: roles.get(`rule-h-${a}`),
    });
    cx += w;
  });
  m.states.forEach((q, i) => {
    const ry = top + 22 + i * (ROW_H + GAP);
    out.push({
      kind: 'text',
      id: `rule-r-${q}`,
      x,
      y: ry + ROW_H / 2 + 5,
      text: q,
      size: 14,
      weight: 'bold',
      mono: true,
      role: roles.get(`rule-r-${q}`),
    });
    let rx = x + labelW;
    m.symbols.forEach((a, j) => {
      const w = colW[j]! - GAP;
      const id = `rule-${q}-${a}`;
      const role = roles.get(id);
      const t = text(q, a);
      out.push({
        kind: 'rect',
        id,
        x: rx,
        y: ry,
        w,
        h: ROW_H,
        r: 4,
        cls: t ? 'live' : undefined,
        role,
      });
      if (t)
        out.push({
          kind: 'text',
          id: `${id}-t`,
          x: rx + w / 2,
          y: ry + ROW_H / 2 + 4.5,
          text: t,
          size: CELL_SIZE,
          anchor: 'middle',
          mono: true,
          role: roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
        });
      rx += colW[j]!;
    });
  });
  const tableW = labelW + colW.reduce((s, w) => s + w, 0) - GAP;
  return {
    x,
    y,
    w: Math.max(tableW, textWidth(title, 13)),
    h: 22 + m.states.length * (ROW_H + GAP) + 22,
  };
}

export function view(step: Step<TmState, TmExtra>, settings: TmSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const c = state.config;
  const oneWay = settings.tape === 'one-way';
  const width = tapeWidth(stage);
  const win = windowFor(c, width, oneWay);
  const cells = c ? Array.from({ length: Math.max(0, win.to) }, (_, i) => cellAt(c, i)) : [];
  drawTape(shapes, {
    x: 0,
    // Without a head, the cells sit where they will be once the head is drawn over them.
    y: c ? 0 : HEAD_H,
    cells,
    from: win.from,
    to: win.to,
    head: c ? c.head : null,
    headLabel: c?.state,
    index: true,
    left: oneWay,
    roles,
  });
  // drawTape shows cells left of 0 as blanks; a two-way tape can have symbols there.
  if (c && win.from < 0)
    for (const s of shapes) {
      const m = /^tape-(-\d+)-t$/.exec(s.id);
      if (!m || s.kind !== 'text') continue;
      const a = cellAt(c, Number(m[1]));
      if (a !== BLANK) {
        s.text = a;
        s.opacity = undefined;
      }
    }
  const tapeW = width * CELL_W;
  const main: Bounds = { x: oneWay ? -6 : 0, y: 0, w: tapeW + (oneWay ? 6 : 0), h: TAPE_H };

  const st = status(c, extra);
  const sy = TAPE_H + 22;
  shapes.push({
    kind: 'text',
    id: 'status',
    x: 0,
    y: sy,
    text: st.text,
    size: STATUS,
    mono: !st.label,
    weight: st.role ? 'bold' : undefined,
    cls: st.label ? 'label' : undefined,
    role: roles.get('status') ?? st.role,
  });
  const trace = drawTrace(shapes, state.trace, 0, sy + 14, tapeW, roles);
  const left = unionBounds(main, trace);
  const table = placePanels(shapes, left, stage, (out, x, y) =>
    drawRules(out, state.machine, x, y, roles),
  );
  const label = `${describe(state)}${c ? ` Status: ${st.text}.` : ''}`;
  return { shapes, bounds: padBounds(unionBounds(left, table), 14), label };
}
