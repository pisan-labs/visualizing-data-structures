/**
 * Pieces the nfa-to-dfa and dfa-minimization pages share. They are candidates for the shared
 * automata kit (src/viz/_automata) and the state-diagram layout (src/layouts/automaton.ts):
 *
 *   automatonInput(sample, check)  the controls.input spec: the one-line automaton text, with an
 *                                  error that names the bad item (and a page's own check, such
 *                                  as "this is not a DFA")
 *   loadAutomatonOp(o)             the Load operation: reads the text, keeps the old machine
 *                                  (and says why) when the text is bad
 *   automatonKey(a)                a string that identifies an automaton, for caches
 *   placeLayers(layers, across)    a state diagram's layout from layers a page chooses itself
 *                                  (the same spacing as layoutStates)
 *   drawGrid(shapes, o)            a table drawn one row per state: a header row, then rows of
 *                                  cells with fixed column widths, room kept for rows to come
 *   onStage(b, stage)              how large a scene of this size is drawn (fitScore, padded)
 *   pickBest(candidates, stage)    the arrangement drawn largest on the stage, or on both a
 *                                  laptop and a phone when there is no stage
 *   keepShapes(shapes, keep)       a drawing with only some of its shapes, for a diagram that
 *                                  grows: draw the finished one, keep what exists so far, and
 *                                  every arrow and loop is already where it ends up
 */
import type { Controls, MarkRole, OpSpec, Scalar, StageSize, Step } from '../../engine/types';
import { fixedLayout, type StateLayout } from '../../layouts/automaton';
import { fitScore, padBounds, textWidth } from '../../layouts/graph';
import type { Bounds, Shape } from '../../render/scene';
import { isDeterministic, type Automaton } from '../_automata/automaton';
import { parseAutomaton } from '../_automata/parse';

export const MAX_TEXT = 400;

export function automatonInput(
  sample: string,
  check?: (a: Automaton) => string | null,
): NonNullable<Controls['input']> {
  return {
    label: 'Automaton',
    placeholder: 'e.g. q0 a -> q1; q1 b -> q0; accept q1',
    maxLength: MAX_TEXT,
    sample,
    parse(token) {
      const t = token.trim();
      if (!t) return new Error('Type moves such as "q0 a -> q1; q1 b -> q0; accept q1".');
      const a = parseAutomaton(t);
      if (a instanceof Error) return a;
      const why = check?.(a);
      return why ? new Error(why) : t;
    },
  };
}

export interface LoadOptions<S> {
  /** "NFA" or "DFA": what the page calls the machine it holds. */
  what: string;
  get(s: S): Automaton;
  make(a: Automaton, old: S): S;
  /** Why this automaton cannot be loaded here, or null. */
  check?(a: Automaton): string | null;
  /** What to say after a good load, such as "Press Convert." */
  ready(a: Automaton): string;
  vars(s: S): Record<string, Scalar>;
}

export function loadAutomatonOp<S, Set, X>(o: LoadOptions<S>): OpSpec<S, Set, X> {
  return {
    label: 'Load',
    arity: 1,
    *run(s, [arg]) {
      const text = String(arg ?? '').trim();
      const a = text ? parseAutomaton(text) : new Error('There is no automaton to read.');
      const why = a instanceof Error ? a.message : o.check?.(a);
      if (a instanceof Error || why) {
        yield {
          state: s,
          marks: [],
          say: `Nothing loaded. ${why} The ${o.what} stays as it was.`,
          lines: [],
          level: 1,
          vars: o.vars(s),
        } satisfies Step<S, X>;
        return s;
      }
      const next = o.make(a, s);
      yield {
        state: next,
        marks: [],
        say: `Loaded ${summarize(a)} ${o.ready(a)}`,
        lines: [],
        level: 1,
        vars: o.vars(next),
      } satisfies Step<S, X>;
      return next;
    },
  };
}

/** "a DFA with 3 states (start q0, accept q2) over a and b, and 6 moves." */
export function summarize(a: Automaton): string {
  const kind = isDeterministic(a) ? 'a DFA' : 'an NFA';
  const acc = a.accept.length ? `accept ${words(a.accept)}` : 'no accept states';
  const over = a.alphabet.length ? `over ${words(a.alphabet)}` : 'with no symbols';
  const n = a.moves.length;
  return `${kind} with ${a.states.length} ${a.states.length === 1 ? 'state' : 'states'} (start ${a.start}, ${acc}) ${over}, and ${n} ${n === 1 ? 'move' : 'moves'}.`;
}

