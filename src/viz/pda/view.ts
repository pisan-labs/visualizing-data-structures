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
import {
  LABEL_SIZE,
  drawAutomaton,
  layoutStates,
  moveId,
  type StateLook,
} from '../../layouts/automaton';
import {
  beside,
  drawColumn,
  fitScore,
  padBounds,
  placePanels,
  textWidth,
  unionBounds,
  type PanelCell,
} from '../../layouts/graph';
import { CELL_W } from '../../layouts/tape';
import { drawTrace, type TraceLine } from '../../layouts/trace';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import {
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
const LINE_H = 18;
const NUM_W = 30;
const CHAR_W = 14 * 0.6;

/** The block the diagram's direction is chosen for: a 9-cell tape, the panel and the stack. */
const NOMINAL = { w: 9 * CELL_W + 24 + 44, h: TAPE_H + GAP + 22 + KEEP * 20 + GAP + 30 };

// ---------------------------------------------------------------------------------------------
// The diagram

/**
 * The machine as an automaton for drawAutomaton: one arrow per pair of states, labeled with
 * its longest move label, so the shared layout places a label as wide as the widest line.
 */
function diagramOf(p: Pda): { a: Automaton; pairs: Map<string, number[]> } {
  const pairs = new Map<string, number[]>();
  p.moves.forEach((m, i) => {
    const k = `${m.from}\u0000${m.to}`;
    pairs.set(k, [...(pairs.get(k) ?? []), i]);
  });
  const a: Automaton = {
    states: p.states,
    alphabet: [],
    start: p.start,
    accept: p.accept,
    moves: [...pairs].map(([k, ids]) => {
      const [from, to] = k.split('\u0000') as [string, string];
      const on = ids
        .map((i) => moveLabel(p.moves[i]!))
        .reduce((x, y) => (y.length > x.length ? y : x));
      return { from, to, on };
    }),
  };
  return { a, pairs };
}

/** Points along an arrow shape, for finding which side of it a label is on. */
function arrowPoints(s: Shape): { x: number; y: number }[] {
  if (s.kind !== 'arrow') return [];
  const out = [];
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const c = s.via ?? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 };
    out.push({
      x: (1 - t) ** 2 * s.x1 + 2 * (1 - t) * t * c.x + t ** 2 * s.x2,
      y: (1 - t) ** 2 * s.y1 + 2 * (1 - t) * t * c.y + t ** 2 * s.y2,
    });
  }
  return out;
}

/**
 * The state diagram with one label line per move. The shared layout places each arrow's label
 * as one line; a label of several lines grows away from its arrow (up above it, down below
 * it), so the line nearest the arrow stays where the layout put it.
 */
export function drawDiagram(
  p: Pda,
  across: boolean,
  roles: ReadonlyMap<string, MarkRole>,
  look?: (q: string) => StateLook | undefined,
): { shapes: Shape[]; bounds: Bounds } {
  const { a, pairs } = diagramOf(p);
  const d = drawAutomaton(a, layoutStates(a, across), { roles, look });
  const byId = new Map(d.shapes.map((s) => [s.id, s]));
  const labelIds = new Set(
    [...pairs.keys()].map((k) => `${moveId(...(k.split('\u0000') as [string, string]))}-t`),
  );
  const shapes = d.shapes.filter((s) => !labelIds.has(s.id));
  const boxes: Bounds[] = [d.bounds];
  for (const [k, ids] of pairs) {
    const [from, to] = k.split('\u0000') as [string, string];
    const id = moveId(from, to);
    const label = byId.get(`${id}-t`);
    if (!label || label.kind !== 'text') continue;
    const c = { x: label.x, y: label.y - LABEL_SIZE * 0.3 };
    const pts = arrowPoints(byId.get(id)!);
    const near = pts.reduce(
      (best, q) =>
        Math.hypot(q.x - c.x, q.y - c.y) < Math.hypot(best.x - c.x, best.y - c.y) ? q : best,
      pts[0] ?? c,
    );
    const dx = c.x - near.x;
    const dy = c.y - near.y;
    const grow = ((ids.length - 1) * LINE_H) / 2;
    const cy = Math.abs(dy) >= Math.abs(dx) ? c.y + Math.sign(dy || -1) * grow : c.y;
    const arrowRole = roles.get(id);
    ids.forEach((i, k) => {
      const text = moveLabel(p.moves[i]!);
      const y = cy + (k - (ids.length - 1) / 2) * LINE_H;
      const lid = moveLineId(i);
      shapes.push({
        kind: 'text',
        id: lid,
        x: c.x,
        y: y + LABEL_SIZE * 0.3,
        text,
        size: LABEL_SIZE,
        anchor: 'middle',
        mono: true,
        cls: 'label',
        role: roles.get(lid) ?? (arrowRole && ids.length === 1 ? arrowRole : undefined),
      });
      const w = textWidth(text, LABEL_SIZE, true);
      boxes.push({ x: c.x - w / 2 - 2, y: y - LABEL_SIZE / 2 - 1, w: w + 4, h: LABEL_SIZE + 2 });
    });
  }
  return { shapes, bounds: unionBounds(...boxes) };
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

const acrossCache = new Map<string, boolean>();

/** Does the diagram draw larger across than down, with a block of the nominal size placed? */
function acrossFits(p: Pda, stage: StageSize | undefined): boolean {
  const key = `${stage ? `${stage.w}x${stage.h}` : '-'}|${pdaKey(p)}`;
  const hit = acrossCache.get(key);
  if (hit !== undefined) return hit;
  const score = (across: boolean) => {
    const d = drawDiagram(p, across, new Map());
    const b = placePanels([], d.bounds, stage, (_out, x, y) => ({ x, y, ...NOMINAL }));
    return fitScore(padBounds(unionBounds(d.bounds, b), 14), stage);
  };
  const out = score(true) >= score(false);
  if (acrossCache.size > 300) acrossCache.clear();
  acrossCache.set(key, out);
  return out;
}

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

  const across = acrossFits(p, stage);
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
