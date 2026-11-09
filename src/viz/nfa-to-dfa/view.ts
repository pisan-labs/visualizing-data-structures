/**
 * The subset construction: the NFA, the DFA growing beside or under it, and the table of
 * subsets (each DFA state, its NFA states, and its move on each symbol), beside or under both.
 *
 * During a run the NFA shows the set being worked on in blue, the moves followed for M in blue,
 * the states of M in green and what ε-moves add in teal. The DFA's states keep the places they
 * have in the finished DFA, so nothing moves as it grows; the dead state ∅ has a dashed
 * outline. In the table, → marks the start state and * an accept state.
 *
 * Arrangement: the diagrams run across (a laptop) or down (a phone), the DFA goes under or
 * beside the NFA, and the table under or beside both, whichever draws largest on the stage
 * (or on both a laptop and a phone when there is no stage). The choice is made from the
 * finished DFA and table, so it holds through a run.
 *
 * On a narrow stage a long table may show only a window of WINDOW_ROWS rows (windowRows):
 * the row being worked on and those after it, the rows the step marks always among them, with
 * "rows i–j of n" beside its header.
 */
import { pickBest } from '../../layouts/arrange';
import type { Mark, MarkRole, StageSize, Step } from '../../engine/types';
import {
  drawAutomaton,
  layoutFromLayers,
  layoutStates,
  type StateLayout,
} from '../../layouts/automaton';
import {
  below,
  beside,
  padBounds,
  placePanels,
  textWidth,
  translate,
  unionBounds,
} from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { setName, stateLetter, type Automaton } from '../_automata/automaton';
import { automatonKey } from '../_automata/page';
import { drawGrid, gridWidths } from '../_automata/panels';
import {
  DFA_PREFIX,
  MAX_ALL,
  allSubsets,
  describe,
  describeRun,
  finalDfa,
  type ConvRun,
  type NdExtra,
  type NdSettings,
  type NfaState,
  type SubsetMode,
} from './model';

const CAPTION = 15;
/**
 * A DFA this large may also be drawn with its states closer together, when that draws the
 * text larger on the stage (a 16-state DFA and its table on a laptop).
 */
const TIGHT_FROM = 8;
const TIGHT = 0.72;

/** The DFA's layout: breadth-first layers, or (all subsets) one layer per subset size. */
function dfaLayout(
  nfa: Automaton,
  dfa: Automaton,
  mode: SubsetMode,
  across: boolean,
  tight = 1,
): StateLayout {
  if (mode === 'reachable') return layoutStates(dfa, across, tight);
  // The DFA's states are A, B, C, ... in the order allSubsets lists the subsets.
  const bySize: string[][] = [];
  allSubsets(nfa.states).forEach((s, i) => (bySize[s.length] ??= []).push(stateLetter(i)));
  return layoutFromLayers(
    bySize.filter((l) => l.length),
    across,
    tight,
  );
}

/** The rows a table window shows, for a table of more than LONG rows. */
const WINDOW_ROWS = 6;
const LONG = 10;
const WINDOW_SIZE = 15;

/**
 * The rows a step must show: those its marks name, and the first row not done yet (the one
 * being worked on, or next). None once every row is done.
 */
function anchors(r: ConvRun, marks: readonly Mark[]): number[] {
  const at = new Map(r.rows.map((row, i) => [row.name, i]));
  const out = marks.flatMap((m) => {
    const row = /^tbl-(.+)-(name|set|on-.+)$/.exec(m.id)?.[1];
    const i = row === undefined ? undefined : at.get(row);
    return i === undefined ? [] : [i];
  });
  const next = r.rows.findIndex((row) => !r.done.includes(row.name));
  if (next >= 0) out.push(next);
  return [...new Set(out)].sort((x, y) => x - y);
}

/**
 * The rows (indices, in order) a window of `size` shows: from the first anchor on, or the last
 * rows when that runs past the end. When the anchors are further apart than that (the row
 * being worked on, and a new row at the end), the first anchor, the other anchors and as many
 * of the last rows as fill the window.
 */
export function windowRows(r: ConvRun, marks: readonly Mark[], size: number): number[] {
  const n = r.rows.length;
  const a = anchors(r, marks);
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);
  const tail = Math.max(0, n - size);
  if (!a.length) return range(tail, n);
  if (a.at(-1)! - a[0]! < size) {
    const from = Math.min(a[0]!, tail);
    return range(from, Math.min(n, from + size));
  }
  const keep = new Set(a);
  for (let i = n - 1; i >= 0 && keep.size < size; i--) keep.add(i);
  return [...keep].sort((x, y) => x - y);
}

