/**
 * The busy beaver: the tape with the head and the state over it, a status line (the rule just
 * used, or how the run ended), the two counters (moves and 1s), and the space-time picture: the
 * last few tapes, one row per move, newest at the bottom, 1s filled, the head's cell outlined.
 * The rules (a table, or a state diagram for up to four states) go beside all that on a wide
 * stage and under it on a tall one (`placePanels`), with the rule just used lit.
 *
 * The tape shows a window of 12 cells (10 on a phone) that stays put while everything the run
 * has touched fits in it, and otherwise follows the head in half-window steps (`tapeWindow`); the
 * space-time rows use the same window, so each column sits under its tape cell.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { drawAutomaton, layoutStates, type LabelLine } from '../../layouts/automaton';
import { padBounds, placePanels, textWidth, translate, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton, Move } from '../_automata/automaton';
import { cellAt, run as runKit } from '../_turing/machine';
import { drawGrid, gridWidths } from '../_automata/panels';
import { HALT, kitMachine, ruleCode, type BbMachine } from './machines';
import {
  CAP,
  ROWS,
  describe,
  ones,
  ruleOf,
  showsDiagram,
  stateOf,
  type BbExtra,
  type BbSettings,
  type BbState,
} from './model';

const TAPE_H = 46 + CELL_H + 20;
const STATUS = 14;
const PITCH = 13;
const BAR_H = 9;

const spans = new WeakMap<BbMachine, { lo: number; hi: number }>();

/** The cells the head visits in a run from a blank tape, to the halt or the cap. */
function runSpan(m: BbMachine): { lo: number; hi: number } {
  let span = spans.get(m);
  if (!span) {
    const c = runKit(kitMachine(m), '', 'two-way', CAP).config;
    spans.set(m, (span = { lo: c.lo, hi: c.hi }));
  }
  return span;
}

/**
 * The tape window. When the whole run fits (16 cells on a wide stage, 14 on a phone), the window
 * shows all of it, with a spare cell on each side if there is room, and never moves. Otherwise
 * 12 cells (10 on a phone) follow the head.
 */
export function tapeFrame(s: BbState, stage?: StageSize): { from: number; to: number } {
  const wide = !stage || stage.w >= 1.4 * stage.h;
  const [min, max] = wide ? [12, 16] : [10, 14];
  const { lo, hi } = runSpan(s.machine);
  const cells = hi - lo + 1;
  const c = s.config;
  // A run past the cap (Run moves, again and again) may leave the run's first CAP moves' span.
  if (cells <= max && c.head >= lo && c.head <= hi) {
    const width = Math.max(min, Math.min(max, cells + 2));
    const from = lo - Math.floor((width - cells) / 2);
    return { from, to: from + width };
  }
  const used = {
    lo: Math.min(c.lo, c.cells.length ? c.first : c.lo),
    hi: Math.max(c.hi, c.cells.length ? c.first + c.cells.length - 1 : c.hi),
  };
  return tapeWindow(c.head, min, { used });
}

function status(s: BbState, extra: BbExtra): { text: string; role?: MarkRole } {
  const c = s.config;
  if (s.halted === 'none') {
    const a = cellAt(c, c.head) === '1' ? 1 : 0;
    return { text: `no rule for ${c.state} reading ${a}: stopped`, role: 'error' };
  }
  if (s.halted) return { text: `halted: ${c.moves} moves, ${ones(c)} ones`, role: 'found' };
  if (extra.repeat !== undefined)
    return { text: `same as move ${extra.repeat}: loops forever`, role: 'error' };
  if (extra.capped) return { text: `still running after ${c.moves} moves`, role: 'active' };
  if (extra.used) {
    const r = ruleOf(s.machine, extra.used.q, extra.used.read);
    return { text: `δ(${extra.used.q}, ${extra.used.read}) = ${ruleCode(r)}` };
  }
  return { text: `in ${c.state}, on a blank tape` };
}

function counter(out: Shape[], id: string, x: number, y: number, label: string, value: number) {
  const w = 104;
  out.push({ kind: 'rect', id, x, y, w, h: 30, r: 6, cls: 'live' });
  out.push({
    kind: 'text',
    id: `${id}-l`,
    x: x + 8,
    y: y + 20,
    text: label,
    size: 13,
    cls: 'label',
  });
  out.push({
    kind: 'text',
    id: `${id}-t`,
    x: x + w - 8,
    y: y + 21,
    text: value.toLocaleString('en-US'),
    size: 17,
    anchor: 'end',
    weight: 'bold',
    mono: true,
  });
  return w;
}

/** The space-time picture: one row per tape, under the tape window's cells. */
function drawHistory(
  out: Shape[],
  s: BbState,
  x: number,
  y: number,
  from: number,
  to: number,
): Bounds {
  out.push({
    kind: 'text',
    id: 'st-title',
    x,
    y: y + 13,
    text: 'Last tapes, one row per move (newest last)',
    size: 13,
    cls: 'label',
  });
  const top = y + 22;
  s.rows.forEach((row, k) => {
    const ry = top + (ROWS - s.rows.length + k) * PITCH;
    for (let i = from; i < to; i++) {
      const cx = x + (i - from) * CELL_W;
      if (row.cells[i - row.first] === '1')
        out.push({
          kind: 'rect',
          id: `st-${row.n}-${i}`,
          x: cx + 2,
          y: ry,
          w: CELL_W - 4,
          h: BAR_H,
          cls: 'wall',
          opacity: k === s.rows.length - 1 ? undefined : 0.75,
        });
    }
    if (row.head >= from && row.head < to)
      out.push({
        kind: 'rect',
        id: `st-${row.n}-h`,
        x: x + (row.head - from) * CELL_W + 0.5,
        y: ry - 1.5,
        w: CELL_W - 1,
        h: BAR_H + 3,
        r: 2,
        cls: 'ghost',
        role: k === s.rows.length - 1 ? 'active' : undefined,
      });
  });
  return { x, y, w: (to - from) * CELL_W, h: 22 + ROWS * PITCH };
}

