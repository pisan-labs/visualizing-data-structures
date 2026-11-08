/**
 * The expression and the word on top, the NFA under them, and a block of panels beside or under
 * the NFA: the step counters, and either the backtracker's stack of choices (a match) or the
 * chart of steps against n (grow).
 *
 * The NFA is the picture regex-to-nfa lays out for Thompson's construction (pictures() in
 * src/viz/_automata/thompson-layout.ts: a star's repeat arrow above its body, its skip arrow below),
 * drawn by the shared drawAutomaton. The backtracker lights the one state it is visiting; the
 * simulation lights its whole set.
 *
 * Arrangement: the view tries each picture of the NFA (one row, wrapped rows, read downward),
 * the tape on one row or two, and the panels beside the NFA or under it, side by side or one
 * under the other, and keeps the one drawn largest on the stage. Every size it compares holds
 * for a whole operation (the stack panel keeps room for STACK_SHOWN choices, the chart for every
 * n, the tape for the longest word), so nothing jumps mid-run.
 *
 * Ids: "rx" the expression; the tape's "tape-<i>" cells ("tape-head" the head, "tape-label",
 * "tape-empty"); the diagram's "s-q0", "m-q0-q1", "start" (src/layouts/automaton.ts); "cnt-..." the
 * counters (drawGrid); "stk-<k>" the k-th choice from the bottom of the stack, "stk-base",
 * "stk-h" and "stk-n" under it; "ch-..." the chart: "ch-bt-<n>" and "ch-nfa-<n>" the bars.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickLayout } from '../../layouts/arrange';
import { drawAutomaton, fixedLayout, type StateLook } from '../../layouts/automaton';
import { clearOfButtons, padBounds, textWidth, unionBounds } from '../../layouts/graph';
import { CELL_W, drawTape } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { drawGrid, gridWidths, GRID_ROW } from '../_automata/panels';
import { pairKey, pictures, type Picture } from '../_automata/thompson-layout';
import { CAP } from './engines';
import {
  describe,
  fmt,
  STACK_SHOWN,
  type EngExtra,
  type EngSettings,
  type EngState,
} from './model';

const GAP = 24;
const LABEL_W = 40;
const RX_H = 26;
const TAPE_H = 26 + 36;
const TAPE_ROW_GAP = 8;
const EMPTY_W = 150;

// The counters: a small table, one row per engine.
const CNT_COLS = ['e', 's', 'v'];
const CNT_HEAD = ['', 'steps', 'answer'];
const CNT_W = gridWidths([
  ['backtracking', 'NFA simulation'],
  ['steps', fmt(CAP)],
  ['answer', 'gave up', 'accept', 'reject'],
]);
const CNT_BOX = { w: CNT_W.reduce((a, b) => a + b + 3, -3), h: 22 + 2 * (GRID_ROW + 3) - 3 };

// The stack of choices.
const STK_ROW = 28;
const STK_W = 112;
/** Under the slots: the base line, the label and the count. */
const STK_FOOT = 44;
const STK_BOX = { w: STK_W + 30, h: STACK_SHOWN * STK_ROW + STK_FOOT };

// The chart: steps on a log scale (one band per power of ten, up to the cap) against n.
const DECADES = Math.round(Math.log10(CAP));
const DECADE_H = 34;
const PLOT_H = DECADES * DECADE_H;
const SLOT = 22;
const BAR_W = 8;
const AXIS_W = 46;
const KEY_H = 26;
/** Wide enough for the bars (and the word "cap" after them) and for the key over them. */
const chartBox = (limit: number) => ({
  w: AXIS_W + Math.max(limit * SLOT + 40, 300),
  h: KEY_H + PLOT_H + 40,
});

type Part = { w: number; h: number };
type Side = 'right' | 'below';
type Flow = 'col' | 'row';

interface Plan {
  pic: Picture;
  /** Tape cells per row. */
  per: number;
  rows: number;
  side: Side;
  flow: Flow;
  bounds: Bounds;
  /** Where things go, in the picture's own coordinates. */
  rx: { x: number; y: number };
  tape: { x: number; y: number };
  parts: { x: number; y: number }[];
}

/** Tape cells this state reserves room for: the longest word of the operation. */
function tapeCells(s: EngState): number {
  if (s.mode === 'grow' && s.growth) return s.growth.limit * s.growth.unit.length;
  // A match keeps one cell past the word, where the head stops at the end.
  return s.word.length + (s.mode === 'match' ? 1 : 0);
}

function tapeSize(cells: number, per: number, rows: number, empty: boolean): Part {
  return {
    w: LABEL_W + Math.max(1, Math.min(per, cells)) * CELL_W + (empty ? EMPTY_W : 0),
    h: rows * TAPE_H + (rows - 1) * TAPE_ROW_GAP,
  };
}

