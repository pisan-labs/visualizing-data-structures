/**
 * Floyd-Warshall, CLRS style: the shortest path between every pair of vertices. D starts as
 * the edge weights (0 on the diagonal, ∞ for no edge). Round k lets paths pass through vertex
 * k: for every i and j, D[i][j] = min(D[i][j], D[i][k] + D[k][j]). After round k, D holds the
 * shortest paths whose inner vertices all come from the first k. The matrix is updated in
 * place, as most code does; CLRS writes a new matrix D(k) each round, which gives the same
 * numbers when there is no negative cycle.
 *
 * A second matrix records the paths. Settings: `paths` is CLRS's predecessor matrix Π
 * (Π[i][j] is the vertex just before j on a shortest path from i) or a next-hop matrix
 * (next[i][j] is the vertex just after i). The `path` operation reads a path for one pair from
 * the finished matrices, backwards with Π or forwards with next.
 *
 * A negative cycle shows up on the diagonal: D[v][v] < 0 means a path from v back to itself
 * with negative weight. The run says so as soon as it appears, and at the end.
 *
 * The state is just the graph; a run's matrices travel in the steps' `extra`.
 */
import type { Mark, OpSpec, PseudoBlock, Scalar, Step } from '../../engine/types';
import type { GraphTemplate } from '../../layouts/graph';
import { edgeId, labelId, vertexId, weightId } from '../../layouts/graph';
import { describeGraph, edgeKey, listWords, plural, type Graph } from '../_graph/graph';
import { graphVars, loadOp, vertexArg, type GraphState } from '../_graph/kit';
import { arcs, dist, pathWords, plus, readyText, startPathsGraph } from '../_paths/kit';

export type FwState = GraphState;
export type PathMatrix = 'pred' | 'next';

export interface FwSettings {
  [key: string]: Scalar;
  paths: PathMatrix;
  layout: GraphTemplate;
}

export const defaults: FwSettings = { paths: 'pred', layout: 'force' };

/** One run's matrices, as they stand at a step. Rows and columns follow g.vertices. */
export interface FwRun {
  /** null is ∞. */
  D: (number | null)[][];
  /** Π[i][j] (pred) or next[i][j] (next), as a vertex name; null is NIL. */
  P: (string | null)[][];
  next: boolean;
  /** The round: -1 before the first, an index into g.vertices, or n when done. */
  k: number;
  /** The cell being looked at, or -1. */
  i: number;
  j: number;
  checks: number;
  updates: number;
  /** Entries each round changed (index = round). */
  changes: number[];
  /** Vertices whose D[v][v] has gone below 0, in the order found. */
  negative: string[];
}

/** A path read from the finished matrices. */
export interface FwPath {
  from: string;
  to: string;
  /** Matrix cells read so far, as [row, column] vertex names. */
  read: [string, string][];
  /** The path so far (from the end backwards with Π, from the start with next). */
  path: string[];
  done?: boolean;
  /** Why there is no path: none at all, or a negative cycle on the way. */
  result?: 'none' | 'cycle';
}

export interface FwExtra {
  run?: FwRun;
  path?: FwPath;
}

type S = FwState;
type X = FwExtra;
type Op = OpSpec<S, FwSettings, X>;
type FwStep = Step<S, X>;

export function init(): S {
  return { graph: startPathsGraph() };
}

const mark = (id: string, role: Mark['role']): Mark => ({ id, role });

/** Matrix ids (see view.ts): cells `D:<row>:<col>` and `P:<row>:<col>`, headers `Dr:<v>`, `Dc:<v>`. Names never hold a colon, so ids stay unique. */
export const dCell = (u: string, v: string) => `D:${u}:${v}`;
export const pCell = (u: string, v: string) => `P:${u}:${v}`;
export const dHead = (side: 'r' | 'c', v: string) => `D${side}:${v}`;

function clone(r: FwRun): FwRun {
  return {
    ...r,
    D: r.D.map((row) => [...row]),
    P: r.P.map((row) => [...row]),
    changes: [...r.changes],
    negative: [...r.negative],
  };
}

