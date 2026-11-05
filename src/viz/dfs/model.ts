/**
 * Depth-first search, CLRS style: DFS(G, s) goes as deep as it can before backing up. Each
 * vertex gets a discovery time d, a finish time f and a parent π, and each edge is classified
 * when it is first explored:
 *   tree     to a white vertex (it is discovered from here)
 *   back     to a gray vertex: an ancestor still being explored (a cycle)
 *   forward  to a black descendant (directed graphs only)
 *   cross    to a black vertex in another branch or tree (directed graphs only)
 * An undirected graph has only tree and back edges: each edge is classified from whichever end
 * the search reaches first, and the edge back to a vertex's own parent is its tree edge.
 *
 * The search starts at s and then goes on from every vertex still white, in name order (with s
 * the first vertex, this is exactly CLRS's DFS(G)).
 *
 * Settings: `style` runs DFS-VISIT as a recursive function (the call stack is drawn), or with an
 * explicit stack of (vertex, parent) pairs. The stack pushes every white neighbour and pops the
 * last one first, so pushing neighbours A to Z visits them Z to A: a different order from the
 * recursion. Pushing them Z to A gives the recursion's order back. Either way the result is a
 * valid depth-first search, and the stack version with reversed pushes matches the recursive
 * one exactly.
 *
 * The state is just the graph; a run's bookkeeping travels in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, kindId, vertexId } from '../../layouts/graph';
import {
  describeGraph,
  edgeKey,
  edgeText,
  listWords,
  neighbours,
  type Graph,
} from '../_graph/graph';
import { graphVars, loadOp, startGraph, vertexArg, type GraphState } from '../_graph/kit';

export type DfsState = GraphState;
export type Style = 'recursive' | 'stack' | 'stackrev';
export type Color = 'white' | 'gray' | 'black';
export type EdgeKind = 'tree' | 'back' | 'forward' | 'cross';

export interface DfsSettings {
  [key: string]: Scalar;
  style: Style;
  layout: GraphTemplate;
}

export const defaults: DfsSettings = { style: 'recursive', layout: 'force' };

/** An entry of the explicit stack: a vertex and the vertex that pushed it (null for a root). */
export interface StackEntry {
  uid: number;
  v: string;
  from: string | null;
}

/** One run's bookkeeping, as it stands at a step. */
export interface DfsRun {
  s: string;
  color: Record<string, Color>;
  d: Record<string, number | null>;
  f: Record<string, number | null>;
  pi: Record<string, string | null>;
  time: number;
  /** Classified edges, by key. */
  edges: Record<string, EdgeKind>;
  /** Recursion: the vertices whose DFS-VISIT calls are open, bottom first. */
  calls: string[];
  /** Explicit stack, bottom first. */
  stack: StackEntry[];
  /** The root of each depth-first tree, in order. */
  roots: string[];
  u?: string;
  v?: string;
  /** Edge checks so far (each (u, v) in an adjacency list counts once). */
  checks: number;
}

export interface DfsExtra {
  run?: DfsRun;
}

type S = DfsState;
type X = DfsExtra;
type Op = OpSpec<S, DfsSettings, X>;
type DfsStep = Step<S, X>;
type Gen = Generator<DfsStep, void, void>;

