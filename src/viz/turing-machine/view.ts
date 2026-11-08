/**
 * A Turing machine: the tape with the head and the state over it, a status line (the rule just
 * used, or how the run ended), and the last few configurations in Sipser's u q v notation. The
 * transition table (or the state diagram) goes beside them on a wide stage and under them on a
 * tall one (`placePanels`), with the rule just used lit. The diagram's layers run across on a
 * wide stage and down on a tall one, unless the other way (or, on a phone, across and a little
 * tighter) draws the whole picture clearly larger.
 *
 * The tape shows a window of 12 cells (10 on a phone). It stays put while everything the run
 * has touched fits in it, and otherwise follows the head in half-window steps (`tapeWindow`),
 * so the camera stays still while the head walks. Every part keeps its size through a run, so
 * nothing jumps. The trace is the shared configuration trace (src/layouts/trace.ts).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { drawAutomaton, layoutStates } from '../../layouts/automaton';
import { padBounds, placePanels, textWidth, translate, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import { drawTrace } from '../../layouts/trace';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import {
  ACCEPT,
  BLANK,
  BLANK_SHOWN,
  REJECT,
  halting,
  ruleFor,
  ruleText,
  type Config,
  type Machine,
  type Rule,
} from '../_turing/machine';
import {
  TRACE_KEEP,
  describe,
  DIAGRAM_MAX,
  inDiagram,
  showsDiagram,
  type TmExtra,
  type TmSettings,
  type TmState,
} from './model';

const HEAD_H = 46;
const TAPE_H = HEAD_H + CELL_H + 20;
const STATUS = 14;

/** Cells in the tape window: wide stages get more. */
export function tapeWidth(stage?: StageSize): number {
  return !stage || stage.w >= 1.4 * stage.h ? 12 : 10;
}

const shown = (a: string) => (a === BLANK ? BLANK_SHOWN : a);

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
  tooBig = false,
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
    y: y + 14,
    text: title,
    size: 14,
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
  const h = 46 + m.states.length * (ROW_H + GAP) - GAP;
  const note = `More than ${DIAGRAM_MAX} states: a table reads better.`;
  if (tooBig)
    out.push({
      kind: 'text',
      id: 'rule-note',
      x,
      y: y + h + 18,
      text: note,
      size: 13,
      cls: 'label',
    });
  return {
    x,
    y,
    w: Math.max(tableW, textWidth(title, 14), tooBig ? textWidth(note, 13) : 0),
    h: h + (tooBig ? 24 : 0),
  };
}

/** Sipser's arrow labels for the rules from p to q: "0,y→R" keeps the symbol, "1→y,L" writes y. */
export function arrowLabel(rules: Rule[]): string {
  const groups = new Map<string, string[]>();
  for (const r of rules) {
    const k = r.write === r.read ? `→${r.move}` : `→${shown(r.write)},${r.move}`;
    groups.set(k, [...(groups.get(k) ?? []), shown(r.read)]);
  }
  return [...groups].map(([k, reads]) => `${reads.join(',')}${k}`).join(' ');
}

/** The machine as an automaton for `drawAutomaton`: one arrow per pair of states. */
export function diagramOf(m: Machine): Automaton {
  const pairs = new Map<string, Rule[]>();
  for (const r of m.rules) {
    const k = `${r.from} ${r.to}`;
    pairs.set(k, [...(pairs.get(k) ?? []), r]);
  }
  const states = [...m.states, ...[ACCEPT, REJECT].filter((q) => inDiagram(m, q))];
  return {
    states,
    alphabet: [],
    start: m.start,
    accept: states.includes(ACCEPT) ? [ACCEPT] : [],
    moves: [...pairs.values()].map((rs) => ({
      from: rs[0]!.from,
      to: rs[0]!.to,
      on: arrowLabel(rs),
    })),
  };
}

/** The state diagram, the current state blue; layers run across on a wide stage, down on a phone. */
function drawDiagram(
  out: Shape[],
  m: Machine,
  x: number,
  y: number,
  roles: Map<string, MarkRole>,
  current: string | undefined,
  across: boolean,
  tight = 1,
): Bounds {
  const title = 'a→b,D: read a, write b, move D';
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
  const d = drawAutomaton(a, layoutStates(a, across, tight), {
    roles,
    look: (q) => (q === current ? 'current' : undefined),
  });
  const b = d.bounds;
  out.push(...translate(d.shapes, x - b.x, y + 30 - b.y));
  return { x, y, w: Math.max(b.w, textWidth(title, 14)), h: 30 + b.h };
}

export function view(step: Step<TmState, TmExtra>, settings: TmSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const c = state.config;
  const oneWay = settings.tape === 'one-way';
  const width = tapeWidth(stage);
  // Everything the run has touched: the cells visited and the input and what was written.
  const used = c
    ? {
        lo: Math.min(c.lo, c.cells.length ? c.first : c.lo),
        hi: Math.max(c.hi, c.cells.length ? c.first + c.cells.length - 1 : c.hi),
      }
    : { lo: 0, hi: 0 };
  const win = tapeWindow(c?.head ?? 0, width, { lo: oneWay ? 0 : undefined, used });
  drawTape(shapes, {
    x: 0,
    y: 0,
    cells: c?.cells ?? [],
    first: c?.first,
    from: win.from,
    to: win.to,
    head: c ? c.head : null,
    headLabel: c?.state,
    headRoom: 'label',
    index: true,
    left: oneWay,
    roles,
  });
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
  const trace = drawTrace(shapes, {
    x: 0,
    y: sy + 14,
    w: tapeW,
    title: 'Configurations (u q v)',
    lines: state.trace.map((l) => ({ n: l.n, index: l.moves, parts: [l.u, l.q, l.v], focus: 1 })),
    keep: TRACE_KEEP,
    roles,
  });
  const left = unionBounds(main, trace);
  const wide = !stage || stage.w >= 1.4 * stage.h;
  const diagram = showsDiagram(state.machine, settings);
  // A long chain of states on a phone reads larger across, a little tighter.
  const arrange = (across: boolean, tight = 1) => {
    const out = [...shapes];
    const table = placePanels(out, left, stage, (o, x, y) =>
      diagram
        ? drawDiagram(o, state.machine, x, y, roles, c?.state, across, tight)
        : drawRules(o, state.machine, x, y, roles, settings.rules === 'diagram'),
    );
    return { shapes: out, bounds: padBounds(unionBounds(left, table), 14) };
  };
  const ways = !diagram
    ? [arrange(wide)]
    : wide
      ? [arrange(true), arrange(false)]
      : [arrange(false), arrange(true), arrange(true, 0.8)];
  const best = pickLayout(stage, ways);
  const label = `${describe(state)}${c ? ` Status: ${st.text}.` : ''}`;
  return { ...best, label };
}
