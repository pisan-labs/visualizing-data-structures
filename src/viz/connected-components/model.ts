/**
 * Connected components of an undirected graph: every vertex gets the number of its piece.
 *
 * The outer loop takes the vertices in name order. Each vertex that has no component yet
 * starts a new one, and a search from it labels everything it can reach with that number.
 * Components are numbered in the order of their first (smallest) vertex.
 *
 * Settings: `method` picks the search: breadth-first with a queue, depth-first by recursion,
 * or no search at all, union-find (CLRS's CONNECTED-COMPONENTS with disjoint sets: union by
 * rank and path compression). Union-find reads the edge list once and numbers the sets at the
 * end, the same way, so all three give the same numbers. A directed graph's arcs count both
 * ways here (weakly connected components).
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  describeGraph,
  findEdge,
  inNeighbours,
  listWords,
  neighbours,
  plural,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, type GraphState } from '../_graph/kit';

export type CcState = GraphState;
export type Method = 'bfs' | 'dfs' | 'union-find';

export interface CcSettings {
  [key: string]: Scalar;
  method: Method;
  layout: GraphTemplate;
}

export const defaults: CcSettings = { method: 'bfs', layout: 'force' };

/** One run's bookkeeping, as it stands at a step. */
export interface CcRun {
  method: Method;
  /** Component number of each vertex, from 1; null while it has none. */
  cc: Record<string, number | null>;
  count: number;
  /** BFS: the queue, front first. DFS: the open VISIT calls, bottom first. */
  frontier: string[];
  /** Vertices in the order they got their number (searches only). */
  order: string[];
  /** Edges looked at, by key. Searches: tree or seen. Union-find: joined two sets, or not. */
  edges: Record<string, 'tree' | 'seen'>;
  /** The root of the current search, the vertex being scanned, the neighbour looked at. */
  s?: string;
  u?: string;
  v?: string;
  /** Searches: neighbour checks. Union-find: FIND-SET calls. */
  checks: number;
  /** Union-find only: parents and ranks. */
  p: Record<string, string>;
  rank: Record<string, number>;
  unions: number;
}

export interface CcExtra {
  run?: CcRun;
}

type S = CcState;
type X = CcExtra;
type Op = OpSpec<S, CcSettings, X>;
type CcStep = Step<S, X>;
type Gen = Generator<CcStep, void, void>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });
const vmark = (v: string, role: Mark['role']) => [mark(vertexId(v), role)];

/** Table cell ids (see view.ts): `tbl-<row>-<vertex>`; queue and call cells `q-<v>`. */
export const cellId = (row: 'cc' | 'p' | 'rank', v: string) => `tbl-${row}-${v}`;
export const frontierId = (v: string) => `q-${v}`;

/** Neighbours in name order, ignoring direction: out- and in-neighbours together. */
export function linked(g: Graph, u: string): string[] {
  if (!g.directed) return neighbours(g, u);
  return [...new Set([...neighbours(g, u), ...inNeighbours(g, u)])].sort(compareNames);
}

/** The key of the stored edge between u and v (either direction when directed). */
export function linkKey(g: Graph, u: string, v: string): string {
  const e = findEdge(g, u, v) ?? findEdge(g, v, u)!;
  return `${e.u}-${e.v}`;
}

/** How the edge between u and v is written, as it is stored. */
export function linkText(g: Graph, u: string, v: string): string {
  const e = findEdge(g, u, v) ?? findEdge(g, v, u)!;
  return g.directed ? `${e.u}>${e.v}` : `${e.u}-${e.v}`;
}

function clone(r: CcRun): CcRun {
  return {
    ...r,
    cc: { ...r.cc },
    frontier: [...r.frontier],
    order: [...r.order],
    edges: { ...r.edges },
    p: { ...r.p },
    rank: { ...r.rank },
  };
}

