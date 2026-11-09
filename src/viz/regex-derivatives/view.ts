/**
 * Regular expression derivatives: the expression r on top, then the last operation's table.
 *
 * - Derive: one row per part of r, smallest parts first (the order the rules need them), with
 *   ν and the part's derivative. Rows still to come show their part, faded.
 * - Match: one row per symbol read, with the derivative so far and its ν, and the verdict.
 * - Build DFA: the DFA of derivatives, growing as states and moves are found, beside or under a
 *   table of its states: the expression each stands for, ν, and where each symbol goes.
 *
 * Every table keeps room for all its rows from the operation's first step (at most ROWS, the
 * window sliding down as rows arrive), so nothing jumps. Long expressions are cut with … in the
 * table; the narration has them whole.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import { pickBest } from '../../layouts/arrange';
import { drawAutomaton, layoutStates, stateId } from '../../layouts/automaton';
import { below, beside, padBounds, textWidth, translate, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { drawGrid, drawVerdict, gridWidths, type GridCell } from '../_automata/panels';
import type { UnionSign } from '../_automata/regex';
import { show, wordText } from './derive';
import {
  MIN_PREFIX,
  describe,
  dfaAutomaton,
  type DfaPanel,
  type RdSettings,
  type RdState,
} from './model';

const ROWS = 9;
/** The most characters of an expression a table cell shows: fewer on a phone (set by view). */
let maxChars = 26;
const TITLE = 13;

const fit = (t: string, max = maxChars) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

function title(out: Shape[], id: string, text: string, x: number, y: number) {
  out.push({ kind: 'text', id, x, y: y + 13, text, size: TITLE, cls: 'label' });
}

/** The rows of a table that are on view: a window of ROWS that slides as rows arrive. */
function windowOf(total: number, shown: number): { from: number; to: number } {
  if (total <= ROWS) return { from: 0, to: total };
  const from = Math.max(0, Math.min(shown - ROWS, total - ROWS));
  return { from, to: from + ROWS };
}

function drawTable(
  out: Shape[],
  x: number,
  y: number,
  o: {
    head: string[];
    cols: string[];
    rows: { key: string; cells: GridCell[] }[];
    widths: string[][];
    note?: string;
    roles: ReadonlyMap<string, MarkRole>;
  },
): Bounds {
  const b = drawGrid(out, {
    id: 'row',
    x,
    y,
    cols: o.cols,
    head: o.head,
    widths: gridWidths(o.widths),
    rows: o.rows,
    reserve: Math.min(ROWS, o.rows.length),
    roles: o.roles,
  });
  if (o.note)
    out.push({
      kind: 'text',
      id: 'row-note',
      x,
      y: b.y + b.h + 16,
      text: o.note,
      size: 12,
      cls: 'label',
    });
  return { ...b, h: b.h + (o.note ? 22 : 0) };
}

function deriveBlock(out: Shape[], s: RdState, u: UnionSign, roles: ReadonlyMap<string, MarkRole>) {
  const p = s.panel!;
  if (p.kind !== 'derive') return { x: 0, y: 0, w: 0, h: 0 };
  title(out, 'panel-title', `d_${p.c} part by part, smallest parts first`, 0, 0);
  const win = windowOf(p.rows.length, p.shown);
  const rows = p.rows.slice(win.from, win.to).map((r, i) => {
    const k = win.from + i;
    const done = k < p.shown;
    return {
      key: String(k),
      cells: [
        { text: fit(r.text), dim: !done },
        { text: done ? (r.nu ? 'true' : 'false') : '', dim: !done },
        { text: done ? fit(show(r.d, u)) : '', dim: !done },
      ],
    };
  });
  const note =
    win.from > 0 || win.to < p.rows.length
      ? `rows ${win.from + 1} to ${win.to} of ${p.rows.length}`
      : undefined;
  const b = drawTable(out, 0, 22, {
    head: ['part', 'ν', `d_${p.c}`],
    cols: ['part', 'nu', 'd'],
    rows,
    widths: [
      ['part', ...p.rows.map((r) => fit(r.text))],
      ['false'],
      [`d_${p.c}`, ...p.rows.map((r) => fit(show(r.d, u)))],
    ],
    note,
    roles,
  });
  return unionBounds({ x: 0, y: 0, w: 10, h: 22 }, b);
}

function matchBlock(out: Shape[], s: RdState, u: UnionSign, roles: ReadonlyMap<string, MarkRole>) {
  const p = s.panel!;
  if (p.kind !== 'match') return { x: 0, y: 0, w: 0, h: 0 };
  title(out, 'panel-title', `Match ${wordText(p.word)}: one derivative per symbol`, 0, 0);
  const win = windowOf(p.rows.length, p.shown);
  const rows = p.rows.slice(win.from, win.to).map((r, i) => {
    const k = win.from + i;
    const done = k < p.shown;
    return {
      key: String(k),
      cells: [
        { text: k ? r.c : 'start', dim: !done },
        { text: done ? fit(show(r.r, u)) : '', dim: !done },
        { text: done ? (r.nu ? 'true' : 'false') : '', dim: !done },
      ],
    };
  });
  const b = drawTable(out, 0, 22, {
    head: ['read', 'r now', 'ν'],
    cols: ['c', 'd', 'nu'],
    rows,
    widths: [['start'], ['r now', ...p.rows.map((r) => fit(show(r.r, u)))], ['false']],
    roles,
  });
  const v = drawVerdict(out, 0, b.y + b.h + 14, p.verdict, roles);
  return unionBounds({ x: 0, y: 0, w: 10, h: 22 }, b, v);
}

