/**
 * Maximum bipartite matching by augmenting paths.
 *
 * The graph has a left side L and a right side R, and every edge joins the two. A matching is a
 * set of edges with no vertex in two of them. An augmenting path starts at a free vertex of L,
 * alternates edges not in the matching and edges in it, and ends at a free vertex of R; flipping
 * it (matched edges leave, the others join) makes the matching one larger. A matching is maximum
 * exactly when no augmenting path is left (Berge).
 *
 * Settings
 *   method  'kuhn' (default): for each vertex of L in name order, a depth-first search for an
 *           augmenting path from it, visiting each vertex of R at most once per search.
 *           'hopcroft-karp': phases. A breadth-first search from every free vertex of L at
 *           once finds the length of the shortest augmenting paths; depth-first searches along
 *           those layers then find a maximal set of disjoint shortest paths, and all of them
 *           are flipped. O(√V) phases.
 *   layout  'columns' (L on the left, R on the right) or 'rows' (L on top)
 *
 * Sides: when every edge joins a name that starts with a letter to one that starts with a digit
 * (workers A, B, C and jobs 1, 2, 3), letters are L and digits R. Otherwise the page two-colours
 * the graph, the first vertex of each piece in name order going to L, and refuses a graph with
 * an odd cycle. Neighbours always come in name order.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import { edgeId, vertexId } from '../../layouts/graph';
import {
  compareNames,
  edgeKey,
  listWords,
  makeGraph,
  neighbours,
  plural,
  type Edge,
  type Graph,
} from '../_graph/graph';
import { readGraph } from '../_graph/parse';

export interface BmState {
  graph: Graph;
  left: string[];
  right: string[];
}

export interface BmSettings {
  [key: string]: Scalar;
  method: 'kuhn' | 'hopcroft-karp';
  layout: 'columns' | 'rows';
}

export const defaults: BmSettings = { method: 'kuhn', layout: 'columns' };

/** Five workers and five jobs; Kuhn needs a long augmenting path for D, and E stays free. */
export const START_TEXT = 'A-1, A-2, B-1, B-3, C-2, C-4, D-2, D-3, E-3';

export interface BmRun {
  /** Partner of each vertex, or null. */
  mate: Record<string, string | null>;
  size: number;
  /** The vertex of L being matched (Kuhn), or the vertex the DFS stands at. */
  u?: string;
  /** The alternating path being built: L, R, L, R, ... */
  path: string[];
  /** Kuhn: vertices of R visited in this search. */
  visited: string[];
  /** Hopcroft-Karp: layers of L (null is ∞), the phase, and the shortest path length. */
  dist?: Record<string, number | null>;
  phase: number;
  found?: number;
  /** Augmenting paths flipped so far, in order. */
  flipped: string[][];
  /** The last path that was flipped (to draw for a step). */
  last?: string[];
  done?: boolean;
  /** Edges looked at, over the whole run. */
  checks: number;
}

export interface BmExtra {
  run?: BmRun;
}

type S = BmState;
type X = BmExtra;
type Op = OpSpec<S, BmSettings, X>;
type BmStep = Step<S, X>;

// ---------------------------------------------------------------------------------------------
// Reading a bipartite graph

const startsWithDigit = (v: string) => /^[0-9]/.test(v);

export function sides(g: Graph): { left: string[]; right: string[] } | Error {
  const digits = g.vertices.filter(startsWithDigit);
  const letters = g.vertices.filter((v) => !startsWithDigit(v));
  if (
    digits.length &&
    letters.length &&
    g.edges.every((e) => startsWithDigit(e.u) !== startsWithDigit(e.v))
  )
    return { left: letters, right: digits };
  // Two-colour each piece from its first vertex in name order.
  const side = new Map<string, 0 | 1>();
  for (const s of g.vertices) {
    if (side.has(s)) continue;
    side.set(s, 0);
    const queue = [s];
    for (let i = 0; i < queue.length; i++) {
      const u = queue[i]!;
      for (const v of neighbours(g, u)) {
        if (!side.has(v)) {
          side.set(v, side.get(u) === 0 ? 1 : 0);
          queue.push(v);
        } else if (side.get(v) === side.get(u))
          return new Error(
            `That graph is not bipartite: ${u} and ${v} would have to be on the same side, because the graph has a cycle of odd length through them.`,
          );
      }
    }
  }
  return {
    left: g.vertices.filter((v) => side.get(v) === 0),
    right: g.vertices.filter((v) => side.get(v) === 1),
  };
}