/** "a", "a and b", "a, b and c". */
export const words = (xs: readonly string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

export const automatonKey = (a: Automaton): string =>
  `${a.start}|${a.states.join(',')}|${a.accept.join(',')}|${a.moves.map((m) => `${m.from}>${m.on}>${m.to}`).join(',')}`;

/** The spacing of src/layouts/automaton.ts: layers 130 apart, states in a layer 96 apart. */
const LAYER_GAP = 130;
const ROW_GAP = 96;

/** A layout from layers a page chooses, centered on the widest layer as layoutStates does. */
export function placeLayers(layers: string[][], across: boolean): StateLayout {
  const widest = Math.max(1, ...layers.map((l) => l.length));
  const pos: Record<string, { x: number; y: number }> = {};
  layers.forEach((layer, i) =>
    layer.forEach((q, j) => {
      const along = i * LAYER_GAP;
      const off = (j - (layer.length - 1) / 2) * ROW_GAP + ((widest - 1) / 2) * ROW_GAP;
      pos[q] = across ? { x: along, y: off } : { x: off, y: along };
    }),
  );
  return fixedLayout(pos, across);
}

// ---------------------------------------------------------------------------------------------
// A table, one row per state

export interface GridCell {
  text: string;
  role?: MarkRole;
  /** Faded: not worked out yet, or no longer counts. */
  dim?: boolean;
}

export interface GridOptions {
  /** Prefix for shape ids. */
  id: string;
  x: number;
  y: number;
  /** One key per column, for ids: cell `${id}-${row}-${col}`, its text `-t`, header `${id}-h-${col}`. */
  cols: string[];
  head: string[];
  /** Column widths; see gridWidths. */
  widths: number[];
  rows: { key: string; cells: GridCell[] }[];
  /** Keep room for this many rows, so the table's box stays the same as rows arrive. */
  reserve?: number;
  roles?: ReadonlyMap<string, MarkRole>;
}

export const GRID_ROW = 24;
const GRID_PITCH = GRID_ROW + 3;
const HEAD_H = 22;

/** Column widths that fit the longest text of each column (header included), in 14-unit mono. */
export function gridWidths(columns: string[][], min = 30): number[] {
  return columns.map((texts) =>
    Math.max(min, ...texts.map((t) => textWidth(t, t.length <= 3 ? 15 : 14, true) + 12)),
  );
}

export function drawGrid(shapes: Shape[], o: GridOptions): Bounds {
  const roles = o.roles ?? new Map<string, MarkRole>();
  const xs: number[] = [];
  let x = o.x;
  for (const w of o.widths) {
    xs.push(x);
    x += w + 3;
  }
  const width = x - 3 - o.x;
  o.cols.forEach((c, k) => {
    shapes.push({
      kind: 'text',
      id: `${o.id}-h-${c}`,
      x: xs[k]! + o.widths[k]! / 2,
      y: o.y + HEAD_H - 7,
      text: o.head[k]!,
      size: 13,
      anchor: 'middle',
      cls: 'label',
      role: roles.get(`${o.id}-h-${c}`),
    });
  });
  o.rows.forEach((row, r) => {
    const y = o.y + HEAD_H + r * GRID_PITCH;
    row.cells.forEach((cell, k) => {
      const id = `${o.id}-${row.key}-${o.cols[k]}`;
      const role = roles.get(id) ?? cell.role;
      const w = o.widths[k]!;
      shapes.push({
        kind: 'rect',
        id,
        x: xs[k]!,
        y,
        w,
        h: GRID_ROW,
        r: 3,
        cls: 'live',
        role,
        opacity: cell.dim ? 0.5 : undefined,
      });
      const size = cell.text.length <= 3 ? 15 : 14;
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: xs[k]! + w / 2,
        y: y + GRID_ROW / 2 + size * 0.36,
        text: cell.text,
        size,
        anchor: 'middle',
        mono: true,
        weight: k === 0 ? 'bold' : undefined,
        role: roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
        opacity: cell.dim ? 0.5 : undefined,
      });
    });
  });
  const n = Math.max(o.rows.length, o.reserve ?? 0, 1);
  return { x: o.x, y: o.y, w: width, h: HEAD_H + n * GRID_PITCH - 3 };
}

// ---------------------------------------------------------------------------------------------
// Choosing an arrangement

/** How large a scene with this content box is drawn on the stage (padded as views pad it). */
export const onStage = (b: Bounds, stage?: StageSize): number => fitScore(padBounds(b, 14), stage);

/**
 * The candidate drawn largest. Earlier candidates win near ties (within 5%), so the first one
 * listed is the house style and another must be clearly better to replace it.
 */
export function pickBest<T extends { bounds: Bounds }>(candidates: T[], stage?: StageSize): T {
  let best = candidates[0]!;
  let score = onStage(best.bounds, stage);
  for (const c of candidates.slice(1)) {
    const s = onStage(c.bounds, stage);
    if (s > score * 1.05) {
      best = c;
      score = s;
    }
  }
  return best;
}

/** The shapes whose ids pass `keep`, with new text for the ones `relabel` names. */
export function keepShapes(
  shapes: Shape[],
  keep: (id: string) => boolean,
  relabel: (id: string) => string | undefined = () => undefined,
): Shape[] {
  return shapes
    .filter((s) => keep(s.id))
    .map((s) => {
      if (s.kind !== 'text') return s;
      const text = relabel(s.id);
      return text === undefined ? s : { ...s, text };
    });
}