/** The DFA's table: each state's expression, ν, and its move on each symbol. */
function dfaTable(out: Shape[], p: DfaPanel, u: UnionSign, roles: ReadonlyMap<string, MarkRole>) {
  title(out, 'panel-title', 'States: one per derivative', 0, 0);
  const moveOf = (q: string, c: string, upTo: number) =>
    p.moves.slice(0, upTo).find((m) => m.from === q && m.on === c)?.to ?? '';
  const rows = p.states.slice(0, Math.min(p.states.length, ROWS)).map((q, k) => {
    const done = k < p.found;
    return {
      key: q.name,
      cells: [
        { text: done ? q.name : '', role: done ? groupRole(k + 1) : undefined },
        { text: done ? fit(show(q.r, u)) : '' },
        { text: done ? (q.nu ? 'true' : 'false') : '' },
        ...p.alphabet.map((c) => ({ text: done ? moveOf(q.name, c, p.done) : '' })),
      ],
    };
  });
  const b = drawTable(out, 0, 22, {
    head: ['q', 'expression', 'ν', ...p.alphabet],
    cols: ['q', 'd', 'nu', ...p.alphabet.map((c) => `on-${c}`)],
    rows,
    widths: [
      ['q', ...p.states.map((q) => q.name)],
      ['expression', ...p.states.map((q) => fit(show(q.r, u)))],
      ['false'],
      ...p.alphabet.map((c) => [c, ...p.states.map((q) => q.name)]),
    ],
    note: p.states.length > ROWS ? `and ${p.states.length - ROWS} more` : undefined,
    roles,
  });
  return unionBounds({ x: 0, y: 0, w: 10, h: 22 }, b);
}

function dfaBlock(
  out: Shape[],
  p: DfaPanel,
  u: UnionSign,
  roles: ReadonlyMap<string, MarkRole>,
  stage?: StageSize,
) {
  const a = dfaAutomaton(p);
  const names = p.states.slice(0, p.found).map((q) => q.name);
  const groups = new Map(roles);
  p.states.forEach((q, k) => {
    const id = stateId(q.name, MIN_PREFIX);
    if (!roles.has(id)) groups.set(id, groupRole(k + 1));
  });
  const show = {
    state: (q: string) => names.includes(q),
    move: (m: { from: string; on: string; to: string }) =>
      p.moves.slice(0, p.done).some((x) => x.from === m.from && x.on === m.on && x.to === m.to),
  };
  const candidates = [true, false].flatMap((across) =>
    [false, true].map((side) => {
      const shapes: Shape[] = [];
      const tight = p.states.length > 5 ? 0.72 : 1;
      const d = drawAutomaton(a, layoutStates(a, across, tight), {
        prefix: MIN_PREFIX,
        roles: groups,
        show,
      });
      const t: Shape[] = [];
      const tb = dfaTable(t, p, u, roles);
      const dx = side ? beside(d.bounds, 30) - tb.x : d.bounds.x - tb.x;
      const dy = side ? d.bounds.y - tb.y : below(d.bounds, 22) - tb.y;
      shapes.push(...d.shapes, ...translate(t, dx, dy));
      return {
        shapes,
        bounds: unionBounds(d.bounds, { ...tb, x: tb.x + dx, y: tb.y + dy }),
      };
    }),
  );
  return pickBest(candidates, stage);
}

export function view(step: Step<RdState, unknown>, settings: RdSettings, stage?: StageSize): Scene {
  const s = step.state;
  const u = settings.union;
  maxChars = !stage || stage.w >= 1.4 * stage.h ? 26 : 18;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const shapes: Shape[] = [];
  const head = `r = ${s.text}`;
  shapes.push({
    kind: 'text',
    id: 'expr',
    x: 0,
    y: 18,
    text: head,
    size: 18,
    mono: true,
    weight: 'bold',
    role: roles.get('expr'),
  });
  const top: Bounds = { x: 0, y: 0, w: textWidth(head, 18, true), h: 26 };
  const p = s.panel;
  let block: { shapes: Shape[]; bounds: Bounds };
  if (!p) {
    const hint: Shape[] = [];
    hint.push({
      kind: 'text',
      id: 'hint',
      x: 0,
      y: 14,
      text: 'Derive a symbol, Match a word, or Build the DFA.',
      size: 14,
      cls: 'label',
    });
    block = { shapes: hint, bounds: { x: 0, y: 0, w: 330, h: 20 } };
  } else if (p.kind === 'dfa') block = dfaBlock([], p, u, roles, stage);
  else {
    const out: Shape[] = [];
    const b = p.kind === 'derive' ? deriveBlock(out, s, u, roles) : matchBlock(out, s, u, roles);
    block = { shapes: out, bounds: b };
  }
  const dy = below(top, 18) - block.bounds.y;
  const dx = -block.bounds.x;
  shapes.push(...translate(block.shapes, dx, dy));
  const bounds = unionBounds(top, {
    ...block.bounds,
    x: block.bounds.x + dx,
    y: block.bounds.y + dy,
  });
  return { shapes, bounds: padBounds(bounds, 14), label: describe(s, settings) };
}