function runVars(g: Graph, r: CcRun): Record<string, Scalar> {
  const base = { ...graphVars(g), components: r.count };
  if (r.method === 'union-find') {
    const sets = g.vertices.filter((v) => r.p[v] === v).length;
    return { ...base, sets, u: r.u ?? '–', v: r.v ?? '–', finds: r.checks, unions: r.unions };
  }
  return {
    ...base,
    s: r.s ?? '–',
    u: r.u ?? '–',
    v: r.v ?? '–',
    [r.method === 'bfs' ? 'Q' : 'calls']: r.frontier.length ? r.frontier.join(' ') : 'empty',
    labeled: r.order.length,
    checks: r.checks,
  };
}

/** The components, each in name order, in the order of their numbers. */
export function groups(g: Graph, r: CcRun): string[][] {
  const out: string[][] = Array.from({ length: r.count }, () => []);
  for (const v of g.vertices) if (r.cc[v]) out[r.cc[v]! - 1]!.push(v);
  return out;
}

/** The final answer of a run, in the code tabs' words: count | number per vertex. */
export function runSummary(g: Graph, r: CcRun): string {
  return `${r.count} | ${g.vertices.map((v) => r.cc[v] ?? '-').join(' ')}`.trimEnd();
}

/** The set each vertex is in, by its root (no compression: just for the picture). */
export function rootOf(r: CcRun, v: string): string {
  let x = v;
  while (r.p[x] !== x) x = r.p[x]!;
  return x;
}

