/**
 * The product construction as a grid: A's states in a row along the top, B's states in a column
 * down the left, and the pair (p, q) where p's column meets q's row, as in a multiplication
 * table. The product's states fill the grid as Build finds them; a pair not found yet (or never
 * reached) is a faint dashed circle. Beside or under the grid, a table lists each pair, whether
 * p accepts in A and q in B, what the operation makes of that (the reason the pair accepts or
 * not), and where it goes on each symbol. A word run puts the input tape there instead, with
 * the pair over the head and the verdict under it.
 *
 * A and B are drawn complete (their dead states dashed) once Build or Run has completed them;
 * before that, the dead state's spot stays empty, so nothing moves when it arrives. Every
 * position comes from the complete machines and the finished product, and the frame is chosen
 * once per stage size, so the drawing holds still through an operation.
 *
 * Arrangement: the table (or tape) goes beside the grid or under it, whichever draws larger on
 * the stage (placePanels).
 */
import type { MarkRole, StageSize, Step } from '../../engine/types';
import { drawAutomaton, fixedLayout, type Pt, type StateLayout } from '../../layouts/automaton';
import { CELL_W } from '../../layouts/tape';
import { padBounds, placePanels, textWidth, unionBounds } from '../../layouts/graph';
import type { Bounds, Scene, Shape, TextShape } from '../../render/scene';
import { makeAutomaton, type Automaton } from '../_automata/automaton';
import {
  RUN_BLOCK_H,
  drawGrid,
  drawInputTape,
  drawVerdict,
  gridWidths,
  stack,
  tapeCells,
  type GridCell,
} from '../_automata/panels';
import {
  A_PREFIX,
  B_PREFIX,
  P_PREFIX,
  describe,
  describeBuild,
  describeRun,
  type BuildRun,
  type ProdExtra,
  type ProdSettings,
  type ProdState,
  type WordRun,
} from './model';
import { OPS, deadOf, full, lineOrder, pairName, productOf, type SetOp } from './product';

/** Grid spacing: the room a state and its arrows' labels need, as between diagram layers. */
const G = 130;
/** Room between the machines and the grid. */
const GAP = 12;
const CAPTION = 13;
const OP_SIZE = 15;
/** The start arrow's ends, along the diagonal from the start pair's middle. */
const START_FROM = (22 + 40) / Math.SQRT2;
const START_TO = (22 + 1) / Math.SQRT2;
/** How far a caption sits from its machine's start state: past the start arrow. */
const CAP_OFF = 22 + 34 + 8;

interface Frame {
  posA: Record<string, Pt>;
  posB: Record<string, Pt>;
  posP: Record<string, Pt>;
  /** Where the panel block (table, or tape and badge) goes. */
  px: number;
  py: number;
  /** The product's start arrow, from the corner where A and B meet, and the operation's name. */
  tail: Pt;
  head: Pt;
  opAt: Pt;
  capA: Pt;
  capB: Pt;
  bounds: Bounds;
}

/** The grid's product: every cell a state, the reachable ones with their moves. */
function gridMachine(A: Automaton, B: Automaton, op: SetOp): Automaton {
  const pr = productOf(A, B, op);
  const cells = lineOrder(A).flatMap((p) => lineOrder(B).map((q) => pairName(p, q)));
  return makeAutomaton({ ...pr.dfa, states: cells });
}

const layoutOf = (pos: Record<string, Pt>, across: boolean): StateLayout =>
  fixedLayout(pos, across);

const frames = new Map<string, Frame>();

type Mode = 'build' | 'run';

/** The table's column widths, from the finished product. */
function tableWidths(A: Automaton, B: Automaton, op: SetOp): number[] {
  const pr = productOf(A, B, op);
  const names = pr.order.map((n) => `→${n}`);
  return gridWidths([
    ['pair', ...names],
    ['A', '✓'],
    ['B', '✓'],
    [OPS[op].label],
    ...A.alphabet.map((c) => [c, ...pr.order]),
  ]);
}

