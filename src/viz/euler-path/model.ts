/**
 * Euler paths and circuits with Hierholzer's algorithm. An Euler path uses every edge exactly
 * once; an Euler circuit also ends where it started.
 *
 * First the page checks the conditions (and refuses, saying why, when they fail):
 *   undirected  every vertex with an edge is in one piece, and 0 vertices (circuit) or exactly 2
 *               (path, from one to the other) have odd degree
 *   directed    the same piece rule (ignoring directions), and out − in = 0 everywhere (circuit),
 *               or one vertex with +1 (the start), one with −1 (the end) and 0 elsewhere (path)
 *
 * Then Hierholzer's algorithm with a stack: look at the top vertex v. If v has an unused edge,
 * walk it and push the far end. If not, pop v and put it at the front of the circuit. When the
 * walk gets stuck and pops back to a vertex that still has unused edges, the walk from there is
 * a detour, and popping it later splices it into the circuit at that vertex.
 *
 * Settings
 *   arrows  'follow'  a directed graph is directed (in/out degrees)
 *           'ignore'  treat every arc as an undirected edge (A>B and B>A become two edges)
 *   layout  the drawing only
 * Ties: the unused edge to the neighbour first in name order (then the edge first in the list).
 * The walk starts at the odd (or +1) vertex first in name order, or for a circuit at the first
 * vertex with an edge.
 *
 * The state is just the graph; a run travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import { compareNames, describeGraph, keyOf, listWords, plural, type Graph } from '../_graph/graph';
import { graphVars, loadOp, type GraphState } from '../_graph/kit';
import { parseGraph } from '../_graph/parse';

export type EulerState = GraphState;
export type Arrows = 'follow' | 'ignore';

export interface EulerSettings {
  [key: string]: Scalar;
  arrows: Arrows;
  layout: GraphTemplate;
}

export const defaults: EulerSettings = { arrows: 'follow', layout: 'force' };

/** The house with a roof: D and E have odd degree, so there is a path from D to E. */
export const START_TEXT = 'A-B, A-C, B-C, B-D, B-E, C-D, C-E, D-E';

export interface Cell {
  /** v.n for the n-th push. */
  uid: string;
  v: string;
}

export interface EulerRun {
  directed: boolean;
  kind: 'circuit' | 'path' | 'none';
  /** Why there is no Euler path, when kind is 'none'. */
  why?: string;
  start?: string;
  /** Edges walked, by edge key, with the end they were walked from. */
  used: Record<string, string>;
  /** Walk order of the used edges. */
  order: string[];
  stack: Cell[];
  /** The circuit so far, in its final order (it grows at the front). */
  circuit: Cell[];
  /** The most cells the stack and the circuit hold during the run, for the panel's room. */
  room: number;
  /** Checking: vertices that break the degree rule. */
  bad?: string[];
  phase: 'check' | 'walk' | 'done';
  /** The walk is resuming from a vertex that still had unused edges (a detour). */
  detour?: string;
  final?: boolean;
}

export interface EulerExtra {
  run?: EulerRun;
}

type S = EulerState;
type X = EulerExtra;
type Op = OpSpec<S, EulerSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: parseGraph(START_TEXT) as Graph };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const cellId = (uid: string) => `h-${uid}`;

// ---------------------------------------------------------------------------------------------
// The multigraph the algorithm walks (directions kept or dropped)

export interface WalkEdge {
  key: string;
  u: string;
  v: string;
}

export interface Walk {
  directed: boolean;
  vertices: string[];
  edges: WalkEdge[];
  /** Per vertex: the edges leaving it, as [edge, far end], neighbour order then list order. */
  out: Map<string, [WalkEdge, string][]>;
  inDeg: Map<string, number>;
}

export function walkOf(g: Graph, arrows: Arrows): Walk {
  const directed = g.directed && arrows === 'follow';
  const edges = g.edges.map((e) => ({ key: keyOf(e), u: e.u, v: e.v }));
  const out = new Map(g.vertices.map((v) => [v, [] as [WalkEdge, string][]]));
  const inDeg = new Map(g.vertices.map((v) => [v, 0]));
  for (const e of edges) {
    out.get(e.u)!.push([e, e.v]);
    if (directed) inDeg.set(e.v, inDeg.get(e.v)! + 1);
    else out.get(e.v)!.push([e, e.u]);
  }
  const index = new Map(edges.map((e, i) => [e.key, i]));
  for (const list of out.values())
    list.sort((a, b) => compareNames(a[1], b[1]) || index.get(a[0].key)! - index.get(b[0].key)!);
  return { directed, vertices: g.vertices, edges, out, inDeg };
}