/** D(0) and Π(0) (or next(0)) from the edges. */
export function startMatrices(g: Graph, next: boolean): FwRun {
  const at = new Map(g.vertices.map((v, x) => [v, x]));
  const D: (number | null)[][] = g.vertices.map((_, i) =>
    g.vertices.map((__, j) => (i === j ? 0 : null)),
  );
  const P: (string | null)[][] = g.vertices.map(() => g.vertices.map(() => null));
  for (const a of arcs(g)) {
    const i = at.get(a.u)!;
    const j = at.get(a.v)!;
    D[i]![j] = a.w;
    P[i]![j] = next ? a.v : a.u;
  }
  return { D, P, next, k: -1, i: -1, j: -1, checks: 0, updates: 0, changes: [], negative: [] };
}

/** Floyd-Warshall without steps: the finished matrices (for paths and practice). */
export function floydWarshall(g: Graph, next: boolean): FwRun {
  const r = startMatrices(g, next);
  const n = g.vertices.length;
  for (let k = 0; k < n; k++) {
    r.changes.push(0);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = r.D[i]![k]!;
        const b = r.D[k]![j]!;
        if (a === null || b === null) continue;
        if (r.D[i]![j] === null || a + b < r.D[i]![j]!) {
          r.D[i]![j] = a + b;
          r.P[i]![j] = next ? r.P[i]![k]! : r.P[k]![j]!;
          r.changes[k]!++;
        }
      }
  }
  r.k = n;
  r.negative = g.vertices.filter((_, x) => r.D[x]![x]! < 0);
  return r;
}

function runVars(g: Graph, r: FwRun): Record<string, Scalar> {
  const n = g.vertices.length;
  return {
    ...graphVars(g),
    k: r.k >= 0 && r.k < n ? g.vertices[r.k]! : r.k >= n ? 'done' : '–',
    i: r.i >= 0 ? g.vertices[r.i]! : '–',
    j: r.j >= 0 ? g.vertices[r.j]! : '–',
    checks: r.checks,
    updates: r.updates,
  };
}

const cellText = (d: number | null) => (d === null ? 'inf' : String(d));

/** The finished matrices in the code tabs' words: D rows | Π rows (| negative cycle ...). */
export function runSummary(g: Graph, r: FwRun): string {
  const D = r.D.map((row) => row.map(cellText).join(' ')).join('; ');
  const P = r.P.map((row) => row.map((p) => p ?? '-').join(' ')).join('; ');
  const neg = g.vertices.filter((_, x) => r.D[x]![x]! < 0);
  return `${D} | ${P}${neg.length ? ` | negative cycle ${neg.join(' ')}` : ''}`;
}