export function parseBipartite(text: string): BmState | Error {
  const r = readGraph(String(text ?? ''));
  if (r instanceof Error) return r;
  const g0 = r.graph;
  // Direction does not matter for a matching: keep each pair once.
  const seen = new Set<string>();
  const edges: Edge[] = [];
  for (const e of g0.edges) {
    const k = compareNames(e.u, e.v) < 0 ? `${e.u}-${e.v}` : `${e.v}-${e.u}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push({ u: e.u, v: e.v, w: 1 });
  }
  const graph = makeGraph({ directed: false, weighted: false, vertices: g0.vertices, edges });
  const sd = sides(graph);
  if (sd instanceof Error) return sd;
  return { graph, ...sd };
}

export const startState = (): S => parseBipartite(START_TEXT) as S;

export function init(): S {
  return startState();
}

// ---------------------------------------------------------------------------------------------

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

function clone(r: BmRun): BmRun {
  return {
    ...r,
    mate: { ...r.mate },
    path: [...r.path],
    visited: [...r.visited],
    dist: r.dist && { ...r.dist },
    flipped: r.flipped.map((p) => [...p]),
    last: r.last && [...r.last],
  };
}

export function stateVars(s: S): Record<string, Scalar> {
  return {
    V: s.graph.vertices.length,
    E: s.graph.edges.length,
    L: s.left.length,
    R: s.right.length,
  };
}

function runVars(s: S, r: BmRun, hk: boolean): Record<string, Scalar> {
  return {
    ...stateVars(s),
    matched: r.size,
    paths: r.flipped.length,
    ...(hk ? { phase: r.phase || '–' } : {}),
    u: r.u ?? '–',
    checks: r.checks,
  };
}

/** "A-2 B-1": each matched vertex of L with its partner, in name order. */
export function pairsText(s: S, mate: Record<string, string | null>): string {
  return s.left
    .filter((u) => mate[u])
    .map((u) => `${u}-${mate[u]}`)
    .join(' ');
}

/** The answer in the code tabs' words. */
export function runSummary(s: S, r: BmRun): string {
  return `${r.size} | ${pairsText(s, r.mate)}`.trimEnd();
}

/** "A – 1 = B – 3": unmatched edges as –, matched ones as =, after the flip. */
export function pathWords(p: string[]): string {
  return p.map((v, i) => (i === 0 ? v : `${i % 2 ? ' – ' : ' = '}${v}`)).join('');
}

/** Flip an augmenting path L0 R0 L1 R1 ...: each L_i is matched to R_i. */
function flip(r: BmRun, p: string[]) {
  for (let i = 0; i + 1 < p.length; i += 2) {
    r.mate[p[i]!] = p[i + 1]!;
    r.mate[p[i + 1]!] = p[i]!;
  }
  r.size++;
  r.flipped.push([...p]);
  r.last = [...p];
}

const run: Op = {
  label: 'Find a maximum matching',
  arity: 0,
  *run(st, _args, { settings }) {
    const g = st.graph;
    const hk = settings.method === 'hopcroft-karp';
    const r: BmRun = {
      mate: Object.fromEntries(g.vertices.map((v) => [v, null])),
      size: 0,
      path: [],
      visited: [],
      phase: 0,
      flipped: [],
      checks: 0,
    };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): BmStep => ({
      state: st,
      marks,
      say,
      lines,
      level,
      vars: runVars(st, r, hk),
      extra: { run: clone(r) },
    });
    const vm = (vs: string[], role: Mark['role']) => vs.map((v) => mark(vertexId(v), role));
    const em = (p: string[], role: Mark['role']) =>
      p.slice(1).map((v, i) => mark(edgeId(edgeKey(g, p[i]!, v)), role));
    const free = (v: string) => r.mate[v] === null;

    if (g.edges.length === 0) {
      r.done = true;
      yield step(
        `There are no edges, so the largest matching is empty. ${g.vertices.length ? `${listWords(g.vertices)} ${g.vertices.length === 1 ? 'stays' : 'all stay'} free.` : ''}`,
        ['ret'],
        1,
      );
      return st;
    }
    yield step(
      `Start with an empty matching: every vertex is free. ${hk ? 'Each phase finds the shortest augmenting paths all at once.' : `Take the left vertices in name order, ${listWords(st.left)}, and look for an augmenting path from each.`}`,
      ['init'],
      2,
    );

    if (!hk) {
      for (const s0 of st.left) {
        r.u = s0;
        r.visited = [];
        r.path = [s0];
        r.last = undefined;
        yield step(
          `Try to match ${s0}. Depth-first search for an augmenting path from ${s0}: an edge to a free vertex on the right ends it; an edge to a matched one continues from that vertex's partner.`,
          ['for', 'try'],
          3,
          vm([s0], 'active'),
        );
        // try(u), unrolled: frames hold u and the index of its next neighbour.
        const frames: { u: string; i: number }[] = [{ u: s0, i: 0 }];
        let ok = false;
        while (frames.length && !ok) {
          const f = frames.at(-1)!;
          const nb = neighbours(g, f.u);
          r.u = f.u;
          if (f.i >= nb.length) {
            frames.pop();
            r.path = r.path.slice(0, -2);
            if (frames.length)
              yield step(
                `${f.u} has no other way to go, so it cannot give up ${r.mate[f.u]}. Back up to ${frames.at(-1)!.u}.`,
                ['fail'],
                3,
                vm([f.u], 'compare'),
              );
            continue;
          }
          const v = nb[f.i++]!;
          r.checks++;
          if (r.visited.includes(v)) {
            yield step(
              `${f.u} – ${v}: ${v} was visited already in this search, so skip it.`,
              ['skip'],
              3,
              vm([v], 'compare'),
            );
            continue;
          }
          r.visited.push(v);
          if (free(v)) {
            r.path.push(v);
            ok = true;
            break;
          }
          const w = r.mate[v]!;
          r.path.push(v, w);
          frames.push({ u: w, i: 0 });
          yield step(
            `${f.u} – ${v}: ${v} is matched to ${w}. Try to find ${w} another partner, so ${v} can go to ${f.u}.`,
            ['visit', 'recurse'],
            3,
            [...vm([f.u], 'active'), ...vm([v, w], 'visit'), ...em([f.u, v, w], 'active')],
          );
        }
        if (ok) {
          const p = [...r.path];
          const end = p.at(-1)!;
          yield step(
            p.length === 2
              ? `${s0} – ${end}: ${end} is free. Match them.`
              : `${end} is free, so ${pathWords(p)} is an augmenting path: it starts and ends at a free vertex and alternates unmatched and matched edges.`,
            ['visit', 'free'],
            2,
            [...vm(p, 'active'), ...em(p, 'active')],
          );
          flip(r, p);
          r.path = [];
          yield step(
            p.length === 2
              ? `Matched ${s0} with ${end}. The matching has ${plural(r.size, 'edge')}.`
              : `Flip it: ${listWords(pairs(p))} join the matching${p.length > 2 ? ` and ${listWords(oldPairs(p))} ${oldPairs(p).length === 1 ? 'leaves' : 'leave'} it` : ''}. One more edge: the matching has ${plural(r.size, 'edge')}.`,
            ['flip'],
            2,
            [...vm(p, 'new'), ...em(p, 'active')],
          );
        } else {
          r.path = [];
          yield step(
            `No augmenting path from ${s0}: every right vertex it can reach is matched, and their partners have nowhere else to go. ${s0} stays free.`,
            ['fail'],
            2,
            vm([s0], 'error'),
          );
        }
      }
    } else {
      const INF = null;
      for (;;) {
        // BFS from every free left vertex at once.
        r.phase++;
        r.last = undefined;
        r.u = undefined;
        const dist: Record<string, number | null> = Object.fromEntries(
          st.left.map((u) => [u, free(u) ? 0 : INF]),
        );
        r.dist = dist;
        let shortest: number | null = null;
        const queue = st.left.filter((u) => free(u));
        for (let i = 0; i < queue.length; i++) {
          const u = queue[i]!;
          if (shortest !== null && dist[u]! >= shortest) continue;
          for (const v of neighbours(g, u)) {
            r.checks++;
            const w = r.mate[v];
            if (w === null) {
              if (shortest === null) shortest = dist[u]! + 1;
            } else if (dist[w] === INF) {
              dist[w] = dist[u]! + 1;
              queue.push(w);
            }
          }
        }
        r.found = 0;
        if (shortest === null) {
          r.phase--;
          r.dist = undefined;
          yield step(
            `Phase ${r.phase + 1}: breadth-first search from the free left vertices${st.left.some(free) ? ` (${listWords(st.left.filter(free))})` : ''} reaches no free right vertex. No augmenting path is left.`,
            ['phase', 'bfs'],
            2,
          );
          break;
        }
        const layers = st.left.filter((u) => dist[u] !== INF);
        yield step(
          `Phase ${r.phase}: breadth-first search from every free left vertex at once, ${listWords(st.left.filter(free))}. Each left vertex gets its layer (the badges): ${layers.map((u) => `${u} ${dist[u]}`).join(', ')}. The shortest augmenting paths have ${plural(2 * shortest - 1, 'edge')}.`,
          ['phase', 'bfs'],
          2,
          vm(st.left.filter(free), 'active'),
        );
        // DFS from each free left vertex, along the layers only.
        for (const s0 of st.left) {
          if (!free(s0) || dist[s0] !== 0) continue;
          r.path = [s0];
          const frames: { u: string; i: number }[] = [{ u: s0, i: 0 }];
          let ok = false;
          while (frames.length && !ok) {
            const f = frames.at(-1)!;
            const nb = neighbours(g, f.u);
            r.u = f.u;
            if (f.i >= nb.length) {
              frames.pop();
              dist[f.u] = INF;
              r.path = r.path.slice(0, -2);
              yield step(
                `No path on from ${f.u}: take it out of the layers for the rest of this phase.`,
                ['dead'],
                3,
                vm([f.u], 'compare'),
              );
              continue;
            }
            const v = nb[f.i++]!;
            r.checks++;
            const w = r.mate[v];
            if (w === null) {
              if (shortest === dist[f.u]! + 1) {
                r.path.push(v);
                ok = true;
              }
              continue;
            }
            if (dist[w] !== INF && dist[w] === dist[f.u]! + 1) {
              r.path.push(v, w);
              frames.push({ u: w, i: 0 });
              yield step(
                `${f.u} – ${v} = ${w}: ${w} is in the next layer, so go on from ${w}.`,
                ['dfs'],
                3,
                [...vm([f.u], 'active'), ...vm([v, w], 'visit'), ...em([f.u, v, w], 'active')],
              );
            }
          }
          r.u = undefined;
          if (!ok) {
            r.path = [];
            continue;
          }
          const p = [...r.path];
          r.found++;
          yield step(
            `A shortest augmenting path: ${pathWords(p)}. It shares no vertex with the others found in this phase.`,
            ['dfs'],
            2,
            [...vm(p, 'active'), ...em(p, 'active')],
          );
          flip(r, p);
          r.path = [];
          // Vertices on a flipped path are used up for this phase.
          for (const x of p) if (x in dist) dist[x] = INF;
          yield step(`Flip it. The matching has ${plural(r.size, 'edge')}.`, ['flip'], 2, [
            ...vm(p, 'new'),
            ...em(p, 'active'),
          ]);
        }
        r.path = [];
        yield step(
          `Phase ${r.phase} flipped ${plural(r.found, 'path')}, all of the same length. The next phase's shortest paths are longer.`,
          ['phase'],
          3,
        );
      }
    }

    r.u = undefined;
    r.path = [];
    r.visited = [];
    r.last = undefined;
    r.dist = undefined;
    r.done = true;
    const freeL = st.left.filter(free);
    const freeR = st.right.filter(free);
    const left = [
      freeL.length ? `Free on the left: ${listWords(freeL)}.` : 'Every left vertex is matched.',
      freeR.length ? `Free on the right: ${listWords(freeR)}.` : 'Every right vertex is matched.',
    ].join(' ');
    yield step(
      `Done: a maximum matching of ${plural(r.size, 'edge')}, ${listWords(
        pairsText(st, r.mate)
          .split(' ')
          .filter(Boolean)
          .map((x) => x.replace('-', '–')),
      )}${hk ? `, in ${plural(r.phase, 'phase')}` : ''}. No augmenting path is left, so no matching is larger. ${left}`,
      ['ret'],
      1,
      vm(
        g.vertices.filter((v) => !free(v)),
        'done',
      ),
    );
    return st;
  },
};