const run: Op = {
  label: 'Find components',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const method = settings.method;
    const r: CcRun = {
      method,
      cc: Object.fromEntries(g.vertices.map((v) => [v, null])),
      count: 0,
      frontier: [],
      order: [],
      edges: {},
      checks: 0,
      p: {},
      rank: {},
      unions: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): CcStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const dir = g.directed
      ? ' The graph is directed, but here an arc joins its two ends either way, so these are its weakly connected components.'
      : '';

    if (g.vertices.length === 0) {
      yield step(
        'The graph is empty: no vertices, so no components.',
        method === 'union-find' ? ['uf.count'] : ['ret'],
        1,
      );
      return s;
    }

    if (method === 'union-find') {
      yield* unionFind(g, r, step, dir);
      return s;
    }

    yield step(
      `Every vertex starts with no component (cc = NIL), and count = 0. The outer loop takes the vertices in name order, ${listWords(g.vertices.slice(0, 3))}${g.vertices.length > 3 ? ', and so on' : ''}.${dir}`,
      ['init.count', 'init.for', 'init.cc'],
      2,
    );

    const bfs = method === 'bfs';

    function* visit(u: string, c: number): Gen {
      r.cc[u] = c;
      r.order.push(u);
      r.frontier.push(u);
      r.u = u;
      r.v = undefined;
      const adj = linked(g, u);
      yield step(
        `VISIT(${u}, ${c}): ${u} joins component ${c}.${adj.length ? ` Now its neighbours in order: ${listWords(adj)}.` : ` It has no neighbours.`}`,
        ['v.sig', 'v.mark'],
        2,
        [...vmark(u, 'active'), mark(cellId('cc', u), 'new'), mark(frontierId(u), 'new')],
      );
      for (const v of adj) {
        r.u = u;
        r.v = v;
        r.checks++;
        const key = linkKey(g, u, v);
        const e = linkText(g, u, v);
        if (r.cc[v] === null) {
          r.edges[key] = 'tree';
          yield step(
            `${e}: ${v} has no component yet, so call VISIT(${v}, ${c}). ${u}'s call waits.`,
            ['v.for', 'v.if', 'v.rec'],
            3,
            [...vmark(u, 'active'), ...vmark(v, 'new'), mark(edgeId(key), 'active')],
          );
          yield* visit(v, c);
        } else {
          if (!r.edges[key]) r.edges[key] = 'seen';
          yield step(
            `${e}: ${v} is already in component ${r.cc[v]}, so skip it.`,
            ['v.for', 'v.if'],
            3,
            [...vmark(u, 'active'), ...vmark(v, 'compare'), mark(edgeId(key), 'active')],
          );
        }
      }
      r.frontier.pop();
      r.u = r.frontier.at(-1);
      r.v = undefined;
      yield step(
        `${u} has no more neighbours to try: VISIT(${u}) returns${r.u ? ` to ${r.u}` : ''}.`,
        ['v.for'],
        3,
        vmark(u, 'done'),
      );
    }

    function* search(src: string, c: number): Gen {
      r.cc[src] = c;
      r.order.push(src);
      r.frontier.push(src);
      yield step(
        `${src} gets component number ${c} and goes in the queue: Q = [${src}].`,
        ['s.cc', 'q.init'],
        2,
        [...vmark(src, 'new'), mark(cellId('cc', src), 'new'), mark(frontierId(src), 'new')],
      );
      while (r.frontier.length) {
        const u = r.frontier.shift()!;
        r.u = u;
        r.v = undefined;
        const adj = linked(g, u);
        yield step(
          adj.length
            ? `Dequeue ${u}. Look at its neighbours in order: ${listWords(adj)}.`
            : `Dequeue ${u}. It has no neighbours.`,
          ['while', 'deq'],
          2,
          vmark(u, 'active'),
        );
        for (const v of adj) {
          r.v = v;
          r.checks++;
          const key = linkKey(g, u, v);
          const e = linkText(g, u, v);
          if (r.cc[v] === null) {
            r.cc[v] = c;
            r.order.push(v);
            r.frontier.push(v);
            r.edges[key] = 'tree';
            yield step(
              `${e}: ${v} has no component yet. It joins component ${c} and goes to the back of the queue.`,
              ['for', 'if', 'v.cc', 'enq'],
              2,
              [
                ...vmark(u, 'active'),
                ...vmark(v, 'new'),
                mark(edgeId(key), 'active'),
                mark(cellId('cc', v), 'new'),
                mark(frontierId(v), 'new'),
              ],
            );
          } else {
            if (!r.edges[key]) r.edges[key] = 'seen';
            yield step(
              `${e}: ${v} is already in component ${r.cc[v]}, so skip it.`,
              ['for', 'if'],
              3,
              [...vmark(u, 'active'), ...vmark(v, 'compare'), mark(edgeId(key), 'active')],
            );
          }
        }
      }
      r.u = undefined;
      r.v = undefined;
    }

    for (const src of g.vertices) {
      r.s = src;
      if (r.cc[src] !== null) {
        yield step(
          `${src} is already in component ${r.cc[src]}: a search found it. Move on.`,
          ['outer', 'if.new'],
          3,
          vmark(src, 'compare'),
        );
        continue;
      }
      r.count++;
      const c = r.count;
      yield step(
        `${src} has no component yet, so it starts a new one: count = ${c}.${c === 2 ? ` Nothing in component 1 can reach ${src}.` : c > 2 ? ` Nothing in components 1 to ${c - 1} can reach ${src}.` : ''}`,
        ['outer', 'if.new', 'count'],
        2,
        vmark(src, 'active'),
      );
      if (bfs) {
        yield* search(src, c);
      } else {
        yield* visit(src, c);
      }
      const members = g.vertices.filter((v) => r.cc[v] === c);
      yield step(
        `Component ${c} is complete: ${members.length === 1 ? `${src} on its own` : listWords(members)}. The search from ${src} found everything it can reach.`,
        bfs ? ['while'] : ['visit.call'],
        2,
        members.map((v) => mark(vertexId(v), 'done')),
      );
    }
    r.s = undefined;
    yield step(finalSay(g, r), ['ret'], 1);
    return s;
  },
};

function finalSay(g: Graph, r: CcRun): string {
  const parts = groups(g, r).map(
    (m, i) => `${i + 1}: ${m.length === 1 ? `${m[0]} alone` : listWords(m)}`,
  );
  if (r.count === 1)
    return `Done. The graph is connected: one component holds all ${plural(g.vertices.length, 'vertex', 'vertices')}.`;
  return `Done. ${plural(r.count, 'component')}: ${parts.join('; ')}. No edge joins two of them.`;
}

