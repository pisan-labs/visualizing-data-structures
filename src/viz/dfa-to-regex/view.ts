/**
 * State elimination: the GNFA, and a table of its labels beside or under it.
 *
 * The diagram keeps every state where it starts: the new start state s in a layer of its own
 * before the DFA's start, the DFA's states in breadth-first layers, and the new accept state f
 * in a layer after them. A ripped state simply goes. Labels get long, so an arrow shows at
 * most LABEL_MAX characters (a longer label ends in …), and the table lists every label in
 * full, wrapped, with R1 to R4 tagged while a pair is rewritten. A label the rule reads as ∅
 * (no loop, or no arrow yet) shows in the table as a dashed row.
 *
 * Arrangement: the diagram runs across (a laptop) or down (a phone), and the table goes beside
 * it or under it, whichever draws largest on the stage. The choice and the table's room are
 * worked out from the whole run (every step's diagram and table), so nothing jumps during it.
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { makeRng } from '../../engine/rng';
import {
  drawAutomaton,
  layers,
  layoutFromLayers,
  type StateLayout,
} from '../../layouts/automaton';
import { below, beside, padBounds, textWidth, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import type { Automaton } from '../_automata/automaton';
import { automatonKey } from '../_automata/page';
import { pickBest } from '../_automata/panels';
import { endNames, type Gnfa } from './gnfa';
import {
  arrowKey,
  describe,
  describeRun,
  ops,
  rowId,
  type DfaState,
  type DrExtra,
  type DrRun,
  type DrSettings,
  type Tag,
} from './model';

/** Characters an arrow's label shows on the diagram; the table has the rest. */
export const LABEL_MAX = 8;
/** Characters per line of a label in the table. */
const WRAP = 26;
const SIZE = 14;
const LINE = 17;
const ROW = 24;
const HEAD = 22;
const GAP = 3;

export const shortLabel = (t: string): string =>
  t.length <= LABEL_MAX ? t : `${t.slice(0, LABEL_MAX - 1)}…`;