/** Pairs L_i – R_i of an augmenting path (the edges that join). */
function pairs(p: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < p.length; i += 2) out.push(`${p[i]}–${p[i + 1]}`);
  return out;
}

/** Pairs R_i = L_(i+1) (the edges that leave). */
function oldPairs(p: string[]): string[] {
  const out: string[] = [];
  for (let i = 1; i + 1 < p.length; i += 2) out.push(`${p[i + 1]}–${p[i]}`);
  return out;
}

const load: Op = {
  label: 'Load',
  arity: 1,
  *run(s, [arg]) {
    const r = parseBipartite(String(arg ?? ''));
    if (r instanceof Error) {
      yield {
        state: s,
        marks: [],
        say: `Nothing loaded. ${r.message} The graph stays as it was.`,
        lines: [],
        level: 1,
        vars: stateVars(s),
      } satisfies BmStep;
      return s;
    }
    const how =
      r.right.every(startsWithDigit) && r.right.length && r.left.every((v) => !startsWithDigit(v))
        ? 'letters on the left and numbers on the right'
        : 'sides found by two-colouring';
    yield {
      state: r,
      marks: [],
      say: `Loaded a bipartite graph with ${plural(r.graph.vertices.length, 'vertex', 'vertices')} and ${plural(r.graph.edges.length, 'edge')}, ${how}: ${listWords(r.left) || 'none'} on the left, ${listWords(r.right) || 'none'} on the right. Press Find a maximum matching.`,
      lines: [],
      level: 1,
      vars: stateVars(r),
    } satisfies BmStep;
    return r;
  },
};