/** The rule table: a row per state, "1RB" for write 1, move right, go to B. */
function drawRules(
  out: Shape[],
  m: BbMachine,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const title = 'Rules: write, move, next';
  out.push({
    kind: 'text',
    id: 'rule-title',
    x,
    y: y + 14,
    text: title,
    size: 14,
    cls: 'label',
    role: roles.get('rule-title'),
  });
  const code = (q: string, a: 0 | 1) => ruleCode(ruleOf(m, q, a)).replace('---', '—');
  const widths = gridWidths([
    ['q', ...m.states],
    ['on 0', ...m.states.map((q) => code(q, 0))],
    ['on 1', ...m.states.map((q) => code(q, 1))],
  ]);
  const b = drawGrid(out, {
    id: 'rule',
    x,
    y: y + 24,
    cols: ['q', '0', '1'],
    head: ['', 'on 0', 'on 1'],
    widths,
    rows: m.states.map((q) => ({
      key: q,
      cells: [{ text: q }, { text: code(q, 0) }, { text: code(q, 1) }],
    })),
    roles,
  });
  return { x, y, w: Math.max(b.w, textWidth(title, 14)), h: 24 + b.h };
}

/** The machine as an automaton for drawAutomaton: one arrow per pair of states, H included. */
function diagramOf(m: BbMachine): Automaton {
  const moves: Move[] = [];
  for (const q of m.states)
    m.table[q]!.forEach((r, a) => {
      if (r) moves.push({ from: q, to: r.next, on: `${a}→${r.write}${r.move}` });
    });
  const reached = moves.some((mv) => mv.to === HALT);
  const states = [...m.states, ...(reached ? [HALT] : [])];
  return { states, alphabet: [], start: m.states[0]!, accept: reached ? [HALT] : [], moves };
}

function drawDiagram(
  out: Shape[],
  m: BbMachine,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  current: string,
  across: boolean,
): Bounds {
  const title = 'a→bD: read a, write b, move D';
  out.push({
    kind: 'text',
    id: 'rule-title',
    x,
    y: y + 14,
    text: title,
    size: 14,
    cls: 'label',
    role: roles.get('rule-title'),
  });
  const a = diagramOf(m);
  const d = drawAutomaton(a, layoutStates(a, across), {
    roles,
    look: (q) => (q === current ? 'current' : undefined),
    label: (ms): LabelLine[] => ms.map((mv) => ({ text: mv.on })),
  });
  const b = d.bounds;
  out.push(...translate(d.shapes, x - b.x, y + 30 - b.y));
  return { x, y, w: Math.max(b.w, textWidth(title, 14)), h: 30 + b.h };
}

export function view(step: Step<BbState, BbExtra>, settings: BbSettings, stage?: StageSize): Scene {
  const { state: s, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const c = s.config;
  const win = tapeFrame(s, stage);
  const width = win.to - win.from;
  const q = stateOf(s);
  drawTape(shapes, {
    x: 0,
    y: 0,
    cells: c.cells,
    first: c.first,
    from: win.from,
    to: win.to,
    head: c.head,
    headLabel: q,
    headRoom: 'label',
    index: true,
    roles,
    blank: '0',
  });
  const tapeW = width * CELL_W;
  const st = status(s, extra);
  const sy = TAPE_H + 20;
  shapes.push({
    kind: 'text',
    id: 'status',
    x: 0,
    y: sy,
    text: st.text,
    size: STATUS,
    mono: true,
    weight: st.role ? 'bold' : undefined,
    role: roles.get('status') ?? st.role,
  });
  const cy = sy + 12;
  const w1 = counter(shapes, 'count-moves', 0, cy, 'moves', c.moves);
  counter(shapes, 'count-ones', w1 + 12, cy, 'ones', ones(c));
  const hist = drawHistory(shapes, s, 0, cy + 44, win.from, win.to);
  const main = unionBounds({ x: 0, y: 0, w: tapeW, h: TAPE_H }, hist);
  const diagram = showsDiagram(s.machine, settings);
  const wide = !stage || stage.w >= 1.4 * stage.h;
  const arrange = (across: boolean) => {
    const out = [...shapes];
    const panel = placePanels(out, main, stage, (o, x, y) =>
      diagram
        ? drawDiagram(o, s.machine, x, y, roles, q, across)
        : drawRules(o, s.machine, x, y, roles),
    );
    return { shapes: out, bounds: padBounds(unionBounds(main, panel), 14) };
  };
  const ways = diagram ? [arrange(wide), arrange(!wide)] : [arrange(wide)];
  const best = pickLayout(stage, ways);
  return { ...best, label: describe(s) };
}
