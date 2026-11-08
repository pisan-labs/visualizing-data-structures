/**
 * A multi-tape machine and its one-tape simulation: the move counts of both side by side at
 * the top, the k tapes stacked with their heads (each tape in its own color), a status line
 * (the rule just used, or how the run ended), then the single tape S simulates them on, under
 * them, with a mark in each tape's color on the cell under that tape's head, and S's status.
 * The rules sit beside on a wide stage and under on a tall one, in as many columns as draw the
 * picture largest.
 *
 * Every tape is the shared tape (src/layouts/tape.ts): a window of 12 cells (10 on a phone)
 * per tape, held still while the touched cells fit. The single tape wraps onto up to three
 * rows of that width, as many as the run will need (`room`), so it keeps its size while it
 * grows; a longer tape shows the window around S's head.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { padBounds, placePanels, textWidth, unionBounds } from '../../layouts/graph';
import { CELL_H, CELL_W, drawTape, tapeWindow } from '../../layouts/tape';
import type { Bounds, Scene, Shape } from '../../render/scene';
import {
  BLANK_SHOWN,
  halting,
  ruleText,
  shown,
  type MtConfig,
  type MtMachine,
  type Sim,
} from './machine';
import { TAPE_ROLES, describe, type MtExtra, type MtSettings, type MtState } from './model';

const LABEL_W = 22;
const HEAD_ROOM = 26;
const TAPE_GAP = 6;
const INDEX_H = 20;
const MAX_ROWS = 3;
const COUNT_SIZE = 14;
const STATUS_SIZE = 13;

/** Cells per tape window: wide stages get more. */
export function cellsWide(stage?: StageSize): number {
  return !stage || stage.w >= 1.4 * stage.h ? 12 : 10;
}

/** Rows the single tape takes: enough for `room` cells, at most three. */
export const simRows = (room: number, width: number) =>
  Math.max(1, Math.min(MAX_ROWS, Math.ceil(room / width)));

const count = (n: number) => n.toLocaleString('en-US');
const plural = (n: number, w: string) => `${count(n)} ${w}${n === 1 ? '' : 's'}`;

interface Status {
  text: string;
  role?: MarkRole;
  label?: boolean;
}

/** The k-tape machine's line: the rule of the move, or how the run ended. */
function status(c: MtConfig | null, extra: MtExtra): Status {
  if (!c) return { text: 'No word on the tapes yet.', label: true };
  if (extra.capped)
    return { text: `still running after ${plural(c.moves, 'move')}`, role: 'active' };
  if (halting(c.state)) {
    const n = `after ${plural(c.moves, 'move')}`;
    if (extra.stuck) return { text: `no rule: reject ${n}`, role: 'error' };
    return c.state === 'accept'
      ? { text: `accept ${n}`, role: 'found' }
      : { text: `reject ${n}`, role: 'error' };
  }
  if (extra.rule && extra.phase !== 'read') return { text: ruleText(extra.rule) };
  return { text: `in ${c.state}, after ${plural(c.moves, 'move')}`, label: true };
}

/** The single tape's line: where S is in simulating the move. */
function simStatus(s: MtState, extra: MtExtra): Status {
  const sim = s.sim;
  const c = s.config;
  if (!sim || !c) return { text: 'Run or simulate a word to fill the single tape.', label: true };
  const seen = (extra.seen ?? []).map((a) => (a === null ? '?' : shown(a))).join(', ');
  const n = plural(sim.moves, 'move');
  if (extra.capped) return { text: `still running after ${n}`, role: 'active' };
  if (
    halting(c.state) &&
    (extra.phase === 'back' || extra.stuck || extra.mode === 'run' || !extra.phase)
  )
    return c.state === 'accept'
      ? { text: `S accepts after ${n}`, role: 'found' }
      : { text: `S rejects after ${n}`, role: 'error' };
  switch (extra.phase) {
    case 'format':
      return { text: `formatted: ${sim.cells.length} cells, ${n}`, label: true };
    case 'read':
      return { text: `scanning right, read ${seen}` };
    case 'found':
      return { text: `read ${seen} at the last #: ${plural(extra.cost ?? 0, 'move')} so far` };
    case 'write':
      return { text: `scanning left: tape ${(extra.tape ?? 0) + 1} updated` };
    case 'shift':
      return { text: `tape ${(extra.tape ?? 0) + 1} grew: shifted the rest right` };
    case 'back':
      return { text: `move ${c.moves} took S ${plural(extra.cost ?? 0, 'move')}` };
  }
  return { text: `kept up with M: ${n} in all`, label: true };
}