export function init(): S {
  return { graph: startGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Table cell ids (see view.ts): `tbl-<row>-<vertex>`; stack cells `st-<uid>`, calls `cs-<v>`. */
export const cellId = (row: 'd' | 'f' | 'pi', v: string) => `tbl-${row}-${v}`;

export const KIND_WORD: Record<EdgeKind, string> = {
  tree: 'tree edge',
  back: 'back edge',
  forward: 'forward edge',
  cross: 'cross edge',
};

function clone(r: DfsRun): DfsRun {
  return {
    ...r,
    color: { ...r.color },
    d: { ...r.d },
    f: { ...r.f },
    pi: { ...r.pi },
    edges: { ...r.edges },
    calls: [...r.calls],
    stack: r.stack.map((e) => ({ ...e })),
    roots: [...r.roots],
  };
}

/** The parentheses so far: "(A" when a vertex is discovered and "A)" when it finishes. */
export function parens(g: Graph, r: DfsRun): string[] {
  const events: [number, string][] = [];
  for (const v of g.vertices) {
    if (r.d[v] !== null) events.push([r.d[v]!, `(${v}`]);
    if (r.f[v] !== null) events.push([r.f[v]!, `${v})`]);
  }
  return events.sort((a, b) => a[0] - b[0]).map((e) => e[1]);
}

function runVars(g: Graph, r: DfsRun): Record<string, Scalar> {
  const kinds = Object.values(r.edges);
  return {
    ...graphVars(g),
    s: r.s,
    u: r.u ?? '–',
    v: r.v ?? '–',
    time: r.time,
    tree: kinds.filter((k) => k === 'tree').length,
    back: kinds.filter((k) => k === 'back').length,
    ...(g.directed
      ? {
          forward: kinds.filter((k) => k === 'forward').length,
          cross: kinds.filter((k) => k === 'cross').length,
        }
      : {}),
    checks: r.checks,
  };
}

/** The final answer of a run, in the code tabs' words (per vertex, then per stored edge). */
export function runSummary(g: Graph, r: DfsRun): string {
  const letter = { tree: 'T', back: 'B', forward: 'F', cross: 'C' } as const;
  return [
    g.vertices.map((v) => r.d[v]).join(' '),
    g.vertices.map((v) => r.f[v]).join(' '),
    g.vertices.map((v) => r.pi[v] ?? '-').join(' '),
    g.edges.map((e) => `${e.u}-${e.v}:${letter[r.edges[`${e.u}-${e.v}`]!] ?? '?'}`).join(' '),
  ]
    .join(' | ')
    .trimEnd();
}

/**
 * What exploring (u, v) means when v is not white: the kind of edge it is (null when it was
 * already classified from the other end, in an undirected graph), and how to say it.
 */
function classify(
  g: Graph,
  r: DfsRun,
  u: string,
  v: string,
): { kind: EdgeKind | null; say: string } {
  const e = edgeText(g, u, v);
  if (!g.directed && r.pi[u] === v)
    return {
      kind: null,
      say: `${e}: ${v} is ${u}'s parent. This is the tree edge ${u} was found along, seen from the other end.`,
    };
  if (r.color[v] === 'gray')
    return {
      kind: 'back',
      say: `${e}: ${v} is gray, still being explored, so ${v} is an ancestor of ${u}. (${u}, ${v}) is a back edge: it closes a cycle.`,
    };
  if (!g.directed)
    return {
      kind: null,
      say: `${e}: ${v} is black. The search already crossed this edge from ${v}'s end, as a back edge.`,
    };
  if (r.d[u]! < r.d[v]!)
    return {
      kind: 'forward',
      say: `${e}: ${v} is black, and ${v}.d = ${r.d[v]} is later than ${u}.d = ${r.d[u]}: ${v} was found below ${u} and is done. (${u}, ${v}) is a forward edge, a shortcut down the tree.`,
    };
  return {
    kind: 'cross',
    say: `${e}: ${v} is black, and ${v}.d = ${r.d[v]} is earlier than ${u}.d = ${r.d[u]}: ${v} is in a branch that was finished before ${u} began. (${u}, ${v}) is a cross edge.`,
  };
}

const run: Op = {
  label: 'Run DFS from',
  arity: 1,
  *run(s, [arg], { settings }) {
    const g = s.graph;
    const a = vertexArg(g, arg);
    if ('error' in a) {
      yield {
        state: s,
        marks: [],
        say: `DFS needs a vertex to start from. ${a.error}`,
        lines: ['sig'],
        level: 1,
        vars: graphVars(g),
      } satisfies DfsStep;
      return s;
    }
    const src = a.v;
    const r: DfsRun = {
      s: src,
      color: Object.fromEntries(g.vertices.map((v) => [v, 'white' as Color])),
      d: Object.fromEntries(g.vertices.map((v) => [v, null])),
      f: Object.fromEntries(g.vertices.map((v) => [v, null])),
      pi: Object.fromEntries(g.vertices.map((v) => [v, null])),
      time: 0,
      edges: {},
      calls: [],
      stack: [],
      roots: [],
      checks: 0,
    };
    let uid = 1;
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): DfsStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    const edgeMarks = (u: string, v: string, kind: EdgeKind | null): Mark[] => {
      const key = edgeKey(g, u, v);
      return [
        mark(vertexId(u), 'active'),
        mark(vertexId(v), 'compare'),
        mark(edgeId(key), 'active'),
        ...(kind && kind !== 'tree' ? [mark(kindId(key), 'active')] : []),
      ];
    };

    // ----- Recursion: DFS-VISIT calls itself.
    const visit = function* (u: string): Gen {
      r.time++;
      r.d[u] = r.time;
      r.color[u] = 'gray';
      r.calls.push(u);
      r.u = u;
      r.v = undefined;
      yield step(
        `DFS-VISIT(${u}): time = ${r.time}, so ${u}.d = ${r.time}, and ${u} turns gray.`,
        ['visit', 'v.time', 'v.d', 'v.gray'],
        2,
        [mark(vertexId(u), 'active'), mark(cellId('d', u), 'new')],
      );
      for (const v of neighbours(g, u)) {
        r.u = u;
        r.v = v;
        r.checks++;
        if (r.color[v] === 'white') {
          r.pi[v] = u;
          r.edges[edgeKey(g, u, v)] = 'tree';
          yield step(
            `${edgeText(g, u, v)}: ${v} is white, so (${u}, ${v}) is a tree edge. ${v}.π = ${u}; call DFS-VISIT(${v}), going one level deeper.`,
            ['v.for', 'v.white', 'v.pi', 'v.call'],
            2,
            [...edgeMarks(u, v, 'tree'), mark(cellId('pi', v), 'new')],
          );
          yield* visit(v);
          r.u = u;
          r.v = undefined;
          continue;
        }
        const c = classify(g, r, u, v);
        if (c.kind) r.edges[edgeKey(g, u, v)] = c.kind;
        // The lines of the test that decided it.
        const lines =
          r.color[v] === 'gray'
            ? ['v.ifgray', ...(c.kind ? ['v.back'] : [])]
            : c.kind === 'cross'
              ? ['v.iffwd', 'v.cross']
              : ['v.iffwd', ...(c.kind ? ['v.fwd'] : [])];
        yield step(c.say, ['v.for', ...lines], c.kind ? 2 : 3, edgeMarks(u, v, c.kind));
      }
      r.u = u;
      r.v = undefined;
      r.time++;
      r.f[u] = r.time;
      r.color[u] = 'black';
      r.calls.pop();
      const back = r.calls.at(-1);
      const none = neighbours(g, u).length === 0;
      yield step(
        `${none ? `${u} has no ${g.directed ? 'edges out' : 'neighbours'}, so it is done at once` : `Every neighbour of ${u} has been explored`}: time = ${r.time}, so ${u}.f = ${r.time}, and ${u} turns black.${back ? ` Return to DFS-VISIT(${back}).` : ''}`,
        ['v.time2', 'v.f', 'v.black'],
        2,
        [mark(vertexId(u), 'done'), mark(cellId('f', u), 'new')],
      );
    };

    // ----- Explicit stack of (vertex, parent) pairs.
    const reverse = settings.style === 'stackrev';
    const stackSearch = function* (root: string): Gen {
      r.stack.push({ uid: uid++, v: root, from: null });
      yield step(`Push (${root}, NIL): the stack starts with ${root}.`, ['s.init'], 2, [
        mark(vertexId(root), 'active'),
      ]);
      while (r.stack.length > 0) {
        const top = r.stack.at(-1)!;
        const u = top.v;
        r.u = u;
        r.v = undefined;
        if (r.color[u] === 'white') {
          r.pi[u] = top.from;
          if (top.from) r.edges[edgeKey(g, top.from, u)] = 'tree';
          r.time++;
          r.d[u] = r.time;
          r.color[u] = 'gray';
          yield step(
            `The top is (${u}, ${top.from ?? 'NIL'}), and ${u} is white: discover it. ${top.from ? `(${top.from}, ${u}) is a tree edge, so ${u}.π = ${top.from}. ` : ''}time = ${r.time}, so ${u}.d = ${r.time}, and ${u} turns gray. It stays on the stack until it is done.`,
            ['s.top', 's.white', 's.pi', 's.time', 's.d', 's.gray'],
            2,
            [
              mark(vertexId(u), 'active'),
              mark(`st-${top.uid}`, 'active'),
              mark(cellId('d', u), 'new'),
              ...(top.from ? [mark(edgeId(edgeKey(g, top.from, u)), 'active')] : []),
            ],
          );
          const pushed: string[] = [];
          const list = neighbours(g, u);
          for (const v of reverse ? [...list].reverse() : list) {
            r.u = u;
            r.v = v;
            r.checks++;
            if (r.color[v] === 'white') {
              const entry = { uid: uid++, v, from: u };
              r.stack.push(entry);
              pushed.push(v);
              yield step(
                `${edgeText(g, u, v)}: ${v} is white, so push (${v}, ${u}).`,
                ['s.for', 's.ifw', 's.push'],
                3,
                [
                  mark(vertexId(u), 'active'),
                  mark(vertexId(v), 'compare'),
                  mark(`st-${entry.uid}`, 'new'),
                ],
              );
              continue;
            }
            const c = classify(g, r, u, v);
            if (c.kind) r.edges[edgeKey(g, u, v)] = c.kind;
            yield step(c.say, ['s.for', 's.other'], c.kind ? 2 : 3, edgeMarks(u, v, c.kind));
          }
          r.v = undefined;
          if (pushed.length > 0) {
            const next = pushed.at(-1)!;
            const order = reverse
              ? `${u}'s neighbours went on Z to A, so the first in name order, ${next}, is on top: the same order as the recursion.`
              : `The last one pushed, ${next}, is on top, so it comes next, before ${listWords(pushed.slice(0, -1).reverse()) || 'anything else'}. The recursion would take ${pushed[0]} first.`;
            yield step(
              pushed.length === 1
                ? `${u} pushed ${next}, which is on top: it comes next.`
                : `${u} pushed ${listWords(pushed)}. ${order}`,
              ['s.for'],
              2,
              [mark(vertexId(u), 'active'), ...pushed.map((v) => mark(vertexId(v), 'compare'))],
            );
          }
          continue;
        }
        r.stack.pop();
        if (r.color[u] === 'gray') {
          r.time++;
          r.f[u] = r.time;
          r.color[u] = 'black';
          yield step(
            `(${u}, ${top.from ?? 'NIL'}) is on top again, and ${u} is gray: everything it pushed is done. Pop it: time = ${r.time}, so ${u}.f = ${r.time}, and ${u} turns black.`,
            ['s.top', 's.else', 's.ifg', 's.time2', 's.f', 's.black'],
            2,
            [mark(vertexId(u), 'done'), mark(cellId('f', u), 'new')],
          );
          continue;
        }
        // An old copy: u was found another way since this entry was pushed.
        const p = top.from;
        if (p) {
          const c = classify(g, r, p, u);
          if (c.kind) r.edges[edgeKey(g, p, u)] = c.kind;
          r.u = p;
          r.v = u;
          const what = c.kind
            ? `It was found below ${p}, so (${p}, ${u}) is a ${KIND_WORD[c.kind]}.`
            : `The edge ${edgeText(g, p, u)} was already crossed from ${u}'s end, as a back edge.`;
          yield step(
            `Pop (${u}, ${p}): ${u} is already black, found another way after ${p} pushed it. ${what}`,
            ['s.top', 's.else', 's.stale', 's.class'],
            c.kind ? 2 : 3,
            edgeMarks(p, u, c.kind),
          );
        } else {
          yield step(`Pop (${u}, NIL): ${u} is already black.`, ['s.top', 's.else'], 3);
        }
      }
    };

    const recursive = settings.style === 'recursive';
    yield step(
      `DFS from ${src}. Every vertex starts white with no parent, and time = 0.${g.directed ? ' The graph is directed, so the search follows edges forward.' : ''}`,
      ['init.for', 'init.color', 'init.pi', 'init.time'],
      2,
    );
    for (const x of [src, ...g.vertices.filter((v) => v !== src)]) {
      r.u = undefined;
      r.v = undefined;
      if (r.color[x] !== 'white') {
        yield step(`${x} is already black, so it starts nothing.`, ['loop', 'loop.if'], 3, [
          mark(vertexId(x), 'compare'),
        ]);
        continue;
      }
      r.roots.push(x);
      yield step(
        r.roots.length === 1
          ? `Start at ${x}: it is white, so it is the root of the first depth-first tree.`
          : `${x} is still white: nothing explored so far reaches it. It starts a new depth-first tree.`,
        ['loop', 'loop.if', 'loop.call'],
        2,
        [mark(vertexId(x), 'active')],
      );
      yield* recursive ? visit(x) : stackSearch(x);
    }
    r.u = undefined;
    r.v = undefined;
    const kinds = Object.values(r.edges);
    const count = (k: EdgeKind) => kinds.filter((x) => x === k).length;
    const parts = (['tree', 'back', 'forward', 'cross'] as const)
      .filter((k) => count(k) > 0)
      .map((k) => `${count(k)} ${KIND_WORD[k]}${count(k) === 1 ? '' : 's'}`);
    const trees =
      r.roots.length === 1
        ? 'one depth-first tree'
        : `${r.roots.length} depth-first trees, rooted at ${listWords(r.roots)}`;
    const cycle =
      count('back') > 0
        ? ' A back edge means the graph has a cycle.'
        : ' No back edges, so there is no cycle.';
    yield step(
      `DFS is done: ${trees}, with ${listWords(parts) || 'no edges'}.${cycle} Read the times in order and the parentheses nest: ${parens(g, r).join(' ')}.`,
      [],
      1,
    );
    return s;
  },
};

const load = loadOp<S, DfsSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => `Type a vertex and press Run to search from it, such as ${g.vertices[0]}.`,
});

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS. Lines stay short (33 characters with their indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

const MAIN = (call: string) => [
  L('sig', 0, 'DFS(G, s)', 'Depth-first search from s:'),
  L('init.for', 1, 'for each vertex u in G.V', 'For every vertex,'),
  L('init.color', 2, 'u.color = WHITE', 'it is undiscovered (white)'),
  L('init.pi', 2, 'u.π = NIL', 'and has no parent.'),
  L('init.time', 1, 'time = 0', 'The clock starts at 0.'),
  L('loop', 1, 'for each u in G.V, s first', 'Try s, then every other vertex:'),
  L('loop.if', 2, 'if u.color == WHITE', 'if it is still undiscovered,'),
  L('loop.call', 3, `${call}(G, u)`, 'search from it: a new tree.'),
];

export function pseudocode(settings: DfsSettings): PseudoBlock[] {
  if (settings.style === 'recursive') {
    return [
      {
        op: 'run',
        lines: [
          ...MAIN('DFS-VISIT'),
          L('visit', 0, 'DFS-VISIT(G, u)', 'Explore from u:'),
          L('v.time', 1, 'time = time + 1', 'tick the clock,'),
          L('v.d', 1, 'u.d = time', 'u is discovered now,'),
          L('v.gray', 1, 'u.color = GRAY', 'and is being explored (gray).'),
          L('v.for', 1, 'for each v in G.Adj[u]', 'For each neighbour v of u:'),
          L('v.white', 2, 'if v.color == WHITE', 'if v is undiscovered,'),
          L('v.pi', 3, 'v.π = u', '(u, v) is a tree edge;'),
          L('v.call', 3, 'DFS-VISIT(G, v)', 'explore from v first.'),
          L('v.ifgray', 2, 'elseif v.color == GRAY', 'If v is still being explored,'),
          L('v.back', 3, '(u, v) is a back edge', 'v is an ancestor: a back edge.'),
          L('v.iffwd', 2, 'elseif u.d < v.d', 'If v is done and came after u,'),
          L('v.fwd', 3, '(u, v) is a forward edge', 'it is below u: a forward edge.'),
          L('v.cross', 2, 'else (u, v) is a cross edge', 'Otherwise it is a cross edge.'),
          L('v.time2', 1, 'time = time + 1', 'Tick the clock:'),
          L('v.f', 1, 'u.f = time', 'u finishes now'),
          L('v.black', 1, 'u.color = BLACK', 'and is done (black).'),
        ],
      },
    ];
  }
  const reverse = settings.style === 'stackrev';
  return [
    {
      op: 'run',
      lines: [
        ...MAIN('DFS-STACK'),
        L('stack', 0, 'DFS-STACK(G, r)', 'Explore from r with a stack:'),
        L('s.init', 1, 'S = [(r, NIL)]', 'Start with r, which has no parent.'),
        L('s.while', 1, 'while S is not empty', 'While the stack has entries,'),
        L('s.top', 2, '(u, p) = TOP(S)', 'look at the top one, u from p.'),
        L('s.white', 2, 'if u.color == WHITE', 'If u is undiscovered,'),
        L('s.pi', 3, 'u.π = p', 'p is its parent (a tree edge),'),
        L('s.time', 3, 'time = time + 1', 'tick the clock,'),
        L('s.d', 3, 'u.d = time', 'u is discovered now'),
        L('s.gray', 3, 'u.color = GRAY', 'and is being explored (gray).'),
        L(
          's.for',
          3,
          reverse ? 'for v in reverse(G.Adj[u])' : 'for each v in G.Adj[u]',
          reverse ? 'For each neighbour, Z to A:' : 'For each neighbour, A to Z:',
        ),
        L('s.ifw', 4, 'if v.color == WHITE', 'if it is undiscovered,'),
        L('s.push', 5, 'PUSH(S, (v, u))', 'push it, found from u;'),
        L('s.other', 4, 'else classify (u, v)', 'else name the edge (u, v).'),
        L('s.else', 2, 'else POP(S)', 'Otherwise take the entry off.'),
        L('s.ifg', 3, 'if u.color == GRAY', 'If u is still being explored,'),
        L('s.time2', 4, 'time = time + 1', 'tick the clock:'),
        L('s.f', 4, 'u.f = time', 'u finishes now'),
        L('s.black', 4, 'u.color = BLACK', 'and is done (black).'),
        L('s.stale', 3, 'elseif p ≠ NIL', 'If it was an old copy from p,'),
        L('s.class', 4, 'classify (p, u)', 'name the edge (p, u).'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Type a start vertex, such as ${s.graph.vertices[0]}, and press Run: depth-first search goes as deep as it can, then backs up.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: the graph, plus where a run stands. */
export function describeRun(g: Graph, r: DfsRun): string {
  const times = g.vertices
    .filter((v) => r.d[v] !== null)
    .map((v) => `${v} ${r.d[v]}/${r.f[v] ?? ''}`)
    .join(', ');
  return `DFS from ${r.s}, time ${r.time}. Times so far: ${times}.`;
}