export const outDeg = (w: Walk, v: string) => w.out.get(v)!.length;
/** Degree (undirected) or out − in (directed). */
export const balance = (w: Walk, v: string) =>
  w.directed ? outDeg(w, v) - w.inDeg.get(v)! : outDeg(w, v);

/** Vertices with an edge, all in one piece (directions ignored)? */
export function onePiece(w: Walk): { ok: boolean; pieces: string[][] } {
  const adj = new Map(w.vertices.map((v) => [v, [] as string[]]));
  for (const e of w.edges) {
    adj.get(e.u)!.push(e.v);
    adj.get(e.v)!.push(e.u);
  }
  const seen = new Set<string>();
  const pieces: string[][] = [];
  for (const s of w.vertices) {
    if (seen.has(s) || adj.get(s)!.length === 0) continue;
    const piece = [s];
    seen.add(s);
    for (let i = 0; i < piece.length; i++)
      for (const x of adj.get(piece[i]!)!)
        if (!seen.has(x)) {
          seen.add(x);
          piece.push(x);
        }
    pieces.push(piece.sort(compareNames));
  }
  return { ok: pieces.length <= 1, pieces };
}

/** The verdict before walking: the kind, the start, the vertices that break the rule, why not. */
export function verdict(w: Walk): {
  kind: EulerRun['kind'];
  start?: string;
  bad: string[];
  why?: string;
  pieces: string[][];
} {
  const { ok, pieces } = onePiece(w);
  const withEdges = w.vertices.filter((v) => outDeg(w, v) > 0 || (w.inDeg.get(v) ?? 0) > 0);
  if (w.directed) {
    const bad = w.vertices.filter((v) => balance(w, v) !== 0);
    const plus = bad.filter((v) => balance(w, v) === 1);
    const minus = bad.filter((v) => balance(w, v) === -1);
    const shapeOk =
      bad.length === 0 || (bad.length === 2 && plus.length === 1 && minus.length === 1);
    if (!shapeOk)
      return {
        kind: 'none',
        bad,
        pieces,
        why: `${listWords(bad.map((v) => `${v} (${signed(balance(w, v))})`))} ${bad.length === 1 ? 'has' : 'have'} out − in ≠ 0. A path needs every vertex balanced, except one start with +1 and one end with −1.`,
      };
    if (!ok) return { kind: 'none', bad, pieces, why: piecesWhy(pieces) };
    return bad.length
      ? { kind: 'path', start: plus[0], bad, pieces }
      : { kind: 'circuit', start: withEdges[0], bad, pieces };
  }
  const odd = w.vertices.filter((v) => outDeg(w, v) % 2 === 1);
  if (odd.length !== 0 && odd.length !== 2)
    return {
      kind: 'none',
      bad: odd,
      pieces,
      why: `${plural(odd.length, 'vertex', 'vertices')} (${listWords(odd)}) ${odd.length === 1 ? 'has' : 'have'} odd degree. A path enters and leaves every vertex in between, so it allows only 0 or 2 odd ones: its two ends.`,
    };
  if (!ok) return { kind: 'none', bad: odd, pieces, why: piecesWhy(pieces) };
  return odd.length
    ? { kind: 'path', start: odd[0], bad: odd, pieces }
    : { kind: 'circuit', start: withEdges[0], bad: odd, pieces };
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

const piecesWhy = (pieces: string[][]) =>
  `The edges are in ${pieces.length} separate pieces (${pieces.map((p) => `{${p.join(', ')}}`).join(' and ')}), and one walk cannot jump between them.`;

/** Hierholzer without steps: the path (vertex names), the edge order, and the most cells held. */
export function hierholzer(w: Walk, start: string) {
  const next = new Map(w.vertices.map((v) => [v, 0]));
  const used = new Set<string>();
  const stack = [start];
  const circuit: string[] = [];
  const order: string[] = [];
  let room = 1;
  while (stack.length) {
    const v = stack.at(-1)!;
    const list = w.out.get(v)!;
    let i = next.get(v)!;
    while (i < list.length && used.has(list[i]![0].key)) i++;
    next.set(v, i);
    if (i < list.length) {
      const [e, to] = list[i]!;
      used.add(e.key);
      order.push(e.key);
      stack.push(to);
    } else {
      circuit.unshift(stack.pop()!);
    }
    room = Math.max(room, stack.length + circuit.length);
  }
  return { path: circuit, order, room };
}

function clone(r: EulerRun): EulerRun {
  return {
    ...r,
    used: { ...r.used },
    order: [...r.order],
    stack: [...r.stack],
    circuit: [...r.circuit],
    bad: r.bad && [...r.bad],
  };
}

function runVars(g: Graph, w: Walk, r: EulerRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    [w.directed ? 'unbalanced' : 'odd']: r.bad?.length ?? '–',
    start: r.start ?? '–',
    used: r.order.length,
    stack: r.stack.length,
    circuit: r.circuit.length,
  };
}

