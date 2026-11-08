/**
 * The pushdown automaton: its state diagram, with every move labeled "a, X → β" (one line per
 * move, so an arrow with several moves has a small stack of labels), the states of the
 * configurations alive now in blue and the move just made highlighted. During a run a block of
 * panels goes beside the diagram or under it (placePanels): the input tape with the symbols
 * read greyed and the state over the head, the configurations (state, input left, stack), an
 * accept, reject or stopped badge, and the stack as a column, top up, with what was just
 * pushed in green. A batch test puts its table where the configurations go.
 *
 * The diagram runs across or down, whichever draws larger on the stage with a block of the
 * nominal size (with no stage, on both a laptop and a phone: fitScore), so the direction
 * depends only on the machine and the screen and stays put while runs come and go.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawAutomaton, layoutStates, type StateLook } from '../../layouts/automaton';
import {
  beside,
  drawColumn,
  padBounds,
  placePanels,
  unionBounds,
  type PanelCell,
} from '../../layouts/graph';
import { CELL_W } from '../../layouts/tape';
import { drawTrace, type TraceLine } from '../../layouts/trace';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton, Move } from '../_automata/automaton';
import {
  acrossFits,
  describeTest,
  drawInputTape,
  drawTestTable,
  drawVerdict,
  stack,
  tapeCells,
  verdictId,
} from '../_automata/panels';
import { moveLabel, pdaKey, type Pda } from '../_automata/pda';
import {
  KEEP,
  describe,
  describeRun,
  moveLineId,
  type Frame,
  type PdaExtra,
  type PdaSettings,
  type PdaShow,
  type PdaState,
  type PdaVerdict,
} from './model';

const TAPE_H = 46 + 36;
const GAP = 14;
const NUM_W = 30;
const CHAR_W = 14 * 0.6;

/** The block the diagram's direction is chosen for: a 9-cell tape, the panel and the stack. */
const NOMINAL = { w: 9 * CELL_W + 24 + 44, h: TAPE_H + GAP + 22 + KEEP * 20 + GAP + 30 };

// ---------------------------------------------------------------------------------------------
// The diagram

/**
 * The machine as an automaton for drawAutomaton: one move per move of the machine, labeled
 * "a, X → β", and the index of each in the machine.
 */
function diagramOf(p: Pda): { a: Automaton; index: Map<Move, number> } {
  const moves = p.moves.map((m) => ({ from: m.from, to: m.to, on: moveLabel(m) }));
  const a: Automaton = { states: p.states, alphabet: [], start: p.start, accept: p.accept, moves };
  return { a, index: new Map(moves.map((m, i) => [m, i])) };
}

/** The state diagram with one label line per move, each line marked by itself. */
export function drawDiagram(
  p: Pda,
  across: boolean,
  roles: ReadonlyMap<string, MarkRole>,
  look?: (q: string) => StateLook | undefined,
): { shapes: Shape[]; bounds: Bounds } {
  const { a, index } = diagramOf(p);
  return drawAutomaton(a, layoutStates(a, across), {
    roles,
    look,
    label: (ms) => ms.map((m) => ({ text: m.on, id: moveLineId(index.get(m)!) })),
  });
}

// ---------------------------------------------------------------------------------------------
// The panels

/** The stack, top up: the top `rows - 1` symbols and "+k" for the rest when it is deeper. */
function drawStack(
  out: Shape[],
  x: number,
  y: number,
  r: PdaShow | undefined,
  rows: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const st = r?.focus.stack ?? '';
  const n = st.length;
  // Bottom first; a cell is named by its height from the bottom, so a symbol keeps its cell.
  const cells: PanelCell[] = [...st].reverse().map((c, i) => ({
    key: String(i),
    text: c,
    role: i >= n - (r?.pushed ?? 0) ? 'new' : undefined,
  }));
  const shown =
    n > rows
      ? [{ key: 'more', text: `+${n - rows + 1}`, dim: true }, ...cells.slice(n - rows + 1)]
      : cells;
  return drawColumn(out, {
    id: 'stack',
    label: 'stack',
    cells: shown,
    x,
    y,
    rows,
    width: 44,
    empty: 'empty',
    roles,
  });
}