/** The block's parts, in order: the counters, then the stack or the chart. */
function partsOf(s: EngState): Part[] {
  if (s.mode === 'match') return [CNT_BOX, STK_BOX];
  if (s.mode === 'grow' && s.growth) return [CNT_BOX, chartBox(s.growth.limit)];
  return [];
}

/** Panels beside the NFA start this much lower when the view does not know the stage. */
const DROP = 34;

function plan(
  s: EngState,
  pic: Picture,
  per: number,
  rows: number,
  side: Side,
  flow: Flow,
  stage?: StageSize,
): Plan {
  const b = pic.bounds;
  const cells = tapeCells(s);
  const tape = tapeSize(cells, per, rows, s.word === '');
  const rxW = textWidth(`R = ${s.text}`, 17, true);
  const mainW = Math.max(b.w, tape.w, rxW);
  const top = b.y - GAP - tape.h - 10 - RX_H;
  const rx = { x: b.x, y: top };
  const tapeAt = { x: b.x + LABEL_W, y: top + RX_H + 10 };
  const parts = partsOf(s);
  const main: Bounds = { x: b.x, y: top, w: mainW, h: b.y + b.h - top };
  const at: { x: number; y: number }[] = [];
  const x0 = side === 'right' ? b.x + mainW + GAP : b.x;
  const y0 = side === 'right' ? top : b.y + b.h + GAP;
  let x = x0;
  let y = y0;
  let w = 0;
  let h = 0;
  for (const p of parts) {
    at.push({ x, y });
    w = Math.max(w, x + p.w - x0);
    h = Math.max(h, y + p.h - y0);
    if (flow === 'col') y += p.h + 14;
    else x += p.w + GAP;
  }
  const boxes: Bounds[] = [main];
  if (parts.length) {
    // Keep the panels clear of the stage's zoom buttons in the top right corner.
    let block: Bounds = { x: x0, y: y0, w, h };
    if (stage) block = clearOfButtons(block, main, stage);
    else if (side === 'right') block = { ...block, y: block.y + DROP };
    for (const a of at) a.y += block.y - y0;
    boxes.push(block);
  }
  return {
    pic,
    per,
    rows,
    side,
    flow,
    bounds: padBounds(unionBounds(...boxes), 12),
    rx,
    tape: tapeAt,
    parts: at,
  };
}

/** The arrangement drawn largest on this stage; with no stage, the first (one row, panels right). */
function choose(s: EngState, stage?: StageSize): Plan {
  const pics = pictures(s.frags, 'thompson', `|${s.text}`);
  const cells = tapeCells(s);
  const tapes = cells > 9 ? [1, 2] : [1];
  const sides: [Side, Flow][] = partsOf(s).length
    ? [
        ['right', 'col'],
        ['below', 'row'],
        ['below', 'col'],
        ['right', 'row'],
      ]
    : [['right', 'col']];
  const options: Plan[] = [];
  for (const pic of pics)
    for (const rows of tapes)
      for (const [side, flow] of sides)
        options.push(plan(s, pic, Math.ceil(cells / rows), rows, side, flow, stage));
  return pickLayout(stage, options);
}

export function view(
  step: Step<EngState, EngExtra>,
  _settings: EngSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const p = choose(s, stage);
  const shapes: Shape[] = [];

  shapes.push({
    kind: 'text',
    id: 'rx',
    x: p.rx.x,
    y: p.rx.y + 19,
    text: `R = ${s.text}`,
    size: 17,
    mono: true,
    weight: 'bold',
  });

  drawWord(shapes, s, p, roles);

  // The NFA, lit by the engine at work.
  const lit = new Set<string>();
  if (s.phase === 'bt' && s.bt) lit.add(s.bt.q);
  if ((s.phase === 'nfa' || s.phase === 'done') && s.sim) for (const q of s.sim.set) lit.add(q);
  if (s.phase === 'done' && !s.sim && s.bt) lit.add(s.bt.q);
  const used = new Set((step.extra?.used ?? []).map((m) => pairKey(m.from, m.to)));
  const look = (q: string): StateLook | undefined => (lit.has(q) ? 'current' : undefined);
  const d = drawAutomaton(s.nfa, fixedLayout(p.pic.pos, p.pic.across), {
    roles,
    look,
    edge: (a, b) => (used.has(pairKey(a, b)) ? 'used' : undefined),
    route: (a, b) => p.pic.paths[pairKey(a, b)],
  });
  shapes.push(...d.shapes);

  const [cntAt, panelAt] = p.parts;
  if (cntAt) drawCounters(shapes, s, cntAt, roles);
  if (panelAt && s.mode === 'match') drawStack(shapes, s, panelAt, roles);
  if (panelAt && s.mode === 'grow') drawChart(shapes, s, panelAt, roles);

  return { shapes, bounds: p.bounds, label: describe(s) };
}