const run: Op = {
  label: 'Find Euler path',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const w = walkOf(g, settings.arrows);
    const v0 = verdict(w);
    const r: EulerRun = {
      directed: w.directed,
      kind: v0.kind,
      used: {},
      order: [],
      stack: [],
      circuit: [],
      room: 1,
      phase: 'check',
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, w, r),
      extra: { run: clone(r) },
    });
    if (g.edges.length === 0) {
      r.kind = 'none';
      r.why = 'The graph has no edges, so there is nothing to walk.';
      r.phase = 'done';
      r.final = true;
      yield step(r.why, ['sig'], 1);
      return s;
    }
    const ignored =
      g.directed && !w.directed
        ? ' Arrows are ignored (see the options): every arc counts as an edge.'
        : '';
    // 1. Degrees.
    r.bad = v0.bad;
    const degText = w.directed
      ? `out − in for each vertex: ${w.vertices.map((v) => `${v} ${signed(balance(w, v))}`).join(', ')}.`
      : `the degree of each vertex: ${w.vertices.map((v) => `${v} ${outDeg(w, v)}`).join(', ')}.`;
    const degOk = v0.kind !== 'none' || v0.why!.includes('pieces');
    yield step(
      `Count ${degText}${ignored} ${
        w.directed
          ? v0.bad.length
            ? `Not balanced: ${listWords(v0.bad)}.`
            : 'Every vertex is balanced.'
          : v0.bad.length
            ? `Odd: ${listWords(v0.bad)}.`
            : 'No vertex has odd degree.'
      }`,
      ['deg'],
      2,
      v0.bad.map((v) => mark(vertexId(v), degOk ? 'compare' : 'error')),
    );
    if (v0.kind === 'none') {
      r.why = v0.why;
      r.phase = 'done';
      r.final = true;
      yield step(
        `No Euler path. ${v0.why}`,
        [v0.why!.includes('pieces') ? 'conn' : 'cond', 'none'],
        1,
        v0.why!.includes('pieces') ? [] : v0.bad.map((v) => mark(vertexId(v), 'error')),
      );
      return s;
    }
    r.start = v0.start;
    const plan = hierholzer(w, v0.start!);
    r.room = plan.room;
    yield step(
      `${
        v0.kind === 'circuit'
          ? w.directed
            ? 'Every vertex is balanced'
            : 'Every degree is even'
          : w.directed
            ? `Only ${v0.start} (+1) and ${v0.bad.find((v) => v !== v0.start)} (−1) are unbalanced`
            : `Exactly two vertices, ${listWords(v0.bad)}, have odd degree`
      }, and the edges are all in one piece. So there is an Euler ${v0.kind}${
        v0.kind === 'path' ? `, starting at ${v0.start}` : ''
      }. ${v0.kind === 'circuit' ? `Start anywhere: ${v0.start}, the first vertex with an edge.` : `It must start there and end at the other one.`}`,
      ['cond', 'conn', 'start'],
      2,
      [mark(vertexId(v0.start!), 'active')],
    );
    // 2. Hierholzer.
    r.phase = 'walk';
    const pushes = new Map<string, number>();
    const push = (v: string): Cell => {
      const n = (pushes.get(v) ?? 0) + 1;
      pushes.set(v, n);
      const c = { uid: `${v}.${n}`, v };
      r.stack.push(c);
      return c;
    };
    const first = push(v0.start!);
    yield step(
      `Push ${v0.start} onto the stack. The circuit starts empty; it is built from the end, as vertices come off the stack.`,
      ['init'],
      2,
      [mark(vertexId(v0.start!), 'active'), mark(cellId(first.uid), 'active')],
    );
    const next = new Map(w.vertices.map((v) => [v, 0]));
    let popped = false;
    while (r.stack.length) {
      const top = r.stack.at(-1)!;
      const v = top.v;
      const list = w.out.get(v)!;
      let i = next.get(v)!;
      while (i < list.length && r.used[list[i]![0].key] !== undefined) i++;
      next.set(v, i);
      if (i < list.length) {
        const [e, to] = list[i]!;
        r.used[e.key] = v;
        r.order.push(e.key);
        const c = push(to);
        const detour = popped;
        r.detour = detour ? v : undefined;
        popped = false;
        const left = r.order.length === g.edges.length ? ' That was the last edge.' : '';
        yield step(
          detour
            ? `${v} still has an unused edge, so start a detour from ${v}: take ${v}${w.directed ? '→' : '-'}${to} and push ${to}. The detour will come off the stack later, spliced into the circuit at ${v}.${left}`
            : `Top of the stack is ${v}. Take its unused edge ${v}${w.directed ? '→' : '-'}${to}, mark it used, and push ${to}.${left}`,
          ['while', 'top', 'if', 'take'],
          2,
          [
            mark(vertexId(v), 'active'),
            mark(vertexId(to), 'visit'),
            mark(edgeId(e.key), 'active'),
            mark(cellId(c.uid), 'active'),
          ],
        );
      } else {
        r.stack.pop();
        r.circuit.unshift(top);
        r.detour = undefined;
        popped = true;
        yield step(
          `${v} has no unused edges left: pop it and put it at the front of the circuit.${
            r.stack.length ? '' : ' The stack is empty.'
          }`,
          ['while', 'top', 'else', 'pop'],
          2,
          [mark(vertexId(v), 'compare'), mark(cellId(top.uid), 'active')],
        );
      }
    }
    r.phase = 'done';
    r.final = true;
    const path = r.circuit.map((c) => c.v);
    yield step(
      `Euler ${v0.kind}: ${path.join(' → ')}. It uses all ${plural(g.edges.length, 'edge')} once${
        v0.kind === 'circuit'
          ? `, and ends where it started`
          : `, from ${path[0]} to ${path.at(-1)}`
      }.`,
      ['ret'],
      1,
      path
        .map((v) => mark(vertexId(v), 'found'))
        .filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i),
    );
    return s;
  },
};