function* unionFind(
  g: Graph,
  r: CcRun,
  step: (say: string, lines: string[], level: 1 | 2 | 3, marks?: Mark[]) => CcStep,
  dir: string,
): Gen {
  for (const v of g.vertices) {
    r.p[v] = v;
    r.rank[v] = 0;
  }
  yield step(
    `MAKE-SET for every vertex: each one is a set of its own, its own parent (p), with rank 0. That is ${plural(g.vertices.length, 'set')}.${dir}`,
    ['uf.for', 'uf.make'],
    2,
  );

  /** FIND-SET with path compression; says the path it walked. */
  const find = (x: string): { root: string; path: string[] } => {
    r.checks++;
    const path = [x];
    while (r.p[path.at(-1)!] !== path.at(-1)!) path.push(r.p[path.at(-1)!]!);
    const root = path.at(-1)!;
    for (const y of path) r.p[y] = root;
    return { root, path };
  };
  const findWords = (x: string, f: { root: string; path: string[] }) =>
    f.path.length === 1
      ? `FIND-SET(${x}) = ${x}, a root`
      : `FIND-SET(${x}) follows ${f.path.join(' → ')}, so it is ${f.root}${f.path.length > 2 ? ` (and ${listWords(f.path.slice(0, -2))} now point${f.path.length === 3 ? 's' : ''} straight at ${f.root})` : ''}`;

  for (const e of g.edges) {
    const key = `${e.u}-${e.v}`;
    const text = g.directed ? `${e.u}>${e.v}` : key;
    r.u = e.u;
    r.v = e.v;
    const fu = find(e.u);
    const fv = find(e.v);
    const marks = [...vmark(e.u, 'active'), ...vmark(e.v, 'active'), mark(edgeId(key), 'active')];
    if (fu.root === fv.root) {
      r.edges[key] = 'seen';
      yield step(
        `Edge ${text}: ${findWords(e.u, fu)}; ${findWords(e.v, fv)}. Same set, so this edge adds nothing.`,
        ['uf.edges', 'uf.if'],
        2,
        marks,
      );
      continue;
    }
    // CLRS LINK(x, y): the root of lower rank goes under the other; on a tie, x goes under y.
    const [x, y] = [fu.root, fv.root];
    let child: string;
    let parent: string;
    if (r.rank[x]! > r.rank[y]!) {
      child = y;
      parent = x;
    } else {
      child = x;
      parent = y;
    }
    const tie = r.rank[x] === r.rank[y];
    r.p[child] = parent;
    if (tie) r.rank[parent]!++;
    r.unions++;
    r.edges[key] = 'tree';
    const how = tie
      ? `Both roots have rank ${r.rank[parent]! - 1}, so ${child} goes under ${parent} and ${parent}'s rank grows to ${r.rank[parent]}`
      : `${parent} has the higher rank, so ${child} goes under ${parent}`;
    const sets = g.vertices.filter((v) => r.p[v] === v).length;
    yield step(
      `Edge ${text}: ${findWords(e.u, fu)}; ${findWords(e.v, fv)}. Different sets, so UNION them. ${how}. ${plural(sets, 'set')} left.`,
      ['uf.edges', 'uf.if', 'uf.union'],
      2,
      [...marks, mark(cellId('p', child), 'new')],
    );
  }
  r.u = undefined;
  r.v = undefined;
  // Number the sets in the order of their smallest vertex, as the searches do.
  const number = new Map<string, number>();
  for (const v of g.vertices) {
    const root = rootOf(r, v);
    if (!number.has(root)) number.set(root, number.size + 1);
    r.cc[v] = number.get(root)!;
  }
  r.count = number.size;
  yield step(
    `${finalSay(g, r)} Each set is numbered by its first vertex in name order, as a search would number it.`,
    ['uf.count'],
    1,
  );
}

