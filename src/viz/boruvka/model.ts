/**
 * Borůvka's minimum spanning tree. Start with every vertex as a component of its own. In each
 * round, every component picks the cheapest edge that leaves it, all the picks join the tree at
 * once, and the components they connect merge. Each round at least halves the number of
 * components, so there are at most log₂ V rounds.
 *
 * Ties must be broken the same way everywhere, or two components can pick two different edges
 * of the same weight that together close a cycle. Here an edge is cheaper than another when it
 * is lighter, or equally heavy and earlier in the edge list (name order: A-D before B-C). The
 * scan goes through the edge list in that order, so the first edge seen wins a tie.
 *
 * Settings: layout (the drawing only).
 *
 * Components are numbered 1, 2, ... in the order of their first vertex (name order), and each
 * is named by that vertex. The state is just the graph; a run travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId, weightId } from '../../layouts/graph';
import { describeGraph, keyOf, listWords, plural, type Edge, type Graph } from '../_graph/graph';
import { graphVars, loadOp } from '../_graph/kit';
import { edgeWords, startMstGraph, treeWords } from '../_graph/mst';

export interface BoruvkaState {
  graph: Graph;
}

export interface BoruvkaSettings {
  [key: string]: Scalar;
  layout: GraphTemplate;
}

export const defaults: BoruvkaSettings = { layout: 'force' };

export interface BoruvkaRun {
  /** The component of each vertex: its first vertex in name order. */
  comp: Record<string, string>;
  /** Tree edges (keys), in the order they joined. */
  T: string[];
  /** This round's cheapest edge per component (by component name), as an edge key. */
  pick: Record<string, string>;
  round: number;
  /** The edge being looked at. */
  at?: string;
  checks: number;
  weight: number;
  final?: boolean;
}

export interface BoruvkaExtra {
  run?: BoruvkaRun;
}

type S = BoruvkaState;
type X = BoruvkaExtra;
type Op = OpSpec<S, BoruvkaSettings, X>;
type PStep = Step<S, X>;

