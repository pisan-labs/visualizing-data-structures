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
import { STATE_R, drawAutomaton, layoutStates, type Pt } from '../../layouts/automaton';
import { padBounds, placePanels, textWidth, translate, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import {
  shapesBounds,
  type Bounds,
  type Scene,
  type Shape,
  type TextShape,
} from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import {
  ACCEPT,
  BLANK,
  BLANK_SHOWN,
  REJECT,
  cellAt,
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
  return !stage || stage.w >= 1.4 * stage.h ? 12 : 10;
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
    w: Math.max(tableW, textWidth(title, 13), tooBig ? textWidth(note, 13) : 0),
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

const LABEL = 15;

/**
 * The shared state-diagram layout centres each label a little off its arrow, which suits
 * labels like "a,b". A Turing machine's labels ("1→y,L") are longer, so here a label beside
 * a steep arrow starts just clear of the line, a loop's label sits clear of the loop, and a
 * label that still overlaps a state or an earlier label moves further from its arrow.
 */
export function tidyLabels(shapes: Shape[], pos: Record<string, Pt>): void {
  type Box = { x1: number; y1: number; x2: number; y2: number };
  const boxOf = (t: TextShape): Box => {
    const w = t.text.length * LABEL * 0.6;
    const x1 = t.anchor === 'start' ? t.x : t.anchor === 'end' ? t.x - w : t.x - w / 2;
    return { x1: x1 - 2, y1: t.y - LABEL * 0.8, x2: x1 + w + 2, y2: t.y + LABEL * 0.25 };
  };
  const hit = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
  const placed: Box[] = Object.values(pos).map((p) => ({
    x1: p.x - STATE_R,
    y1: p.y - STATE_R,
    x2: p.x + STATE_R,
    y2: p.y + STATE_R,
  }));
  const arrows = new Map(shapes.filter((x) => x.kind === 'arrow').map((x) => [x.id, x]));
  for (const t of shapes) {
    const m = /^m-(\w+)-(\w+)-t$/.exec(t.id);
    const arrow = m && arrows.get(t.id.slice(0, -2));
    if (!m || t.kind !== 'text' || !arrow || arrow.kind !== 'arrow') continue;
    const loop = m[1] === m[2];
    const from: Pt = loop
      ? pos[m[1]!]!
      : arrow.via
        ? {
            x: (arrow.x1 + arrow.x2) / 4 + arrow.via.x / 2,
            y: (arrow.y1 + arrow.y2) / 4 + arrow.via.y / 2,
          }
        : { x: (arrow.x1 + arrow.x2) / 2, y: (arrow.y1 + arrow.y2) / 2 };
    const dx = t.x - from.x;
    const dy = t.y - LABEL * 0.35 - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const away = { x: dx / len, y: dy / len };
    if (Math.abs(away.x) > 0.7) {
      t.anchor = away.x > 0 ? 'start' : 'end';
      t.x = from.x + Math.sign(away.x) * (loop ? STATE_R * 2.2 + 4 : 6);
    }
    // Try further out, then slid along the arrow either way, and keep the first spot that is free.
    const along = { x: -away.y, y: away.x };
    const home = { x: t.x, y: t.y };
    const tries = [0, 1, 2, 3, 4, 5].flatMap((k) =>
      [
        [k, 0],
        [k, 1],
        [k, -1],
      ].map(([out, side]) => ({
        x: home.x + away.x * 8 * out! + along.x * 10 * (k + 1) * side!,
        y: home.y + away.y * 8 * out! + along.y * 10 * (k + 1) * side!,
      })),
    );
    const free = tries.find((p) => !placed.some((b) => hit(b, boxOf({ ...t, ...p }))));
    if (free) Object.assign(t, free);
    placed.push(boxOf(t));
  }
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
): Bounds {
  const title = 'a→b,D: read a, write b, move D';
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
  const a = diagramOf(m);
  const d = drawAutomaton(a, layoutStates(a, across), {
    roles,
    look: (q) => (q === current ? 'current' : undefined),
  });
  tidyLabels(d.shapes, layoutStates(a, across).pos);
  const b = shapesBounds(d.shapes, 2)!;
  out.push(...translate(d.shapes, x - b.x, y + 30 - b.y));
  return { x, y, w: Math.max(b.w, textWidth(title, 13)), h: 30 + b.h };
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
  const wide = !stage || stage.w >= 1.4 * stage.h;
  const table = placePanels(shapes, left, stage, (out, x, y) =>
    showsDiagram(state.machine, settings)
      ? drawDiagram(out, state.machine, x, y, roles, c?.state, wide)
      : drawRules(out, state.machine, x, y, roles, settings.rules === 'diagram'),
  );
  const label = `${describe(state)}${c ? ` Status: ${st.text}.` : ''}`;
  return { shapes, bounds: padBounds(unionBounds(left, table), 14), label };
}