const statusShape = (
  id: string,
  y: number,
  st: Status,
  roles: ReadonlyMap<string, MarkRole>,
): Shape => ({
  kind: 'text',
  id,
  x: 0,
  y,
  text: st.text,
  size: STATUS_SIZE,
  mono: !st.label,
  weight: st.role ? 'bold' : undefined,
  cls: st.label ? 'label' : undefined,
  role: roles.get(id) ?? st.role,
});

/** "q0 1|0,_ → q1 -,$ S,R" with ␣ for the blank in the symbols. */
export function ruleLine(line: string): string {
  const w = line.split(' ');
  if (w[0] === 'start') return line;
  const sym = (t: string) => t.replace(/_/g, BLANK_SHOWN);
  const rest = w.slice(3);
  return [w[0], sym(w[1]!), '→', rest[0], ...rest.slice(1, -1).map(sym), rest.at(-1)].join(' ');
}

const RULE_SIZE = 12;
const RULE_H = 20;
const RULE_GAP = 3;

/** The rules as written, in `cols` columns (down the first, then the next), the one in use lit. */
function drawRules(
  out: Shape[],
  m: MtMachine,
  x: number,
  y: number,
  roles: ReadonlyMap<string, MarkRole>,
  cols: number,
): Bounds {
  const title = 'Rules: state reads → next writes moves';
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
  const texts = m.lines.map(ruleLine);
  const colW = Math.max(...texts.map((t) => textWidth(t, RULE_SIZE, true))) + 14;
  const per = Math.ceil(texts.length / cols);
  const top = y + 24;
  texts.forEach((t, j) => {
    const cx = x + Math.floor(j / per) * (colW + 10);
    const cy = top + (j % per) * (RULE_H + RULE_GAP);
    const id = `rule-${j}`;
    const role = roles.get(id);
    out.push({ kind: 'rect', id, x: cx, y: cy, w: colW, h: RULE_H, r: 4, cls: 'live', role });
    out.push({
      kind: 'text',
      id: `${id}-t`,
      x: cx + 7,
      y: cy + RULE_H / 2 + 4.5,
      text: t,
      size: RULE_SIZE,
      mono: true,
      role: roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
    });
  });
  const w = Math.min(cols, texts.length) * (colW + 10) - 10;
  return {
    x,
    y,
    w: Math.max(w, textWidth(title, 13)),
    h: 24 + per * (RULE_H + RULE_GAP) - RULE_GAP,
  };
}

/** S's marks: a dot over the symbol (Sipser) or a line under it, in each tape's color. */
function drawMarks(
  out: Shape[],
  sim: Sim,
  rows: { from: number; to: number; y: number }[],
  settings: MtSettings,
  roles: ReadonlyMap<string, MarkRole>,
) {
  sim.dots.forEach((d, i) => {
    const row = rows.find((r) => d >= r.from && d < r.to);
    if (!row) return;
    const id = `sim-dot-${i + 1}`;
    const role = roles.get(id) ?? TAPE_ROLES[i];
    const cx = (d - row.from + 0.5) * CELL_W;
    const top = row.y + HEAD_ROOM;
    out.push(
      settings.mark === 'dot'
        ? { kind: 'circle', id, x: cx, y: top + 6.5, r: 3, cls: 'arrowhead', role }
        : {
            kind: 'rect',
            id,
            x: cx - 9,
            y: top + CELL_H - 7,
            w: 18,
            h: 2.5,
            r: 1,
            cls: 'arrowhead',
            role,
          },
    );
  });
}