/** The word as a tape, with the head where the engine at work is. */
function drawWord(shapes: Shape[], s: EngState, p: Plan, roles: Map<string, MarkRole>) {
  const w = s.word;
  const n = w.length;
  let head: number | null = null;
  let read = 0;
  if (s.phase === 'bt' && s.bt) {
    head = s.bt.at;
    read = s.bt.at;
  } else if (s.phase === 'nfa' && s.sim) {
    head = Math.min(s.sim.read, n);
    read = s.sim.read;
  }
  const cells = s.mode === 'match' ? n + 1 : n;
  shapes.push({
    kind: 'text',
    id: 'tape-label',
    x: p.tape.x - 10,
    y: p.tape.y + 26 + 36 / 2 + 6,
    text: 'w =',
    size: 15,
    anchor: 'end',
    mono: true,
    cls: 'label',
  });
  // A long word wraps onto rows of p.per cells.
  if (cells)
    drawTape(shapes, {
      id: 'tape',
      x: p.tape.x,
      y: p.tape.y,
      cells: [...w],
      to: Math.min(cells, p.rows * p.per),
      rows: { width: p.per, pitch: TAPE_H + TAPE_ROW_GAP },
      head,
      headRoom: 'head',
      read,
      roles,
      blank: ' ',
    });
  if (!n)
    shapes.push({
      kind: 'text',
      id: 'tape-empty',
      x: p.tape.x + (cells ? CELL_W : 0) + 10,
      y: p.tape.y + 26 + 36 / 2 + 6,
      text: 'ε, the empty word',
      size: 16,
      mono: true,
    });
}

const answerRole = (v: string | null | undefined): MarkRole | undefined =>
  v === 'accept' ? 'found' : v === 'reject' ? 'error' : v === 'stopped' ? 'compare' : undefined;

const answerText = (v: string | null | undefined) => (v === 'stopped' ? 'gave up' : (v ?? ''));

function drawCounters(
  shapes: Shape[],
  s: EngState,
  at: { x: number; y: number },
  roles: Map<string, MarkRole>,
) {
  let bt: { steps: string; v: string | null } = { steps: '', v: null };
  let nfa: { steps: string; v: string | null } = { steps: '', v: null };
  if (s.mode === 'grow' && s.growth) {
    const last = s.growth.rows.at(-1);
    if (last) {
      bt = { steps: fmt(last.bt), v: last.btResult };
      nfa = { steps: fmt(last.nfa), v: last.nfaResult };
    }
  } else {
    if (s.bt) bt = { steps: fmt(s.bt.steps), v: s.bt.result };
    if (s.sim) nfa = { steps: fmt(s.sim.steps), v: s.sim.result };
  }
  const working = (who: 'bt' | 'nfa'): MarkRole | undefined =>
    s.mode === 'match' && s.phase === who ? 'active' : undefined;
  drawGrid(shapes, {
    id: 'cnt',
    x: at.x,
    y: at.y,
    cols: CNT_COLS,
    head: CNT_HEAD,
    widths: CNT_W,
    rows: [
      {
        key: 'bt',
        cells: [
          { text: 'backtracking', role: working('bt') },
          { text: bt.steps },
          { text: answerText(bt.v), role: answerRole(bt.v) },
        ],
      },
      {
        key: 'nfa',
        cells: [
          { text: 'NFA simulation', role: working('nfa') },
          { text: nfa.steps },
          { text: answerText(nfa.v), role: answerRole(nfa.v) },
        ],
      },
    ],
    roles,
  });
}

/**
 * The stack of choices, newest on top, on a base line with its label under it. Only the top
 * STACK_SHOWN fit; the count under the label says how many there are in all.
 */
function drawStack(
  shapes: Shape[],
  s: EngState,
  at: { x: number; y: number },
  roles: Map<string, MarkRole>,
) {
  const bt = s.bt;
  const depth = bt?.depth ?? 0;
  const shown = bt?.stack ?? [];
  const lo = depth - shown.length;
  const bottom = at.y + STACK_SHOWN * STK_ROW;
  shown.forEach((c, j) => {
    const id = `stk-${lo + j}`;
    const y = bottom - (j + 1) * STK_ROW;
    const role = roles.get(id);
    shapes.push({
      kind: 'rect',
      id,
      x: at.x,
      y: y + 2,
      w: STK_W,
      h: STK_ROW - 4,
      r: 4,
      cls: 'live',
      role,
      enterFrom: { x: at.x, y: at.y },
    });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: at.x + STK_W / 2,
      y: y + STK_ROW / 2 + 5,
      text: `(${c.q}, ${c.at})`,
      size: 15,
      anchor: 'middle',
      mono: true,
      role: role === 'new' ? 'new' : undefined,
    });
  });
  shapes.push({
    kind: 'arrow',
    id: 'stk-base',
    x1: at.x - 6,
    y1: bottom + 2,
    x2: at.x + STK_W + 6,
    y2: bottom + 2,
    head: 'none',
  });
  shapes.push({
    kind: 'text',
    id: 'stk-h',
    x: at.x,
    y: bottom + 20,
    text: 'stack (q, i)',
    size: 14,
    cls: 'label',
  });
  shapes.push({
    kind: 'text',
    id: 'stk-n',
    x: at.x,
    y: bottom + 38,
    text: depth
      ? `${depth} ${depth === 1 ? 'choice' : 'choices'}${lo > 0 ? `, top ${shown.length} shown` : ''}`
      : 'empty',
    size: 13,
    cls: 'label',
  });
}