/** "rows 8, 12–16 of 16", beside the header of a table window (rows counted from 1). */
export function windowText(rows: readonly number[], n: number): string {
  const runs: string[] = [];
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1] === rows[j]! + 1) j++;
    runs.push(i === j ? `${rows[i]! + 1}` : `${rows[i]! + 1}–${rows[j]! + 1}`);
    i = j + 1;
  }
  return `rows ${runs.join(', ')} of ${n}`;
}

interface Frame {
  /** The NFA runs across; the DFA too, unless `turned`. */
  across: boolean;
  turned: boolean;
  /** The table's rows shown at once, or 0 for all of them. */
  window: number;
  /** Both diagrams' spacing (layoutFromLayers). */
  tight: number;
  /** Where the DFA's shapes move to. */
  dx: number;
  dy: number;
  /** The table's top left corner. */
  tx: number;
  ty: number;
  widths: number[];
  bounds: Bounds;
}

function tableColumns(nfa: Automaton, dfa: Automaton, sets: Record<string, string[]>) {
  const names = dfa.states.map((q) => `→*${q}`);
  return gridWidths([
    ['DFA', ...names],
    ['NFA states', ...Object.values(sets).map(setName)],
    ...nfa.alphabet.map((c) => [c, ...dfa.states]),
  ]);
}

function caption(shapes: Shape[], id: string, text: string, b: Bounds) {
  shapes.push({ kind: 'text', id, x: b.x, y: b.y - 8, text, size: CAPTION, cls: 'label' });
}

const captioned = (b: Bounds): Bounds => ({ ...b, y: b.y - 8 - CAPTION, h: b.h + 8 + CAPTION });

const frames = new Map<string, Frame>();

function arrange(nfa: Automaton, mode: SubsetMode, stage?: StageSize): Frame {
  const key = `${automatonKey(nfa)}|${mode}|${stage ? `${stage.w}x${stage.h}` : '-'}`;
  const hit = frames.get(key);
  if (hit) return hit;
  const { dfa, sets } = finalDfa(nfa, mode);
  const widths = tableColumns(nfa, dfa, sets);
  const candidates: Frame[] = [];
  const tights = dfa.states.length >= TIGHT_FROM ? [1, TIGHT] : [1];
  // A narrow stage may show a window of a long table's rows.
  const shown = stage && stage.w < stage.h && dfa.states.length > LONG ? [0, WINDOW_ROWS] : [0];
  const tableW = widths.reduce((a, b) => a + b + 3, -3);
  const noteW = textWidth(windowText([8, 10, 11], dfa.states.length), WINDOW_SIZE) + 10;
  for (const window of shown)
    for (const tight of tights)
      for (const across of [true, false])
        for (const turned of window ? [false, true] : [false]) {
          const nb = captioned(drawAutomaton(nfa, layoutStates(nfa, across, tight)).bounds);
          const db = captioned(
            drawAutomaton(dfa, dfaLayout(nfa, dfa, mode, across !== turned, tight), {
              prefix: DFA_PREFIX,
            }).bounds,
          );
          const grid = (out: Shape[], x: number, y: number) => {
            const b = drawGrid(out, {
              id: 'tbl',
              x,
              y,
              cols: [],
              head: [],
              widths,
              rows: [],
              reserve: window || dfa.states.length,
            });
            return window ? { ...b, w: tableW + noteW } : b;
          };
          const push = (dx: number, dy: number, table: Bounds, diagrams: Bounds) =>
            candidates.push({
              window,
              across,
              turned,
              tight,
              dx,
              dy,
              tx: table.x,
              ty: table.y,
              widths,
              bounds: unionBounds(diagrams, table),
            });
          for (const under of [false, true]) {
            const dx = under ? nb.x - db.x : beside(nb, 40) - db.x;
            const dy = under ? below(nb, 24) - db.y : nb.y - db.y;
            const diagrams = unionBounds(nb, { ...db, x: db.x + dx, y: db.y + dy });
            push(dx, dy, placePanels([], diagrams, stage, grid), diagrams);
          }
          // A table window beside the NFA, and the DFA under both.
          if (window) {
            const table = grid([], beside(nb, 30), nb.y);
            const top = unionBounds(nb, table);
            const dx = nb.x - db.x;
            const dy = below(top, 24) - db.y;
            push(dx, dy, table, unionBounds(nb, { ...db, x: db.x + dx, y: db.y + dy }));
          }
        }
  const best = pickBest(candidates, stage);
  if (frames.size > 300) frames.clear();
  frames.set(key, best);
  return best;
}