const load = loadOp<S, CcSettings, X>({
  make: (graph) => ({ graph }),
  ready: () => 'Press Find components to number its pieces.',
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: CcSettings): PseudoBlock[] {
  const head = [
    L('sig', 0, 'CONNECTED-COMPONENTS(G)', 'Number the pieces of G:'),
    L('init.count', 1, 'count = 0', 'No components yet.'),
    L('init.for', 1, 'for each vertex u in G.V', 'Every vertex'),
    L('init.cc', 2, 'u.cc = NIL', 'starts with no number.'),
    L('outer', 1, 'for each vertex s in G.V', 'Take each vertex s in order:'),
    L('if.new', 2, 'if s.cc == NIL', 'if it has no number yet,'),
    L('count', 3, 'count = count + 1', 'it starts a new component.'),
  ];
  if (settings.method === 'union-find') {
    return [
      {
        op: 'run',
        lines: [
          L('sig', 0, 'CONNECTED-COMPONENTS(G)', 'Number the pieces of G:'),
          L('uf.for', 1, 'for each vertex v in G.V', 'Every vertex'),
          L('uf.make', 2, 'MAKE-SET(v)', 'starts as a set of its own.'),
          L('uf.edges', 1, 'for each edge (u, v) in G.E', 'For each edge u-v:'),
          L('uf.if', 2, 'if FIND-SET(u) ≠ FIND-SET(v)', 'if its ends are in different sets,'),
          L('uf.union', 3, 'UNION(u, v)', 'merge the two sets.'),
          L('uf.count', 1, 'return the number of sets', 'Each set left is a component.'),
        ],
      },
    ];
  }
  if (settings.method === 'dfs') {
    return [
      {
        op: 'run',
        lines: [
          ...head,
          L('visit.call', 3, 'VISIT(s, count)', 'Label all it reaches.'),
          L('ret', 1, 'return count', 'Report the number of pieces.'),
          L('v.sig', 0, 'VISIT(u, c)', 'Label from u:'),
          L('v.mark', 1, 'u.cc = c', 'u is in component c.'),
          L('v.for', 1, 'for each v in G.Adj[u]', 'For each neighbour v:'),
          L('v.if', 2, 'if v.cc == NIL', 'if it has no number,'),
          L('v.rec', 3, 'VISIT(v, c)', 'label from v too.'),
        ],
      },
    ];
  }
  return [
    {
      op: 'run',
      lines: [
        ...head,
        L('s.cc', 3, 's.cc = count', 's gets that number'),
        L('q.init', 3, 'Q = ⟨s⟩', 'and starts a queue.'),
        L('while', 3, 'while Q ≠ ∅', 'While the queue has vertices,'),
        L('deq', 4, 'u = DEQUEUE(Q)', 'take u from the front.'),
        L('for', 4, 'for each v in G.Adj[u]', 'For each neighbour v:'),
        L('if', 5, 'if v.cc == NIL', 'if it has no number,'),
        L('v.cc', 6, 'v.cc = count', 'it joins this component'),
        L('enq', 6, 'ENQUEUE(Q, v)', 'and goes to the back.'),
        L('ret', 1, 'return count', 'Report the number of pieces.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Find components: each piece of the graph gets its own number and color.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: CcRun): string {
  if (r.method === 'union-find' && r.count === 0) {
    const sets = new Map<string, string[]>();
    for (const v of g.vertices) {
      const root = rootOf(r, v);
      sets.set(root, [...(sets.get(root) ?? []), v]);
    }
    return `Union-find. Sets so far: ${[...sets.values()].map((m) => `{${m.join(', ')}}`).join(' ')}.`;
  }
  const done = groups(g, r)
    .map((m, i) => `component ${i + 1}: ${m.join(', ')}`)
    .join('; ');
  return `${plural(r.count, 'component')} so far${done ? `: ${done}` : ''}.`;
}