const traceW = (f: Frame) => Math.ceil(NUM_W + f.chars * CHAR_W + 8);

function drawLines(
  out: Shape[],
  x: number,
  y: number,
  r: PdaShow,
  w: number,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  const lines: TraceLine[] = r.lines.map((l) => ({
    n: l.n,
    index: l.index,
    parts: [l.config.state, r.word.slice(l.config.pos) || 'ε', l.config.stack || 'ε'],
    focus: 0,
  }));
  if (r.more) lines.push({ n: -1, index: '', parts: [`… and ${r.more} more`], focus: 0 });
  return drawTrace(out, {
    x,
    y,
    w,
    title: 'state, input left, stack',
    lines,
    keep: KEEP,
    roles,
  });
}

/** The accept or reject badge, or "stopped" when the search gave up at the cap. */
function drawBadge(
  out: Shape[],
  x: number,
  y: number,
  v: PdaVerdict | undefined,
  roles: ReadonlyMap<string, MarkRole>,
): Bounds {
  if (v !== 'stopped') return drawVerdict(out, x, y, v, roles);
  const w = 112;
  const role = roles.get(verdictId) ?? 'active';
  out.push({ kind: 'rect', id: verdictId, x, y, w, h: 30, r: 15, cls: 'live', role });
  out.push({
    kind: 'text',
    id: `${verdictId}-t`,
    x: x + w / 2,
    y: y + 21,
    text: '? stopped',
    size: 16,
    anchor: 'middle',
    weight: 'bold',
    role,
  });
  return { x, y, w, h: 30 };
}

// ---------------------------------------------------------------------------------------------
// The scene

export function view(
  step: Step<PdaState, PdaExtra>,
  _settings: PdaSettings,
  stage?: StageSize,
): Scene {
  const { state, extra = {} } = step;
  const p = state.machine;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const r = extra.run;
  const t = extra.test;
  const frame = extra.frame ?? r?.frame;

  let block: ((out: Shape[], x: number, y: number) => Bounds) | undefined;
  if (frame && (r || t)) {
    const tapeW = tapeCells(frame.room) * CELL_W;
    const w = Math.max(tapeW, traceW(frame));
    const left: ((out: Shape[], x: number, y: number) => Bounds)[] = [
      (out, x, y) =>
        r
          ? drawInputTape(out, x, y, {
              word: r.word,
              read: r.focus.pos,
              head: r.focus.pos,
              headLabel: r.focus.state,
              room: frame.room,
              roles: new Map<string, MarkRole>(
                r.verdict === 'reject' ? [['tape-head', 'error']] : [],
              ),
            })
          : { x, y, w: tapeW, h: TAPE_H },
    ];
    if (t) left.push((out, x, y) => drawTestTable(out, x, y, t, roles));
    else if (r) {
      left.push((out, x, y) => drawLines(out, x, y, r, w, roles));
      left.push((out, x, y) => drawBadge(out, x, y, r.verdict, roles));
    }
    const column = stack(left);
    block = (out, x, y) => {
      const b = column(out, x, y);
      const s = drawStack(out, beside(b, 24), y, r, frame.rows, roles);
      return unionBounds(b, s);
    };
  }

  const across = acrossFits(`pda|${pdaKey(p)}`, (dir) => drawDiagram(p, dir, new Map()).bounds, {
    stage,
    nominal: NOMINAL,
  });
  const live = new Set(r?.live ?? []);
  const dead = new Set(r?.dead ?? []);
  const d = drawDiagram(p, across, roles, (q) =>
    live.has(q) ? 'current' : dead.has(q) ? 'dead' : undefined,
  );
  const shapes = [...d.shapes];
  const boxes = [d.bounds];
  if (block) boxes.push(placePanels(shapes, d.bounds, stage, block));
  const label = [describe(state), t ? describeTest(t) : '', r ? describeRun(r) : '']
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: padBounds(unionBounds(...boxes), 14), label };
}