function emptyTable(A: Automaton, B: Automaton, op: SetOp) {
  const widths = tableWidths(A, B, op);
  const n = productOf(A, B, op).order.length;
  return (out: Shape[], x: number, y: number) =>
    drawGrid(out, { id: 'tbl', x, y, cols: [], head: [], widths, rows: [], reserve: n });
}

const RUN_W = (room: number) => Math.max(tapeCells(room) * CELL_W, 96);

function arrange(s: ProdState, op: SetOp, mode: Mode, room: number, stage?: StageSize): Frame {
  const A = full(s.a);
  const B = full(s.b);
  const ka = `${A.states.join(',')}/${A.moves.map((m) => `${m.from}${m.on}${m.to}`).join(',')}`;
  const kb = `${B.states.join(',')}/${B.moves.map((m) => `${m.from}${m.on}${m.to}`).join(',')}`;
  const key = `${ka}|${kb}|${op}|${mode}|${room}|${stage ? `${stage.w}x${stage.h}` : '-'}`;
  const hit = frames.get(key);
  if (hit) return hit;
  const cols = lineOrder(s.a);
  const rows = lineOrder(s.b);
  const posP: Record<string, Pt> = {};
  cols.forEach((p, i) => rows.forEach((q, j) => (posP[pairName(p, q)] = { x: i * G, y: j * G })));
  const drawn = drawAutomaton(gridMachine(A, B, op), layoutOf(posP, true), {
    prefix: P_PREFIX,
    startArrow: false,
  }).bounds;
  // The start arrow comes in from the corner, up and to the left, with the operation's name.
  const s0 = posP[pairName(A.start, B.start)]!;
  const tail = { x: s0.x - START_FROM, y: s0.y - START_FROM };
  const head = { x: s0.x - START_TO, y: s0.y - START_TO };
  const opAt = { x: tail.x + 6, y: tail.y - 6 };
  const opW = textWidth(OPS[op].label, OP_SIZE);
  const pb = unionBounds(
    drawn,
    { x: opAt.x - opW, y: opAt.y - OP_SIZE, w: opW, h: OP_SIZE + 4 },
    {
      ...tail,
      w: 1,
      h: 1,
    },
  );
  const rawA: Record<string, Pt> = {};
  cols.forEach((p, i) => (rawA[p] = { x: i * G, y: 0 }));
  const ab = drawAutomaton(A, layoutOf(rawA, true), { prefix: A_PREFIX }).bounds;
  const dy = pb.y - GAP - CAPTION - (ab.y + ab.h);
  const posA: Record<string, Pt> = {};
  for (const p of cols) posA[p] = { x: rawA[p]!.x, y: dy };
  const rawB: Record<string, Pt> = {};
  rows.forEach((q, j) => (rawB[q] = { x: 0, y: j * G }));
  const bb = drawAutomaton(B, layoutOf(rawB, false), { prefix: B_PREFIX }).bounds;
  const dx = pb.x - GAP - (bb.x + bb.w);
  const posB: Record<string, Pt> = {};
  for (const q of rows) posB[q] = { x: dx, y: rawB[q]!.y };
  // The captions: left of A's start arrow, and over B's.
  const capA = { x: posA[A.start]!.x - CAP_OFF, y: posA[A.start]!.y + 5 };
  const capB = { x: posB[B.start]!.x, y: posB[B.start]!.y - CAP_OFF };
  const diagrams = unionBounds(
    pb,
    { ...ab, y: ab.y + dy },
    { ...bb, x: bb.x + dx },
    { x: capA.x - 14, y: capA.y - 15, w: 14, h: 19 },
    { x: capB.x - 8, y: capB.y - 15, w: 16, h: 19 },
  );
  const block =
    mode === 'build'
      ? emptyTable(A, B, op)
      : (_out: Shape[], x: number, y: number): Bounds => ({
          x,
          y,
          w: RUN_W(room),
          h: RUN_BLOCK_H,
        });
  const at = placePanels([], diagrams, stage, block);
  const f: Frame = {
    posA,
    posB,
    posP,
    px: at.x,
    py: at.y,
    tail,
    head,
    opAt,
    capA,
    capB,
    bounds: unionBounds(diagrams, at),
  };
  if (frames.size > 300) frames.clear();
  frames.set(key, f);
  return f;
}

