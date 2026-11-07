/**
 * DFA minimization: the DFA being minimized, then (under or beside it) the method's table and
 * the minimal DFA once it is built.
 *
 * The DFA's states keep the places they have in the complete DFA, so the dead state appears
 * in its own spot and dropped states leave without anything moving. With partition refinement
 * each state wears its block's group color and number (#1, #2, ...), and the table lists each
 * state's block and signature (the block each symbol leads to), colored the same way. With
 * table filling, the triangle of pairs fills with X and the symbol that separates each pair;
 * the blocks are colored at the end. The minimal DFA's states keep their block's color and
 * list the states they merge.
 *
 * Arrangement: the diagrams run across (a laptop) or down (a phone); the table and the minimal
 * DFA sit side by side or one under the other, under or beside the DFA, whichever draws
 * largest on the stage. The choice is made from the finished sizes, so it holds through a run.
 */
import { groupRole, type MarkRole, type StageSize, type Step } from '../../engine/types';
import {
  drawAutomaton,
  layoutStates,
  stateId,
  type DrawOptions,
  type Pt,
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
import {
  complete,
  makeAutomaton,
  minimize,
  reachable,
  type Automaton,
} from '../_automata/automaton';
import {
  automatonKey,
  clearOfButtons,
  drawBadges,
  drawGrid,
  gridWidths,
  pickBest,
} from '../nfa-to-dfa/kit';
import {
  MIN_PREFIX,
  describe,
  describeRun,
  pairCell,
  type Method,
  type MinExtra,
  type MinRun,
  type MinSettings,
  type MinState,
} from './model';

const CAPTION = 13;

function caption(shapes: Shape[], id: string, text: string, x: number, y: number) {
  shapes.push({ kind: 'text', id, x, y: y - 8, text, size: CAPTION, cls: 'label' });
}

const captioned = (b: Bounds): Bounds => ({ ...b, y: b.y - 8 - CAPTION, h: b.h + 8 + CAPTION });

// ---------------------------------------------------------------------------------------------
// The pair table: rows are states 1..n-1, columns states 0..n-2, a cell for each pair below
// the diagonal (Hopcroft and Ullman's layout).

const PAIR_H = 24;

function pairSizes(states: string[]) {
  const cw = Math.max(34, ...states.map((q) => textWidth(q, 13, true) + 10));
  const headW = Math.max(20, ...states.map((q) => textWidth(q, 14, true) + 10));
  return { cw, headW };
}

function drawPairs(
  shapes: Shape[],
  o: {
    x: number;
    y: number;
    states: string[];
    marked: Record<string, string>;
    roles: Map<string, MarkRole>;
  },
): Bounds {
  const { states, roles } = o;
  const n = states.length;
  const { cw, headW } = pairSizes(states);
  if (n < 2) {
    shapes.push({
      kind: 'text',
      id: 'pt-none',
      x: o.x,
      y: o.y + 16,
      text: 'one state: no pairs',
      size: 13,
      cls: 'label',
    });
    return { x: o.x, y: o.y, w: 130, h: 24 };
  }
  for (let i = 1; i < n; i++) {
    const y = o.y + (i - 1) * (PAIR_H + 3);
    shapes.push({
      kind: 'text',
      id: `pt-r-${states[i]}`,
      x: o.x + headW - 8,
      y: y + PAIR_H / 2 + 5,
      text: states[i]!,
      size: 14,
      anchor: 'end',
      weight: 'bold',
      mono: true,
    });
    for (let j = 0; j < i; j++) {
      const id = pairCell(states, states[i]!, states[j]!);
      const key = `${states[j]}|${states[i]}`;
      const sym = o.marked[key];
      const role = roles.get(id);
      const x = o.x + headW + j * (cw + 3);
      shapes.push({ kind: 'rect', id, x, y, w: cw, h: PAIR_H, r: 3, cls: 'live', role });
      shapes.push({
        kind: 'text',
        id: `${id}-t`,
        x: x + cw / 2,
        y: y + PAIR_H / 2 + 5,
        text: sym ? `X ${sym}` : '',
        size: 14,
        anchor: 'middle',
        mono: true,
        weight: 'bold',
        role: roles.get(`${id}-t`) ?? (role === 'active' || role === 'error' ? role : undefined),
      });
    }
  }
  const bottom = o.y + (n - 1) * (PAIR_H + 3);
  for (let j = 0; j < n - 1; j++)
    shapes.push({
      kind: 'text',
      id: `pt-c-${states[j]}`,
      x: o.x + headW + j * (cw + 3) + cw / 2,
      y: bottom + 14,
      text: states[j]!,
      size: 14,
      anchor: 'middle',
      weight: 'bold',
      mono: true,
    });
  return { x: o.x, y: o.y, w: headW + (n - 1) * (cw + 3) - 3, h: (n - 1) * (PAIR_H + 3) + 18 };
}

// ---------------------------------------------------------------------------------------------
// Moore's table: each state, its block, and the block each symbol leads to.

function sigWidths(states: string[], alphabet: string[]) {
  const n = String(states.length);
  return gridWidths([['q', ...states], ['block', n], ...alphabet.map((c) => [c, n])]);
}

function drawSigs(
  shapes: Shape[],
  o: {
    x: number;
    y: number;
    r?: MinRun;
    states: string[];
    alphabet: string[];
    roles: Map<string, MarkRole>;
  },
): Bounds {
  const r = o.r;
  return drawGrid(shapes, {
    id: 'sig',
    x: o.x,
    y: o.y,
    cols: ['name', 'block', ...o.alphabet.map((c) => `on-${c}`)],
    head: ['q', 'block', ...o.alphabet],
    widths: sigWidths(o.states, o.alphabet),
    rows: r
      ? r.work.states.map((q) => ({
          key: q,
          cells: [
            { text: q },
            { text: String(r.block[q]), role: groupRole(r.block[q]!) },
            ...o.alphabet.map((_, i) => {
              const b = r.sig[q]?.[i];
              return b === undefined ? { text: '' } : { text: String(b), role: groupRole(b) };
            }),
          ],
        }))
      : [],
    reserve: o.states.length,
    roles: o.roles,
  });
}

// ---------------------------------------------------------------------------------------------
// Arrangement

interface Frame {
  across: boolean;
  /** The picture's box until the dead state is added and unreachable states are dropped. */
  before: Bounds;
  /** The table's top left corner, and where the minimal DFA's shapes move to. */
  tx: number;
  ty: number;
  mx: number;
  my: number;
  bounds: Bounds;
}

/** The states the table covers: the complete DFA's reachable states, in name order. */
function tableStates(dfa: Automaton): string[] {
  return reachable(complete(dfa));
}

function drawTable(
  shapes: Shape[],
  method: Method,
  dfa: Automaton,
  x: number,
  y: number,
  roles: Map<string, MarkRole>,
  r?: MinRun,
): Bounds {
  const states = tableStates(dfa);
  if (method === 'moore')
    return drawSigs(shapes, {
      x,
      y,
      r: r && Object.keys(r.block).length ? r : undefined,
      states,
      alphabet: dfa.alphabet,
      roles,
    });
  return drawPairs(shapes, { x, y, states, marked: r?.marked ?? {}, roles });
}

/** The DFA left once it is complete and its unreachable states are gone. */
function trimmed(dfa: Automaton): Automaton {
  const full = complete(dfa);
  const keep = reachable(full);
  return makeAutomaton({
    ...full,
    states: keep,
    accept: full.accept.filter((q) => keep.includes(q)),
    moves: full.moves.filter((m) => keep.includes(m.from)),
  });
}

const only = (pos: Record<string, Pt>, states: string[]) =>
  Object.fromEntries(states.map((q) => [q, pos[q]!]));

/** A diagram with badges beside its states. */
function withBadges(
  a: Automaton,
  layout: StateLayout,
  o: DrawOptions,
  badge: (q: string) => string | undefined,
) {
  const d = drawAutomaton(a, layout, o);
  const b = drawBadges(d.shapes, only(layout.pos, a.states), badge, o.prefix, o.roles);
  return {
    shapes: [...d.shapes, ...b.shapes],
    bounds: b.bounds ? unionBounds(d.bounds, b.bounds) : d.bounds,
  };
}

/**
 * The box the DFA takes once refining starts: its reachable states (still where the complete
 * DFA's layout puts them), with a block badge on each.
 */
function dfaBox(dfa: Automaton, across: boolean): Bounds {
  const work = trimmed(dfa);
  const badge = `#${work.states.length}`;
  return withBadges(work, layoutStates(complete(dfa), across), {}, () => badge).bounds;
}

function drawMin(
  min: Automaton,
  blocks: Record<string, string[]>,
  across: boolean,
  roles?: Map<string, MarkRole>,
) {
  return withBadges(min, layoutStates(min, across), { prefix: MIN_PREFIX, roles }, (q) =>
    blocks[q] && blocks[q]!.length > 1 ? `{${blocks[q]!.join(',')}}` : undefined,
  );
}

const frames = new Map<string, Frame>();

function arrange(dfa: Automaton, method: Method, stage?: StageSize): Frame {
  const key = `${automatonKey(dfa)}|${method}|${stage ? `${stage.w}x${stage.h}` : '-'}`;
  const hit = frames.get(key);
  if (hit) return hit;
  const { dfa: min, blocks } = minimize(dfa);
  const none = new Map<string, MarkRole>();
  const candidates: Frame[] = [];
  for (const across of [true, false]) {
    const db = captioned(dfaBox(dfa, across));
    const mb = captioned(drawMin(min, blocks, across).bounds);
    for (const side of [false, true]) {
      // The block: the table's caption at its top left corner, the table under it, and the
      // minimal DFA beside or under the table. (mdx, mdy) moves the minimal DFA into place.
      const t = captioned(drawTable([], method, dfa, 0, 8 + CAPTION, none));
      const mdx = side ? beside(t, 30) - mb.x : -mb.x;
      const mdy = side ? t.y - mb.y : below(t, 20) - mb.y;
      const room = unionBounds(t, { ...mb, x: mb.x + mdx, y: mb.y + mdy });
      const placed = placePanels([], db, stage, (_out, x, y) => ({
        ...room,
        x: room.x + x,
        y: room.y + y,
      }));
      const block = clearOfButtons(placed, db, stage);
      candidates.push({
        across,
        before: captioned(drawAutomaton(complete(dfa), layoutStates(complete(dfa), across)).bounds),
        tx: block.x - room.x,
        ty: block.y - room.y + 8 + CAPTION,
        mx: block.x - room.x + mdx,
        my: block.y - room.y + mdy,
        bounds: unionBounds(db, block),
      });
    }
  }
  const best = pickBest(candidates, stage);
  if (frames.size > 300) frames.clear();
  frames.set(key, best);
  return best;
}

export function view(
  step: Step<MinState, MinExtra>,
  settings: MinSettings,
  stage?: StageSize,
): Scene {
  const dfa = step.state.dfa;
  const r = step.extra?.run;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const full = complete(dfa);
  // The plain DFA runs the way a run would, so its states stay put when Minimize starts.
  const f = arrange(dfa, r?.method ?? settings.method, stage);
  if (!r) {
    const d = drawAutomaton(dfa, layoutStates(full, f.across), { roles });
    return { shapes: d.shapes, bounds: padBounds(d.bounds, 14), label: describe(step.state) };
  }
  const shapes: Shape[] = [];
  const colored = r.method === 'moore' || !!r.min;
  const blockOf = (q: string) => (colored ? r.block[q] : undefined);
  const dfaRoles = new Map(roles);
  for (const q of r.work.states) {
    const b = blockOf(q);
    if (b && !roles.has(stateId(q))) dfaRoles.set(stateId(q), groupRole(b));
  }
  const layout = layoutStates(full, f.across);
  const drawn = withBadges(
    r.work,
    layout,
    {
      roles: dfaRoles,
      look: (q) => (r.dropping.includes(q) ? 'dim' : q === r.added ? 'dead' : undefined),
      edge: (p) => (r.dropping.includes(p) ? 'dim' : undefined),
    },
    (q) => {
      const b = blockOf(q);
      return b ? `#${b}` : undefined;
    },
  );
  shapes.push(...drawn.shapes);
  const label = `${describe(step.state)} ${describeRun(r)}`;
  if (!r.refining) {
    const b = drawAutomaton(full, layout).bounds;
    caption(shapes, 'cap-dfa', 'DFA', b.x, b.y);
    return { shapes, bounds: padBounds(f.before, 14), label };
  }
  const db = dfaBox(dfa, f.across);
  caption(shapes, 'cap-dfa', 'DFA', db.x, db.y);

  caption(
    shapes,
    'cap-table',
    r.method === 'moore' ? 'Blocks and signatures' : 'Pairs told apart',
    f.tx,
    f.ty,
  );
  drawTable(shapes, r.method, dfa, f.tx, f.ty, roles, r);

  if (r.min && r.blocks) {
    const minRoles = new Map(roles);
    for (const q of r.min.states)
      if (!roles.has(stateId(q, MIN_PREFIX)))
        minRoles.set(stateId(q, MIN_PREFIX), groupRole(r.block[q]!));
    const m = drawMin(r.min, r.blocks, f.across, minRoles);
    shapes.push(...translate(m.shapes, f.mx, f.my));
    caption(shapes, 'cap-min', 'Minimal DFA', m.bounds.x + f.mx, m.bounds.y + f.my);
  }
  return { shapes, bounds: padBounds(f.bounds, 14), label };
}