export function init(): S {
  return { graph: startMstGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
export const pickId = (key: string) => `pk-${key}`;
export const treeCellId = (key: string) => `T-${key}`;
export const compCellId = (v: string) => `tbl-c-${v}`;

/** Component names in order, so each gets a number (1, 2, ...) and a color. */
export const compNames = (g: Graph, comp: Record<string, string>): string[] =>
  g.vertices.filter((v) => comp[v] === v);

/** Components after joining these tree edges: each vertex labeled by its piece's first vertex. */
export function componentsOf(g: Graph, T: string[]): Record<string, string> {
  const adj = new Map(g.vertices.map((v) => [v, [] as string[]]));
  for (const k of T) {
    const e = g.edges.find((x) => keyOf(x) === k)!;
    adj.get(e.u)!.push(e.v);
    adj.get(e.v)!.push(e.u);
  }
  const comp: Record<string, string> = {};
  for (const s of g.vertices) {
    if (comp[s]) continue;
    comp[s] = s;
    const stack = [s];
    while (stack.length) {
      const u = stack.pop()!;
      for (const w of adj.get(u)!) {
        if (!comp[w]) {
          comp[w] = s;
          stack.push(w);
        }
      }
    }
  }
  return comp;
}

/** Cheaper: lighter, or as heavy and earlier in the edge list. */
export const cheaper = (g: Graph, a: Edge, b: Edge | undefined): boolean =>
  !b || a.w < b.w || (a.w === b.w && g.edges.indexOf(a) < g.edges.indexOf(b));

/** Borůvka without steps: the tree edges in the order they join, and the rounds. */
export function boruvkaPlain(g: Graph) {
  let T: string[] = [];
  let rounds = 0;
  for (;;) {
    const comp = componentsOf(g, T);
    const pick = new Map<string, Edge>();
    for (const e of g.edges) {
      const a = comp[e.u]!;
      const b = comp[e.v]!;
      if (a === b) continue;
      if (cheaper(g, e, pick.get(a))) pick.set(a, e);
      if (cheaper(g, e, pick.get(b))) pick.set(b, e);
    }
    if (pick.size === 0) break;
    rounds++;
    const add = compNames(g, comp)
      .filter((c) => pick.has(c))
      .map((c) => keyOf(pick.get(c)!));
    T = [...T, ...add.filter((k, i) => add.indexOf(k) === i && !T.includes(k))];
  }
  return { T, rounds };
}

function clone(r: BoruvkaRun): BoruvkaRun {
  return { ...r, comp: { ...r.comp }, T: [...r.T], pick: { ...r.pick } };
}

function runVars(g: Graph, r: BoruvkaRun): Record<string, Scalar> {
  return {
    ...graphVars(g),
    round: r.round,
    components: compNames(g, r.comp).length,
    '|T|': r.T.length,
    weight: r.weight,
    checks: r.checks,
  };
}

const edgeOf = (g: Graph, k: string) => g.edges.find((e) => keyOf(e) === k)!;

const run: Op = {
  label: 'Run Borůvka',
  arity: 0,
  *run(s) {
    const g = s.graph;
    if (g.directed) {
      yield {
        state: s,
        marks: [],
        say: "Borůvka's algorithm needs an undirected graph: a spanning tree joins vertices, and its edges have no direction. This graph is directed. Load it with - instead of >, such as A-B:4, and run again.",
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies PStep;
      return s;
    }
    const r: BoruvkaRun = {
      comp: Object.fromEntries(g.vertices.map((v) => [v, v])),
      T: [],
      pick: {},
      round: 0,
      checks: 0,
      weight: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): PStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const compText = (c: string) => {
      const members = g.vertices.filter((v) => r.comp[v] === c);
      return members.length === 1 ? c : `{${members.join(', ')}}`;
    };
    yield step(
      `Every vertex starts as a component of its own: ${plural(g.vertices.length, 'component')}. In each round, every component picks the cheapest edge leaving it, and they all join the tree together.`,
      ['sig', 'init'],
      2,
    );

    for (;;) {
      const names = compNames(g, r.comp);
      const label = Object.fromEntries(names.map((c) => [c, compText(c)]));
      r.pick = {};
      r.round++;
      yield step(
        `Round ${r.round}: ${plural(names.length, 'component')}. Scan every edge once and remember, for each component, the cheapest edge that leaves it. Equal weights: the edge earlier in the list wins.`,
        ['while', 'clear'],
        2,
      );
      for (const e of g.edges) {
        const k = keyOf(e);
        r.at = k;
        r.checks++;
        const a = r.comp[e.u]!;
        const b = r.comp[e.v]!;
        const em = [mark(edgeId(k), 'active'), mark(weightId(k), 'active')];
        if (a === b) {
          yield step(
            `${edgeWords(e)}: both ends are in ${compText(a)}. It does not leave the component, so skip it.`,
            ['for', 'same'],
            3,
            [...em, mark(vertexId(e.u), 'compare'), mark(vertexId(e.v), 'compare')],
          );
          continue;
        }
        const won: string[] = [];
        const lost: string[] = [];
        for (const c of [a, b]) {
          const cur = r.pick[c] ? edgeOf(g, r.pick[c]!) : undefined;
          if (cheaper(g, e, cur)) {
            r.pick[c] = k;
            won.push(cur ? `${compText(c)} (was ${edgeWords(cur)})` : compText(c));
          } else lost.push(`${compText(c)} keeps ${edgeWords(cur!)}`);
        }
        yield step(
          `${edgeWords(e)} joins ${compText(a)} and ${compText(b)}. ${
            won.length ? `Cheapest so far for ${listWords(won)}.` : ''
          }${lost.length ? ` ${lost.join('; ')}.` : ''}`.trim(),
          ['for', 'cmp'],
          3,
          [...em, mark(vertexId(e.u), 'visit'), mark(vertexId(e.v), 'visit')],
        );
      }
      r.at = undefined;
      const picks = names.filter((c) => r.pick[c]);
      if (picks.length === 0) {
        r.round--;
        break;
      }
      const lonely = names.filter((c) => !r.pick[c]);
      yield step(
        `The picks: ${picks.map((c) => `${label[c]} → ${edgeWords(edgeOf(g, r.pick[c]!))}`).join('; ')}.${
          lonely.length
            ? ` ${listWords(lonely.map((c) => label[c]!))} ${lonely.length === 1 ? 'has' : 'have'} no edge leaving: a piece of the graph on ${lonely.length === 1 ? 'its' : 'their'} own.`
            : ''
        }`,
        ['picks'],
        2,
        [...new Set(picks.map((c) => r.pick[c]!))].flatMap((k) => [
          mark(edgeId(k), 'active'),
          mark(pickId(k), 'active'),
        ]),
      );
      for (const c of picks) {
        const k = r.pick[c]!;
        const e = edgeOf(g, k);
        if (r.T.includes(k)) {
          yield step(
            `${label[c]} picked ${edgeWords(e)} too, and it is in the tree already. Both ends chose the same edge: nothing more to add.`,
            ['add', 'dup'],
            3,
            [mark(edgeId(k), 'done'), mark(pickId(k), 'compare')],
          );
          continue;
        }
        const before = { a: compText(r.comp[e.u]!), b: compText(r.comp[e.v]!) };
        r.T.push(k);
        r.weight += e.w;
        r.comp = componentsOf(g, r.T);
        yield step(
          `Add the pick of ${label[c]}, ${edgeWords(e)}: ${before.a} and ${before.b} merge into ${compText(r.comp[e.u]!)}. Tree weight so far: ${r.weight}.`,
          ['add', 'union'],
          2,
          [mark(edgeId(k), 'done'), mark(weightId(k), 'done'), mark(treeCellId(k), 'active')],
        );
      }
      const left = compNames(g, r.comp).length;
      yield step(
        `End of round ${r.round}: ${plural(names.length, 'component')} became ${left}.${left > 1 ? '' : ' One component: the tree spans the graph.'}`,
        ['while'],
        2,
      );
      if (left === 1) break;
    }
    r.pick = {};
    r.final = true;
    const edges = r.T.map((k) => edgeOf(g, k));
    yield step(`Done after ${plural(r.round, 'round')}. ${treeWords(g, edges)}`, ['ret'], 1);
    return s;
  },
};

const load = loadOp<S, BoruvkaSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) =>
    g.directed
      ? "This graph is directed, and Borůvka's algorithm needs an undirected one."
      : `Press Run to build a minimum spanning tree, every component picking its cheapest edge at once.${
          g.weighted || g.edges.length === 0
            ? ''
            : ' Every edge has weight 1 here, so ties decide everything. Give edges weights such as A-B:4.'
        }`,
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

export function pseudocode(): PseudoBlock[] {
  const lines = [
    L('sig', 0, 'MST-BORUVKA(G, w)', 'Build a minimum spanning tree:'),
    L('init', 1, 'T = ∅; each v is a component', 'no edges yet; every vertex alone.'),
    L('while', 1, 'while an edge leaves some component', 'While the pieces are not joined,'),
    L('clear', 2, 'cheapest[C] = NIL for each C', 'forget last round’s picks.'),
    L('for', 2, 'for each edge (u, v) ∈ G.E', 'Look at every edge once:'),
    L('same', 3, 'if comp(u) == comp(v): skip', 'skip it if both ends are in one piece,'),
    L('cmp', 3, 'update cheapest of both comps', 'else it may be the cheapest way out of either.'),
    L('picks', 2, '// each C has its cheapest edge', 'Every piece now has its cheapest edge.'),
    L('add', 2, 'for each C: e = cheapest[C]', 'For each piece’s pick,'),
    L('dup', 3, 'if e ∈ T: skip', 'skip it if the other end picked it too,'),
    L('union', 3, 'T = T ∪ {e}; merge comps', 'else add it and merge the two pieces.'),
    L('ret', 1, 'return T', 'T is a minimum spanning tree.'),
  ];
  return [{ op: 'run', lines }];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: Borůvka's algorithm grows every component at once, each one taking its cheapest edge out.`;
}

export const initialVars = (s: S) => graphVars(s.graph);

export const describe = (s: S): string => describeGraph(s.graph);

export function describeRun(g: Graph, r: BoruvkaRun): string {
  const comps = compNames(g, r.comp)
    .map((c) => `{${g.vertices.filter((v) => r.comp[v] === c).join(', ')}}`)
    .join(' ');
  return `Round ${r.round}. Components: ${comps}. Tree edges: ${r.T.join(', ') || 'none'}, weight ${r.weight}.`;
}

/** The code tabs' line: total weight | tree edges in the order they joined. */
export function runSummary(r: BoruvkaRun): string {
  return `${r.weight} | ${r.T.join(' ')}`.trimEnd();
}