const run: Op = {
  label: 'Run Floyd-Warshall',
  arity: 0,
  *run(s, _args, { settings }) {
    const g = s.graph;
    const n = g.vertices.length;
    const V = g.vertices;
    const next = settings.paths === 'next';
    const P = next ? 'next' : 'Π';
    const r = startMatrices(g, next);
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): FwStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: runVars(g, r),
      extra: { run: clone(r) },
    });
    yield step(
      `Floyd-Warshall on all ${plural(n, 'vertex', 'vertices')}. D starts as the edge weights: D[i][j] = w(i, j) when there is an edge, 0 on the diagonal and ∞ everywhere else. ${
        next
          ? 'next[i][j] = j for every edge: from i, go straight to j.'
          : 'Π[i][j] = i for every edge: the vertex before j is i.'
      } So far, no path may pass through any other vertex.`,
      ['init.d', 'init.p'],
      2,
    );

    const D = r.D;
    const Pm = r.P;
    for (let k = 0; k < n; k++) {
      const K = V[k]!;
      r.k = k;
      r.i = -1;
      r.j = -1;
      r.changes.push(0);
      yield step(
        `Round ${k + 1} of ${n}, k = ${K}: may a path now pass through ${K}? For every i and j, compare D[i][j] with D[i][${K}] + D[${K}][j]. ${
          D[k]![k]! >= 0
            ? `Row ${K} and column ${K} cannot change: going through ${K} to reach ${K} adds D[${K}][${K}] = ${D[k]![k]}.`
            : ''
        }`.trim(),
        ['k'],
        2,
        [mark(dHead('r', K), 'active'), mark(dHead('c', K), 'active'), mark(vertexId(K), 'active')],
      );
      for (let i = 0; i < n; i++) {
        const I = V[i]!;
        const rowStart = D[i]![k]!;
        if (rowStart === null) {
          // Nothing through k can help row i: one step for the whole row.
          r.i = i;
          r.j = -1;
          r.checks += n;
          yield step(
            `Row ${I}: D[${I}][${K}] = ∞, ${I} cannot reach ${K} yet, so going through ${K} cannot help any path from ${I}.`,
            ['i', 'j', 'if'],
            3,
            [mark(dCell(I, K), 'compare')],
          );
          continue;
        }
        for (let j = 0; j < n; j++) {
          const J = V[j]!;
          // Read both again for every j: with D[k][k] < 0 they can change during the round.
          const a = D[i]![k]!;
          const b = D[k]![j]!;
          r.checks++;
          // Cells in row or column k cannot change unless D[k][k] < 0; skip them quietly.
          if (a === null || b === null || ((i === k || j === k) && D[k]![k]! >= 0)) continue;
          r.i = i;
          r.j = j;
          const old = D[i]![j]!;
          const via = a + b;
          const reads = [mark(dCell(I, K), 'compare'), mark(dCell(K, J), 'compare')];
          if (old === null || via < old) {
            D[i]![j] = via;
            Pm[i]![j] = next ? Pm[i]![k]! : Pm[k]![j]!;
            r.updates++;
            r.changes[k]!++;
            const pText = next
              ? `next[${I}][${J}] = next[${I}][${K}] = ${Pm[i]![j]}`
              : `Π[${I}][${J}] = Π[${K}][${J}] = ${Pm[i]![j]}`;
            yield step(
              `D[${I}][${J}] = min(D[${I}][${J}], D[${I}][${K}] + D[${K}][${J}]) = min(${dist(old)}, ${plus(a, b)}) = ${via}. Going through ${K} is shorter, so D[${I}][${J}] = ${via} and ${pText}.`,
              ['i', 'j', 'if', 'set.d', 'set.p'],
              2,
              [
                mark(dCell(I, J), 'active'),
                ...reads,
                mark(pCell(I, J), 'active'),
                mark(pCell(next ? I : K, next ? K : J), 'compare'),
              ],
            );
            if (i === j && via < 0 && !r.negative.includes(I)) {
              r.negative.push(I);
              yield step(
                `D[${I}][${I}] = ${via} is below 0: a path from ${I} back to ${I} with negative weight. ${I} is on a negative cycle, and every pair that can pass through it has no shortest path. The diagonal will show it.`,
                ['set.d'],
                2,
                [mark(dCell(I, I), 'error'), mark(vertexId(I), 'error')],
              );
            }
          } else {
            yield step(
              `D[${I}][${J}] = ${old}, and through ${K} it would be ${plus(a, b)} = ${via}: no shorter. No change.`,
              ['i', 'j', 'if'],
              3,
              [mark(dCell(I, J), 'active'), ...reads],
            );
          }
        }
      }
      r.i = -1;
      r.j = -1;
      const changed = r.changes[k]!;
      const so = V.slice(0, k + 1);
      yield step(
        `Round ${k + 1} done: ${changed ? `${plural(changed, 'entry', 'entries')} changed` : 'nothing changed'}. D now holds the shortest paths whose inner vertices come from ${so.length === 1 ? K : `${listWords(so)}`} only.`,
        ['k'],
        2,
      );
    }
    r.k = n;
    const neg = V.filter((_, x) => D[x]![x]! < 0);
    yield step(
      neg.length
        ? `Done, but the diagonal has ${neg.map((v) => `D[${v}][${v}] = ${D[V.indexOf(v)]![V.indexOf(v)]}`).join(', ')}: ${listWords(neg)} ${neg.length === 1 ? 'lies' : 'lie'} on a negative cycle. A pair whose paths can pass through ${neg.length === 1 ? 'it' : 'them'} has no shortest path, so ${neg.length === 1 ? 'its' : 'their'} entries mean nothing.`
        : `Done: D holds the shortest distance between every pair, and ${P} the paths. ${r.updates === 0 ? 'No entry ever changed: every shortest path is a single edge.' : `${plural(r.updates, 'entry', 'entries')} changed in all.`} Press Path, with two vertices, to read one.`,
      ['done'],
      1,
      neg.flatMap((v) => [mark(dCell(v, v), 'error'), mark(vertexId(v), 'error')]),
    );
    return s;
  },
};