export function view(step: Step<MtState, MtExtra>, settings: MtSettings, stage?: StageSize): Scene {
  const { state, extra = {} } = step;
  const m = state.machine;
  const c = state.config;
  const sim = state.sim;
  // Each tape's head in its own color, unless the step marks it.
  const roles = new Map<string, MarkRole>();
  c?.tapes.forEach((t, i) => {
    roles.set(`t${i + 1}-head`, TAPE_ROLES[i]!);
    roles.set(`t${i + 1}-${t.head}`, TAPE_ROLES[i]!);
  });
  for (const mk of step.marks) roles.set(mk.id, mk.role);
  const shapes: Shape[] = [];
  const width = cellsWide(stage);
  const tapeW = width * CELL_W;

  // The two counts, side by side.
  const sMoves = sim?.moves ?? 0;
  const per = c && c.moves ? ` (${count(Math.round(sMoves / c.moves))} a move)` : '';
  shapes.push(
    {
      kind: 'text',
      id: 'count-m',
      x: 0,
      y: 15,
      text: `M: ${plural(c?.moves ?? 0, 'move')}`,
      size: COUNT_SIZE,
      weight: 'bold',
      role: roles.get('count-m'),
    },
    {
      kind: 'text',
      id: 'count-s',
      x: tapeW,
      y: 15,
      text: `S: ${plural(sMoves, 'move')}${per}`,
      size: COUNT_SIZE,
      weight: 'bold',
      anchor: 'end',
      role: roles.get('count-s'),
    },
  );

  // The k tapes.
  let y = 26;
  for (let i = 0; i < m.k; i++) {
    const t = c?.tapes[i];
    const win = tapeWindow(t?.head ?? 0, width, {
      lo: 0,
      used: { lo: 0, hi: t ? Math.max(t.hi, t.cells.length - 1) : 0 },
    });
    shapes.push({
      kind: 'text',
      id: `t${i + 1}-label`,
      x: -10,
      y: y + HEAD_ROOM + CELL_H / 2 + 5,
      text: String(i + 1),
      size: 14,
      weight: 'bold',
      anchor: 'end',
      cls: 'label',
    });
    drawTape(shapes, {
      id: `t${i + 1}`,
      x: 0,
      y,
      cells: t?.cells ?? [],
      from: win.from,
      to: win.to,
      head: t ? t.head : null,
      headRoom: 'head',
      left: true,
      roles,
    });
    y += HEAD_ROOM + CELL_H + TAPE_GAP;
  }
  const st = status(c, extra);
  shapes.push(statusShape('status', y + 12, st, roles));
  y += 26;

  // The single tape, on as many rows as the run needs.
  shapes.push({
    kind: 'text',
    id: 'sim-title',
    x: 0,
    y: y + 13,
    text: `S, on one tape: ${settings.mark === 'dot' ? 'a dot' : 'a line'} marks each head`,
    size: 13,
    cls: 'label',
    role: roles.get('sim-title'),
  });
  y += 20;
  const nRows = simRows(Math.max(state.room, sim?.cells.length ?? 0), width);
  const span = nRows * width;
  const win = sim
    ? tapeWindow(sim.head, span, { lo: 0, used: { lo: 0, hi: sim.cells.length - 1 } })
    : { from: 0, to: span };
  const pitch = HEAD_ROOM + CELL_H + INDEX_H;
  shapes.push({
    kind: 'text',
    id: 'sim-label',
    x: -10,
    y: y + HEAD_ROOM + CELL_H / 2 + 5,
    text: 'S',
    size: 14,
    weight: 'bold',
    anchor: 'end',
    cls: 'label',
  });
  drawTape(shapes, {
    id: 'sim',
    x: 0,
    y,
    cells: sim?.cells ?? [],
    from: win.from,
    to: win.to,
    rows: { width, pitch },
    head: sim ? sim.head : null,
    headRoom: 'head',
    index: true,
    left: true,
    roles,
  });
  const rows = Array.from({ length: nRows }, (_, r) => ({
    from: win.from + r * width,
    to: win.from + (r + 1) * width,
    y: y + r * pitch,
  }));
  y += nRows * pitch;
  if (sim) drawMarks(shapes, sim, rows, settings, roles);
  const sst = simStatus(state, extra);
  shapes.push(statusShape('sim-status', y + 10, sst, roles));
  y += 16;
  const main: Bounds = { x: -LABEL_W, y: 0, w: tapeW + LABEL_W, h: y };

  // The rules in 1 to 3 columns, beside or under: fewer columns unless more draw clearly larger.
  const candidates: { shapes: Shape[]; bounds: Bounds }[] = [];
  for (let cols = 1; cols <= Math.min(3, m.lines.length); cols++) {
    const scratch: Shape[] = [];
    const at = placePanels(scratch, main, stage, (out, x, yy) =>
      drawRules(out, m, x, yy, roles, cols),
    );
    candidates.push({ shapes: scratch, bounds: unionBounds(main, at) });
  }
  const best = pickBest(candidates, stage);
  shapes.push(...best.shapes);
  const label = `${describe(state)}${c ? ` Status: ${st.text}. Single tape: ${sst.text}.` : ''}`;
  return { shapes, bounds: padBounds(best.bounds, 14), label };
}