/**
 * A product state's name is its pair, "p0,q1". It goes on two lines in its circle, p over q,
 * so even a pair such as "dead,q1" fits inside the accept ring.
 */
function pairLabels(shapes: Shape[], prefix: string): Shape[] {
  return shapes.flatMap((sh): Shape[] => {
    if (sh.kind !== 'text' || !sh.id.startsWith(`${prefix}s-`) || !sh.id.endsWith('-t'))
      return [sh];
    const [p, q] = sh.text.split(',') as [string, string];
    const size = Math.max(p.length, q.length) >= 5 ? 10 : 12;
    const cy = sh.y - (sh.size ?? 15) * 0.35;
    const top: TextShape = { ...sh, text: p, size, y: cy - 6.5 + size * 0.35 };
    return [top, { ...top, id: `${sh.id}2`, text: q, y: cy + 6.5 + size * 0.35 }];
  });
}

export function view(
  step: Step<ProdState, ProdExtra>,
  settings: ProdSettings,
  stage?: StageSize,
): Scene {
  const s = step.state;
  const b = step.extra?.build;
  const r = step.extra?.run;
  const op = b?.op ?? settings.op;
  const roles = new Map<string, MarkRole>(step.marks.map((m) => [m.id, m.role]));
  const A = full(s.a);
  const B = full(s.b);
  const pr = productOf(A, B, op);
  const mode: Mode = r ? 'run' : 'build';
  const room = r?.word.length ?? 0;
  const f = arrange(s, op, mode, room, stage);
  const fullA = b ? b.fullA : r ? true : s.built;
  const fullB = b ? b.fullB : r ? true : s.built;
  const deadA = deadOf(s.a);
  const deadB = deadOf(s.b);
  const shapes: Shape[] = [];

  // A, along the top; B, down the left.
  const side = (
    m: Automaton,
    pos: Record<string, Pt>,
    across: boolean,
    prefix: string,
    dead: string | null,
    shown: boolean,
    current: string | undefined,
    last: WordRun['lastA'],
  ) =>
    drawAutomaton(m, layoutOf(pos, across), {
      prefix,
      roles,
      look: (q) => (q === current ? 'current' : q === dead ? 'dead' : undefined),
      edge: (p, q) => (last && last.from === p && last.to === q ? 'used' : undefined),
      show: {
        state: (q) => shown || q !== dead,
        move: (x) => shown || x.to !== dead,
      },
    });
  shapes.push(...side(A, f.posA, true, A_PREFIX, deadA, fullA, r?.p, r?.lastA).shapes);
  shapes.push(...side(B, f.posB, false, B_PREFIX, deadB, fullB, r?.q, r?.lastB).shapes);

  // The product, in the grid.
  const found = new Set<string>(b ? b.rows : s.built || r ? pr.order : []);
  const foundMoves = new Set(
    (b ? b.moves : found.size ? pr.dfa.moves : []).map((m) => `${m.from} ${m.on}`),
  );
  const accept = b ? b.accept : pr.dfa.accept;
  const cur = r ? pairName(r.p, r.q) : undefined;
  const lastP = r?.lastA && r.lastB ? pairName(r.lastA.from, r.lastB.from) : undefined;
  const dp = drawAutomaton({ ...gridMachine(A, B, op), accept }, layoutOf(f.posP, true), {
    prefix: P_PREFIX,
    roles,
    startArrow: false,
    look: (n) => (n === cur ? 'current' : undefined),
    edge: (p, q) => (r && r.read > 0 && p === lastP && q === cur ? 'used' : undefined),
    show: {
      state: (n) => found.has(n),
      move: (m) => foundMoves.has(`${m.from} ${m.on}`),
    },
  });
  shapes.push(...pairLabels(dp.shapes, P_PREFIX));
  if (found.size)
    shapes.push({
      kind: 'arrow',
      id: `${P_PREFIX}start`,
      x1: f.tail.x,
      y1: f.tail.y,
      x2: f.head.x,
      y2: f.head.y,
      role: roles.get(`${P_PREFIX}start`),
    });

  // Pairs not found: faint placeholders, in the dead state's row or column only once it exists.
  for (const [n, pt] of Object.entries(f.posP)) {
    if (found.has(n)) continue;
    const [p, q] = n.split(',');
    if ((!fullA && p === deadA) || (!fullB && q === deadB)) continue;
    shapes.push({
      kind: 'circle',
      id: `ghost-${n}`,
      x: pt.x,
      y: pt.y,
      r: 22,
      cls: 'dead-state',
      opacity: 0.35,
    });
  }

  // Captions: A, B, and the operation at the corner, where the product starts.
  const caption = (id: string, at: Pt, text: string, anchor: 'end' | 'middle'): Shape => ({
    kind: 'text',
    id,
    x: at.x,
    y: at.y,
    text,
    size: OP_SIZE,
    anchor,
    weight: 'bold',
    cls: 'label',
  });
  shapes.push(
    caption('cap-a', f.capA, 'A', 'end'),
    caption('cap-b', f.capB, 'B', 'middle'),
    caption('cap-op', f.opAt, OPS[op].label, 'end'),
  );

  // The table, or the tape and the verdict.
  if (r) {
    const tapeRoles = new Map(roles);
    stack([
      (out, x, y) =>
        drawInputTape(out, x, y, {
          word: r.word,
          read: r.read,
          head: r.read,
          headLabel: pairName(r.p, r.q),
          room,
          roles: tapeRoles,
        }),
      (out, x, y) => drawVerdict(out, x, y, r.verdict, roles),
    ])(shapes, f.px, f.py);
  } else {
    drawTable(shapes, f, s, op, b, roles);
  }

  const label = [
    describe(s, settings),
    b ? describeBuild(b, pr) : found.size ? describeBuild(finished(pr, op), pr) : '',
    r ? describeRun(r) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { shapes, bounds: padBounds(f.bounds, 14), label };
}

/** A finished build, for drawing the product once it is built. */
function finished(pr: ReturnType<typeof productOf>, op: SetOp): BuildRun {
  return {
    op,
    fullA: true,
    fullB: true,
    rows: pr.order,
    moves: pr.dfa.moves,
    accept: pr.dfa.accept,
    queue: [],
    done: pr.order,
    finished: true,
  };
}

function drawTable(
  shapes: Shape[],
  f: Frame,
  s: ProdState,
  op: SetOp,
  b: BuildRun | undefined,
  roles: Map<string, MarkRole>,
) {
  const A = full(s.a);
  const B = full(s.b);
  const pr = productOf(A, B, op);
  const r = b ?? (s.built ? finished(pr, op) : undefined);
  const mark = (yes: boolean): GridCell => ({ text: yes ? '✓' : '–' });
  drawGrid(shapes, {
    id: 'tbl',
    x: f.px,
    y: f.py,
    cols: ['pair', 'inA', 'inB', 'op', ...A.alphabet.map((c) => `on-${c}`)],
    head: ['pair', 'A', 'B', OPS[op].label, ...A.alphabet],
    widths: tableWidths(A, B, op),
    rows: (r?.rows ?? []).map((n) => {
      const [p, q] = pr.pairs[n]!;
      const acc = r!.accept.includes(n);
      return {
        key: n,
        cells: [
          { text: `${n === pr.order[0] ? '→' : ''}${n}` },
          mark(A.accept.includes(p)),
          mark(B.accept.includes(q)),
          { ...mark(acc), role: acc ? 'found' : undefined },
          ...A.alphabet.map((c) => ({
            text: r!.moves.find((m) => m.from === n && m.on === c)?.to ?? '',
          })),
        ],
      };
    }),
    reserve: pr.order.length,
    roles,
  });
}
