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
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawAutomaton, layoutStates, type StateLayout } from '../../layouts/automaton';
import { below, beside, padBounds, placePanels, translate, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape } from '../../render/scene';
import { setName, stateLetter, type Automaton } from '../_automata/automaton';
import {
  automatonKey,
  clearOfButtons,
  drawGrid,
  gridWidths,
  keepShapes,
  pickBest,
  placeLayers,
} from './kit';
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

const CAPTION = 13;

/** The DFA's layout: breadth-first layers, or (all subsets) one layer per subset size. */
function dfaLayout(nfa: Automaton, dfa: Automaton, mode: SubsetMode, across: boolean): StateLayout {
  if (mode === 'reachable') return layoutStates(dfa, across);
  // The DFA's states are A, B, C, ... in the order allSubsets lists the subsets.
  const bySize: string[][] = [];
  allSubsets(nfa.states).forEach((s, i) => (bySize[s.length] ??= []).push(stateLetter(i)));
  return placeLayers(
    bySize.filter((l) => l.length),
    across,
  );
}

interface Frame {
  across: boolean;
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
  for (const across of [true, false]) {
    const nb = captioned(drawAutomaton(nfa, layoutStates(nfa, across)).bounds);
    const db = captioned(
      drawAutomaton(dfa, dfaLayout(nfa, dfa, mode, across), { prefix: DFA_PREFIX }).bounds,
    );
    for (const under of [false, true]) {
      const dx = under ? nb.x - db.x : beside(nb, 40) - db.x;
      const dy = under ? below(nb, 24) - db.y : nb.y - db.y;
      const diagrams = unionBounds(nb, { ...db, x: db.x + dx, y: db.y + dy });
      const placed = placePanels([], diagrams, stage, (out, x, y) =>
        drawGrid(out, {
          id: 'tbl',
          x,
          y,
          cols: [],
          head: [],
          widths,
          rows: [],
          reserve: dfa.states.length,
        }),
      );
      const table = clearOfButtons(placed, diagrams, stage);
      candidates.push({
        across,
        dx,
        dy,
        tx: table.x,
        ty: table.y,
        widths,
        bounds: unionBounds(diagrams, table),
      });
    }
  }
  const best = pickBest(candidates, stage);
  if (frames.size > 300) frames.clear();
  frames.set(key, best);
  return best;
}

function drawNfa(nfa: Automaton, across: boolean, roles: Map<string, MarkRole>) {
  return drawAutomaton(nfa, layoutStates(nfa, across), { roles });
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
    const d = drawNfa(nfa, arrange(nfa, mode, stage).across, roles);
    return { shapes: d.shapes, bounds: padBounds(d.bounds, 14), label: describe(step.state) };
  }
  const mode = r.mode;
  const f = arrange(nfa, mode, stage);
  const shapes: Shape[] = [];

  const n = drawNfa(nfa, f.across, roles);
  shapes.push(...n.shapes);
  caption(shapes, 'cap-nfa', 'NFA', n.bounds);

  shapes.push(...translate(drawDfa(nfa, r, f.across, roles), f.dx, f.dy));
  const { dfa } = finalDfa(nfa, mode);
  const db = drawAutomaton(dfa, dfaLayout(nfa, dfa, mode, f.across), {
    prefix: DFA_PREFIX,
  }).bounds;
  caption(shapes, 'cap-dfa', 'DFA', { ...db, x: db.x + f.dx, y: db.y + f.dy });

  drawGrid(shapes, {
    id: 'tbl',
    x: f.tx,
    y: f.ty,
    cols: ['name', 'set', ...nfa.alphabet.map((c) => `on-${c}`)],
    head: ['DFA', 'NFA states', ...nfa.alphabet],
    widths: f.widths,
    rows: r.rows.map((row) => {
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
    reserve: dfa.states.length,
    roles,
  });
  return {
    shapes,
    bounds: padBounds(f.bounds, 14),
    label: `${describe(step.state)} ${describeRun(nfa, r)}`,
  };
}

/** The DFA so far: the finished DFA's drawing, keeping only the states and moves found. */
function drawDfa(
  nfa: Automaton,
  r: ConvRun,
  across: boolean,
  roles: Map<string, MarkRole>,
): Shape[] {
  const { dfa, sets } = finalDfa(nfa, r.mode);
  const known = new Set(r.rows.map((row) => row.name));
  const on = new Map<string, string[]>();
  for (const m of r.moves) {
    const k = `${m.from}-${m.to}`;
    on.set(k, [...(on.get(k) ?? []), m.on].sort());
  }
  const drawn = drawAutomaton({ ...dfa, accept: r.accept }, dfaLayout(nfa, dfa, r.mode, across), {
    prefix: DFA_PREFIX,
    roles,
    look: (q) => (sets[q]?.length === 0 ? 'dead' : r.unreachable?.includes(q) ? 'dim' : undefined),
    edge: (p) => (r.unreachable?.includes(p) ? 'dim' : undefined),
  });
  const state = new RegExp(`^${DFA_PREFIX}s-([^-]+)`);
  const move = new RegExp(`^${DFA_PREFIX}m-([^-]+)-([^-]+)`);
  return keepShapes(
    drawn.shapes,
    (id) => {
      if (id === `${DFA_PREFIX}start`) return r.start !== undefined;
      const s = state.exec(id);
      if (s) return known.has(s[1]!);
      const m = move.exec(id);
      if (m) return on.has(`${m[1]}-${m[2]}`);
      return true;
    },
    (id) => {
      const m = move.exec(id);
      return m && id.endsWith('-t') ? on.get(`${m[1]}-${m[2]}`)!.join(',') : undefined;
    },
  );
}