const load = loadOp<S, EulerSettings, X>({
  make: (graph) => ({ graph }),
  ready: () => 'Press Find to check the degrees and trace an Euler path if there is one.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: EulerSettings): PseudoBlock[] {
  const d = settings.arrows === 'follow';
  const lines = [
    L('sig', 0, 'EULER-PATH(G)', 'Walk every edge exactly once:'),
    d
      ? L(
          'deg',
          1,
          'b(v) = out(v) − in(v) for each v',
          'count arcs out minus arcs in at each vertex.',
        )
      : L('deg', 1, 'odd = {v : deg(v) is odd}', 'find the vertices of odd degree.'),
    d
      ? L(
          'cond',
          1,
          'need all b = 0, or one +1, one −1',
          'All balanced, or one start (+1) and one end (−1).',
        )
      : L('cond', 1, 'need |odd| = 0 or 2', 'There must be no odd vertex, or exactly two.'),
    L(
      'conn',
      1,
      'and all edges in one piece',
      'And every edge must be reachable from every other.',
    ),
    L('none', 2, 'else return NIL', 'Otherwise there is no Euler path.'),
    d
      ? L(
          'start',
          1,
          's = the +1 vertex, else any',
          'Start at the +1 vertex, or anywhere for a circuit.',
        )
      : L(
          'start',
          1,
          's = an odd vertex, else any',
          'Start at an odd vertex, or anywhere for a circuit.',
        ),
    L('init', 1, 'stack = [s]; circuit = []', 'Push s; the circuit is empty.'),
    L('while', 1, 'while stack ≠ ∅', 'While the stack is not empty,'),
    L('top', 2, 'v = stack.top', 'look at the top vertex v.'),
    L('if', 2, 'if v has an unused edge (v, w)', 'If v has an edge not walked yet,'),
    L('take', 3, 'mark it used; push w', 'walk it and push the other end.'),
    L('else', 2, 'else', 'Otherwise v is stuck:'),
    L('pop', 3, 'pop v; circuit = v + circuit', 'pop it onto the front of the circuit.'),
    L('ret', 1, 'return circuit', 'The circuit is the Euler path.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find: can you draw it without lifting your pen or going over an edge twice?`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(r: EulerRun): string {
  if (r.kind === 'none' && r.final) return `No Euler path. ${r.why ?? ''}`.trim();
  const st = r.stack.map((c) => c.v).join(', ');
  const ci = r.circuit.map((c) => c.v).join(', ');
  return `Euler ${r.kind}. Stack: ${st || 'empty'}. Circuit: ${ci || 'empty'}.`;
}

/** The code tabs' line: the path, or "none". */
export const runSummary = (r: EulerRun): string =>
  r.kind === 'none' ? 'none' : r.circuit.map((c) => c.v).join(' ');