function drawNfa(nfa: Automaton, f: Frame, roles: Map<string, MarkRole>) {
  return drawAutomaton(nfa, layoutStates(nfa, f.across, f.tight), { roles });
}

export function view(
  step: Step<NfaState, NdExtra>,
  settings: NdSettings,
  stage?: StageSize,
): Scene {
  const nfa = step.state.nfa;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  if (!r) {
    // The NFA runs the way a run would draw it, so its states stay put when Convert starts.
    const mode = settings.subsets === 'all' && nfa.states.length <= MAX_ALL ? 'all' : 'reachable';
    const d = drawNfa(nfa, arrange(nfa, mode, stage), roles);
    return { shapes: d.shapes, bounds: padBounds(d.bounds, 14), label: describe(step.state) };
  }
  const mode = r.mode;
  const f = arrange(nfa, mode, stage);
  const shapes: Shape[] = [];

  const n = drawNfa(nfa, f, roles);
  shapes.push(...n.shapes);
  caption(shapes, 'cap-nfa', 'NFA', n.bounds);

  shapes.push(...translate(drawDfa(nfa, r, f, roles), f.dx, f.dy));
  const { dfa } = finalDfa(nfa, mode);
  const db = drawAutomaton(dfa, dfaLayout(nfa, dfa, mode, f.across !== f.turned, f.tight), {
    prefix: DFA_PREFIX,
  }).bounds;
  caption(shapes, 'cap-dfa', 'DFA', { ...db, x: db.x + f.dx, y: db.y + f.dy });

  const shown = f.window ? windowRows(r, step.marks, f.window) : r.rows.map((_, i) => i);
  if (shown.length < r.rows.length)
    shapes.push({
      kind: 'text',
      id: 'tbl-window',
      x: f.tx + f.widths.reduce((a, b) => a + b + 3, -3) + 10,
      y: f.ty + 15,
      text: windowText(shown, r.rows.length),
      size: WINDOW_SIZE,
      cls: 'label',
    });
  drawGrid(shapes, {
    id: 'tbl',
    x: f.tx,
    y: f.ty,
    cols: ['name', 'set', ...nfa.alphabet.map((c) => `on-${c}`)],
    head: ['DFA', 'NFA states', ...nfa.alphabet],
    widths: f.widths,
    rows: shown
      .map((i) => r.rows[i]!)
      .map((row) => {
        const dim = r.unreachable?.includes(row.name);
        const mark = `${row.name === r.start ? '→' : ''}${r.accept.includes(row.name) ? '*' : ''}`;
        return {
          key: row.name,
          cells: [
            { text: `${mark}${row.name}`, dim },
            { text: setName(row.set), dim },
            ...nfa.alphabet.map((c) => ({
              text: r.moves.find((m) => m.from === row.name && m.on === c)?.to ?? '',
              dim,
            })),
          ],
        };
      }),
    reserve: f.window || dfa.states.length,
    roles,
  });
  return {
    shapes,
    bounds: padBounds(f.bounds, 14),
    label: `${describe(step.state)} ${describeRun(nfa, r)}`,
  };
}

/**
 * The DFA so far: the finished DFA, drawing only the states and moves found, each where it is
 * in the finished drawing.
 */
function drawDfa(nfa: Automaton, r: ConvRun, f: Frame, roles: Map<string, MarkRole>): Shape[] {
  const { dfa, sets } = finalDfa(nfa, r.mode);
  const known = new Set(r.rows.map((row) => row.name));
  const found = new Set(r.moves.map((m) => `${m.from} ${m.on} ${m.to}`));
  return drawAutomaton(
    { ...dfa, accept: r.accept },
    dfaLayout(nfa, dfa, r.mode, f.across !== f.turned, f.tight),
    {
      prefix: DFA_PREFIX,
      roles,
      look: (q) =>
        sets[q]?.length === 0 ? 'dead' : r.unreachable?.includes(q) ? 'dim' : undefined,
      edge: (p) => (r.unreachable?.includes(p) ? 'dim' : undefined),
      show: {
        state: (q) => known.has(q),
        move: (m) => found.has(`${m.from} ${m.on} ${m.to}`),
        start: r.start !== undefined,
      },
    },
  ).shapes;
}