export const ops = { load, run };

// ---------------------------------------------------------------------------------------------
// Pseudocode

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: BmSettings): PseudoBlock[] {
  if (settings.method === 'hopcroft-karp')
    return [
      {
        op: 'run',
        lines: [
          L('sig', 0, 'HOPCROFT-KARP(G = (L ∪ R, E))', 'Maximum matching, in phases:'),
          L('init', 1, 'M = ∅', 'Start with no edges matched.'),
          L('phase', 1, 'while BFS finds a free R vertex', 'While some augmenting path is left:'),
          L(
            'bfs',
            2,
            'layer L from all free L vertices',
            'layer the graph from every free left vertex,',
          ),
          L('dfs', 2, 'DFS each free u along layers', 'find disjoint shortest paths by DFS,'),
          L('dead', 3, 'dead end: drop u from layers', 'dropping dead ends for this phase,'),
          L('flip', 2, 'M = M ⊕ P for each path P', 'and flip every path found.'),
          L('ret', 1, 'return M', 'No augmenting path: M is maximum.'),
        ],
      },
    ];
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'KUHN(G = (L ∪ R, E))', 'Maximum matching, one vertex at a time:'),
        L('init', 1, 'match(v) = NIL for all v', 'Start with every vertex free.'),
        L('for', 1, 'for each u in L', 'For each left vertex u,'),
        L('try', 2, 'visited = ∅; TRY(u)', 'search for an augmenting path from u:'),
        L('visit', 3, 'for each v in Adj[u]', 'Look at each neighbour v in turn:'),
        L('skip', 4, 'if v visited: next; mark v', 'skip it if this search saw it.'),
        L('free', 4, 'if match(v) = NIL', 'If v is free, the path ends here.'),
        L('recurse', 4, 'or TRY(match(v))', 'Or rematch v’s partner elsewhere.'),
        L('flip', 5, 'match(v) = u; return TRUE', 'Then flip: u takes v.'),
        L('fail', 3, 'return FALSE', 'No way through: u stays free.'),
        L('ret', 1, 'return the matching', 'No path left: the matching is maximum.'),
      ],
    },
  ];
}

export function initialSay(s: S): string {
  return `A bipartite graph: ${listWords(s.left) || 'no vertices'} on the left, ${listWords(s.right) || 'none'} on the right, ${plural(s.graph.edges.length, 'edge')} between them. Press Find a maximum matching to pair up as many as possible, each vertex used at most once.`;
}

export function initialVars(s: S) {
  return stateVars(s);
}

export function describe(s: S): string {
  const adj = s.left.map((u) => {
    const nb = neighbours(s.graph, u);
    return nb.length ? `${u} with ${nb.join(', ')}` : `${u} with nothing`;
  });
  return `A bipartite graph with ${listWords(s.left) || 'nothing'} on the left and ${listWords(s.right) || 'nothing'} on the right. Edges: ${adj.join('; ') || 'none'}.`;
}

export function describeRun(s: S, r: BmRun): string {
  const m = pairsText(s, r.mate);
  return `Matching of ${plural(r.size, 'edge')}${m ? `: ${m}` : ''}.${r.path.length > 1 ? ` Path so far: ${r.path.join(' ')}.` : ''}${r.done ? ' It is maximum.' : ''}`;
}