/** A label's lines: at most WRAP characters each, broken after a ∪ where one is near the end. */
export function wrap(t: string, width = WRAP): string[] {
  const out: string[] = [];
  let rest = t;
  while (rest.length > width) {
    const cut = rest.lastIndexOf('∪', width - 1);
    const at = cut >= width / 2 ? cut + 1 : width;
    out.push(rest.slice(0, at));
    rest = rest.slice(at);
  }
  out.push(rest);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The whole run, for the frame

const runCache = new Map<string, DrRun[]>();

/** Every step's run of a Convert with these settings (none when Convert refuses). */
export function allRuns(dfa: Automaton, settings: DrSettings): DrRun[] {
  const key = `${settings.order}|${settings.simplify}|${automatonKey(dfa)}`;
  let hit = runCache.get(key);
  if (!hit) {
    hit = [];
    const gen = ops.convert.run({ dfa }, [], { settings, rng: makeRng(0) });
    for (let r = gen.next(); !r.done; r = gen.next()) if (r.value.extra?.run) hit.push(r.value.extra.run);
    if (runCache.size > 100) runCache.clear();
    runCache.set(key, hit);
  }
  return hit;
}

function gnfaLayout(dfa: Automaton, across: boolean): StateLayout {
  const { s, f } = endNames(dfa);
  return layoutFromLayers([[s], ...layers(dfa), [f]], across);
}

const asAutomaton = (g: Gnfa): Automaton => ({
  states: g.states,
  alphabet: [],
  start: g.start,
  accept: [g.accept],
  moves: g.arrows.map((a) => ({ from: a.from, to: a.to, on: shortLabel(a.text) })),
});

// ---------------------------------------------------------------------------------------------
// The label table

interface Row {
  p: string;
  q: string;
  tag?: Tag;
  lines: string[];
  ghost: boolean;
}

function tableRows(r: DrRun): Row[] {
  const at = (x: string) => r.g.states.indexOf(x);
  // Before merging, a pair can have an arrow per symbol: one row, "a,b" as the DFA writes it.
  const texts = new Map<string, string[]>();
  for (const a of r.g.arrows) {
    const k = arrowKey(a.from, a.to);
    texts.set(k, [...(texts.get(k) ?? []), a.text]);
  }
  const rows: Row[] = [...texts].map(([k, ts]) => {
    const [p, q] = k.split('>') as [string, string];
    return { p, q, tag: r.tags[k], lines: wrap(ts.join(',')), ghost: false };
  });
  for (const [p, q] of r.ghosts)
    rows.push({ p, q, tag: r.tags[arrowKey(p, q)], lines: ['∅'], ghost: true });
  return rows.sort((x, y) => at(x.p) - at(y.p) || at(x.q) - at(y.q));
}

const rowH = (row: Row) => ROW + (row.lines.length - 1) * LINE;
const tableH = (rows: Row[]) =>
  HEAD + Math.max(1, rows.length) * (ROW + GAP) - GAP + rows.reduce((n, x) => n + rowH(x) - ROW, 0);

interface Cols {
  tag: number;
  arrow: number;
  label: number;
}

function columns(dfa: Automaton): Cols {
  const { s, f } = endNames(dfa);
  const names = [s, f, ...dfa.states];
  const longest = Math.max(...names.map((n) => n.length));
  return {
    tag: textWidth('R4', SIZE, true) + 12,
    arrow: textWidth('→'.padStart(2 * longest + 1, 'x'), SIZE, true) + 14,
    label: textWidth('x'.repeat(WRAP), SIZE, true) + 14,
  };
}

const tableW = (c: Cols) => c.tag + c.arrow + c.label + 2 * GAP;

function drawTable(
  shapes: Shape[],
  x: number,
  y: number,
  c: Cols,
  rows: Row[],
  roles: ReadonlyMap<string, MarkRole>,
): void {
  const xs = [x, x + c.tag + GAP, x + c.tag + c.arrow + 2 * GAP];
  const head = (id: string, text: string, at: number) =>
    shapes.push({ kind: 'text', id, x: at + 6, y: y + HEAD - 7, text, size: 13, cls: 'label' });
  head('lab-h-a', 'arrow', xs[1]!);
  head('lab-h-l', 'label', xs[2]!);
  let at = y + HEAD;
  for (const row of rows) {
    const id = rowId(row.p, row.q);
    const h = rowH(row);
    const role = roles.get(id);
    shapes.push({
      kind: 'rect',
      id,
      x,
      y: at,
      w: tableW(c),
      h,
      r: 4,
      cls: row.ghost ? 'ghost' : 'live',
      role,
    });
    const textRole = role === 'active' || role === 'error' ? role : undefined;
    const cell = (key: string, cx: number, cy: number, text: string, bold = false) =>
      shapes.push({
        kind: 'text',
        id: `${id}-${key}`,
        x: cx + 6,
        y: cy + ROW / 2 + 5,
        text,
        size: SIZE,
        mono: true,
        weight: bold ? 'bold' : undefined,
        role: textRole,
      });
    if (row.tag) cell('g', xs[0]!, at, row.tag, true);
    cell('a', xs[1]!, at, `${row.p}→${row.q}`);
    row.lines.forEach((line, i) => cell(`l${i}`, xs[2]!, at + i * LINE, line));
    at += h + GAP;
  }
}

// ---------------------------------------------------------------------------------------------
// The frame

interface Frame {
  across: boolean;
  /** The table's top left corner. */
  tx: number;
  ty: number;
  cols: Cols;
  bounds: Bounds;
}

const frames = new Map<string, Frame>();

function arrange(dfa: Automaton, settings: DrSettings, stage?: StageSize): Frame {
  const key = `${settings.order}|${settings.simplify}|${automatonKey(dfa)}|${stage ? `${stage.w}x${stage.h}` : '-'}`;
  const hit = frames.get(key);
  if (hit) return hit;
  const runs = allRuns(dfa, settings);
  const cols = columns(dfa);
  const height = runs.length ? Math.max(...runs.map((r) => tableH(tableRows(r)))) : 0;
  const candidates: Frame[] = [];
  for (const across of [true, false]) {
    const layout = gnfaLayout(dfa, across);
    const diagram = unionBounds(
      drawAutomaton(dfa, layout, { around: 'avoid' }).bounds,
      ...runs.map((r) => drawAutomaton(asAutomaton(r.g), layout, { around: 'avoid' }).bounds),
    );
    if (!runs.length) {
      candidates.push({ across, tx: 0, ty: 0, cols, bounds: diagram });
      continue;
    }
    for (const under of [false, true]) {
      const tx = under ? diagram.x : beside(diagram, 30);
      const ty = under ? below(diagram, 22) : diagram.y;
      const table: Bounds = { x: tx, y: ty, w: tableW(cols), h: height };
      candidates.push({ across, tx, ty, cols, bounds: unionBounds(diagram, table) });
    }
  }
  const best = pickBest(candidates, stage);
  if (frames.size > 300) frames.clear();
  frames.set(key, best);
  return best;
}

export function view(step: Step<DfaState, DrExtra>, settings: DrSettings, stage?: StageSize): Scene {
  const dfa = step.state.dfa;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const f = arrange(dfa, settings, stage);
  const layout = gnfaLayout(dfa, f.across);
  if (!r) {
    const d = drawAutomaton(dfa, layout, { roles, around: 'avoid' });
    return { shapes: d.shapes, bounds: padBounds(f.bounds, 14), label: describe(step.state) };
  }
  const shapes: Shape[] = [];
  shapes.push(...drawAutomaton(asAutomaton(r.g), layout, { roles, around: 'avoid' }).shapes);
  drawTable(shapes, f.tx, f.ty, f.cols, tableRows(r), roles);
  return {
    shapes,
    bounds: padBounds(f.bounds, 14),
    label: `${describe(step.state)} ${describeRun(r)}`,
  };
}