const path: Op = {
  label: 'Path',
  arity: 2,
  *run(s, [a0, b0], { settings }) {
    const g = s.graph;
    const V = g.vertices;
    const next = settings.paths === 'next';
    const a = vertexArg(g, a0);
    const b = vertexArg(g, b0);
    if ('error' in a || 'error' in b) {
      yield {
        state: s,
        marks: [],
        say: `A path needs two vertices. ${'error' in a ? a.error : (b as { error: string }).error}`,
        lines: ['path'],
        level: 1,
        vars: graphVars(g),
      } satisfies FwStep;
      return s;
    }
    const from = a.v;
    const to = b.v;
    const r = floydWarshall(g, next);
    const D = r.D;
    const x = (v: string) => V.indexOf(v);
    const p: FwPath = { from, to, read: [], path: next ? [from] : [to] };
    const step = (say: string, lines: string[], level: 1 | 2 | 3, marks: Mark[] = []): FwStep => ({
      state: s,
      marks,
      say,
      lines,
      level,
      vars: { ...graphVars(g), from, to },
      extra: { run: r, path: { ...p, read: [...p.read], path: [...p.path] } },
    });
    const d = D[x(from)]![x(to)]!;
    // A pair is broken if a negative cycle lies on some path between them.
    const via = V.filter(
      (v) => D[x(v)]![x(v)]! < 0 && D[x(from)]![x(v)] !== null && D[x(v)]![x(to)] !== null,
    );
    if (via.length) {
      p.result = 'cycle';
      yield step(
        `No shortest path from ${from} to ${to}: on the way it can reach ${listWords(via)}, which ${via.length === 1 ? 'lies' : 'lie'} on a negative cycle (D[${via[0]}][${via[0]}] = ${D[x(via[0]!)]![x(via[0]!)]}). Going round it again and again makes the path as light as you like.`,
        ['path'],
        1,
        [mark(dCell(from, to), 'error'), ...via.map((v) => mark(dCell(v, v), 'error'))],
      );
      return s;
    }
    if (d === null) {
      p.result = 'none';
      yield step(
        `There is no path from ${from} to ${to}: D[${from}][${to}] = ∞ in the finished matrix.`,
        ['path'],
        1,
        [mark(dCell(from, to), 'compare'), mark(labelId(to), 'stale')],
      );
      return s;
    }
    yield step(
      from === to
        ? `A path from ${from} to itself: D[${from}][${from}] = ${d}.`
        : `Read the path from ${from} to ${to} from Floyd-Warshall's finished matrices (Run shows how they fill). D[${from}][${to}] = ${d} is its weight. ${next ? `next[${from}][j] gives the first step from ${from} toward j, so walk forwards.` : `Π[${from}][j] is the vertex just before j, so walk backwards from ${to}.`}`,
      ['path'],
      2,
      [mark(dCell(from, to), 'active')],
    );
    // Walk the matrix: at most V - 1 steps on a simple path.
    for (let guard = 0; guard < V.length; guard++) {
      if (next) {
        const at = p.path.at(-1)!;
        if (at === to) break;
        const nx = r.P[x(at)]![x(to)]!;
        p.read.push([at, to]);
        p.path.push(nx);
        yield step(
          `next[${at}][${to}] = ${nx}: from ${at}, the path goes to ${nx}. So far: ${pathWords(p.path)}.`,
          ['walk'],
          2,
          [mark(pCell(at, to), 'active'), mark(vertexId(nx), 'visit')],
        );
      } else {
        const at = p.path[0]!;
        if (at === from) break;
        const pv = r.P[x(from)]![x(at)]!;
        p.read.push([from, at]);
        p.path.unshift(pv);
        yield step(
          `Π[${from}][${at}] = ${pv}: the vertex just before ${at} is ${pv}. So far: ${pathWords(p.path)}.`,
          ['walk'],
          2,
          [mark(pCell(from, at), 'active'), mark(vertexId(pv), 'visit')],
        );
      }
    }
    p.done = true;
    const edges = p.path.slice(1).flatMap((v, k) => {
      const key = edgeKey(g, p.path[k]!, v);
      return [mark(edgeId(key), 'active'), mark(weightId(key), 'active')];
    });
    yield step(
      from === to
        ? `The path from ${from} to ${from} is just ${from}, with weight 0.`
        : `The shortest path from ${from} to ${to} is ${pathWords(p.path)}, with weight D[${from}][${to}] = ${d}.`,
      ['path'],
      1,
      edges,
    );
    return s;
  },
};