/** Height of a bar for this many steps, on the log scale. */
const barH = (v: number) => Math.max(2, (Math.log10(Math.max(1, v)) / DECADES) * PLOT_H);

const DECADE_TEXT = ['1', '10', '100', '1k', '10k', '100k'];

function drawChart(
  shapes: Shape[],
  s: EngState,
  at: { x: number; y: number },
  roles: Map<string, MarkRole>,
) {
  const g = s.growth!;
  const x0 = at.x + AXIS_W;
  const y0 = at.y + KEY_H + PLOT_H;
  const right = x0 + g.limit * SLOT;
  // The key.
  const key = (id: string, x: number, role: MarkRole, text: string) => {
    shapes.push({ kind: 'rect', id, x, y: at.y + 4, w: 14, h: 14, r: 2, cls: 'live', role });
    shapes.push({
      kind: 'text',
      id: `${id}-t`,
      x: x + 20,
      y: at.y + 16,
      text,
      size: 13,
      cls: 'label',
    });
  };
  key('ch-key-bt', x0, 'g2', 'backtracking');
  key('ch-key-nfa', x0 + 150, 'g1', 'NFA simulation');
  // Powers of ten, the cap at the top.
  for (let k = 0; k <= DECADES; k++) {
    const y = y0 - k * DECADE_H;
    if (k > 0)
      shapes.push({
        kind: 'arrow',
        id: `ch-grid-${k}`,
        x1: x0,
        y1: y,
        x2: right,
        y2: y,
        head: 'none',
        dashed: true,
        role: k === DECADES ? 'error' : undefined,
        opacity: k === DECADES ? undefined : 0.3,
        z: -2,
      });
    shapes.push({
      kind: 'text',
      id: `ch-grid-${k}-t`,
      x: x0 - 6,
      y: y + 4,
      text: DECADE_TEXT[k] ?? `1e${k}`,
      size: 11,
      anchor: 'end',
      mono: true,
      cls: 'label',
    });
  }
  shapes.push({
    kind: 'text',
    id: 'ch-cap',
    x: right + 4,
    y: y0 - PLOT_H + 4,
    text: 'cap',
    size: 12,
    cls: 'label',
  });
  shapes.push({ kind: 'arrow', id: 'ch-axis-x', x1: x0, y1: y0, x2: right, y2: y0, head: 'none' });
  shapes.push({
    kind: 'arrow',
    id: 'ch-axis-y',
    x1: x0,
    y1: y0,
    x2: x0,
    y2: y0 - PLOT_H,
    head: 'none',
  });
  for (let n = 1; n <= g.limit; n++)
    shapes.push({
      kind: 'text',
      id: `ch-n-${n}`,
      x: x0 + (n - 0.5) * SLOT,
      y: y0 + 15,
      text: String(n),
      size: 11,
      anchor: 'middle',
      mono: true,
      cls: 'label',
    });
  shapes.push({
    kind: 'text',
    id: 'ch-axis-t',
    x: x0,
    y: y0 + 34,
    text: `steps (log scale) for ${g.unit.length > 1 ? `(${g.unit})` : g.unit}ⁿ`,
    size: 12,
    cls: 'label',
  });
  for (const r of g.rows) {
    const sx = x0 + (r.n - 1) * SLOT + (SLOT - 2 * BAR_W - 2) / 2;
    const bar = (id: string, x: number, v: number, role: MarkRole) => {
      const h = barH(v);
      shapes.push({
        kind: 'rect',
        id,
        x,
        y: y0 - h,
        w: BAR_W,
        h,
        r: 1,
        cls: 'live',
        role: roles.get(id) ?? role,
        enterFrom: { x, y: y0 },
      });
    };
    bar(`ch-bt-${r.n}`, sx, r.bt, r.btResult === 'stopped' ? 'error' : 'g2');
    bar(`ch-nfa-${r.n}`, sx + BAR_W + 2, r.nfa, 'g1');
  }
}