const load = loadOp<S, FwSettings, X>({
  make: (graph) => ({ graph }),
  ready: (g) => readyText(g, 'floyd'),
});

export const ops = { load, run, path };

// ---------------------------------------------------------------------------------------------
// Pseudocode, after CLRS, updating D in place. Lines stay short (33 characters with their
// indent) for a phone.

const L = (id: string, indent: number, text: string, plain: string) => ({
  id,
  indent,
  text,
  plain,
});

export function pseudocode(settings: FwSettings): PseudoBlock[] {
  const next = settings.paths === 'next';
  return [
    {
      op: 'run',
      lines: [
        L('sig', 0, 'FLOYD-WARSHALL(W, n)', 'Shortest paths between all pairs:'),
        L('init.d', 1, 'D = W  // 0 on the diagonal', 'start with the edge weights,'),
        next
          ? L('init.p', 1, 'next_ij = j for each edge', 'and from i, go straight to j.')
          : L('init.p', 1, 'Π_ij = i for each edge', 'and j comes straight from i.'),
        L('k', 1, 'for k = 1 to n', 'Let paths pass through k, then'),
        L('i', 2, 'for i = 1 to n', 'for every start i'),
        L('j', 3, 'for j = 1 to n', 'and every end j:'),
        L('if', 4, 'if d_ik + d_kj < d_ij', 'if going through k is shorter,'),
        L('set.d', 5, 'd_ij = d_ik + d_kj', 'take that path'),
        next
          ? L('set.p', 5, 'next_ij = next_ik', 'and its first step.')
          : L('set.p', 5, 'Π_ij = Π_kj', 'and its last step.'),
        L('done', 1, 'return D', 'D holds every shortest distance.'),
      ],
    },
    {
      op: 'path',
      lines: next
        ? [
            L('path', 0, 'PATH(next, i, j)', 'The path from i to j:'),
            L('walk', 1, 'while i ≠ j: i = next[i][j]', 'step forward until you reach j.'),
          ]
        : [
            L('path', 0, 'PATH(Π, i, j)', 'The path from i to j:'),
            L('walk', 1, 'while j ≠ i: j = Π[i][j]', 'step back from j until you reach i.'),
          ],
    },
  ];
}

export function initialSay(s: S): string {
  return `${describeGraph(s.graph).split('. ')[0]}. Press Run: Floyd-Warshall finds the shortest path between every pair of vertices, one round per vertex.`;
}

export function initialVars(s: S) {
  return graphVars(s.graph);
}

export function describe(s: S): string {
  return describeGraph(s.graph);
}

/** The scene label: where a run stands. */
export function describeRun(g: Graph, r: FwRun, p?: FwPath): string {
  const n = g.vertices.length;
  const where =
    r.k < 0 ? 'Before the first round.' : r.k >= n ? 'Done.' : `Round k = ${g.vertices[r.k]}.`;
  const rows = g.vertices
    .map((v, i) => `${v}: ${r.D[i]!.map((d) => dist(d)).join(' ')}`)
    .join('; ');
  const pathText = p
    ? ` Path from ${p.from} to ${p.to}: ${p.done ? pathWords(p.path) : 'reading'}.`
    : '';
  return `Floyd-Warshall. ${where} D rows: ${rows}.${pathText}`;
}
